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
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { useFakeHome } from './fake-home.mjs';
import { downloadIcon, hasUsableIcon } from '../cli/setup.mjs';

useFakeHome();

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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

describe('downloadIcon: what counts as an icon', () => {
  it('a 200 that is not a PNG (captive portal, challenge page) is rejected', async () => {
    const url = await serve((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><html><body>Sign in to the network</body></html>');
    });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('a body shorter than the PNG signature is rejected', async () => {
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG.subarray(0, 4)); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), false);
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('replaces an existing non-PNG icon left by an older bad download', async () => {
    fs.writeFileSync(dest, '<html>captive portal</html>');
    assert.equal(hasUsableIcon(dest), false);
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), true);
    assert.deepEqual(fs.readFileSync(dest), PNG);
  });
});

describe('downloadIcon: moving the file into place', () => {
  const busy = (code) => { throw Object.assign(new Error(code), { code }); };

  it('retries a rename that fails briefly (antivirus, a toast holding the icon)', async () => {
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG); });
    let calls = 0;
    const rename = (from, to) => {
      calls += 1;
      if (calls <= 2) busy('EPERM');
      fs.renameSync(from, to);
    };
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000, rename, retryDelayMs: 5 }), true);
    assert.equal(calls, 3);
    assert.deepEqual(fs.readFileSync(dest), PNG);
    assert.deepEqual(leftovers(), []);
  });

  it('gives up after 3 retries, cleans up and reports failure', async () => {
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG); });
    let calls = 0;
    const rename = () => { calls += 1; busy('EBUSY'); };
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000, rename, retryDelayMs: 5 }), false);
    assert.equal(calls, 4, 'first try plus 3 retries');
    assert.equal(fs.existsSync(dest), false);
    assert.deepEqual(leftovers(), []);
  });

  it('does not retry an error that is not a transient lock', async () => {
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG); });
    let calls = 0;
    const rename = () => { calls += 1; busy('ENOENT'); };
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000, rename, retryDelayMs: 5 }), false);
    assert.equal(calls, 1);
    assert.deepEqual(leftovers(), []);
  });
});

describe('downloadIcon: stale temp files', () => {
  it('sweeps old <icon>.<pid>.tmp files at the start of a download, keeping fresh and unrelated ones', async () => {
    const stale = `${dest}.4242.tmp`;
    const fresh = `${dest}.4343.tmp`;
    const other = path.join(dir, 'config.json.1.tmp');
    for (const f of [stale, fresh, other]) fs.writeFileSync(f, 'x');
    const old = new Date(Date.now() - 5 * 60 * 1000);
    fs.utimesSync(stale, old, old);
    fs.utimesSync(other, old, old);
    const url = await serve((req, res) => { res.writeHead(200); res.end(PNG); });
    assert.equal(await downloadIcon(dest, { url, timeoutMs: 5000 }), true);
    assert.equal(fs.existsSync(stale), false, 'old temp is swept');
    assert.equal(fs.existsSync(fresh), true, 'a recent temp may belong to a live download');
    assert.equal(fs.existsSync(other), true, 'only icon temp files are touched');
  });

  it('removes the in-flight temp file when the process exits mid-download (Ctrl+C)', async () => {
    const url = await serve((req, res) => {
      res.writeHead(200, { 'Content-Length': String(PNG.length + 100) });
      res.write(PNG); // the rest never comes, so the temp file stays open
    });
    const setupUrl = pathToFileURL(path.join(repoRoot, 'cli', 'setup.mjs')).href;
    const code = `
      import fs from 'node:fs';
      import { downloadIcon } from ${JSON.stringify(setupUrl)};
      downloadIcon(${JSON.stringify(dest)}, { url: ${JSON.stringify(url)}, timeoutMs: 30000 });
      const t = setInterval(() => {
        if (fs.readdirSync(${JSON.stringify(dir)}).some((f) => f.endsWith('.tmp'))) {
          clearInterval(t);
          setTimeout(() => process.exit(130), 50);
        }
      }, 10);
    `;
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
      env: { ...process.env, HOME: dir, USERPROFILE: dir, ANOTIFIER_TELEMETRY: '0' },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr.on('data', (d) => { stderr += d; });
    const exitCode = await new Promise((resolve) => child.on('close', resolve));
    assert.equal(exitCode, 130, stderr);
    assert.deepEqual(fs.readdirSync(dir), [], 'no icon and no temp file left behind');
  });
});

describe('hasUsableIcon', () => {
  it('is false when there is no icon', () => {
    assert.equal(hasUsableIcon(dest), false);
  });

  it('is true for a valid PNG, and keeps it untouched', () => {
    fs.writeFileSync(dest, PNG);
    assert.equal(hasUsableIcon(dest), true);
    assert.equal(fs.existsSync(dest), true);
  });

  it('treats an existing icon without the PNG signature as missing and removes it', () => {
    fs.writeFileSync(dest, '<html>sign in</html>');
    assert.equal(hasUsableIcon(dest), false);
    assert.equal(fs.existsSync(dest), false);
  });

  it('treats a 0-byte icon as missing and removes it', () => {
    fs.writeFileSync(dest, '');
    assert.equal(hasUsableIcon(dest), false);
    assert.equal(fs.existsSync(dest), false);
  });
});
