// cli/approval.mjs — `anotifier approval setup | status | off`.
//
// EXPERIMENTAL and not enabled by `anotifier setup`. Remote approval lets the
// phone approve commands on this machine (docs/design/remote-approval.md), so
// it is opt-in here, refuses anonymous public ntfy.sh (D1), and does not
// finish setup until a real round trip from the phone works (design 4.2).
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from '../src/config-loader.mjs';
import {
  approvalPath, approvalsDir, awayPath, readApproval, readApprovalRaw, writeApproval, checkServer,
  generateRequestTopic, generateResponsePrefix, generateOneTime, maskTopic, readAwayUntil, clearAway,
  countPendingSlots, readLastOutcome, isPublicNtfySh, REQUEST_TOPIC_RE, RESPONSE_PREFIX_RE,
  APPROVAL_VERSION, DEFAULT_WAIT_SECONDS, MIN_WAIT_SECONDS, MAX_WAIT_SECONDS, DISPLAY_MODES,
  HOOK_TIMEOUT_MARGIN_SECONDS,
} from '../src/approval.mjs';
import { exchange, publishJson, buildFollowUpPayload, probeLockdown, checkAccountTier } from '../src/approval-ntfy.mjs';
import { formatClock } from '../src/suppress.mjs';
import { patchClaudeApproval, unpatchClaudeApproval, claudeApprovalWired } from '../setup/patch-config.mjs';
import { ask, askYN, c } from './ui.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETUP_TEST_WAIT_MS = 120 * 1000;
const USAGE = 'anotifier approval <setup | status | off>';
const SETUP_USAGE = 'anotifier approval setup --server <https://ntfy.example.com> [--display summary|minimal|full] [--wait <seconds>] [--token-expires <YYYY-MM-DD>] [--rotate]';

export const EXPERIMENTAL_NOTICE = [
  'EXPERIMENTAL: remote approval is not finished and is not enabled by `anotifier setup`.',
  'It has not yet been checked on real phones and watches for whether a locked device',
  'can tap Approve. Use it only on a server you control, and only if you accept that.',
];

const REASONS = {
  'not-configured': 'not set up (run: anotifier approval setup)',
  disabled: 'turned off (run: anotifier approval setup)',
  'config-unreadable': 'approval.json cannot be read',
  'config-permissions': 'approval.json is readable by other users; run: chmod 600 ~/.anotifier/approval.json',
  'config-corrupt': 'approval.json is not valid; re-run: anotifier approval setup',
  'server-invalid': 'the server is not a valid https URL',
  'server-insecure': 'the server must use https (plain http only on this machine)',
  'public-ntfy-sh': 'anonymous public ntfy.sh is not supported for approvals; use your own server or an ntfy.sh account token',
  'token-expired': 'the agent access token has expired; create a new one and re-run setup',
};

export function reasonText(reason) {
  return REASONS[reason] || reason;
}

export function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--rotate') flags.rotate = true;
    else if (['--server', '--display', '--wait', '--token-expires'].includes(a)) {
      if (args[i + 1] === undefined) throw new Error(`${a} needs a value`);
      flags[a.slice(2)] = args[++i];
    } else throw new Error(`unknown option ${a}`);
  }
  return flags;
}

function approvePath() {
  return path.resolve(__dirname, '..', 'src', 'approve.mjs');
}

function claudeDir() {
  return path.join(os.homedir(), '.claude');
}

function readClaudeSettings() {
  try { return JSON.parse(fs.readFileSync(path.join(claudeDir(), 'settings.json'), 'utf8')); } catch { return null; }
}

// The server ACL recipe of design 2.5, with this install's names filled in.
export function aclRecipe({ requestTopic, responsePrefix }) {
  return [
    '# server.yml',
    'auth-file: /var/lib/ntfy/user.db',
    'auth-default-access: deny-all',
    '',
    'ntfy user add agent            # used by this machine',
    'ntfy user add phone            # used by the phone app login',
    `ntfy access agent    ${requestTopic} write-only`,
    `ntfy access phone    ${requestTopic} read-only`,
    `ntfy access everyone "${responsePrefix}_*" write-only`,
    `ntfy access agent    "${responsePrefix}_*" read-only`,
    'ntfy token add --expires=90d --label=anotifier agent',
  ];
}

