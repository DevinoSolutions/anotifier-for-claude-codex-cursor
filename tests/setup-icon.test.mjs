// tests/setup-icon.test.mjs — `anotifier setup` downloads the notification icon.
// The download used to hang setup forever on a silent server (the `timeout`
// option only emits an event) and left a 0-byte icon.png behind on any failure,
// which was never retried and then reached Linux toasts as `--icon`.
// Every case talks to a local http server, never the network.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { useFakeHome } from './fake-home.mjs';
import { downloadIcon, hasUsableIcon } from '../cli/setup.mjs';

useFakeHome();

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

let dir;
let dest;
let server;
let sockets;

// handler(req, res, socket) decides how this server misbehaves.
async function serve(handler) {
  const open = new Set();
  sockets = open;
  server = http.createServer((req, res) => handler(req, res, req.socket));
  server.on('connection', (s) => { open.add(s); s.on('close', () => open.delete(s)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${server.address().port}/icon.png`;
}

const leftovers = () => fs.readdirSync(dir).filter((f) => f !== 'icon.png');

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-icon-'));
  dest = path.join(dir, 'icon.png');
});

afterEach(async () => {
  for (const s of sockets || []) s.destroy();
  if (server) await new Promise((resolve) => server.close(resolve));
  server = null;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('downloadIcon', () => {
  it('writes the icon on a 200 and leaves no temp file', async () => {
    const url = await serve((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(PNG); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), true);
    assert.deepEqual(fs.readFileSync(dest), PNG);
    assert.deepEqual(leftovers(), []);
  });

  it('replaces a 0-byte icon left by an older failed download', async () => {
    fs.writeFileSync(dest, '');
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), true);
    assert.deepEqual(fs.readFileSync(dest), PNG);
  });

  it('a non-200 fails and creates nothing', async () => {
    const url = await serve((req, res) => { res.writeHead(404); res.end('nope'); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('an empty 200 body is not an icon', async () => {
    const url = await serve((req, res) => { res.writeHead(200); res.end(); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('a server that never answers is cut off at the deadline instead of hanging', async () => {
    const url = await serve(() => { /* accept the request, say nothing */ });
    const started = Date.now();
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 300 }), false);
    assert.ok(Date.now() - started < 3000, 'must give up near the deadline');
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('a server that stalls mid-body is cut off too, and the partial file is removed', async () => {
    const url = await serve((req, res) => {
      res.writeHead(200, { 'Content-Length': String(PNG.length + 100) });
      res.write(PNG); // the rest never comes
    });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 400 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('a connection reset before any response fails cleanly', async () => {
    const url = await serve((req, res, socket) => socket.destroy());
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('a connection reset mid-body fails cleanly and keeps no partial icon', async () => {
    const url = await serve((req, res, socket) => {
      res.writeHead(200, { 'Content-Length': String(PNG.length + 100) });
      res.write(PNG, () => setTimeout(() => socket.destroy(), 30));
    });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('a failed download never touches an icon that is already there', async () => {
    fs.writeFileSync(dest, PNG);
    const url = await serve((req, res) => { res.writeHead(500); res.end(); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.deepEqual(fs.readFileSync(dest), PNG);
    assert.deepEqual(leftovers(), []);
  });

  it('an unusable URL resolves false instead of throwing', async () => {
    assert.equal(await downloadIcon(dest, { url: 'not a url', timeoutMs: 1000 }), false);
    assert.deepEqual(leftovers(), []);
  });
});

describe('hasUsableIcon', () => {
  it('is false when there is no icon', () => {
    assert.equal(hasUsableIcon(dest), false);
  });

  it('is true for an icon with bytes, and keeps it', () => {
    fs.writeFileSync(dest, PNG);
    assert.equal(hasUsableIcon(dest), true);
    assert.equal(fs.existsSync(dest), true);
  });

  it('treats a 0-byte icon as missing and removes it', () => {
    fs.writeFileSync(dest, '');
    assert.equal(hasUsableIcon(dest), false);
    assert.equal(fs.existsSync(dest), false);
  });
});
