// tests/patch-config-statusline.test.mjs — setup wires Claude Code's statusline
// through src/statusline.mjs (usage-limit warnings) and uninstall restores it.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isOurStatusline, wrappedStatusline, statuslineCommand,
  wireClaudeStatusline, unwireClaudeStatusline, patchClaude, unpatchAll,
} from '../setup/patch-config.mjs';

const SL = '/opt/anotifier/src/statusline.mjs';

describe('statusline helpers', () => {
  it('statuslineCommand wraps an original as base64 and round-trips it', () => {
    const orig = `echo "a b" | sed 's/x/y/'`;
    const cmd = statuslineCommand(SL, orig);
    assert.match(cmd, /^node ".*statusline\.mjs" --wrap-b64 [A-Za-z0-9+/=]+$/);
    assert.equal(wrappedStatusline(cmd), orig);
    assert.equal(statuslineCommand(SL, null), `node "${SL}"`);
    assert.equal(wrappedStatusline(`node "${SL}"`), null);
  });
  it('isOurStatusline needs statusline.mjs AND an anotifier path', () => {
    assert.equal(isOurStatusline(`node "${SL}"`), true);
    assert.equal(isOurStatusline('node "/x/agent-notify/src/statusline.mjs"'), true);
    assert.equal(isOurStatusline('node "/x/other/statusline.mjs"'), false);
    assert.equal(isOurStatusline('~/bin/my-line.sh'), false);
    assert.equal(isOurStatusline(undefined), false);
  });
});

