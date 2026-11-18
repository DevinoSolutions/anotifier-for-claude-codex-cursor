// cli/setup.mjs
import readline from 'node:readline';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { randomInt } from 'node:crypto';
import { execSync } from 'node:child_process';
import { getConfigDir, getConfigPath, loadConfigResult, saveConfig } from '../src/config-loader.mjs';
import { toastPlatform } from '../src/platforms/index.mjs';
import { findWslPowerShell } from '../src/platforms/wsl.mjs';
import { TOOL_EVENTS, patchClaude, patchCodex, patchCursor, patchGemini, patchAntigravity } from '../setup/patch-config.mjs';
import { ask, askYN, log } from './ui.mjs';
import { DOCS_URL, STAR_LINE, SUPPORT_LINE } from '../src/support.mjs';
import { track } from '../src/telemetry.mjs';
import { resolveSetupConsent } from './telemetry.mjs';
import { PLATFORM_INFO, applyToastBackendResult, isProbeTimeout, probeBinary } from './toast-backend.mjs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = os.homedir();
// win32 | darwin | wsl | linux: WSL toasts go through Windows, not notify-send.
const PLATFORM = toastPlatform();

// What Antigravity CLI / IDE put in ~/.gemini. A ~/.gemini holding only these
// belongs to an Antigravity-only user and is not a Gemini CLI install.
const ANTIGRAVITY_ONLY_ENTRIES = new Set(['antigravity-cli', 'antigravity', 'antigravity-ide', 'config']);

// Conservative on purpose: Gemini CLI is detected whenever settings.json exists
// or ~/.gemini is empty or holds anything that is not an Antigravity marker.
export function hasGeminiCli(geminiDir) {
  let entries;
  try { entries = fs.readdirSync(geminiDir); } catch { return false; }
  if (entries.length === 0) return true;
  return entries.some((name) => name === 'settings.json' || !ANTIGRAVITY_ONLY_ENTRIES.has(name));
}

// Where each tool's dir, config file and label come from is TOOL_EVENTS (the
// same registry the patchers and `status` use); only HOW a tool is recognised
// is local, because it differs per tool.
const DETECTORS = {
  // Claude Code is detected by its settings file, not just the directory.
  claude: (dir) => fs.existsSync(path.join(dir, TOOL_EVENTS.claude.file)),
  codex: (dir) => fs.existsSync(dir),
  cursor: (dir) => fs.existsSync(dir),
  gemini: (dir) => hasGeminiCli(dir),
  // Antigravity CLI keeps its app data in ~/.gemini/antigravity-cli; its hooks
  // file sits beside Gemini CLI's, under ~/.gemini/config (see patchAntigravity).
  antigravity: (dir) => fs.existsSync(path.join(dir, 'antigravity-cli')),
};

export function detectTools(home = HOME) {
  const tools = [];
  for (const [name, tool] of Object.entries(TOOL_EVENTS)) {
    const dir = path.join(home, tool.dir);
    if (DETECTORS[name](dir)) tools.push({ name, label: tool.label, dir });
  }
  return tools;
}

// The topic is the only thing keeping a public ntfy.sh topic private, so it
// comes from the CSPRNG (16 chars of 36 ≈ 82 bits), not Math.random.
export function generateTopic(rand = randomInt) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 16; i++) suffix += chars[rand(chars.length)];
  return `anotifier-${suffix}`;
}

function resolveNotifyPath() {
  const packageNotify = path.resolve(__dirname, '..', 'src', 'notify.mjs');
  if (fs.existsSync(packageNotify)) return packageNotify;
  return path.join(getConfigDir(), 'src', 'notify.mjs');
}

const ICON_URL = 'https://claude.ai/images/claude_app_icon.png';
const ICON_DEADLINE_MS = 10000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
// Antivirus scanning the fresh file, or a toast still holding the old icon, can
// make a Windows rename fail for a moment.
const RENAME_RETRIES = 3;
const RENAME_RETRY_MS = 75;
const RENAME_RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES']);
const STALE_TEMP_MS = 60000;

