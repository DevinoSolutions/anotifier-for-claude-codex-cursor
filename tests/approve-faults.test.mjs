// tests/approve-faults.test.mjs — THE safety property of remote approval
// (docs/design/remote-approval.md 5.2, D2, T13), against the REAL
// src/approve.mjs run as a subprocess and a fake ntfy server on node:http.
//
// Invariant: stdout is exactly "{}\n" and the exit code is 0 in every case
// that lacks a valid token. The only run allowed to print allow is the one
// where the phone taps Approve before expiry.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  startFakeNtfy, closedPortBase, seedHome, bashRequest, runApprove, tap, actionByLabel, cleanup,
  ALLOW_BYTES, DENY_BYTES, NO_DECISION_BYTES,
} from './approval-helpers.mjs';
import { generateOneTime } from '../src/approval.mjs';

const POSIX = process.platform !== 'win32';
const TOKEN = 'tk_faulttestabcdefghijklmnopqrs';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let fake;
const homes = [];
before(async () => { fake = await startFakeNtfy(); });
after(async () => {
  await fake.close();
  for (const h of homes) cleanup(h);
});
beforeEach(() => fake.reset());

function home(opts = {}) {
  const h = seedHome({ server: fake.base, token: TOKEN, ...opts });
  homes.push(h.home);
  return h;
}

function assertNoDecision(res, label = '') {
  assert.equal(res.stdout, NO_DECISION_BYTES, `${label} stdout: ${JSON.stringify(res.stdout)} stderr: ${res.stderr}`);
  assert.equal(res.status, 0, `${label} exit ${res.status} ${res.signal || ''} stderr: ${res.stderr}`);
}

function assertNoSlots(h) {
  const left = fs.readdirSync(h.approvalsDir).filter((f) => f.startsWith('slot-'));
  assert.deepEqual(left, [], 'every exit path frees its slot');
}

function assertNoNetwork() {
  assert.equal(fake.subscribes.length, 0, 'no subscribe');
  assert.equal(fake.published.length, 0, 'no publish');
}

