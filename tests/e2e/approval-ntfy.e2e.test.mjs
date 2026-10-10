// tests/e2e/approval-ntfy.e2e.test.mjs — remote approval against a REAL ntfy
// server configured with the design's ACL recipe (docs/design/remote-approval.md
// 2.5 and 5.3). Runs in .github/workflows/approval-ntfy.yml, which starts a
// pinned ntfy server with deny-all, the agent and phone users, the ACLs and an
// agent token, and exports them here. Skipped when that server is absent
// (every other lane, and local runs).
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { seedHome, bashRequest, runApprove, cleanup, ALLOW_BYTES, DENY_BYTES, NO_DECISION_BYTES } from '../approval-helpers.mjs';
import { waitForRequest, performAction, actionByLabel, pollTopic, request, basicAuth } from '../../scripts/approval/phone-sim.mjs';
import { generateOneTime } from '../../src/approval.mjs';
import { probeLockdown } from '../../src/approval-ntfy.mjs';

const env = process.env;
const base = env.AAN_APPROVAL_NTFY_URL;
const skip = base ? false : 'AAN_APPROVAL_NTFY_URL not set (real ntfy server lane only)';
const token = env.AAN_APPROVAL_AGENT_TOKEN;
const requestTopic = env.AAN_APPROVAL_REQUEST_TOPIC;
const responsePrefix = env.AAN_APPROVAL_RESPONSE_PREFIX;
const openTopic = env.AAN_APPROVAL_OPEN_TOPIC; // a request-style topic the workflow made world read-write
const phone = { user: env.AAN_APPROVAL_PHONE_USER, pass: env.AAN_APPROVAL_PHONE_PASS };
const agentAuth = { Authorization: `Bearer ${token}` };
const phoneAuth = () => ({ Authorization: basicAuth(phone.user, phone.pass) });

const homes = [];
after(() => { for (const h of homes) cleanup(h); });

function home() {
  const h = seedHome({ server: base, token, approval: { requestTopic, responsePrefix } });
  homes.push(h.home);
  return h;
}

// A unique command per run, so the phone sim picks out its own request from
// the topic's cache.
const marker = () => `echo e2e-${crypto.randomBytes(6).toString('hex')}`;

// Start the hook, have the phone wait for its request, then do `act`.
async function round(command, act, { waitMs = 20000, h = home() } = {}) {
  const run = runApprove({ home: h.home, stdin: bashRequest(command), waitMs, timeoutMs: waitMs + 30000 });
  const msg = await waitForRequest({ base, topic: requestTopic, ...phone, match: (m) => String(m.message).startsWith(command) });
  assert.ok(msg, 'the phone received the request');
  if (act) await act(msg);
  return { res: await run, msg };
}

describe('real ntfy server: ACLs as designed (2.5)', { skip }, () => {
  it('anonymous users cannot read the request topic', async () => {
    const r = await pollTopic(base, requestTopic);
    assert.ok([401, 403].includes(r.status), `got ${r.status}`);
  });

  it('anonymous users cannot publish to the request topic (no fake prompts, T10)', async () => {
    const r = await request(`${base}/${requestTopic}`, { method: 'POST', body: 'fake prompt' });
    assert.ok([401, 403].includes(r.status), `got ${r.status}`);
  });

  it('anonymous users cannot read a response topic, but can write to one', async () => {
    const topic = `${responsePrefix}_${generateOneTime()}`;
    const read = await pollTopic(base, topic);
    assert.ok([401, 403].includes(read.status), `read got ${read.status}`);
    const write = await request(`${base}/${topic}`, { method: 'POST', body: 'x' });
    assert.equal(write.status, 200);
  });

  it('the agent token publishes requests and reads responses, but cannot read requests', async () => {
    const pub = await request(`${base}/`, { method: 'POST', headers: { ...agentAuth, 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: requestTopic, message: 'acl probe' }) });
    assert.equal(pub.status, 200);
    const readReq = await pollTopic(base, requestTopic, agentAuth);
    assert.ok([401, 403].includes(readReq.status), `agent read of the request topic got ${readReq.status}`);
    const readResp = await pollTopic(base, `${responsePrefix}_${generateOneTime()}`, agentAuth);
    assert.equal(readResp.status, 200);
  });

  it('the phone reads the request topic but cannot publish to it', async () => {
    assert.equal((await pollTopic(base, requestTopic, phoneAuth())).status, 200);
    const w = await request(`${base}/${requestTopic}`, { method: 'POST', headers: phoneAuth(), body: 'x' });
    assert.ok([401, 403].includes(w.status), `got ${w.status}`);
  });

  // Without a tier, ntfy shares one visitor per IP between accounts, and
  // overlapping requests from one IP (here all on 127.0.0.1; in real use a
  // phone and a laptop behind one home router) gave the phone an intermittent
  // 403. The recipe gives every account a tier (design 2.5, step 1).
  it('overlapping requests from one IP each get the answer their ACL gives (accounts have a tier)', async () => {
    for (let wave = 0; wave < 2; wave++) {
      const phoneReads = [];
      const anonReads = [];
      const agentReads = [];
      for (let i = 0; i < 8; i++) {
        phoneReads.push(pollTopic(base, requestTopic, phoneAuth()));
        anonReads.push(pollTopic(base, requestTopic));
        agentReads.push(pollTopic(base, `${responsePrefix}_${generateOneTime()}`, agentAuth));
      }
      const [phone, anon, agent] = await Promise.all([phoneReads, anonReads, agentReads].map((p) => Promise.all(p)));
      assert.deepEqual(phone.map((r) => r.status), Array(8).fill(200), 'every phone read of the request topic succeeds');
      assert.deepEqual(agent.map((r) => r.status), Array(8).fill(200), 'every agent read of a response topic succeeds');
      for (const r of anon) assert.ok([401, 403].includes(r.status), `an anonymous read of the request topic got ${r.status}`);
    }
  });
});

