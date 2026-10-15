// src/turn-timer.mjs — how long did the agent's turn take?
//
// Three agents give us both ends of a turn: a hook that fires when the user
// submits a prompt and a Stop-style hook that fires when the agent finishes.
// The first records a start time here (recordTurnStart), the second reads it
// back (finishTurn). Everything else has no reliable start signal and is left
// out on purpose: with no duration, nothing is shown and nothing is filtered.
//
//   claude  UserPromptSubmit -> Stop         (also fires for turns Claude starts itself)
//   codex   UserPromptSubmit -> Stop         (both carry the same turn_id)
//   gemini  BeforeAgent      -> AfterAgent
//
// Not supported, and why:
//   cursor       beforeSubmitPrompt must answer {"continue": true} or it can
//                block the prompt, and the docs do not promise that it and
//                `stop` share a generation_id. Cursor also fires hooks twice.
//   antigravity  its only per-invocation event (PreInvocation) is not documented
//                as once per user turn, so any start time would be a guess.
//
// State is one small file shared by every session on the machine, so the
// read-modify-write runs under the same exclusive lock as the usage and
// context alerts. It is written atomically. A start that cannot be recorded
// (lock contention, unwritable home) just means that turn has no duration: the
// failure direction is always "notify as usual", never "swallow the alert".
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir } from './config-loader.mjs';
import { readState, writeState, withLock } from './usage-alert.mjs';
import { logHookError } from './error-log.mjs';

// Sources whose hooks give a start signal, and the raw hook event that carries it.
export const TURN_START_HOOKS = {
  claude: 'UserPromptSubmit',
  codex: 'UserPromptSubmit',
  gemini: 'BeforeAgent',
};

export function supportsTurnTiming(source) {
  return Object.hasOwn(TURN_START_HOOKS, source);
}

// An entry older than this is dropped on the next write, and a turn longer than
// this is not believed (a resumed session or a changed clock, not a real turn).
const MAX_TURN_MS = 24 * 60 * 60 * 1000;
// A second Stop for the same turn this soon after the first is a double-fire
// (the dedup lock exists for the same reason): it must see the same answer.
const REPEAT_WINDOW_MS = 5000;
const MAX_ENTRIES = 200;
const LOCK_TRIES = 5;
const LOCK_WAIT_MS = 20;

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

export function turnStatePath() {
  return path.join(getConfigDir(), 'turns.json');
}

// Keyed by source and session so two agents (or two chats) never share a clock.
// Capped, because a session id is whatever the tool sends.
function entryKey(source, sessionId) {
  return `${source}:${String(sessionId).slice(0, 80)}`;
}

function usableTurnId(turnId) {
  return typeof turnId === 'string' && turnId !== '' ? turnId.slice(0, 80) : '';
}

// Locked read-modify-write. Returns whatever `fn` returned, or undefined when
// the lock could not be had after a few short tries. That is logged (errors.log,
// shown by `anotifier status`) and otherwise changes nothing: the caller treats
// it as "no duration", so the alert is still sent.
function withTurnState(statePath, fn) {
  for (let i = 0; i < LOCK_TRIES; i++) {
    const out = withLock(`${statePath}.lock`, () => ({ value: fn(readState(statePath)) }), 'turn-timer:lock');
    if (out) return out.value;
    if (i < LOCK_TRIES - 1) sleepSync(LOCK_WAIT_MS);
  }
  logHookError('turn-timer:lock', new Error(`could not get ${statePath}.lock after ${LOCK_TRIES} tries; this turn has no duration`));
  return undefined;
}

function pruned(state, now) {
  const kept = Object.entries(state)
    .filter(([, e]) => e && Number.isFinite(e.startedAt) && now - e.startedAt <= MAX_TURN_MS)
    .sort((a, b) => b[1].startedAt - a[1].startedAt)
    .slice(0, MAX_ENTRIES);
  return Object.fromEntries(kept);
}

