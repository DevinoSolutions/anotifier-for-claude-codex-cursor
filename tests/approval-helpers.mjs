// tests/approval-helpers.mjs — shared by the remote-approval tests: a fake
// ntfy server on node:http (streaming /<topic>/json subscribe, JSON publish to
// /, plain publish to /<topic>), a seeded throwaway HOME, and an ASYNC
// subprocess runner for src/approve.mjs (async, because the fake server lives
// in the test process and spawnSync would block it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { generateRequestTopic, generateResponsePrefix } from '../src/approval.mjs';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const ALLOW_BYTES = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}\n';
export const DENY_BYTES = '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"Denied from phone via anotifier."}}}\n';
export const NO_DECISION_BYTES = '{}\n';

// A loopback port that was just free: bind port 0, note it, close it.
export function closedPortBase() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(`http://127.0.0.1:${port}`));
    });
  });
}

// The fake server. `fake.mode` switches failure behaviour per test:
//   subscribeStatus  answer GET /<t>/json with this status instead of 200
//   subscribeHang    never answer the subscribe at all (slow headers)
//   noOpen           answer 200 but never send the open event
//   publishStatus    answer POST / with this status
//   publishHang      never answer the publish
//   cutAfterPublish  destroy every subscriber socket right after a publish
//   flood            after a publish, stream this many bytes of junk lines
//   junkMessages     after a publish, send this many bogus message events
//   rawLines         after a publish, write these raw lines to subscribers
// `fake.onRequest(payload, fake)` runs for every JSON publish that carries
// actions: that is "the phone".
export async function startFakeNtfy() {
  const fake = {
    mode: {},
    published: [], // JSON publishes, in order: { payload, auth }
    subscribes: [], // { topic, auth }
    posts: [], // plain POST /<topic>: { topic, body }
    subscribers: new Map(), // topic -> Set(res)
    sockets: new Set(),
    onRequest: null,
  };
  const send = (topic, body) => {
    const subs = fake.subscribers.get(topic);
    if (!subs) return;
    const line = JSON.stringify({ id: Math.random().toString(36).slice(2, 12), time: Math.floor(Date.now() / 1000), event: 'message', topic, message: body }) + '\n';
    for (const res of subs) res.write(line);
  };
  fake.deliver = send;
  fake.writeAll = (topic, raw) => {
    for (const res of fake.subscribers.get(topic) || []) res.write(raw);
  };
  fake.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    if (req.method === 'GET' && parts.length === 2 && parts[1] === 'json') {
      const topic = parts[0];
      fake.subscribes.push({ topic, auth: req.headers.authorization || null });
      if (fake.mode.subscribeHang) return; // never answer
      if (fake.mode.subscribeStatus) { res.statusCode = fake.mode.subscribeStatus; res.end('{"error":"nope"}'); return; }
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      if (!fake.subscribers.has(topic)) fake.subscribers.set(topic, new Set());
      fake.subscribers.get(topic).add(res);
      req.on('close', () => fake.subscribers.get(topic)?.delete(res));
      if (!fake.mode.noOpen) res.write(JSON.stringify({ id: 'o', time: 1, event: 'open', topic }) + '\n');
      res.write(JSON.stringify({ id: 'k', time: 1, event: 'keepalive', topic }) + '\n');
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      if (req.method === 'POST' && parts.length === 0) {
        let payload = null;
        try { payload = JSON.parse(body); } catch {}
        fake.published.push({ payload, auth: req.headers.authorization || null });
        if (fake.mode.publishHang) return;
        res.statusCode = fake.mode.publishStatus || 200;
        res.end(JSON.stringify({ id: 'p', event: 'message' }));
        if (res.statusCode !== 200 || !payload?.actions) return;
        const topic = new URL(payload.actions[0].url).pathname.split('/').filter(Boolean)[0];
        setTimeout(() => {
          if (fake.mode.cutAfterPublish) {
            for (const r of fake.subscribers.get(topic) || []) r.destroy();
            return;
          }
          if (fake.mode.flood) {
            const chunk = `${JSON.stringify({ event: 'keepalive', topic, pad: 'x'.repeat(900) })}\n`;
            let sent = 0;
            for (const r of fake.subscribers.get(topic) || []) {
              while (sent < fake.mode.flood && !r.destroyed) { r.write(chunk); sent += chunk.length; }
            }
          }
          if (fake.mode.junkMessages) {
            for (let i = 0; i < fake.mode.junkMessages; i++) send(topic, `junk ${i}`);
          }
          if (fake.mode.rawLines) fake.writeAll(topic, fake.mode.rawLines.join('\n') + '\n');
          fake.onRequest?.(payload, fake);
        }, 20);
        return;
      }
      if (req.method === 'POST' && parts.length === 1) {
        fake.posts.push({ topic: parts[0], body });
        res.end(JSON.stringify({ id: 'r', event: 'message' }));
        send(parts[0], body);
        return;
      }
      res.statusCode = 404;
      res.end();
    });
  });
  fake.server.on('connection', (s) => { fake.sockets.add(s); s.on('close', () => fake.sockets.delete(s)); });
  await new Promise((r) => fake.server.listen(0, '127.0.0.1', r));
  fake.base = `http://127.0.0.1:${fake.server.address().port}`;
  fake.reset = () => {
    fake.mode = {};
    fake.published = [];
    fake.subscribes = [];
    fake.posts = [];
    fake.onRequest = null;
  };
  fake.close = () => new Promise((r) => {
    for (const s of fake.sockets) s.destroy();
    fake.server.close(() => r());
  });
  return fake;
}