// A readline whose echo can be switched off, for typing an access token
// without it appearing on screen (review of PR #96, L4). Everything the
// interface writes goes through a sink that forwards to `output` unless
// handle.muted is set.
export function createPromptInterface({ input = process.stdin, output = process.stdout } = {}) {
  const handle = { muted: false, output };
  const sink = new Writable({
    write(chunk, encoding, callback) {
      if (!handle.muted) output.write(chunk, encoding);
      callback();
    },
  });
  sink.columns = output.columns;
  sink.isTTY = output.isTTY;
  handle.rl = readline.createInterface({ input, output: sink, terminal: Boolean(output.isTTY) });
  return handle;
}

// Ask for a secret. The prompt is shown, the typed characters are not, and a
// newline is written afterwards so the next line starts clean. Resolves the
// trimmed answer, or '' if the input closes first.
export function askSecret(handle, question) {
  return new Promise((resolve) => {
    let done = false;
    const onClose = () => finish('');
    const finish = (answer) => {
      if (done) return;
      done = true;
      handle.muted = false;
      handle.rl.removeListener('close', onClose);
      handle.output.write('\n');
      resolve((answer ?? '').trim());
    };
    handle.rl.question(`  ? ${question}: `, finish); // the prompt is written before the mute
    handle.muted = true;
    handle.rl.on('close', onClose);
  });
}

// What an anonymous probe that did not get 401 or 403 means, in words.
const LOCKDOWN_RISK = {
  'read-request': 'anyone who learns the topic could read your approval requests, which show your commands',
  'publish-request': 'anyone who learns the topic could post fake approval prompts to your phone',
  'read-response': 'anyone could read the responses, including the one-time tokens in them',
};

export function lockdownFailure(lock) {
  const check = lock.failed;
  const hint = 'Apply the ACL recipe printed above (design: docs/design/remote-approval.md, section 2.5): auth-default-access: deny-all, then the ntfy access lines. Then re-run `anotifier approval setup`; the names stay the same.';
  if (!check) return { message: 'The server could not be checked.', hint };
  if (check.status === null) {
    return {
      message: `Could not check that the server is locked down: ${check.what} failed (${check.error || 'network error'}). Remote approval stays off.`,
      hint: 'Check the server URL and that it is reachable, with a valid https certificate, from this machine. ' + hint,
    };
  }
  const risk = LOCKDOWN_RISK[check.id] || 'the server is not locked down';
  return {
    message: `The server is not locked down: ${check.what} got HTTP ${check.status}, not 401 or 403, so ${risk}. Remote approval stays off.`,
    hint,
  };
}

function fail(message, hint) {
  console.error(`  ${c.error('✗')} ${message}`);
  if (hint) console.error(`    ${c.muted(hint)}`);
  process.exitCode = 1;
}

function printNotice() {
  console.log();
  for (const line of EXPERIMENTAL_NOTICE) console.log(`  ${c.warn(line)}`);
  console.log();
}

async function setup(args) {
  // Setup talks to the server over https and must verify it: do not let an
  // inherited NODE_TLS_REJECT_UNAUTHORIZED=0 switch that off (review of PR #96,
  // M1). The requests also say rejectUnauthorized: true themselves.
  delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  let flags;
  try { flags = parseFlags(args); } catch (err) { fail(err.message, SETUP_USAGE); return; }
  const tty = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const prompt = tty ? createPromptInterface() : null;
  try {
    await setupWith(flags, prompt?.rl ?? null, prompt);
  } finally {
    prompt?.rl.close();
  }
}

