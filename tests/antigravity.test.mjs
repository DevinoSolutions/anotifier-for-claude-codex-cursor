// tests/antigravity.test.mjs — Antigravity CLI support: payload parsing, routing,
// hook wiring (setup merge / uninstall / status detection) and the hook response.
// Payload and hooks.json shapes follow https://antigravity.google/docs/hooks.
// No live Antigravity CLI is exercised here.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInput } from '../src/parse-input.mjs';
import { route } from '../src/router.mjs';
import { loadConfig } from '../src/config-loader.mjs';
import { defaultResponseBody } from '../src/notify.mjs';
import { patchAntigravity, unpatchAll, detectAntigravityEvents } from '../setup/patch-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = '/home/user/.npm/anotifier/src/notify.mjs';

const stopPayload = {
  conversationId: '0b7c1f3e-1111-2222-3333-444455556666',
  workspacePaths: ['/work/frontend', '/work/shared'],
  transcriptPath: '/home/user/.gemini/antigravity-cli/transcript.jsonl',
  artifactDirectoryPath: '/tmp/artifacts',
  modelName: 'gemini-x',
  executionNum: 1,
  terminationReason: 'model_stop',
  fullyIdle: true,
};

describe('antigravity payload parsing', () => {
  it('maps Stop (passed via --event) to task_complete', () => {
    const ev = parseInput(stopPayload, 'antigravity', 'Stop');
    assert.equal(ev.source, 'antigravity');
    assert.equal(ev.event, 'task_complete');
  });

  it('takes project and session from workspacePaths[0] and conversationId', () => {
    const ev = parseInput(stopPayload, 'antigravity', 'Stop');
    assert.equal(ev.cwd, '/work/frontend');
    assert.equal(ev.projectName, 'frontend');
    assert.equal(ev.sessionId, stopPayload.conversationId);
  });

  it('handles Windows workspace paths', () => {
    const ev = parseInput({ workspacePaths: ['C:\\Users\\me\\my-app'] }, 'antigravity', 'Stop');
    assert.equal(ev.projectName, 'my-app');
  });

  it('tolerates a missing or malformed workspacePaths', () => {
    for (const workspacePaths of [undefined, [], 'x', [42], null]) {
      const ev = parseInput({ conversationId: 'c', workspacePaths }, 'antigravity', 'Stop');
      assert.equal(ev.event, 'task_complete');
      assert.equal(ev.cwd, '');
      assert.equal(ev.projectName, '');
    }
  });

  it('maps no tool or invocation event to a notification', () => {
    for (const name of ['PreToolUse', 'PostToolUse', 'PreInvocation', 'PostInvocation']) {
      assert.equal(parseInput(stopPayload, 'antigravity', name).event, 'unknown', name);
    }
  });

  it('ignores a claude-style notification_type', () => {
    const ev = parseInput({ ...stopPayload, notification_type: 'permission_prompt' }, 'antigravity', 'Stop');
    assert.equal(ev.notificationType, '');
  });

  it('does not leak antigravity fields into other sources', () => {
    const ev = parseInput(stopPayload, 'gemini', 'AfterAgent');
    assert.equal(ev.event, 'task_complete');
    assert.equal(ev.sessionId, stopPayload.conversationId); // shared field name is harmless
  });
});

describe('antigravity routing', () => {
  it('titles the alert "<project> · Antigravity" with the generic body', () => {
    const ev = parseInput(stopPayload, 'antigravity', 'Stop');
    const n = route(ev, loadConfig());
    assert.equal(n.title, 'frontend · Antigravity');
    assert.equal(n.message, 'frontend: Task complete');
    assert.equal(n.event, 'task_complete');
  });
});

describe('antigravity hook response', () => {
  it('answers {"decision":"stop"} for antigravity, {} for everything else', () => {
    assert.deepEqual(JSON.parse(defaultResponseBody('antigravity')), { decision: 'stop' });
    for (const s of ['claude', 'codex', 'gemini', 'cursor', undefined]) {
      assert.equal(defaultResponseBody(s), '{}\n');
    }
  });

  function run(input, config) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-agy-sub-'));
    fs.mkdirSync(path.join(home, '.anotifier'), { recursive: true });
    fs.writeFileSync(path.join(home, '.anotifier', 'config.json'), JSON.stringify(config));
    const res = spawnSync(process.execPath, ['src/notify.mjs', '--source', 'antigravity', '--event', 'Stop'], {
      cwd: repoRoot, input, env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8', timeout: 30000,
    });
    fs.rmSync(home, { recursive: true, force: true });
    return res;
  }
  const quiet = { toast: { enabled: false }, ntfy: { enabled: false }, terminalBell: { enabled: false } };

  it('real hook run exits 0 with a stop decision', () => {
    const res = run(JSON.stringify(stopPayload), quiet);
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), { decision: 'stop' });
  });

  it('malformed stdin still exits 0 with a stop decision (fail-open)', () => {
    const res = run('not json {{{', quiet);
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), { decision: 'stop' });
  });

  it('a quiet-hours run still answers stop', () => {
    const res = run(JSON.stringify(stopPayload), { ...quiet, quietHours: { enabled: true, from: '00:00', to: '23:59' } });
    assert.equal(res.status, 0, res.stderr);
    assert.deepEqual(JSON.parse(res.stdout), { decision: 'stop' });
  });
});

