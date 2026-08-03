// src/suppress.mjs — "should this run stay silent?"
//
// Two ways to ask for quiet, one gate: an explicit `anotifier snooze <duration>`
// (a timestamp in a state file next to .update-check.json) and a recurring
// quietHours window from config.json. Either one alone suppresses, and
// suppression is ALL-OR-NOTHING across channels — toast, ntfy, webhook and the
// terminal bell go silent together. Per-channel scoping would mean two
// suppression sources with different granularity and no honest answer for the
// update notice, so the simple contract wins: snoozed means silent, period.
//
// Everything here is fail-open. A missing, corrupt, unreadable or expired state
// file reads as "not snoozed": a broken file must never be able to silence the
// notifier forever.
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, parseHHMM } from './config-loader.mjs';

// Same directory and dotfile convention as .update-check.json. A separate file
// rather than a key in that one: this is user intent with its own lifecycle
// (written by the CLI, deleted on expiry), not a cache.
export const SNOOZE_PATH = path.join(getConfigDir(), '.snooze.json');

const UNIT_MS = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 };
// A bare number is minutes — `anotifier snooze 45` is the shape people type first.
const DURATION_RE = /^(\d+)(s|m|h)?$/;

// "30m" | "2h" | "90s" | "45" → milliseconds, or null when unusable. Zero and
// negative durations are null too: `snooze 0` is a typo, not a request to be
// silenced for no time at all, and the CLI should say so rather than write a
// state file that is already expired.
export function parseDuration(input) {
  const match = DURATION_RE.exec(String(input ?? '').trim().toLowerCase());
  if (!match) return null;
  const ms = Number(match[1]) * UNIT_MS[match[2] || 'm'];
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

// Local-time HH:MM, for "snoozed until 14:32" in the CLI and status.
export function formatClock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// null = there is no state file at all; {} = there is one but nothing usable
// came out of it. The caller needs to tell those apart only to decide whether
// there is anything worth unlinking.
function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return err?.code === 'ENOENT' ? null : {};
  }
}

// The active snooze deadline (epoch ms), or null. Opportunistically deletes a
// state file that is expired or unusable — dead state should not linger in the
// config dir or show up in `status`. A failed unlink changes nothing: the
// timestamp check above has already decided the answer.
export function readSnoozeUntil(statePath = SNOOZE_PATH, now = Date.now()) {
  const state = readState(statePath);
  if (state === null) return null;
  const until = typeof state.until === 'number' && state.until > now ? state.until : null;
  if (until === null) { try { fs.unlinkSync(statePath); } catch {} }
  return until;
}

// Writes the deadline and returns it. Unlike the read path this does NOT
// swallow failures: it is only ever called from the CLI, where a state file
// that could not be written must be reported rather than silently ignored.
export function writeSnoozeUntil(until, statePath = SNOOZE_PATH) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ until }) + '\n', 'utf8');
  return until;
}

// True when a snooze was actually cancelled, false when there was none. Any
// other failure throws, for the same reason writeSnoozeUntil does.
export function clearSnooze(statePath = SNOOZE_PATH) {
  try {
    fs.unlinkSync(statePath);
    return true;
  } catch (err) {
    if (err?.code === 'ENOENT') return false;
    throw err;
  }
}

// The usable quiet-hours window, or null when the feature is off for any
// reason: not enabled, a time that is not "HH:MM", or from === to. A
// zero-length window is deliberately treated as OFF rather than as a
// 24-hour one — "from 09:00 to 09:00" reads as a mistake, and the failure
// mode of guessing wrong is silencing every notification all day.
export function quietHoursWindow(block) {
  if (!block || block.enabled !== true) return null;
  const fromMin = parseHHMM(block.from);
  const toMin = parseHHMM(block.to);
  if (fromMin === null || toMin === null || fromMin === toMin) return null;
  return { from: block.from, to: block.to, fromMin, toMin };
}

// Start inclusive, end exclusive, in LOCAL machine time: 22:00→08:00 silences
// 22:00 and 07:59 but not 08:00. from > to means the window spans midnight
// (22:00–23:59 plus 00:00–07:59), which is why the test flips to an OR.
// `now` is a Date so callers can pin a wall-clock time without depending on the
// machine's timezone.
export function inQuietHours(block, now = new Date()) {
  const window = quietHoursWindow(block);
  if (!window) return false;
  const minutes = now.getHours() * 60 + now.getMinutes();
  return window.fromMin < window.toMin
    ? minutes >= window.fromMin && minutes < window.toMin
    : minutes >= window.fromMin || minutes < window.toMin;
}

// The hook path's single question. Returns null (notify normally) or the reason
// this run stays silent — snooze wins the tie only because it has to be checked
// first to expire the file; either source alone is enough.
export function isSuppressed(config, { statePath = SNOOZE_PATH, now = Date.now() } = {}) {
  const until = readSnoozeUntil(statePath, now);
  if (until !== null) return { reason: 'snooze', until };
  const block = config?.quietHours;
  if (inQuietHours(block, new Date(now))) return { reason: 'quietHours', from: block.from, to: block.to };
  return null;
}