async function setupWith(flags, rl, prompt = null) {
  console.log();
  console.log(`  ${c.bold('anotifier')} ${c.accent('approval setup')}`);
  printNotice();
  console.log(`  ${c.white('This lets your phone approve commands that Claude Code wants to run on this machine.')}`);
  console.log(`  ${c.white('Anyone who can read the approval topic on your ntfy server can approve them too.')}`);
  console.log(`  ${c.muted('Only Bash commands, only while `anotifier away` is on. Every failure falls back to the terminal prompt.')}`);
  console.log();

  if (!fs.existsSync(claudeDir())) {
    fail('Claude Code not found (no ~/.claude). Remote approval supports Claude Code only for now.');
    return;
  }

  const existing = readApprovalRaw() || {};
  const rotate = flags.rotate || !REQUEST_TOPIC_RE.test(existing.requestTopic || '') || !RESPONSE_PREFIX_RE.test(existing.responsePrefix || '');

  let server = flags.server;
  if (!server && rl) server = await ask(rl, 'ntfy server URL (your own server, https)', existing.server || '');
  if (!server) { fail('No server given.', SETUP_USAGE); return; }

  // The token never comes from a flag, so it stays out of shell history.
  let token = process.env.AAN_APPROVAL_TOKEN || '';
  if (!token && rl) {
    const keep = existing.token ? ' (Enter keeps the saved one)' : ' (Enter for none)';
    token = await askSecret(prompt, `Access token of the ntfy user this machine publishes as${keep}`);
  }
  if (!token && existing.token) token = existing.token;
  token = token.trim() || null;

  const srv = checkServer(server, token);
  if (!srv.ok) {
    if (srv.reason === 'public-ntfy-sh') {
      fail('Anonymous public ntfy.sh is not supported for remote approval.',
        'Anyone who learns the topic could approve commands, and ntfy.sh, Google and Apple see every request. Use your own ntfy server, or an ntfy.sh account with a reserved topic and its access token (AAN_APPROVAL_TOKEN).');
    } else {
      fail(`Server refused: ${reasonText(srv.reason)}.`);
    }
    return;
  }

  const display = flags.display || existing.display || 'summary';
  if (!DISPLAY_MODES.includes(display)) { fail(`--display must be one of ${DISPLAY_MODES.join(', ')}`); return; }
  const waitSeconds = flags.wait !== undefined ? Number(flags.wait) : (existing.waitSeconds ?? DEFAULT_WAIT_SECONDS);
  if (!Number.isInteger(waitSeconds) || waitSeconds < MIN_WAIT_SECONDS || waitSeconds > MAX_WAIT_SECONDS) {
    fail(`--wait must be a whole number of seconds from ${MIN_WAIT_SECONDS} to ${MAX_WAIT_SECONDS}`);
    return;
  }
  let tokenExpiresAt = flags['token-expires'] ?? (token && token === existing.token ? existing.tokenExpiresAt : undefined);
  if (tokenExpiresAt === undefined && token && rl) {
    tokenExpiresAt = await ask(rl, 'When does that token expire? (YYYY-MM-DD, Enter if it does not)', '') || undefined;
  }
  if (tokenExpiresAt !== undefined && tokenExpiresAt !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tokenExpiresAt) || !Number.isFinite(Date.parse(tokenExpiresAt))) {
      fail('--token-expires must be a date like 2027-01-31'); return;
    }
    if (Date.parse(tokenExpiresAt) <= Date.now()) { fail('That token has already expired.'); return; }
  }

  const data = {
    v: APPROVAL_VERSION,
    enabled: false, // only a successful round trip below turns it on
    server: srv.base,
    requestTopic: rotate ? generateRequestTopic() : existing.requestTopic,
    responsePrefix: rotate ? generateResponsePrefix() : existing.responsePrefix,
    ...(token ? { token } : {}),
    ...(token && tokenExpiresAt ? { tokenExpiresAt } : {}),
    waitSeconds,
    display,
    tools: ['Bash'],
    neverRemote: Array.isArray(existing.neverRemote) ? existing.neverRemote : [],
  };
  // Turning setup on again starts from "off": the hook stays inert until the
  // round trip below succeeds.
  unpatchClaudeApproval(claudeDir(), path.join(getConfigDir(), 'backups'));
  writeApproval(data);

  const host = new URL(srv.base).hostname;
  console.log(`  ${c.bold('1. Server')}`);
  if (isPublicNtfySh(host)) {
    console.log(`  ${c.white('Reserve this topic on your ntfy.sh account with anonymous access denied:')}`);
    console.log(`    ${c.accent(data.requestTopic)}`);
  } else {
    console.log(`  ${c.white('Configure your ntfy server with deny-all and these ACLs (names are this install\'s):')}`);
    for (const line of aclRecipe(data)) console.log(`    ${c.muted(line)}`);
  }
  console.log();
  console.log(`  ${c.bold('2. Phone')}`);
  console.log(`  ${c.white('In the ntfy app, add the server, log in as the phone user, and subscribe to:')}`);
  console.log(`    ${c.accent(data.requestTopic)}`);
  console.log(`  ${c.muted('This is the only time the full topic is shown. Treat it like a password.')}`);
  console.log();
  console.log(`  ${c.bold('3. Safety')}`);
  console.log(`  ${c.white('- Hide sensitive notification content for the ntfy app on the lock screen.')}`);
  console.log(`  ${c.white('- Turn off mirroring of ntfy notifications to watches.')}`);
  console.log(`  ${c.white('- Do not subscribe to this topic in a browser or the ntfy web app on a shared machine.')}`);
  console.log(`  ${c.white('- Treat any approval prompt you did not expect, or any unusual button, as hostile: do not tap it.')}`);
  console.log();

  if (rl) {
    const go = await askYN(rl, 'Server and phone ready? Send a test request now', true, { eof: false });
    if (!go) {
      console.log(`  ${c.muted('Saved, not enabled. Re-run `anotifier approval setup` when ready; the names stay the same.')}`);
      console.log();
      return;
    }
  }

  // The ACL recipe is what keeps a stranger from reading requests or posting
  // fake ones. Ask the server, with no credentials, whether it is enforced
  // before trusting it with a round trip (review of PR #96, M3).
  console.log(`  ${c.white('Checking, without credentials, that the server is locked down...')}`);
  const lock = await probeLockdown(data.server, {
    requestTopic: data.requestTopic,
    responsePrefix: data.responsePrefix,
    checkResponseTopic: !isPublicNtfySh(host),
  });
  if (!lock.ok) {
    const why = lockdownFailure(lock);
    fail(why.message, why.hint);
    return;
  }
  console.log(`  ${c.success('✓')} ${c.white('The server refuses anonymous reads and publishes on the approval topics.')}`);
  console.log();

  // A tierless ntfy account shares one rate-limit visitor per client IP, which
  // can cause intermittent 403s. A warning only: setup goes on either way, and
  // a failed check prints nothing. Skipped on ntfy.sh, where tiers are its plans.
  if (data.token && !isPublicNtfySh(host)) {
    const acct = await checkAccountTier(data.server, data.token);
    if (acct.checked && !acct.hasTier) {
      console.log(`  ${c.warn('!')} ${c.white('This ntfy account has no tier, so overlapping requests from one IP may get intermittent 403s, which make approvals fall back to the terminal.')}`);
      console.log(`  ${c.muted('Fix it on the server (docs/design/remote-approval.md, section 2.5, step 1):')}`);
      console.log(`  ${c.muted('  ntfy tier add --name=approval approval')}`);
      console.log(`  ${c.muted('  ntfy user change-tier <user> approval')}`);
      console.log();
    }
  }

  console.log(`  ${c.white('Sent a test request. Tap Approve on your phone within 2 minutes...')}`);
  const rid = generateOneTime();
  const tokens = { allow: generateOneTime(), deny: generateOneTime() };
  const expiresAt = Date.now() + SETUP_TEST_WAIT_MS;
  const result = await exchange({
    base: data.server,
    token: data.token || null,
    requestTopic: data.requestTopic,
    responseTopic: `${data.responsePrefix}_${rid}`,
    rid,
    tokens,
    title: 'anotifier · approval setup test',
    message: `Tap Approve to finish setting up remote approval for ${os.hostname()}.\n\nNothing runs when you tap it.`,
    allowApprove: true,
    expiresAt,
  });
  if (result.published) {
    const done = result.decision === 'allow' ? 'Setup test approved' : 'Setup test not approved';
    await publishJson(data.server, buildFollowUpPayload({ requestTopic: data.requestTopic, rid, title: done, message: 'anotifier remote approval' }), { token: data.token || null, timeoutMs: 3000 });
  }
  if (result.decision !== 'allow') {
    const why = result.decision === 'deny' ? 'you tapped Deny'
      : result.reason === 'auth' ? 'the server refused the token (check the ACLs and the token)'
        : result.reason === 'quota' ? 'the server rate-limited the request'
          : result.reason === 'expired' ? 'no answer within 2 minutes'
            : `the request failed (${result.reason})`;
    fail(`Round trip failed: ${why}. Remote approval stays off.`, 'Fix it and re-run `anotifier approval setup`; the names stay the same.');
    return;
  }

  writeApproval({ ...data, enabled: true });
  patchClaudeApproval(claudeDir(), approvePath(), {
    timeout: waitSeconds + HOOK_TIMEOUT_MARGIN_SECONDS,
    backupDir: path.join(getConfigDir(), 'backups'),
  });
  console.log(`  ${c.success('✓')} ${c.white('Round trip works. Remote approval is set up for Claude Code (Bash only).')}`);
  console.log(`    ${c.muted('It engages only while away mode is on:')} ${c.white('anotifier away 2h')}`);
  console.log(`    ${c.muted('Turn it off again with:')} ${c.white('anotifier approval off')}`);
  printNotice();
}