describe('antigravity hook wiring', () => {
  let home;
  let geminiDir;
  let hooksPath;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-agy-home-'));
    geminiDir = path.join(home, '.gemini');
    hooksPath = path.join(geminiDir, 'config', 'hooks.json');
    fs.mkdirSync(path.join(geminiDir, 'antigravity-cli'), { recursive: true });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const read = () => JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  const userHooks = {
    'my-linter-hook': { PostToolUse: [{ matcher: 'run_command', hooks: [{ type: 'command', command: './lint.sh', timeout: 10 }] }] },
    'my-stop-hook': { Stop: [{ type: 'command', command: './on-stop.sh' }] },
  };

  it('creates ~/.gemini/config/hooks.json with a flat Stop handler', () => {
    patchAntigravity(geminiDir, NOTIFY);
    const data = read();
    assert.deepEqual(Object.keys(data), ['anotifier']);
    assert.deepEqual(data.anotifier, {
      Stop: [{ type: 'command', command: `node "${NOTIFY}" --source antigravity --event Stop`, timeout: 30 }],
    });
  });

  it('merges next to the user\'s own groups without touching them', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(userHooks));
    patchAntigravity(geminiDir, NOTIFY);
    const data = read();
    assert.deepEqual(data['my-linter-hook'], userHooks['my-linter-hook']);
    assert.deepEqual(data['my-stop-hook'], userHooks['my-stop-hook']);
    assert.equal(data.anotifier.Stop.length, 1);
  });

  it('is idempotent', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(userHooks));
    patchAntigravity(geminiDir, NOTIFY);
    const once = fs.readFileSync(hooksPath, 'utf8');
    patchAntigravity(geminiDir, NOTIFY);
    assert.equal(fs.readFileSync(hooksPath, 'utf8'), once);
  });

  it('backs the existing file up before writing', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(userHooks));
    const backups = path.join(home, 'backups');
    patchAntigravity(geminiDir, NOTIFY, backups);
    const [name] = fs.readdirSync(backups);
    assert.match(name, /^hooks\.json\..+\.backup$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(backups, name), 'utf8')), userHooks);
  });

  it('refuses to overwrite a corrupt hooks.json', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '{ not json');
    assert.throws(() => patchAntigravity(geminiDir, NOTIFY), /not valid JSON/);
    assert.equal(fs.readFileSync(hooksPath, 'utf8'), '{ not json');
  });

  it('refuses a hooks.json that is not an object', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '[1]');
    assert.throws(() => patchAntigravity(geminiDir, NOTIFY), /not a JSON object/);
  });

  it('status detection sees our Stop handler, and only ours', () => {
    assert.deepEqual(detectAntigravityEvents(userHooks), []);
    patchAntigravity(geminiDir, NOTIFY);
    assert.deepEqual(detectAntigravityEvents(read()), ['Stop']);
    assert.deepEqual(detectAntigravityEvents(null), []);
    assert.deepEqual(detectAntigravityEvents([]), []);
  });

  it('uninstall removes only ours and restores the user\'s file exactly', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(userHooks));
    patchAntigravity(geminiDir, NOTIFY);
    const results = unpatchAll(home);
    const agy = results.find((r) => r.tool === 'Antigravity CLI');
    assert.deepEqual({ ok: agy.ok, reason: agy.reason }, { ok: true, reason: 'hooks removed' });
    assert.deepEqual(read(), userHooks);
  });

  it('uninstall also removes our handler if the user moved it into their own group', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    const moved = {
      mine: { Stop: [{ type: 'command', command: './keep.sh' }, { type: 'command', command: `node "${NOTIFY}" --source antigravity --event Stop`, timeout: 30 }] },
    };
    fs.writeFileSync(hooksPath, JSON.stringify(moved));
    unpatchAll(home);
    assert.deepEqual(read(), { mine: { Stop: [{ type: 'command', command: './keep.sh' }] } });
  });

  it('uninstall reports nothing to remove when there is no hooks.json or it holds no hooks of ours', () => {
    let agy = unpatchAll(home).find((r) => r.tool === 'Antigravity CLI');
    assert.deepEqual({ ok: agy.ok, reason: agy.reason }, { ok: true, reason: 'nothing to remove' });
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, JSON.stringify(userHooks));
    agy = unpatchAll(home).find((r) => r.tool === 'Antigravity CLI');
    assert.equal(agy.reason, 'nothing to remove');
    assert.deepEqual(read(), userHooks);
  });

  it('uninstall reports a corrupt hooks.json instead of throwing', () => {
    fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
    fs.writeFileSync(hooksPath, '{ nope');
    const agy = unpatchAll(home).find((r) => r.tool === 'Antigravity CLI');
    assert.equal(agy.ok, false);
  });
});
