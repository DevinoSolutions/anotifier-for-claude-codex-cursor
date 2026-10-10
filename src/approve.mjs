#!/usr/bin/env node
// src/approve.mjs — remote approval hook: answer an agent's permission
// request from the phone (docs/design/remote-approval.md).
//
// A separate entry point on purpose (D7): src/notify.mjs keeps its
// never-block contract, and this is the ONLY file that can print a decision.
//
// THE SAFETY PROPERTY (D2, T13): exactly one code path prints `allow`, and it
// runs only after the verifier in approval-ntfy.mjs accepted the one-time
// Allow token for this request before its expiry. Every other outcome —
// a gate that says no, a timeout, a network or auth error, a quota or 429, a
// malformed, unauthenticated, replayed or late reply, bad stdin, a signal, a
// crash — prints `{}` and exits 0. `{}` is "no decision": the agent shows its
// normal terminal prompt (or, in a session that cannot prompt, denies). The
// hook never exits 2, which Codex would read as a deny (design 2.7).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfigResult } from './config-loader.mjs';
import { isSuppressed, formatClock } from './suppress.mjs';
import { logHookError } from './error-log.mjs';
import { isEntry } from './usage-alert.mjs';
import {
  approvalPath, awayPath, readApproval, readAwayUntil, claimSlot, releaseSlot,
  generateOneTime, recordOutcome,
} from './approval.mjs';
import { bashDisplay, bashDenylistHit, neverRemoteHit, shortLabel } from './approval-display.mjs';
import { exchange, publishJson, buildFollowUpPayload, DENY_MESSAGE } from './approval-ntfy.mjs';

export const NO_DECISION = Object.freeze({});

// Hook stdin is a few KB; a megabyte is already absurd.
const STDIN_CAP = 1024 * 1024;
const STDIN_TIMEOUT_MS = 2000;
const FOLLOW_UP_BUDGET_MS = 3000;
// Commands longer than this are not shown or offered at all.
const COMMAND_CAP = 100 * 1024;

// Per-agent adapters: how to read the hook input and what to call the agent.
// Claude Code only in this PR (design 3.1). Codex (design 3.2) adds an entry
// here; its output has the same shape, so decisionOutput needs no change.
export const AGENTS = {
  claude: {
    label: 'Claude Code',
    parse(raw) {
      if (raw.hook_event_name !== 'PermissionRequest') return null;
      return { toolName: raw.tool_name, toolInput: raw.tool_input, cwd: raw.cwd, sessionId: raw.session_id };
    },
  },
};

// Hook output for a VERIFIED decision. Verified against the Claude Code
// hooks reference (PermissionRequest decision control): behavior allow/deny
// inside hookSpecificOutput.decision. Never updatedInput, updatedPermissions
// or interrupt (design 3.1; D3: no "always allow").
export function decisionOutput(decision) {
  if (decision === 'allow') {
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } };
  }
  if (decision === 'deny') {
    return { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'deny', message: DENY_MESSAGE } } };
  }
  return NO_DECISION;
}

export function parseArgs(argv) {
  const args = { source: 'claude' };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--source' && argv[i + 1]) { args.source = argv[i + 1]; i++; }
  }
  return args;
}

