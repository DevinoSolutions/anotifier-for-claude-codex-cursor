// scripts/approval/phone-sim.mjs — a stand-in for the ntfy phone app in the
// real-server lane (docs/design/remote-approval.md 5.3). It logs in as the
// `phone` user, reads the request topic, parses `actions`, and performs a
// chosen `http` action EXACTLY as the ntfy app would: the action's own method,
// URL, headers and body, and no credentials of its own.
import http from 'node:http';
import https from 'node:https';

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = (u.protocol === 'https:' ? https : http).request(u, { method, headers, agent: false }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end(body);
  });
}

export function basicAuth(user, pass) {
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

// Every cached message on a topic, as the given identity (headers).
export async function pollTopic(base, topic, headers = {}) {
  const res = await request(`${base}/${topic}/json?poll=1&since=all`, { headers });
  if (res.status !== 200) return { status: res.status, messages: [] };
  const messages = res.body.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((m) => m && m.event === 'message');
  return { status: res.status, messages };
}

// Wait for the first message on the request topic that carries actions and
// satisfies `match`. Polls, so it works whether it starts before or after
// the hook publishes.
export async function waitForRequest({ base, topic, user, pass, match = () => true, timeoutMs = 20000, intervalMs = 250 }) {
  const headers = { Authorization: basicAuth(user, pass) };
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status, messages } = await pollTopic(base, topic, headers);
    if (status !== 200) throw new Error(`phone could not read the request topic: HTTP ${status}`);
    const hit = messages.find((m) => Array.isArray(m.actions) && m.actions.length && match(m));
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return null;
}

// Tap a button the way the app does.
export async function performAction(action, overrides = {}) {
  const a = { ...action, ...overrides };
  if (a.action !== 'http') throw new Error(`not an http action: ${a.action}`);
  return request(a.url, { method: a.method || 'POST', headers: a.headers || {}, body: a.body || '' });
}

export function actionByLabel(message, label) {
  return (message?.actions || []).find((a) => a.label === label) || null;
}

export { request };
