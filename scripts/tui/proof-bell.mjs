// scripts/tui/proof-bell.mjs — F1: a real INTERACTIVE claude TUI, terminal bell
// enabled, must set the tmux window_bell_flag (proves the bell reaches the
// terminal a real user would hear).
//
// WHY INTERACTIVE, NOT `claude -p`: the claude bell fires only when Claude Code
// writes the Stop-hook response `{"terminalSequence":"\x07"}` to its controlling
// pty (see src/notify.mjs — the claude path upgrades responseBody to a bare BEL
// that CC decodes and writes through its own terminal renderer). That is an
// interactive-renderer path; print/headless `-p` is NOT a proven bell path. The
// only A/B-proven recipe (repo memory tui-proof-harness, claude 2.1.204) drives
// the interactive TUI via send-keys in a non-active tmux window. A paid macOS run
// is too costly to gamble on `-p`, so we replicate the proven interactive drive.
//
// AUTH + FIRST-RUN: auth is PROXYAI_API_KEY (our proxy, preferred) or
// ANTHROPIC_API_KEY (fallback), see claudeProvider(). On a fresh HOME, interactive
// claude would block on: onboarding/theme, the "use this custom API key?" prompt
// (because an env key is a "custom" key), the folder-trust dialog, AND the
// hooks-trust dialog (our seeded settings.json wires hooks). We pre-seed
// ~/.claude.json to pre-accept every one of them (see seedClaudeJson) so claude
// boots straight to an input prompt. The pre-seed is ONLY to skip dialogs — the
// key is still the real auth.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import {
  newDetachedWindow, windowBellFlag, capturePane, sendPrompt, sendKeys,
  resolveBin, killSession, dumpSession, sleep, apiAccountError,
} from './lib.mjs';
import { claudeProvider } from '../lib/provider.mjs';

const SESSION = 'aan-bell';
let agentWin; // set once the claude window exists, so fail() can read its pane
let provider; // which model provider claude runs on (see claudeProvider in ../lib/provider.mjs)

function diagnose(label) {
  console.error(`\n===== F1 DIAGNOSTICS (${label}) =====`);
  console.error(dumpSession(SESSION));
  console.error('===== END F1 DIAGNOSTICS =====\n');
}
// Leave the session alive on failure so the workflow's always() diag step can also
// dump it; we already printed a full dump here.
// An API account error in the pane (out of credits, bad key) means the turn could
// never complete, whatever anotifier did: report it as INFRA. Still exit 1,
// because the bell was not proven.
function fail(msg) {
  const accountErr = agentWin === undefined ? null : apiAccountError(safeCapture(agentWin));
  if (accountErr) {
    console.error(`FAIL [INFRA]: ${msg} The ${provider?.label ?? 'model provider'} refused the request: "${accountErr}"`);
    diagnose('infra-api-account');
    process.exit(1);
  }
  console.error(`FAIL [PRODUCT]: ${msg}`); diagnose('product-fail'); process.exit(1);
}
function infra(msg) { console.error(`FAIL [INFRA]: ${msg}`); process.exit(1); }

// Pre-accept every first-run dialog claude would otherwise block on. Field names
// verified against Claude Code 2.1.x (see CC issue #5572 for the hooks-trust flag
// and the customApiKeyResponses / project-trust schema):
//   - hasCompletedOnboarding (top-level): skips welcome + theme picker.
//   - hasTrustDialogHooksAccepted (top-level): skips the "hooks changed — trust?"
//     prompt that our seeded settings.json hooks trigger.
//   - customApiKeyResponses.approved (top-level): the LAST 20 chars of the key
//     pre-approve the "use this custom API key?" prompt an env ANTHROPIC_API_KEY
//     triggers. It must be the key claude is actually given (the proxy key on
//     the proxy path), not whichever key the CI env happens to hold.
//   - projects[workDir].hasTrustDialogAccepted / hasCompletedProjectOnboarding:
//     folder-trust for the exact directory claude runs in.
// Written to BOTH ~/.claude.json (canonical) and ~/.claude/claude.json (a path
// some builds reference); unknown keys are ignored, so over-seeding is safe and
// strictly lowers the chance a dialog slips through and eats a paid run.
function seedClaudeJson(home, workDir, apiKey) {
  const last20 = String(apiKey).slice(-20);
  const project = {
    hasTrustDialogAccepted: true,
    hasTrustDialogHooksAccepted: true,
    hasCompletedProjectOnboarding: true,
    allowedTools: [],
    history: [],
  };
  const cfg = {
    hasCompletedOnboarding: true,
    hasTrustDialogHooksAccepted: true,
    bypassPermissionsModeAccepted: true,
    theme: 'dark',
    customApiKeyResponses: { approved: [last20], rejected: [] },
    projects: { [workDir]: project },
  };
  const json = JSON.stringify(cfg, null, 2) + '\n';
  fs.writeFileSync(path.join(home, '.claude.json'), json);
  fs.writeFileSync(path.join(home, '.claude', 'claude.json'), json);
}

