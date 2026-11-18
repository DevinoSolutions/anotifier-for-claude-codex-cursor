// tests/unpatch-untouched.test.mjs — `anotifier uninstall` must only touch a
// tool's config when something of ours is in it. A config with nothing to
// remove stays byte-identical, and no backup is made for it.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TOOL_EVENTS, patchClaude, patchCodex, unpatchAll } from '../setup/patch-config.mjs';

const NOTIFY = '/home/user/.npm/anotifier/src/notify.mjs';

// Deliberately NOT how unpatchAll writes JSON (2-space, trailing newline), so a
// needless rewrite shows up as a byte difference: 4-space indent, CRLF, no
// trailing newline.
const foreign = (extra = {}) => JSON.stringify({
  hooks: {
    PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo safety' }] }],
    Stop: [],
  },
  ...extra,
}, null, 4).replace(/\n/g, '\r\n');

// The backup directory is flat.
const listFiles = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir) : []);

describe('unpatchAll with nothing of ours to remove', () => {
  let home, backups;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-unpatch-'));
    backups = path.join(home, 'backups');
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));

  const hookTools = Object.values(TOOL_EVENTS).filter((t) => t.layout !== 'groups');

  it('leaves every tool config byte-identical and makes no backup', () => {
    const before = {};
    for (const tool of hookTools) {
      const file = path.join(home, tool.dir, tool.file);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, foreign());
      before[file] = fs.readFileSync(file);
    }
    const results = unpatchAll(home, backups);
    for (const tool of hookTools) {
      const r = results.find((x) => x.tool === tool.label);
      assert.deepEqual([r.ok, r.reason], [true, 'nothing to remove'], tool.label);
    }
    for (const [file, bytes] of Object.entries(before)) {
      assert.ok(fs.readFileSync(file).equals(bytes), `${file} was rewritten`);
    }
    assert.deepEqual(listFiles(backups), [], 'no backup was created');
    assert.equal(fs.existsSync(backups), false, 'not even the backup directory');
  });

  it("a Claude config with the user's own statusline and hooks is left alone", () => {
    const file = path.join(home, '.claude', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, foreign({ statusLine: { type: 'command', command: 'my-own-statusline --fancy' } }));
    const before = fs.readFileSync(file);
    const r = unpatchAll(home, backups).find((x) => x.tool === TOOL_EVENTS.claude.label);
    assert.deepEqual([r.ok, r.reason], [true, 'nothing to remove']);
    assert.ok(fs.readFileSync(file).equals(before));
    assert.deepEqual(listFiles(backups), []);
  });

  it('a config with an empty hooks object is left alone too', () => {
    const file = path.join(home, '.gemini', 'settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ "hooks": {}, "theme": "dark" }');
    const before = fs.readFileSync(file);
    unpatchAll(home, backups);
    assert.ok(fs.readFileSync(file).equals(before));
    assert.deepEqual(listFiles(backups), []);
  });

  it('a second uninstall after a real one changes nothing and makes no new backup', () => {
    const claudeDir = path.join(home, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), foreign());
    patchClaude(claudeDir, NOTIFY);

    unpatchAll(home, backups);
    const afterFirst = fs.readFileSync(path.join(claudeDir, 'settings.json'));
    const backupsAfterFirst = listFiles(backups);
    assert.equal(backupsAfterFirst.length, 1, 'the first uninstall backed the file up once');

    unpatchAll(home, backups);
    assert.ok(fs.readFileSync(path.join(claudeDir, 'settings.json')).equals(afterFirst));
    assert.deepEqual(listFiles(backups), backupsAfterFirst, 'no second backup');
  });

  it('still backs up and rewrites when something of ours is removed (Claude and Codex)', () => {
    const claudeDir = path.join(home, '.claude');
    const codexDir = path.join(home, '.codex');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, 'settings.json'), foreign());
    patchClaude(claudeDir, NOTIFY);
    patchCodex(codexDir, NOTIFY);

    const results = unpatchAll(home, backups);
    for (const label of [TOOL_EVENTS.claude.label, TOOL_EVENTS.codex.label]) {
      const r = results.find((x) => x.tool === label);
      assert.deepEqual([r.ok, r.reason], [true, 'hooks removed'], label);
    }
    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
    assert.equal(settings.hooks.Notification, undefined);
    assert.equal(settings.hooks.PreToolUse.length, 1, "the user's own hook is kept");
    const names = listFiles(backups);
    assert.ok(names.some((n) => n.startsWith('settings.json.')), names.join(', '));
    assert.ok(names.some((n) => n.startsWith('hooks.json.')), names.join(', '));
  });

  it('a Claude config that only has our statusline wired is still restored', () => {
    const claudeDir = path.join(home, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    patchClaude(claudeDir, NOTIFY);
    const file = path.join(claudeDir, 'settings.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    // Strip the hooks, keep only what the statusline wiring wrote.
    delete data.hooks;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
    const r = unpatchAll(home, backups).find((x) => x.tool === TOOL_EVENTS.claude.label);
    assert.deepEqual([r.ok, r.reason], [true, 'statusline restored']);
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).statusLine, undefined);
  });
});
