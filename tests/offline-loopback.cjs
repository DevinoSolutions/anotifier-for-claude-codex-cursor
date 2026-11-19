// tests/offline-loopback.cjs — which hosts tests/offline-preload.cjs lets through.
// Whole-host match: `localhost.example.com` and `127.evil.com` are NOT loopback.
'use strict';

const LOOPBACK = /^(?:localhost\.?|127(?:\.\d{1,3}){3}|::1|0\.0\.0\.0|(?:::ffff:)127(?:\.\d{1,3}){3})$/i;

// net hands over the bare host (no brackets, no port); the bracketed form is accepted too.
function isLoopback(host) {
  const name = String(host || 'localhost').replace(/^\[(.*)\]$/, '$1');
  return LOOPBACK.test(name);
}

module.exports = { isLoopback };