// True when the file starts with the PNG signature. A captive portal or a
// challenge page answers 200 with HTML, and that is not an icon.
function hasPngSignature(file) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const head = Buffer.alloc(PNG_SIGNATURE.length);
    const n = fs.readSync(fd, head, 0, head.length, 0);
    return n === head.length && head.equals(PNG_SIGNATURE);
  } catch { return false; } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* best effort */ } }
  }
}

// An icon file counts only when it is a PNG: an empty or non-PNG one (left by
// an older failed or bad download) is not an icon, and Linux toasts would pass
// it as --icon. Such a leftover is removed so the download is retried and a
// failed retry leaves no icon at all.
export function hasUsableIcon(iconPath) {
  try { fs.statSync(iconPath); } catch { return false; }
  if (hasPngSignature(iconPath)) return true;
  try { fs.rmSync(iconPath, { force: true }); } catch { /* best effort */ }
  return false;
}

// Temp files from a download that was killed (Ctrl+C is handled, a hard kill is
// not) are named <icon>.<pid>.tmp; drop the ones nobody can still be writing.
export function sweepStaleIconTemps(iconPath, { maxAgeMs = STALE_TEMP_MS, now = Date.now() } = {}) {
  const dir = path.dirname(iconPath);
  const prefix = `${path.basename(iconPath)}.`;
  let names;
  try { names = fs.readdirSync(dir); } catch { return; }
  for (const name of names) {
    if (!name.startsWith(prefix) || !name.endsWith('.tmp')) continue;
    const file = path.join(dir, name);
    try {
      if (now - fs.statSync(file).mtimeMs > maxAgeMs) fs.rmSync(file, { force: true });
    } catch { /* best effort */ }
  }
}

// Downloads to a temp file beside the target and renames it into place only
// after a complete 200 response whose body is a PNG, so a failure never leaves
// a partial, empty or non-image icon. One overall deadline covers connecting,
// waiting and the body, so a server that goes silent (or drips bytes) cannot
// hang setup. The temp file is also removed if the process exits mid-download
// (setup's Ctrl+C handler calls process.exit). Resolves true or false; never
// rejects. `url`, `timeoutMs`, `rename` and `retryDelayMs` are injectable for tests.
export function downloadIcon(destPath, {
  url = ICON_URL, timeoutMs = ICON_DEADLINE_MS, rename = fs.renameSync, retryDelayMs = RENAME_RETRY_MS,
} = {}) {
  return new Promise((resolve) => {
    const tmpPath = `${destPath}.${process.pid}.tmp`;
    let settled = false;
    let failing = false;
    let req = null;
    let res = null;
    let file = null;
    let timer = null;

    const removeTmp = () => { try { fs.rmSync(tmpPath, { force: true }); } catch { /* best effort */ } };
    const onExit = () => { try { fs.unlinkSync(tmpPath); } catch { /* best effort */ } };
    const settle = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      process.removeListener('exit', onExit);
      resolve(ok);
    };
    // Stop everything and drop the temp file. The file is removed only once its
    // handle is closed, which Windows requires.
    const fail = () => {
      if (settled || failing) return;
      failing = true;
      clearTimeout(timer);
      try { req?.destroy(); } catch { /* already gone */ }
      try { res?.destroy(); } catch { /* already gone */ }
      if (file && !file.closed) {
        file.once('close', () => { removeTmp(); settle(false); });
        file.destroy();
      } else {
        removeTmp();
        settle(false);
      }
    };
    const moveIntoPlace = (retriesLeft) => {
      if (settled || failing) return;
      try {
        rename(tmpPath, destPath);
      } catch (err) {
        if (retriesLeft > 0 && RENAME_RETRYABLE.has(err?.code)) {
          setTimeout(() => moveIntoPlace(retriesLeft - 1), retryDelayMs);
        } else {
          fail();
        }
        return;
      }
      settle(true);
    };
    // The file is closed and flushed: accept it only if the whole body arrived,
    // it is not empty and it is a PNG, then move it into place.
    const commit = () => {
      if (settled || failing) return;
      let ok = false;
      try { ok = Boolean(res?.complete) && hasPngSignature(tmpPath); } catch { ok = false; }
      if (!ok) { fail(); return; }
      moveIntoPlace(RENAME_RETRIES);
    };

    sweepStaleIconTemps(destPath);
    process.once('exit', onExit);
    timer = setTimeout(fail, timeoutMs);
    try {
      const client = new URL(url).protocol === 'http:' ? http : https;
      req = client.get(url, (response) => {
        res = response;
        if (response.statusCode !== 200) { response.resume(); fail(); return; }
        file = fs.createWriteStream(tmpPath);
        file.on('error', fail);
        file.on('close', commit);
        response.on('error', fail);
        // A dropped connection closes the response without completing it.
        response.on('close', () => { if (!response.complete) fail(); });
        response.pipe(file);
      });
      req.on('error', fail);
    } catch { fail(); }
  });
}

