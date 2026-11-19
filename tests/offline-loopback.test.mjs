import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { isLoopback } = createRequire(import.meta.url)('./offline-loopback.cjs');

test('offline preload: loopback forms stay reachable', () => {
  for (const h of ['localhost', 'LOCALHOST', 'localhost.', '127.0.0.1', '127.1.2.3', '::1', '[::1]', '0.0.0.0', '::ffff:127.0.0.1', undefined, '']) {
    assert.equal(isLoopback(h), true, String(h));
  }
});

test('offline preload: lookalike and remote hosts are refused', () => {
  for (const h of ['localhost.example.com', '127.evil.com', '127.0.0.1.evil.com', 'evil-localhost', 'example.com', '10.0.0.1', '192.168.1.1', '::2', '::ffff:10.0.0.1', 'registry.npmjs.org']) {
    assert.equal(isLoopback(h), false, h);
  }
});