async function main() {
  provider = claudeProvider();
  if (!provider) infra('PROXYAI_API_KEY or ANTHROPIC_API_KEY required.');
  const apiKey = provider.apiKey;
  console.log(`F1: claude model provider = ${provider.label}`);

  // Isolated HOME so we never touch the runner's real config; wired to notify with
  // terminalBell enabled and every push channel off (the bell is the only signal).
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-tui-bell-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{}\n');
  fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
  fs.writeFileSync(path.join(home, '.anotifier', 'config.json'),
    JSON.stringify({ toast: { enabled: false }, ntfy: { enabled: false }, webhook: { enabled: false }, terminalBell: { enabled: true } }) + '\n');

  // claude runs from (and we pre-trust) this exact directory.
  const workDir = fs.mkdtempSync(path.join(home, 'work-'));
  seedClaudeJson(home, workDir, apiKey);

  const repo = process.cwd();
  await execWire(home, repo);

  // Launch the REAL interactive claude TUI in a NON-active window. HOME/USERPROFILE
  // point config resolution at our isolated home; the provider's variables (proxy
  // base URL + key, or nothing for the inherited ANTHROPIC_API_KEY) ride on the
  // same `env` prefix. `bash -c` (not -lc) keeps the inherited PATH so the npm global
  // `claude` and `node` (for the hook) resolve; we still pass claude's absolute
  // path for good measure.
  const claudeBin = resolveBin('claude');
  // The proof is model-agnostic — a completed turn fires the Stop hook → BEL →
  // tmux bell flag regardless of which model answered — so the provider picks the
  // model (haiku on a real Anthropic key, a sonnet-tier open model on the proxy).
  // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC additionally mutes the auto-updater,
  // telemetry, error reporting, and the extra helper calls that are pure cost
  // here. The interactive recipe itself is unchanged (pinned CLI, same keys).
  // The provider's variables (on the proxy path, its key) go through a 0600 file
  // sourced inside the shell, never onto the command line where ps, tmux's process
  // list or a diagnostics dump could show them. Empty on the Anthropic fallback.
  const envFile = path.join(home, 'provider.env');
  fs.writeFileSync(envFile, Object.entries(provider.env)
    .map(([k, v]) => `export ${k}=${shQuote(v)}\n`).join(''), { mode: 0o600 });
  const cmd = `env HOME='${home}' USERPROFILE='${home}' CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC='1' bash -c ". '${envFile}' && cd '${workDir}' && exec '${claudeBin}' --model ${shQuote(provider.model)}"`;
  const win = newDetachedWindow(SESSION, cmd);
  agentWin = win;
  console.log(`F1: agent window = ${SESSION}:${win} (claude bin: ${claudeBin})`);

  // 1) Wait for claude to boot to an input-ready TUI.
  let booted = false;
  const bootWaitSec = provider.slow ? 90 : 45;
  for (let i = 0; i < bootWaitSec; i++) {
    await sleep(1000);
    if (isClaudeReady(safeCapture(win))) { booted = true; break; }
  }
  console.log(`F1: claude ${booted ? 'reached an input-ready TUI' : `did NOT reach a recognizable input prompt within ${bootWaitSec}s (continuing anyway)`}.`);
  console.log(`F1: pane after boot:\n${tail(safeCapture(win), 20)}`);

  // 2) Type a trivial prompt and submit. A completed turn fires the Stop hook →
  // terminalSequence BEL → tmux window_bell_flag on this non-active window.
  sendPrompt(SESSION, win, 'Reply with the single word OK.');

  // 3) Poll the bell flag. Re-submit defensively at 20s/45s in case the first
  // keystrokes landed before the input widget was interactive (a stray Enter on an
  // already-running turn just no-ops).
  let flag = '0';
  // Open models are slow to first byte, so the proxy path waits longer for the turn.
  const bellWaitSec = provider.slow ? 240 : 90;
  for (let i = 0; i < bellWaitSec; i++) {
    await sleep(1000);
    try { flag = windowBellFlag(SESSION, win); } catch { /* window may still be starting */ }
    if (flag === '1') break;
    // An account error is final: stop waiting and let fail() report it as INFRA.
    if (i % 5 === 4 && apiAccountError(safeCapture(win))) { console.log('F1: the pane shows an API account error, not waiting any longer.'); break; }
    if (i === 20) { console.log('F1: no bell at 20s — re-sending Enter.'); sendKeys(SESSION, win, ['Enter']); }
    if (i === 45) { console.log('F1: no bell at 45s — re-sending prompt.'); sendPrompt(SESSION, win, 'Reply with the single word OK.'); }
  }

  console.log(`F1: final window_bell_flag = ${flag}`);
  console.log(`F1: pane tail:\n${tail(safeCapture(win), 12)}`);

  if (flag !== '1') fail('window_bell_flag never became 1 — claude TUI did not ring the terminal bell.');

  // Success only: clean up. (Failure leaves the session for the workflow diag step.)
  // The killed TUI process dies asynchronously and can still be flushing into the
  // temp home while we delete it — retry, and never fail a passed proof on cleanup.
  killSession(SESSION);
  try {
    fs.rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
  } catch (err) {
    console.log(`F1: temp-home cleanup failed (${err.code}) — runner temp dir, ignoring.`);
  }
  console.log(`PASS (hard): real interactive claude TUI rang the terminal bell (window_bell_flag=1) on ${provider.label}.`);
  process.exit(0);
}

// Any of: the input-box prompt, the shortcuts hint, the welcome banner, or the
// rounded-box border chars claude draws — a version-tolerant "ready" signal.
function isClaudeReady(pane) {
  if (!pane) return false;
  return /\?\s*for\s+shortcuts|>\s|│\s*>|Welcome to Claude|Bypassing Permissions|╭|╰/i.test(pane);
}
function tail(s, n) { return String(s || '').split('\n').slice(-n).join('\n'); }
function safeCapture(win) { try { return capturePane(SESSION, win); } catch { return ''; } }

// Wire notify hooks into the isolated home by running the real setup patcher.
async function execWire(home, repo) {
  const { patchClaude } = await import(path.join(repo, 'setup', 'patch-config.mjs'));
  patchClaude(path.join(home, '.claude'), path.join(repo, 'src', 'notify.mjs'));
}

function shQuote(v) { return `'${String(v).replace(/'/g, `'\\''`)}'`; }

main();
