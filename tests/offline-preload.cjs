// tests/offline-preload.cjs — run the suite as if the network were unplugged.
//
//   NODE_OPTIONS="--require <abs path>/tests/offline-preload.cjs" node scripts/run-tests.mjs tests
//
// Use an absolute path: a relative one is resolved against each child's own cwd,
// so it breaks every child a test spawns with another working directory.
//
// NODE_OPTIONS is inherited by every child process a test spawns (notify.mjs, the
// CLI, statusline.mjs), so a spawned hook that reaches for npm, claude.ai or any
// other remote host fails at once with ENETUNREACH instead of quietly depending on
// the machine's connection. Loopback and unix sockets are untouched: the tests'
// own local servers keep working.
//
// TRAP_LOG=<file>   append one JSON line per refused connection (host, port, argv,
//                   HOME of the process), to find which test reached out.
// TRAP_LOG_ONLY=1   do not refuse, only log: for the e2e tier, which talks to the
//                   real ntfy.sh on purpose, to see what else it reaches.
'use strict';
const net = require('node:net');
const fs = require('node:fs');

const connect = net.Socket.prototype.connect;
const { isLoopback } = require('./offline-loopback.cjs');

net.Socket.prototype.connect = function patchedConnect(...args) {
  let target = args[0];
  if (Array.isArray(target)) target = target[0]; // already-normalised form
  let host;
  let port;
  let socketPath;
  if (target && typeof target === 'object') {
    ({ host, port, path: socketPath } = target);
  } else if (typeof target === 'number' || (typeof target === 'string' && /^\d+$/.test(target))) {
    port = target;
    host = typeof args[1] === 'string' ? args[1] : undefined;
  } else if (typeof target === 'string') {
    socketPath = target;
  }
  if (socketPath) return connect.apply(this, args);
  const name = String(host || 'localhost');
  if (isLoopback(name)) return connect.apply(this, args);

  if (process.env.TRAP_LOG) {
    try {
      fs.appendFileSync(process.env.TRAP_LOG, `${JSON.stringify({
        host: name, port, argv: process.argv.slice(1, 4), home: process.env.HOME || process.env.USERPROFILE,
      })}\n`);
    } catch { /* logging is best effort */ }
  }
  if (process.env.TRAP_LOG_ONLY) return connect.apply(this, args);
  const err = new Error(`offline-preload: refused a connection to ${name}`);
  err.code = 'ENETUNREACH';
  process.nextTick(() => this.destroy(err));
  return this;
};
