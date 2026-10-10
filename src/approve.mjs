#!/usr/bin/env node
// src/approve.mjs — the remote approval hook's entry point (the path that
// setup writes into the agent's settings). Deliberately tiny: it installs the
// handlers that turn every abnormal exit into `{}` and exit 0 BEFORE anything
// else is loaded, then imports the real logic (src/approve-core.mjs) inside a
// try/catch. A module that fails to load (a syntax error, a missing file, a
// broken dependency) therefore prints `{}` and exits 0 instead of crashing
// with a stack trace and a non-zero code (review of PR #96, L3).
//
// Safety property, unchanged (docs/design/remote-approval.md D2, T13): the
// only decision this process can print is the one approve-core.mjs prints
// after the verifier accepted the one-time Allow token. Everything else is
// `{}` with exit 0; the hook never exits 2, which Codex would read as a deny.
// This file imports only node:fs, which cannot fail to load.
import fs from 'node:fs';

// The hook talks to the ntfy server over https and must verify its
// certificate. NODE_TLS_REJECT_UNAUTHORIZED=0 in the agent's environment would
// switch that off for every request (review of PR #96, M1). The request
// options also say rejectUnauthorized: true explicitly.
delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

// Shared with approve-core.mjs: responded is "something was printed already";
// release frees the pending slot; log records an error; bail is below.
const ctl = {
  responded: false,
  release: () => {},
  log: () => {},
  bail: () => {},
};

// Last resort for every abnormal path: print `{}` once (synchronously, so it
// lands even mid-exit), free the slot, exit 0. If a decision was already
// written, nothing more is printed.
ctl.bail = () => {
  if (!ctl.responded) {
    ctl.responded = true;
    try { fs.writeSync(1, '{}\n'); } catch {}
  }
  try { ctl.release(); } catch {}
  process.exit(0);
};

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  try { process.on(sig, ctl.bail); } catch {}
}
const crash = (err) => {
  try { ctl.log(err); } catch {}
  ctl.bail();
};
process.on('uncaughtException', crash);
process.on('unhandledRejection', crash);
// Whatever ended the process (including Node giving up on a top-level await
// that can never settle, which would exit with code 13), the answer is `{}`
// unless a decision was already printed, and the exit code is 0.
process.on('exit', () => {
  if (!ctl.responded) {
    ctl.responded = true;
    try { fs.writeSync(1, '{}\n'); } catch {}
  }
  try { ctl.release(); } catch {}
  process.exitCode = 0;
});

try {
  const core = await import('./approve-core.mjs');
  await core.main(ctl);
} catch (err) {
  // The core would not load (or threw before it could answer). Log if the
  // logger itself loads; either way the answer is no decision.
  try { (await import('./error-log.mjs')).logHookError('approve', err); } catch {}
  ctl.bail();
}