// 'ready' | 'missing' | 'unknown'. A timeout (slow pwsh start) is 'unknown':
// it does not prove the module is absent.
function installBurntToast() {
  try {
    execSync('pwsh -NoProfile -Command "if (-not (Get-Module -ListAvailable -Name BurntToast)) { Install-Module BurntToast -Scope CurrentUser -Force -AcceptLicense }"', { stdio: 'pipe', timeout: 30000 });
    return 'ready';
  } catch (err) { return isProbeTimeout(err) ? 'unknown' : 'missing'; }
}

function migrateExistingTopic() {
  const oldConfig = path.join(HOME, '.claude', 'ntfy-config.json');
  try {
    const data = JSON.parse(fs.readFileSync(oldConfig, 'utf8'));
    if (data.topic) return data.topic;
  } catch { /* no old config */ }
  return null;
}

// Collect stdin into memory before any synchronous blocking operations.
// On Windows, execSync (e.g. BurntToast install) blocks the event loop for tens of seconds.
// During that time, the OS pipe buffer fills and stdin EOF arrives. When the event loop
// resumes, readline has already processed all buffered input and closed — causing
// "readline was closed" on subsequent rl.question() calls.
// Fix: collect all stdin upfront, then create a readline shim that serves answers on demand.
function collectStdin() {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      const chunks = [];
      process.stdin.on('data', (c) => chunks.push(c));
      process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      process.stdin.on('error', () => resolve(''));
      process.stdin.resume();
    } else {
      resolve(null); // TTY: readline reads live from stdin directly
    }
  });
}

// A readline-compatible shim that pops answers from a pre-collected lines array.
// question(prompt, callback) immediately calls callback with the next raw line
// (callers ask()/askYN() trim it), so it works correctly even after all stdin
// data has been received.
function makeLineShim(lines) {
  let idx = 0;
  return {
    get closed() { return false; },
    question(prompt, callback) {
      process.stdout.write(prompt);
      const answer = idx < lines.length ? lines[idx++] : '';
      // Use setImmediate to be async like real readline (avoids stack overflows and
      // ensures the calling async function can properly await between questions).
      setImmediate(() => callback(answer));
    },
    close() { /* no-op: no underlying stream to close */ },
  };
}