function hhmm(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

describe('the one path that may allow', () => {
  it('Approve tapped before expiry prints exactly the allow decision', async () => {
    const h = home();
    fake.onRequest = (payload) => tap(actionByLabel(payload, 'Approve'));
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test') });
    assert.equal(res.stdout, ALLOW_BYTES, res.stderr);
    assert.equal(res.status, 0);
    assertNoSlots(h);

    // What the phone saw (design 2.3 step 5, 2.8).
    const [request, receipt] = fake.published;
    const p = request.payload;
    assert.equal(request.auth, `Bearer ${TOKEN}`);
    assert.equal(p.topic, h.data.requestTopic);
    assert.equal(p.title, 'my-app · Claude Code wants to run Bash');
    assert.match(p.message, /^npm test\n\nSession abc1 · expires \d\d:\d\d$/);
    assert.ok(!JSON.stringify(p).includes('MODEL WRITTEN DESCRIPTION'), 'the model-written description is never shown');
    assert.deepEqual(p.actions.map((a) => a.label), ['Approve', 'Deny']);
    // Subscribed to the fresh response topic BEFORE publishing, with the token.
    assert.equal(fake.subscribes.length, 1);
    assert.equal(fake.subscribes[0].auth, `Bearer ${TOKEN}`);
    assert.equal(fake.subscribes[0].topic, `${h.data.responsePrefix}_${p.sequence_id}`);
    // The receipt replaces the request (same sequence id), with no buttons.
    assert.equal(receipt.payload.sequence_id, p.sequence_id);
    assert.equal(receipt.payload.title, 'Allow decision sent to Claude Code');
    assert.equal(receipt.payload.actions, undefined);
    const last = JSON.parse(fs.readFileSync(path.join(h.approvalsDir, 'last.json'), 'utf8'));
    assert.equal(last.outcome, 'allow');
    assert.deepEqual(Object.keys(last).sort(), ['at', 'outcome'], 'no content recorded');
  });

  it('Deny prints the deny decision, and a later Approve on the same request is ignored', async () => {
    const h = home();
    fake.onRequest = async (payload) => {
      await tap(actionByLabel(payload, 'Deny'));
      await tap({ ...actionByLabel(payload, 'Approve') });
    };
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test') });
    assert.equal(res.stdout, DENY_BYTES, res.stderr);
    assert.equal(res.status, 0);
    assert.equal(fake.published[1].payload.title, 'Deny decision sent to Claude Code');
    assertNoSlots(h);
  });

  it('two concurrent requests answered in reverse order each get their own answer (T9)', async () => {
    const h = home();
    const seen = [];
    fake.onRequest = async (payload) => {
      seen.push(payload);
      if (seen.length < 2) return;
      const first = seen.find((p) => p.message.startsWith('echo first'));
      const second = seen.find((p) => p.message.startsWith('echo second'));
      await tap(actionByLabel(second, 'Deny'));
      await tap(actionByLabel(first, 'Approve'));
    };
    const [a, b] = await Promise.all([
      runApprove({ home: h.home, stdin: bashRequest('echo first') }),
      runApprove({ home: h.home, stdin: bashRequest('echo second') }),
    ]);
    assert.equal(a.stdout, ALLOW_BYTES, a.stderr);
    assert.equal(b.stdout, DENY_BYTES, b.stderr);
    assertNoSlots(h);
  });
});

describe('gates: no decision within milliseconds, and no network', () => {
  const gate = async (label, h, stdin = bashRequest('npm test'), opts = {}) => {
    const res = await runApprove({ home: h.home, stdin, ...opts });
    assertNoDecision(res, label);
    assertNoNetwork();
    assert.ok(res.ms < 10000, `${label} took ${res.ms} ms`);
    return res;
  };

  it('not configured at all', async () => {
    const h = home();
    fs.unlinkSync(path.join(h.dir, 'approval.json'));
    await gate('not configured', h);
    assert.ok(!fs.existsSync(path.join(h.approvalsDir, 'last.json')), 'nothing written for users who never set it up');
  });

  it('disabled', async () => { await gate('disabled', home({ approval: { enabled: false } })); });
  it('not away', async () => { await gate('not away', home({ away: false })); });
  it('away expired', async () => { await gate('away expired', home({ awayUntil: Date.now() - 1000 })); });
  it('away implausibly far in the future', async () => { await gate('away far', home({ awayUntil: Date.now() + 30 * 24 * 3600 * 1000 })); });

  it('away file corrupt', async () => {
    const h = home();
    fs.writeFileSync(path.join(h.approvalsDir, 'away.json'), '{"until":');
    await gate('away corrupt', h);
  });

  it('snoozed', async () => {
    const h = home();
    fs.writeFileSync(path.join(h.dir, '.snooze.json'), JSON.stringify({ until: Date.now() + 3600 * 1000 }));
    await gate('snoozed', h);
  });

  it('in quiet hours', async () => {
    const now = Date.now();
    await gate('quiet hours', home({ config: { quietHours: { enabled: true, from: hhmm(now - 3600e3), to: hhmm(now + 3600e3) } } }));
  });

  it('config.json that cannot be parsed fails closed', async () => {
    const h = home();
    fs.writeFileSync(path.join(h.dir, 'config.json'), '{broken');
    await gate('config corrupt', h);
  });

  it('a tool that is not eligible (Edit, ExitPlanMode, AskUserQuestion)', async () => {
    for (const tool of ['Edit', 'Write', 'ExitPlanMode', 'AskUserQuestion', 'mcp__srv__tool', 'PowerShell']) {
      const h = home({ approval: { tools: ['Bash', 'Edit', 'Write'] } });
      await gate(tool, h, bashRequest('x', { tool_name: tool, tool_input: { command: 'x', file_path: '/work/my-app/a.js' } }));
    }
  });

  it('a denylisted command', async () => { await gate('denylist', home(), bashRequest('echo evil >> ~/.bashrc')); });
  it('a neverRemote prefix', async () => { await gate('neverRemote', home({ approval: { neverRemote: ['git push --force'] } }), bashRequest('git push --force origin main')); });

  it('no free slot: 5 live approvals pending', async () => {
    const h = home();
    for (let i = 0; i < 5; i++) fs.writeFileSync(path.join(h.approvalsDir, `slot-${i}`), `${process.pid} ${Date.now() + 600000}`);
    await gate('no slot', h);
    assert.equal(fs.readdirSync(h.approvalsDir).filter((f) => f.startsWith('slot-')).length, 5, 'other slots untouched');
  });

  it('plain http to a remote server', async () => {
    const res = await runApprove({ home: home({ approval: { server: 'http://ntfy.example.com' } }).home, stdin: bashRequest('npm test') });
    assertNoDecision(res, 'http remote');
  });

  it('D1: public ntfy.sh without a token', async () => {
    const h = seedHome({ server: 'https://ntfy.sh' });
    homes.push(h.home);
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test') });
    assertNoDecision(res, 'ntfy.sh anonymous');
    assert.ok(res.ms < 10000);
  });

  it('an agent this PR does not support yet (codex)', async () => {
    await gate('codex', home(), bashRequest('npm test'), { args: ['--source', 'codex'] });
  });
});

describe('malformed input and local files', () => {
  const cases = {
    'malformed stdin': 'not json {{{',
    'empty stdin': '',
    'stdin array': '[1,2]',
    'wrong event': bashRequest('npm test', { hook_event_name: 'PreToolUse' }),
    'command not a string': bashRequest('x', { tool_input: { command: ['rm', '-rf'] } }),
    'empty command': bashRequest('   '),
    'no tool_input': bashRequest('x', { tool_input: null }),
    'stdin over 1 MB': JSON.stringify({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'x'.repeat(2 * 1024 * 1024) } }),
  };
  for (const [name, stdin] of Object.entries(cases)) {
    it(name, async () => {
      const res = await runApprove({ home: home().home, stdin });
      assertNoDecision(res, name);
      assertNoNetwork();
    });
  }

  it('corrupt approval.json', async () => {
    const h = home();
    fs.writeFileSync(path.join(h.dir, 'approval.json'), '{"v":1,', { mode: 0o600 });
    assertNoDecision(await runApprove({ home: h.home, stdin: bashRequest('npm test') }));
    assertNoNetwork();
  });

  if (POSIX) {
    it('unreadable approval.json', async () => {
      const h = home();
      fs.chmodSync(path.join(h.dir, 'approval.json'), 0o000);
      assertNoDecision(await runApprove({ home: h.home, stdin: bashRequest('npm test') }));
      assertNoNetwork();
      fs.chmodSync(path.join(h.dir, 'approval.json'), 0o600);
    });

    it('group/world-readable approval.json', async () => {
      const h = home();
      fs.chmodSync(path.join(h.dir, 'approval.json'), 0o644);
      assertNoDecision(await runApprove({ home: h.home, stdin: bashRequest('npm test') }));
      assertNoNetwork();
    });
  }
});