describe('real ntfy server: the setup lockdown probe (review of PR #96, M3)', { skip }, () => {
  it('passes on this deny-all server, without credentials', async () => {
    const r = await probeLockdown(base, { requestTopic, responsePrefix });
    assert.equal(r.ok, true, JSON.stringify(r.checks));
    assert.deepEqual(r.checks.map((c) => c.ok), [true, true, true]);
  });

  it('refuses an open topic: a world-readable request topic fails the first check', {
    skip: openTopic ? false : 'AAN_APPROVAL_OPEN_TOPIC not set',
  }, async () => {
    const r = await probeLockdown(base, { requestTopic: openTopic, responsePrefix });
    assert.equal(r.ok, false);
    assert.equal(r.failed.id, 'read-request');
    assert.equal(r.failed.status, 200);
  });
});

describe('real ntfy server: the full loop (5.3)', { skip }, () => {
  it('approve', async () => {
    const { res, msg } = await round(marker(), (m) => performAction(actionByLabel(m, 'Approve')));
    assert.equal(res.stdout, ALLOW_BYTES, res.stderr);
    assert.equal(res.status, 0);
    assert.deepEqual(msg.actions.map((a) => a.label), ['Approve', 'Deny']);
    assert.equal(msg.actions[0].headers, undefined, 'no credentials inside the buttons');
  });

  it('deny', async () => {
    const { res } = await round(marker(), (m) => performAction(actionByLabel(m, 'Deny')));
    assert.equal(res.stdout, DENY_BYTES, res.stderr);
  });

  it('timeout: no answer gives no decision and an expiry update with the same sequence id', async () => {
    const cmd = marker();
    const { res, msg } = await round(cmd, null, { waitMs: 3000 });
    assert.equal(res.stdout, NO_DECISION_BYTES, res.stderr);
    assert.equal(res.status, 0);
    const { messages } = await pollTopic(base, requestTopic, phoneAuth());
    const update = messages.find((m) => m.sequence_id === msg.sequence_id && m.title === 'Expired, answer at the terminal');
    assert.ok(update, 'expiry update published');
  });

  it('wrong token: a forged Approve body changes nothing', async () => {
    const { res } = await round(marker(), (m) => {
      const a = actionByLabel(m, 'Approve');
      const body = JSON.parse(a.body);
      return performAction(a, { body: JSON.stringify({ ...body, t: generateOneTime() }) });
    }, { waitMs: 4000 });
    assert.equal(res.stdout, NO_DECISION_BYTES, res.stderr);
  });

  it('replay: the previous request\'s Approve body does nothing for a new request', async () => {
    let old;
    const first = await round(marker(), (m) => { old = actionByLabel(m, 'Approve'); return performAction(old); });
    assert.equal(first.res.stdout, ALLOW_BYTES);
    const second = await round(marker(), async (m) => {
      await performAction(actionByLabel(m, 'Approve'), { body: old.body }); // old body, new topic
      await performAction(old); // old body, old topic
    }, { waitMs: 4000 });
    assert.equal(second.res.stdout, NO_DECISION_BYTES, second.res.stderr);
  });

  it('two concurrent requests answered in reverse order', async () => {
    const h = home();
    const a = marker();
    const b = marker();
    const runA = runApprove({ home: h.home, stdin: bashRequest(a), waitMs: 20000, timeoutMs: 60000 });
    const runB = runApprove({ home: h.home, stdin: bashRequest(b), waitMs: 20000, timeoutMs: 60000 });
    const [msgA, msgB] = await Promise.all([
      waitForRequest({ base, topic: requestTopic, ...phone, match: (m) => String(m.message).startsWith(a) }),
      waitForRequest({ base, topic: requestTopic, ...phone, match: (m) => String(m.message).startsWith(b) }),
    ]);
    await performAction(actionByLabel(msgB, 'Deny'));
    await performAction(actionByLabel(msgA, 'Approve'));
    const [resA, resB] = await Promise.all([runA, runB]);
    assert.equal(resA.stdout, ALLOW_BYTES, resA.stderr);
    assert.equal(resB.stdout, DENY_BYTES, resB.stderr);
  });
});