// AAN_APPROVAL_WAIT_MS can only SHORTEN the configured wait (used by the
// tests to reach expiry quickly). A shorter window is never less safe.
export function parseWaitCap(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// A 4-character session tag for the phone, from the session id's own
// alphanumerics, so two sessions in one project stay distinguishable (T9).
function sessionTag(sessionId) {
  const clean = String(sessionId || '').replace(/[^A-Za-z0-9]/g, '');
  return clean ? clean.slice(0, 4) : '----';
}

function projectName(cwd) {
  const dir = typeof cwd === 'string' ? cwd.replace(/[\\/]+$/, '') : '';
  return shortLabel(dir ? path.basename(dir) : 'project', 40) || 'project';
}

// Title and body of the request notification (design 2.8). The model-written
// description is never shown: the command is the headline (T11).
export function requestText({ agentLabel, toolName, project, display, sessionId, expiresAt }) {
  const lines = [display.text];
  if (!display.fits) lines.push('', 'Too long to approve from the phone: Deny, or answer at the terminal.');
  lines.push('', `Session ${sessionTag(sessionId)} · expires ${formatClock(expiresAt)}`);
  return { title: `${project} · ${agentLabel} wants to run ${toolName}`, message: lines.join('\n') };
}

// What replaces the request notification once the hook stops listening. A
// receipt says what the hook returned, not that the tool ran (design 2.3).
export function followUpText({ result, agentLabel, toolName, project }) {
  if (result === 'allow' || result === 'deny') {
    const word = result === 'allow' ? 'Allow' : 'Deny';
    return { title: `${word} decision sent to ${agentLabel}`, message: `${toolName} in ${project}` };
  }
  if (result === 'terminal') return { title: 'Sent back to the terminal', message: `${toolName} in ${project}: answer at the terminal` };
  if (result === 'expired') return { title: 'Expired, answer at the terminal', message: `${toolName} in ${project}` };
  return { title: 'No longer waiting, answer at the terminal', message: `${toolName} in ${project}` };
}

// The whole hook, minus process plumbing. Resolves
//   { output, outcome, followUp }
// where output is what to print, outcome a short class for `approval status`,
// and followUp an optional async step to run after the output is written.
// Never throws: a throw is caught by main and is still `{}`.
export async function runHook(stdinText, {
  source = 'claude',
  now = Date.now,
  rand = crypto.randomBytes,
  home = os.homedir(),
  waitMsCap = null,
  onSlot = () => {},
  onDeadline = () => {},
} = {}) {
  const no = (outcome) => ({ output: NO_DECISION, outcome, followUp: null });

  const agent = Object.hasOwn(AGENTS, source) ? AGENTS[source] : null;
  if (!agent) return no('unsupported-agent');

  let raw;
  try { raw = JSON.parse(stdinText); } catch { return no('bad-input'); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return no('bad-input');
  const req = agent.parse(raw);
  if (!req) return no('bad-input');

  // Gates, in order (design 2.3, step 2). Each one is a plain no-decision exit
  // within milliseconds, with no network.
  const loaded = readApproval(approvalPath(), now());
  if (!loaded.ok) return no(loaded.reason);
  const approval = loaded.approval;
  // From here on the user has remote approval enabled, so outcomes are worth
  // recording for `approval status` (a class only, never content).
  const done = (outcome, output = NO_DECISION, followUp = null) => {
    recordOutcome(outcome, { now: now() });
    return { output, outcome, followUp };
  };

  if (readAwayUntil(awayPath(), now()) === null) return done('not-away');

  // Snooze and quiet hours silence approvals too (design 4.1). A config.json
  // that cannot be read or parsed hides whether quiet hours are on, so it
  // fails closed here, unlike on the notification path.
  const { config, problem } = loadConfigResult();
  if (problem && (problem.type === 'read' || problem.type === 'parse')) return done('config-error');
  if (isSuppressed(config, { now: now() })) return done('suppressed');

  if (typeof req.toolName !== 'string' || !approval.tools.includes(req.toolName)) return done('ineligible-tool');
  const command = req.toolInput && typeof req.toolInput === 'object' ? req.toolInput.command : undefined;
  if (typeof command !== 'string' || !command.trim() || command.length > COMMAND_CAP) return done('bad-input');
  if (bashDenylistHit(command)) return done('denylisted');
  if (neverRemoteHit(command, approval.neverRemote)) return done('never-remote');

  let waitMs = approval.waitSeconds * 1000;
  if (waitMsCap) waitMs = Math.min(waitMs, waitMsCap);
  const expiresAt = now() + waitMs;

  const slot = claimSlot({ expiresAt, now: now() });
  if (!slot) return done('no-slot');
  onSlot(slot);
  onDeadline(expiresAt);

  let result;
  const project = projectName(req.cwd);
  const ctx = { agentLabel: agent.label, toolName: req.toolName, project };
  try {
    const rid = generateOneTime(rand);
    const tokens = { allow: generateOneTime(rand), deny: generateOneTime(rand), terminal: generateOneTime(rand) };
    const display = bashDisplay(command, { mode: approval.display, home });
    // Only the buttons actually offered get a live token.
    if (display.fits) delete tokens.terminal;
    else delete tokens.allow;
    const text = requestText({ ...ctx, display, sessionId: req.sessionId, expiresAt });
    result = await exchange({
      base: approval.server,
      token: approval.token,
      requestTopic: approval.requestTopic,
      responseTopic: `${approval.responsePrefix}_${rid}`,
      rid,
      tokens,
      title: text.title,
      message: text.message,
      allowApprove: display.fits,
      expiresAt,
      now,
    });
    result.rid = rid;
  } finally {
    releaseSlot(slot);
  }

  const outcome = result.decision || result.reason || 'no-decision';
  const followUp = result.published
    ? () => publishJson(approval.server, buildFollowUpPayload({
      requestTopic: approval.requestTopic,
      rid: result.rid,
      ...followUpText({ ...ctx, result: outcome }),
    }), { token: approval.token, timeoutMs: FOLLOW_UP_BUDGET_MS })
    : null;
  // decisionOutput turns only 'allow' and 'deny' into a decision; the
  // verifier is the only source of either.
  return done(outcome, decisionOutput(result.decision), followUp);
}

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) { resolve(''); return; }
    let data = '';
    let finished = false;
    const done = (val) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { process.stdin.pause(); } catch {}
      resolve(val);
    };
    const timer = setTimeout(() => done(data), STDIN_TIMEOUT_MS);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
      if (data.length > STDIN_CAP) done('');
    });
    process.stdin.on('end', () => done(data));
    process.stdin.on('error', () => done(''));
  });
}