describe('server and network faults', () => {
  const fault = async (label, mode, { waitMs = 1500, maxMs = 15000, server } = {}) => {
    fake.mode = mode;
    const h = server ? seedHome({ server, token: TOKEN }) : home();
    if (server) homes.push(h.home);
    // A phone that WOULD approve if it ever got the chance: none of these
    // faults may let that through.
    fake.onRequest = (payload) => tap(actionByLabel(payload, 'Approve')).catch(() => {});
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs });
    assertNoDecision(res, label);
    assert.ok(res.ms < maxMs, `${label} took ${res.ms} ms`);
    assertNoSlots(h);
    return { res, h };
  };

  it('connection refused', async () => { await fault('refused', {}, { server: await closedPortBase() }); });
  it('TLS error (https to a plain-http server)', async () => { await fault('tls', {}, { server: fake.base.replace('http://', 'https://') }); });

  for (const status of [401, 403, 429, 500]) {
    it(`subscribe answered ${status}`, async () => {
      await fault(`subscribe ${status}`, { subscribeStatus: status });
      assert.equal(fake.published.length, 0, 'nothing published without a subscription');
    });
    it(`publish answered ${status}`, async () => {
      const { h } = await fault(`publish ${status}`, { publishStatus: status });
      const want = status === 429 ? 'quota' : status === 500 ? 'server' : 'auth';
      assert.equal(JSON.parse(fs.readFileSync(path.join(h.approvalsDir, 'last.json'), 'utf8')).outcome, want);
    });
  }

  it('subscribe with slow headers (never answered)', async () => { await fault('slow subscribe', { subscribeHang: true }); });
  it('subscribe answered but the open event never comes', async () => {
    await fault('no open', { noOpen: true });
    assert.equal(fake.published.length, 0, 'never publishes before the subscription is confirmed');
  });
  it('publish never answered', async () => { await fault('slow publish', { publishHang: true }); });
  it('stream cut right after publishing', async () => { await fault('cut', { cutAfterPublish: true }); });

  it('10 MB stream: given up at the 64 KB cap, long before expiry', async () => {
    await fault('flood', { flood: 10 * 1024 * 1024 }, { waitMs: 20000, maxMs: 15000 });
  });

  it('60 bogus messages: given up at the 50-message cap, long before expiry', async () => {
    fake.mode = { junkMessages: 60 };
    const h = home();
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 20000 });
    assertNoDecision(res, 'message cap');
    assert.ok(res.ms < 15000, `took ${res.ms}`);
  });

  const JUNK = ['{{{', '[]', '"str"', 'null', '{"event":"message"}', '{"event":"message","message":"{}"}'];

  it('malformed stream lines are ignored, then expiry', async () => {
    fake.mode = { rawLines: JUNK };
    const h = home();
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 1500 });
    assertNoDecision(res, 'raw junk');
    assert.equal(fake.published.at(-1).payload.title, 'Expired, answer at the terminal');
  });

  it('malformed stream lines do not break the stream: a valid Approve after them still counts', async () => {
    fake.mode = { rawLines: JUNK };
    fake.onRequest = (payload) => tap(actionByLabel(payload, 'Approve'));
    const res = await runApprove({ home: home().home, stdin: bashRequest('npm test') });
    assert.equal(res.stdout, ALLOW_BYTES, res.stderr);
  });
});