// A prompt was just submitted: remember when. Never throws; true when recorded.
export function recordTurnStart({ source, sessionId, turnId } = {}, { statePath = turnStatePath(), now = Date.now() } = {}) {
  if (!supportsTurnTiming(source) || !sessionId) return false;
  try {
    const ok = withTurnState(statePath, (state) => {
      const next = pruned(state, now);
      const key = entryKey(source, sessionId);
      const open = next[key];
      // A prompt sent while the turn is still running (steering the agent, or
      // queueing the next one) is part of the SAME turn: keep the first start,
      // or a long turn would look short and could be filtered out. Only the
      // turn id (codex names the latest) and the time of the last prompt move.
      // A finished entry (endedAt set) or one past MAX_TURN_MS starts afresh.
      next[key] = open && !Number.isFinite(open.endedAt)
        ? { ...open, turnId: usableTurnId(turnId), lastPromptAt: now }
        : { startedAt: now, turnId: usableTurnId(turnId) };
      writeState(statePath, next);
      return true;
    });
    return ok === true;
  } catch (err) {
    logHookError('turn-timer:start', err);
    return false;
  }
}

// The agent just finished a turn: how long was it, in milliseconds, or null
// when that is not known. Null for every doubt: an unsupported agent, no
// recorded start, a different turn id, a start in the future, an absurd length.
// The end is stamped on first read so a double-fired Stop reports the same
// length, while a later Stop that no prompt preceded reports nothing. The
// stamped length is only repeated to a Stop carrying the same turn id as the
// one that stamped it (both empty counts as the same), so a codex turn that
// started on its own never inherits the previous turn's duration.
// Never throws.
export function finishTurn({ source, sessionId, turnId } = {}, { statePath = turnStatePath(), now = Date.now() } = {}) {
  if (!supportsTurnTiming(source) || !sessionId) return null;
  try {
    const ms = withTurnState(statePath, (state) => {
      const key = entryKey(source, sessionId);
      const entry = state[key];
      if (!entry || !Number.isFinite(entry.startedAt)) return null;
      const wanted = usableTurnId(turnId);
      if (wanted && entry.turnId && wanted !== entry.turnId) return null;
      let endedAt = now;
      if (Number.isFinite(entry.endedAt)) {
        if (now - entry.endedAt > REPEAT_WINDOW_MS) return null;
        if ((entry.endedTurnId || '') !== wanted) return null;
        endedAt = entry.endedAt;
      } else {
        writeState(statePath, { ...state, [key]: { ...entry, endedAt, endedTurnId: wanted } });
      }
      const elapsed = endedAt - entry.startedAt;
      return elapsed >= 0 && elapsed <= MAX_TURN_MS ? elapsed : null;
    });
    return typeof ms === 'number' ? ms : null;
  } catch (err) {
    logHookError('turn-timer:finish', err);
    return null;
  }
}

// Uninstall: delete the state file, its lock and any temp file a crashed write
// left behind. Returns { removed: [names], failed: [{ name, message }] }; a file
// that is already gone is not a failure. Never throws.
export function removeTurnState(dir = getConfigDir()) {
  const removed = [];
  const failed = [];
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return { removed, failed }; }
  const base = path.basename(turnStatePath());
  const ours = (n) => n === base || n === `${base}.lock` || (n.startsWith(`${base}.`) && n.endsWith('.tmp'));
  for (const name of names.filter(ours)) {
    try { fs.unlinkSync(path.join(dir, name)); removed.push(name); }
    catch (err) { if (err?.code !== 'ENOENT') failed.push({ name, message: err.message }); }
  }
  return { removed, failed };
}

// events.task_complete.minDurationSeconds as a number of seconds; 0 (off) for
// anything else. The config validator already drops bad values, so this only
// has to be safe for a config that skipped it.
export function minDurationSeconds(config) {
  const n = config?.events?.task_complete?.minDurationSeconds;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : 0;
}

// True when a completion should NOT be announced: a duration is known, the
// threshold is on, and the turn was shorter than it. An unknown duration is
// never filtered. Only task_complete is ever passed in by the caller.
export function isBelowMinDuration(durationMs, config) {
  const min = minDurationSeconds(config);
  return min > 0 && typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs < min * 1000;
}