describe('wireClaudeStatusline / unwireClaudeStatusline', () => {
  it('creates ours when there is no statusLine', () => {
    const s = {};
    assert.equal(wireClaudeStatusline(s, SL), true);
    assert.deepEqual(s.statusLine, { type: 'command', command: `node "${SL}"` });
  });

  it('wraps a custom command and keeps the other statusLine fields', () => {
    const s = { statusLine: { type: 'command', command: '~/my-line.sh', padding: 2, refreshInterval: 5 } };
    wireClaudeStatusline(s, SL);
    assert.equal(s.statusLine.padding, 2);
    assert.equal(s.statusLine.refreshInterval, 5);
    assert.equal(s.statusLine.type, 'command');
    assert.equal(wrappedStatusline(s.statusLine.command), '~/my-line.sh');
    assert.ok(isOurStatusline(s.statusLine.command));
  });

  it('is idempotent and never double-wraps', () => {
    const s = { statusLine: { type: 'command', command: '~/my-line.sh', padding: 1 } };
    wireClaudeStatusline(s, SL);
    const once = JSON.stringify(s);
    wireClaudeStatusline(s, SL);
    wireClaudeStatusline(s, SL);
    assert.equal(JSON.stringify(s), once);
    assert.equal(wrappedStatusline(s.statusLine.command), '~/my-line.sh');

    const own = {};
    wireClaudeStatusline(own, SL);
    const ownOnce = JSON.stringify(own);
    wireClaudeStatusline(own, SL);
    assert.equal(JSON.stringify(own), ownOnce);
  });

  it('re-pointing at a new script path keeps the original command', () => {
    const s = { statusLine: { type: 'command', command: 'orig' } };
    wireClaudeStatusline(s, SL);
    wireClaudeStatusline(s, '/new/anotifier/src/statusline.mjs');
    assert.match(s.statusLine.command, /\/new\/anotifier\//);
    assert.equal(wrappedStatusline(s.statusLine.command), 'orig');
  });

  it('leaves a non-command statusLine untouched', () => {
    for (const sl of [{ type: 'text', text: 'hi' }, 'a string', { type: 'command' }, { type: 'command', command: 5 }]) {
      const s = { statusLine: structuredClone(sl) };
      assert.equal(wireClaudeStatusline(s, SL), false);
      assert.deepEqual(s.statusLine, sl);
      assert.equal(unwireClaudeStatusline(s), false);
      assert.deepEqual(s.statusLine, sl);
    }
  });

  it('unwire restores the original exactly', () => {
    const orig = { type: 'command', command: `bash -c 'echo "$1" | tr a b'`, padding: 3, refreshInterval: 10 };
    const s = { model: 'x', statusLine: structuredClone(orig) };
    wireClaudeStatusline(s, SL);
    assert.equal(unwireClaudeStatusline(s), true);
    assert.deepEqual(s, { model: 'x', statusLine: orig });
  });

  it('unwire deletes a statusLine that setup created', () => {
    const s = { model: 'x' };
    wireClaudeStatusline(s, SL);
    assert.equal(unwireClaudeStatusline(s), true);
    assert.deepEqual(s, { model: 'x' });
  });

  it('unwire ignores a user statusline that is not ours', () => {
    const s = { statusLine: { type: 'command', command: '~/my-line.sh' } };
    assert.equal(unwireClaudeStatusline(s), false);
    assert.equal(s.statusLine.command, '~/my-line.sh');
    assert.equal(unwireClaudeStatusline({}), false);
    assert.equal(unwireClaudeStatusline(null), false);
  });
});

describe('patchClaude / unpatchAll end to end', () => {
  let home, claudeDir, settingsPath;
  const notify = path.join(os.tmpdir(), 'anotifier', 'src', 'notify.mjs');
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-statusline-patch-'));
    claudeDir = path.join(home, '.claude');
    settingsPath = path.join(claudeDir, 'settings.json');
    fs.mkdirSync(claudeDir, { recursive: true });
  });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  const read = () => JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  it('patchClaude wires the statusline next to statusline.mjs and uninstall restores the original', () => {
    const original = { type: 'command', command: '~/my-line.sh', padding: 1 };
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'm', statusLine: original }));
    patchClaude(claudeDir, notify, path.join(home, 'bak'));
    const wired = read();
    assert.ok(wired.hooks.Stop && wired.hooks.Notification);
    assert.ok(wired.statusLine.command.includes(path.join(path.dirname(notify), 'statusline.mjs')));
    assert.equal(wired.statusLine.padding, 1);
    assert.equal(wrappedStatusline(wired.statusLine.command), '~/my-line.sh');

    const results = unpatchAll(home, path.join(home, 'bak'));
    assert.ok(results.every((r) => r.ok));
    const after = read();
    assert.deepEqual(after.statusLine, original);
    assert.equal(after.hooks?.Stop, undefined);
    assert.equal(after.model, 'm');
  });

  it('patch twice then uninstall still restores (no double wrap)', () => {
    const original = { type: 'command', command: '~/my-line.sh' };
    fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: original }));
    patchClaude(claudeDir, notify);
    patchClaude(claudeDir, notify);
    unpatchAll(home);
    assert.deepEqual(read().statusLine, original);
  });

  it('uninstall removes the statusLine setup created', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ model: 'm' }));
    patchClaude(claudeDir, notify);
    assert.ok(read().statusLine);
    unpatchAll(home);
    assert.equal(read().statusLine, undefined);
  });

  it('restores the statusline even when settings has no hooks key', () => {
    const cmd = statuslineCommand(SL, '~/my-line.sh');
    fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: cmd, padding: 4 } }));
    const results = unpatchAll(home);
    const claude = results.find((r) => r.tool === 'Claude Code');
    assert.deepEqual([claude.ok, claude.reason], [true, 'statusline restored']);
    assert.deepEqual(read().statusLine, { type: 'command', command: '~/my-line.sh', padding: 4 });
  });

  it('no hooks key and no statusline of ours reports nothing to remove', () => {
    fs.writeFileSync(settingsPath, JSON.stringify({ statusLine: { type: 'command', command: '~/x.sh' } }));
    const claude = unpatchAll(home).find((r) => r.tool === 'Claude Code');
    assert.equal(claude.reason, 'nothing to remove');
    assert.equal(read().statusLine.command, '~/x.sh');
  });
});