describe('hostile or late responses', () => {
  it('forged, mismatched and replayed bodies never allow', async () => {
    const h = home();
    fake.onRequest = async (payload) => {
      const approve = actionByLabel(payload, 'Approve');
      const deny = actionByLabel(payload, 'Deny');
      const good = JSON.parse(approve.body);
      const denyBody = JSON.parse(deny.body);
      const bodies = [
        { ...good, t: generateOneTime() }, // random token
        { ...good, t: denyBody.t }, // allow carrying the deny token
        { ...good, rid: generateOneTime() }, // wrong rid
        { ...good, v: 2 },
        { ...good, d: 'ALLOW' },
        { ...good, t: good.t.slice(0, 20) },
        'allow',
        '',
      ];
      for (const b of bodies) await tap({ ...approve, body: typeof b === 'string' ? b : JSON.stringify(b) });
    };
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 2000 });
    assertNoDecision(res, 'forged');
    assert.equal(fake.published.at(-1).payload.title, 'Expired, answer at the terminal');
    assertNoSlots(h);
  });

  it('replay: the Approve body of one request does nothing for the next', async () => {
    const h = home();
    let captured;
    fake.onRequest = (payload) => { captured = actionByLabel(payload, 'Approve'); return tap(captured); };
    const first = await runApprove({ home: h.home, stdin: bashRequest('npm test') });
    assert.equal(first.stdout, ALLOW_BYTES);

    fake.reset();
    fake.onRequest = async (payload) => {
      // The old body, sent to the NEW response topic and to the old one.
      await tap({ ...actionByLabel(payload, 'Approve'), body: captured.body });
      await tap(captured);
    };
    const second = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 1500 });
    assertNoDecision(second, 'replay');
  });

  it('an Approve tapped after expiry is inert', async () => {
    const h = home();
    fake.onRequest = async (payload) => { await sleep(1800); await tap(actionByLabel(payload, 'Approve')).catch(() => {}); };
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 1000 });
    assertNoDecision(res, 'late');
  });

  it('a command too long to show offers no Approve; At terminal returns no decision at once', async () => {
    const h = home();
    let offered;
    fake.onRequest = (payload) => { offered = payload.actions.map((a) => a.label); return tap(actionByLabel(payload, 'At terminal')); };
    const res = await runApprove({ home: h.home, stdin: bashRequest(`echo ${'a '.repeat(300)}`), waitMs: 20000 });
    assertNoDecision(res, 'terminal');
    assert.deepEqual(offered, ['Deny', 'At terminal']);
    assert.ok(res.ms < 15000);
    assert.equal(fake.published.at(-1).payload.title, 'Sent back to the terminal');
  });
});