// Tap a button exactly as the ntfy app does: the action's own method, URL,
// headers and body, nothing else.
export function tap(action) {
  return new Promise((resolve, reject) => {
    const req = http.request(action.url, { method: action.method || 'POST', headers: action.headers || {} }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end(action.body || '');
  });
}

export function actionByLabel(payload, label) {
  return (payload?.actions || []).find((a) => a.label === label);
}

// A throwaway HOME with remote approval configured and (by default) away on.
export function seedHome({ server, token, approval = {}, away = true, awayUntil, config } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-approve-'));
  const dir = path.join(home, '.anotifier');
  const approvalsDir = path.join(dir, 'approvals');
  fs.mkdirSync(approvalsDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dir, 0o700); fs.chmodSync(approvalsDir, 0o700); } catch {}
  const data = {
    v: 1,
    enabled: true,
    server,
    requestTopic: generateRequestTopic(),
    responsePrefix: generateResponsePrefix(),
    ...(token ? { token } : {}),
    waitSeconds: 300,
    display: 'summary',
    tools: ['Bash'],
    neverRemote: [],
    ...approval,
  };
  fs.writeFileSync(path.join(dir, 'approval.json'), JSON.stringify(data), { mode: 0o600 });
  try { fs.chmodSync(path.join(dir, 'approval.json'), 0o600); } catch {}
  if (away) {
    fs.writeFileSync(path.join(approvalsDir, 'away.json'), JSON.stringify({ until: awayUntil ?? Date.now() + 3600 * 1000 }), { mode: 0o600 });
  }
  if (config) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
  return { home, data, dir, approvalsDir };
}

export function bashRequest(command, extra = {}) {
  return JSON.stringify({
    session_id: 'abc12345-session',
    transcript_path: '/tmp/t.jsonl',
    cwd: '/work/my-app',
    permission_mode: 'default',
    hook_event_name: 'PermissionRequest',
    tool_name: 'Bash',
    tool_input: { command, description: 'MODEL WRITTEN DESCRIPTION' },
    ...extra,
  });
}

const SCRUB = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'NTFY_TOKEN', 'AAN_APPROVAL_TOKEN'];

// Run src/approve.mjs. Resolves { status, signal, stdout, stderr, ms }.
// `onSpawn(child)` lets a test signal the process mid-run.
export function runApprove({ home, stdin = '', args = ['--source', 'claude'], env = {}, nodeArgs = [], waitMs = 4000, timeoutMs = 30000, onSpawn } = {}) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, HOME: home, USERPROFILE: home, ANOTIFIER_TELEMETRY: '0', ...(waitMs ? { AAN_APPROVAL_WAIT_MS: String(waitMs) } : {}), ...env };
    for (const k of SCRUB) delete childEnv[k];
    const started = Date.now();
    const child = spawn(process.execPath, [...nodeArgs, path.join(repoRoot, 'src', 'approve.mjs'), ...args], {
      cwd: repoRoot, env: childEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    const killer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (status, signal) => {
      clearTimeout(killer);
      resolve({ status, signal, stdout, stderr, ms: Date.now() - started });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(stdin);
    onSpawn?.(child);
  });
}

export function cleanup(home) {
  try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
}
