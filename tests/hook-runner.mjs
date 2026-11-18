// tests/hook-runner.mjs — run the REAL src/notify.mjs hook as a subprocess against
// a throwaway HOME, the way an agent would, and hand back what it printed.
//
// One place for what every hook test needs and used to spell out by hand:
//   - HOME and USERPROFILE point at the test's home, never the developer's;
//   - the agent and ntfy credentials in the environment are scrubbed, so the run
//     depends on the config in the test's home and on nothing that happens to be
//     set on the machine;
//   - the update check cannot reach npm (see seedFreshUpdateCache in fake-home.mjs),
//     so the run is offline and never announces an update to a channel the test is
//     counting requests on. Pass `offline: false` for a test that is about that.
//
//   runHook({ source, payload, home })      async: use it whenever the test also
//                                           runs a local HTTP server, because the
//                                           child's request is served by THIS
//                                           process's event loop
//   runHookSync({ source, payload, home })  spawnSync, for tests with no server
//
// Both resolve to { status, signal, stdout, stderr } (strings, never undefined).
// Options: `source` (--source, default 'claude'), `args` (extra arguments, such as
// ['--event', 'Stop']), `payload` (an object is sent as JSON, a string as is),
// `home` (required), `env` (extra environment; wins over the scrubbing, and a key set to
// undefined is removed from the child's environment), `cwd`,
// `timeoutMs`, `offline`.
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { seedFreshUpdateCache } from './fake-home.mjs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NOTIFY = path.join(repoRoot, 'src', 'notify.mjs');

// Credentials and endpoints an agent or the developer may have exported. A hook
// test must get its behaviour from the config it wrote, not from these.
export const SCRUB = [
  'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'CURSOR_API_KEY', 'NTFY_TOKEN',
];

// What the runners spawn, without spawning it: exported so the helper itself can be tested.
export function buildInvocation({ source = 'claude', args = [], payload, home, env = {}, cwd = repoRoot, offline = true }) {
  if (typeof home !== 'string' || !home) throw new Error('runHook needs a home: it must never run against the real one');
  if (path.resolve(home) === path.resolve(os.homedir())) throw new Error('runHook was given the real home directory');
  if (offline) seedFreshUpdateCache(home);
  const childEnv = { ...process.env };
  for (const key of SCRUB) delete childEnv[key];
  Object.assign(childEnv, { HOME: home, USERPROFILE: home }, env);
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete childEnv[key];
  const input = payload === undefined ? '' : typeof payload === 'string' ? payload : JSON.stringify(payload);
  return { argv: [NOTIFY, '--source', source, ...args], input, env: childEnv, cwd };
}

export function runHookSync(options) {
  const { argv, input, env, cwd } = buildInvocation(options);
  const res = spawnSync(process.execPath, argv, {
    cwd, input, env, encoding: 'utf8', timeout: options.timeoutMs ?? 30000,
  });
  return { status: res.status, signal: res.signal, stdout: res.stdout || '', stderr: res.stderr || '', error: res.error };
}

export function runHook(options) {
  const { argv, input, env, cwd } = buildInvocation(options);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, argv, { cwd, env, timeout: options.timeoutMs ?? 30000 });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.stdin.on('error', () => {}); // a child that exits before reading stdin
    child.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    child.stdin.end(input);
  });
}