async function status() {
  const raw = readApprovalRaw();
  const check = readApproval();
  const settings = readClaudeSettings();
  const wired = settings ? claudeApprovalWired(settings) : false;
  const away = readAwayUntil(awayPath());
  const last = readLastOutcome();

  console.log();
  console.log(`  ${c.bold('anotifier')} ${c.accent('approval')} ${c.warn('(experimental)')}`);
  console.log();
  const row = (k, v) => console.log(`  ${c.muted(k.padEnd(14))} ${v}`);
  row('State', check.ok ? c.success('ready') : c.warn(reasonText(check.reason)));
  if (raw) {
    let origin = 'invalid';
    try { origin = new URL(raw.server).origin; } catch {}
    row('Server', c.white(origin));
    row('Request topic', c.white(maskTopic(raw.requestTopic)));
    row('Token', raw.token ? c.white(raw.tokenExpiresAt ? `set, expires ${raw.tokenExpiresAt}` : 'set') : c.muted('none'));
    row('Display', c.white(String(check.ok ? check.approval.display : raw.display || 'summary')));
    row('Wait', c.white(`${raw.waitSeconds ?? DEFAULT_WAIT_SECONDS} s`));
  }
  row('Claude hook', wired ? c.success('installed') : c.muted('not installed'));
  row('Away', away ? c.warn(`on until ${formatClock(away)}`) : c.muted('off (approvals do not engage)'));
  if (fs.existsSync(approvalsDir())) row('Pending', c.white(String(countPendingSlots())));
  if (last) row('Last result', c.white(`${last.outcome} at ${formatClock(last.at)}`));
  console.log();
}

async function off() {
  const removed = unpatchClaudeApproval(claudeDir(), path.join(getConfigDir(), 'backups'));
  const raw = readApprovalRaw();
  if (raw && raw.enabled !== false) writeApproval({ ...raw, enabled: false });
  const wasAway = clearAway();
  console.log();
  console.log(`  ${c.success('✓')} ${c.white('Remote approval is off.')}`);
  console.log(`    ${c.muted(removed ? 'Claude Code hook removed.' : 'No Claude Code hook was installed.')}`);
  if (wasAway) console.log(`    ${c.muted('Away mode cleared.')}`);
  console.log();
}

export async function run(sub, ...args) {
  if (sub === 'setup') return setup(args);
  if (sub === 'status' || !sub) return status();
  if (sub === 'off') return off();
  fail(`Unknown subcommand "${sub}"`, USAGE);
}
