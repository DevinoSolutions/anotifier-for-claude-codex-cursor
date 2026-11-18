// tests/cli-registry.test.mjs — `setup` (detectTools) and `status` (checkTool)
// read each tool's dir, config file and label from TOOL_EVENTS, the same
// registry the patchers use, instead of keeping their own copies.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  TOOL_EVENTS, patchClaude, patchCodex, patchCursor, patchGemini, patchAntigravity,
} from '../setup/patch-config.mjs';
import { detectTools } from '../cli/setup.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOTIFY = '/home/user/.npm/anotifier/src/notify.mjs';

let home;
beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-registry-')); });
afterEach(() => { fs.rmSync(home, { recursive: true, force: true }); });

// Lay down every tool the way a real install does.
function seedAllTools() {
  fs.mkdirSync(path.join(home, TOOL_EVENTS.claude.dir), { recursive: true });
  fs.writeFileSync(path.join(home, TOOL_EVENTS.claude.dir, TOOL_EVENTS.claude.file), '{}\n');
  fs.mkdirSync(path.join(home, TOOL_EVENTS.codex.dir), { recursive: true });
  fs.mkdirSync(path.join(home, TOOL_EVENTS.cursor.dir), { recursive: true });
  fs.mkdirSync(path.join(home, TOOL_EVENTS.gemini.dir), { recursive: true });
  fs.writeFileSync(path.join(home, TOOL_EVENTS.gemini.dir, TOOL_EVENTS.gemini.file), '{}\n');
  fs.mkdirSync(path.join(home, TOOL_EVENTS.antigravity.dir, 'antigravity-cli'), { recursive: true });
}

function runStatus() {
  const res = spawnSync(process.execPath, ['cli/index.mjs', 'status'], {
    cwd: repoRoot,
    env: { ...process.env, HOME: home, USERPROFILE: home, ANOTIFIER_TELEMETRY: '0' },
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

describe('detectTools reads the registry', () => {
  it('returns every registry tool, in registry order, with its label and dir', () => {
    seedAllTools();
    const tools = detectTools(home);
    assert.deepEqual(tools.map((t) => t.name), Object.keys(TOOL_EVENTS));
    for (const t of tools) {
      assert.equal(t.label, TOOL_EVENTS[t.name].label);
      assert.equal(t.dir, path.join(home, TOOL_EVENTS[t.name].dir));
    }
  });

  it('keeps each tool\'s own recognition rule', () => {
    // Claude Code needs its settings file, not just the directory.
    fs.mkdirSync(path.join(home, TOOL_EVENTS.claude.dir), { recursive: true });
    assert.deepEqual(detectTools(home), []);
    fs.writeFileSync(path.join(home, TOOL_EVENTS.claude.dir, TOOL_EVENTS.claude.file), '{}\n');
    assert.deepEqual(detectTools(home).map((t) => t.name), ['claude']);
    // Codex and Cursor need only the directory.
    fs.mkdirSync(path.join(home, TOOL_EVENTS.codex.dir));
    fs.mkdirSync(path.join(home, TOOL_EVENTS.cursor.dir));
    assert.deepEqual(detectTools(home).map((t) => t.name), ['claude', 'codex', 'cursor']);
  });
});

describe('status reads the registry', () => {
  it('lists every registry tool, installed or not', () => {
    const out = runStatus();
    for (const t of Object.values(TOOL_EVENTS)) {
      assert.match(out, new RegExp(`${t.label} not installed`), `${t.label} row`);
    }
  });

  it('reports each tool wired once its patcher has run, including Antigravity\'s grouped file', () => {
    seedAllTools();
    const backups = path.join(home, '.anotifier', 'backups');
    const dir = (name) => path.join(home, TOOL_EVENTS[name].dir);
    patchClaude(dir('claude'), NOTIFY, backups);
    patchCodex(dir('codex'), NOTIFY, backups);
    patchCursor(dir('cursor'), NOTIFY, backups);
    patchGemini(dir('gemini'), NOTIFY, backups);
    patchAntigravity(dir('antigravity'), NOTIFY, backups);
    const out = runStatus();
    for (const [name, t] of Object.entries(TOOL_EVENTS)) {
      const row = out.split('\n').find((l) => l.includes(t.label));
      assert.ok(row, `${name} row`);
      assert.ok(row.includes('✓'), `${name} should read as wired: ${row}`);
      assert.ok(!row.includes('not wired') && !row.includes('not installed'), `${name}: ${row}`);
    }
  });
});