async function main() {
  let responded = false;
  let slot = null;

  // Last resort for every abnormal path: print `{}` once (synchronously, so
  // it lands even mid-exit), free the slot, exit 0. If a decision was already
  // written, nothing more is printed.
  const bail = () => {
    if (!responded) {
      responded = true;
      try { fs.writeSync(1, '{}\n'); } catch {}
    }
    releaseSlot(slot);
    process.exit(0);
  };
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
    try { process.on(sig, bail); } catch {}
  }
  process.on('uncaughtException', (err) => { logHookError('approve', err); bail(); });
  process.on('unhandledRejection', (err) => { logHookError('approve', err); bail(); });
  process.on('exit', () => releaseSlot(slot));

  const respond = (output) => new Promise((resolve) => {
    if (responded) { resolve(); return; }
    responded = true;
    process.stdout.write(JSON.stringify(output) + '\n', () => resolve());
  });

  try {
    const args = parseArgs(process.argv);
    const stdinText = await readStdin();
    const result = await runHook(stdinText, {
      source: args.source,
      waitMsCap: parseWaitCap(process.env.AAN_APPROVAL_WAIT_MS),
      onSlot: (s) => { slot = s; },
      // Backstop: whatever happens, never outlive the wait by more than a few
      // seconds. The agent's own timeout is the wait plus 30 s.
      onDeadline: (expiresAt) => { setTimeout(bail, Math.max(0, expiresAt - Date.now()) + 10000).unref(); },
    });
    slot = null;
    await respond(result.output);
    if (result.followUp) {
      await Promise.race([
        result.followUp().catch(() => {}),
        new Promise((r) => setTimeout(r, FOLLOW_UP_BUDGET_MS).unref()),
      ]);
    }
  } catch (err) {
    logHookError('approve', err);
  }
  await respond(NO_DECISION);
  process.exit(0);
}

if (isEntry(process.argv[1], import.meta.url)) {
  main();
}