export async function run() {
  // Ctrl+C during the wizard aborts before anything is written. All answers are
  // collected first and the config/patches are written only at the end, so an
  // abort here genuinely leaves nothing behind.
  process.on('SIGINT', () => {
    log('\n  aborted — nothing saved', 'red');
    process.exit(130);
  });

  // Collect all stdin before any synchronous blocking work (Windows execSync safety).
  const stdinData = await collectStdin();

  let rl;
  if (stdinData !== null) {
    // Non-TTY (piped): serve answers from the pre-collected buffer, one per question call.
    const lines = stdinData.split(/\r?\n/);
    rl = makeLineShim(lines);
  } else {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }

  log('\n  anotifier — cross-platform AI agent notifications\n', 'bold');

  // 1. Platform
  const platLabel = PLATFORM_INFO[PLATFORM].label;
  log(`  Detecting platform... ${platLabel}`, 'cyan');

  // 2. Detect tools
  log('  Detecting tools...', 'cyan');
  const tools = detectTools();
  const allTools = Object.values(TOOL_EVENTS).map((t) => t.label);
  const foundNames = tools.map(t => t.label);
  for (const t of allTools) {
    if (foundNames.includes(t)) log(`    ✓ ${t}`, 'green');
    else log(`    ✗ ${t} (not installed)`, 'dim');
  }

  if (tools.length === 0) {
    // Nothing was set up — fail loud so scripts and users don't read this as success.
    log('\n  No supported AI tools found. Install Claude Code, Codex, Gemini CLI, Antigravity CLI, or Cursor first.', 'red');
    rl.close();
    // Sent only if this install opted in on an earlier run; nothing was asked yet.
    track('setup_failed', { step: 'no_tools' });
    process.exitCode = 1;
    return;
  }

  // 3. Toast backend
  log('\n  Installing toast backend...', 'cyan');
  let toastReady = true;
  if (PLATFORM === 'win32') {
    // Toasts run only through PowerShell 7; without it the BurntToast install
    // below would fail with a message that hides the real cause.
    const pwsh = probeBinary('pwsh');
    if (pwsh === 'unknown') {
      toastReady = null;
      log('    ? PowerShell 7 check timed out — leaving toasts as they are; re-run setup to retry', 'yellow');
    } else if (pwsh === 'missing') {
      toastReady = false;
      log('    ✗ PowerShell 7 (pwsh) not found — Windows toasts need it', 'yellow');
      log('      winget install --id Microsoft.PowerShell --source winget, then re-run: anotifier setup', 'dim');
    } else {
      const bt = installBurntToast();
      if (bt === 'ready') log('    ✓ BurntToast module ready', 'green');
      else if (bt === 'unknown') { toastReady = null; log('    ? BurntToast check timed out — leaving toasts as they are; re-run setup to retry', 'yellow'); }
      else { toastReady = false; log('    ✗ BurntToast install failed — toasts may not work', 'yellow'); }
    }
  } else if (PLATFORM === 'darwin') {
    log('    ✓ osascript (built-in)', 'green');
  } else if (PLATFORM === 'wsl') {
    const exe = findWslPowerShell();
    if (exe) log(`    ✓ Windows toast via ${exe} (WSL interop)`, 'green');
    else { toastReady = false; log('    ✗ no Windows PowerShell reachable — check [interop] enabled=true in /etc/wsl.conf', 'yellow'); }
  } else {
    const found = probeBinary('notify-send');
    if (found === 'found') log('    ✓ notify-send available', 'green');
    else if (found === 'unknown') { toastReady = null; log('    ? notify-send check timed out — leaving toasts as they are; re-run setup to retry', 'yellow'); }
    else { toastReady = false; log('    ✗ notify-send not found — install libnotify for toasts', 'yellow'); }
  }

  // 4. Icon
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const iconPath = path.join(configDir, 'icon.png');
  let iconReady = true;
  if (!hasUsableIcon(iconPath)) {
    const ok = await downloadIcon(iconPath);
    iconReady = ok;
    if (ok) log('    ✓ Notification icon downloaded', 'green');
    else log('    ✗ Icon download failed (toasts will use default icon)', 'yellow');
  }

  // 5. Load config (fail loud on a corrupt file, but offer to rebuild it)
  const { config, problem } = loadConfigResult(getConfigPath());
  if (problem) {
    log(`  ${problem.message}`, 'red');
    const rebuild = await askYN(rl, `config.json is invalid (${problem.type}). Rebuild it from scratch?`, false);
    if (!rebuild) {
      log('  aborted — existing config.json left untouched', 'red');
      rl.close();
      process.exitCode = 1;
      return;
    }
    // Proceed: `config` holds a clean, usable config to overwrite the bad file with.
  }

  // 5b. A toast channel with no backend can only fail on every run, so turn it
  // off (flagged, so a later setup that finds a backend turns it back on).
  const toastChange = applyToastBackendResult(config, toastReady);
  if (toastChange === 'disabled') {
    log(`    ✗ Toasts turned off: no toast backend found. To enable them, ${PLATFORM_INFO[toastPlatform()].installHint}, then re-run: anotifier setup`, 'yellow');
  } else if (toastChange === 'enabled') {
    log('    ✓ Toast backend found — toasts turned back on', 'green');
  }

  // 6. ntfy config
  const enableNtfy = await askYN(rl, 'Enable phone notifications via ntfy?');
  if (enableNtfy) {
    config.ntfy.enabled = true;
    config.ntfy.server = await ask(rl, 'ntfy server', config.ntfy.server || 'https://ntfy.sh');
    const existingTopic = migrateExistingTopic() || config.ntfy.topic;
    const topic = await ask(rl, 'ntfy topic', existingTopic || generateTopic());
    config.ntfy.topic = topic;
  } else {
    config.ntfy.enabled = false;
  }

  // 6b. Anonymous usage stats. Only a first-time setup on a real terminal asks
  // (default Yes); piped/agent-driven runs, closed input, an earlier answer and
  // DO_NOT_TRACK / CI all leave the stored choice (OFF by default) untouched.
  await resolveSetupConsent(rl, config);

  saveConfig(config, getConfigPath());
  log('    ✓ Config saved', 'green');

  // 7. Patch tool configs — collect failures so we never claim success on error.
  log('\n  Patching tool configs...', 'cyan');
  const notifyPath = resolveNotifyPath();
  const backupDir = path.join(configDir, 'backups');

  const patchers = {
    claude: patchClaude,
    codex: patchCodex,
    cursor: patchCursor,
    gemini: patchGemini,
    antigravity: patchAntigravity,
  };

  const failures = [];
  for (const tool of tools) {
    try {
      patchers[tool.name](tool.dir, notifyPath, backupDir);
      log(`    ✓ ${tool.label}`, 'green');
    } catch (err) {
      log(`    ✗ ${tool.label}: ${err.message}`, 'red');
      failures.push({ tool: tool.label, name: tool.name, reason: err.message });
    }
  }

  if (failures.length) {
    log('\n  Setup failed — some tools were not patched:', 'red');
    for (const f of failures) log(`    ✗ ${f.tool}: ${f.reason}`, 'red');
    log('    Fix the errors above and re-run setup.', 'yellow');
    rl.close();
    track('setup_failed', {
      step: 'patch',
      tools_detected: tools.map((t) => t.name),
      failed_tools: failures.map((f) => f.name),
    }, { config });
    process.exitCode = 1;
    return;
  }

  log(`    Backed up originals to ${backupDir}`, 'dim');

  // 8. ntfy info
  if (config.ntfy.enabled && config.ntfy.topic) {
    const url = `${config.ntfy.server}/${config.ntfy.topic}`;
    log('\n  =======================================', 'cyan');
    log('    Phone notifications — subscribe in the ntfy app', 'cyan');
    log('  =======================================', 'cyan');
    log(`    Topic: ${config.ntfy.topic}`);
    log(`    URL:   ${url}`);
    log('');
    log('    Install the ntfy app (Android/iOS), then subscribe to the URL above.');
  }

  // 9. Summary — only reached when every detected tool patched cleanly.
  log('\n  ✓ Setup complete. Restart your AI tools to activate.', 'green');
  log(`    Docs & guides: ${DOCS_URL}`, 'dim');
  // The only place besides `status` where we ask for support — interactive
  // CLI output only, never the hook path and never inside a notification.
  log(`    ${STAR_LINE}`, 'dim');
  log(`    ${SUPPORT_LINE}\n`, 'dim');

  rl.close();
  track('setup_completed', {
    tools_detected: tools.map((t) => t.name),
    toast_backend_ready: toastReady === true,
    icon_ready: iconReady,
    config_rebuilt: Boolean(problem),
    ntfy_enabled: config.ntfy.enabled,
  }, { config });
}