describe('signals and crashes', () => {
  if (POSIX) {
    for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
      it(`${sig} while waiting prints {} and exits 0`, async () => {
        const h = home();
        let child;
        fake.onRequest = () => { setTimeout(() => child.kill(sig), 100); };
        const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 20000, onSpawn: (c) => { child = c; } });
        assertNoDecision(res, sig);
        assertNoSlots(h);
      });
    }
  }

  it('SIGTERM at random moments never yields anything but {} or nothing', async () => {
    // Windows has no signal handlers (TerminateProcess), so there the only
    // acceptable outputs are {} or empty stdout: both are "no decision".
    for (const delay of [5, 60, 200, 400]) {
      const h = home();
      fake.onRequest = (payload) => tap(actionByLabel(payload, 'Deny')).catch(() => {});
      let child;
      const run = runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 20000, onSpawn: (c) => { child = c; setTimeout(() => c.kill('SIGTERM'), delay); } });
      const res = await run;
      assert.ok(child);
      assert.ok([NO_DECISION_BYTES, '', DENY_BYTES].includes(res.stdout), `delay ${delay}: ${JSON.stringify(res.stdout)}`);
      assert.notEqual(res.stdout, ALLOW_BYTES);
    }
  });

  const preload = (code) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aan-preload-')), 'inject.cjs');
    fs.writeFileSync(file, code);
    return file;
  };

  it('an uncaught exception mid-wait prints {} and exits 0', async () => {
    const h = home();
    const file = preload("setTimeout(() => { throw new Error('injected crash'); }, 800);");
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 20000, nodeArgs: ['--require', file] });
    assertNoDecision(res, 'uncaught');
    assertNoSlots(h);
  });

  it('an unhandled rejection mid-wait prints {} and exits 0', async () => {
    const h = home();
    const file = preload("setTimeout(() => { Promise.reject(new Error('injected rejection')); }, 800);");
    const res = await runApprove({ home: h.home, stdin: bashRequest('npm test'), waitMs: 20000, nodeArgs: ['--require', file] });
    assertNoDecision(res, 'rejection');
    assertNoSlots(h);
  });

  it('the source never exits 2 and has a single allow construction', () => {
    const src = fs.readFileSync(new URL('../src/approve.mjs', import.meta.url), 'utf8');
    assert.ok(!/process\.exit\(\s*[1-9]/.test(src), 'only exit(0)');
    assert.equal((src.match(/behavior: 'allow'/g) || []).length, 1, 'one place builds allow');
  });
});
