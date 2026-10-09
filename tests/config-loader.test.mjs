import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

// We'll test with a temp dir as home
const tmpDir = path.join(os.tmpdir(), 'anotifier-test-' + Date.now());
const configDir = path.join(tmpDir, '.anotifier');
const configPath = path.join(configDir, 'config.json');

describe('config-loader', () => {
  beforeEach(() => {
    fs.mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns defaults when no user config exists', async () => {
    const { loadConfig } = await import('../src/config-loader.mjs');
    const config = loadConfig(path.join(tmpDir, 'nonexistent', 'config.json'));
    assert.equal(config.ntfy.server, 'https://ntfy.sh');
    assert.equal(config.toast.enabled, true);
    assert.equal(config.events.task_complete.toastSound, 'IM');
  });

  it('merges user config over defaults', async () => {
    const userConfig = {
      ntfy: { topic: 'my-topic', enabled: false }
    };
    fs.writeFileSync(configPath, JSON.stringify(userConfig));
    const { loadConfig } = await import('../src/config-loader.mjs');
    const config = loadConfig(configPath);
    assert.equal(config.ntfy.topic, 'my-topic');
    assert.equal(config.ntfy.enabled, false);
    // defaults preserved for unset keys
    assert.equal(config.ntfy.server, 'https://ntfy.sh');
    assert.equal(config.toast.enabled, true);
  });

  it('falls back to defaults when the user config is corrupt JSON', async () => {
    // A hand-edited broken config must not break notifications — loadConfig
    // swallows the parse error and returns the full default set.
    fs.writeFileSync(configPath, '{ ntfy: this is not, valid json ]]');
    const { loadConfig } = await import('../src/config-loader.mjs');
    const config = loadConfig(configPath);
    assert.equal(config.ntfy.server, 'https://ntfy.sh');
    assert.equal(config.toast.enabled, true);
    assert.equal(config.events.needs_input.priority, 'urgent');
  });

  it('a "__proto__" key in the user config does not reach Object.prototype', async () => {
    // JSON.parse keeps "__proto__" as an own key, so a naive deep merge would
    // walk into Object.prototype and pollute every object in the process.
    fs.writeFileSync(configPath, '{"__proto__":{"aanPolluted":true},"ntfy":{"constructor":{"prototype":{"aanPolluted":true}},"topic":"t"}}');
    const { loadConfig } = await import('../src/config-loader.mjs');
    try {
      const config = loadConfig(configPath);
      assert.equal(({}).aanPolluted, undefined);
      assert.equal(config.ntfy.topic, 't');
    } finally {
      delete Object.prototype.aanPolluted;
    }
  });

  it('saves config to disk', async () => {
    const { loadConfig, saveConfig } = await import('../src/config-loader.mjs');
    const config = loadConfig(configPath);
    config.ntfy.topic = 'saved-topic';
    saveConfig(config, configPath);
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(raw.ntfy.topic, 'saved-topic');
  });

  it('writes config.json owner-only and replaces an existing 0644 file', { skip: process.platform === 'win32' }, async () => {
    const { saveConfig } = await import('../src/config-loader.mjs');
    fs.writeFileSync(configPath, '{}\n', { mode: 0o644 });
    fs.chmodSync(configPath, 0o644);
    saveConfig({ ntfy: { topic: 'secret' } }, configPath);
    assert.equal(fs.statSync(configPath).mode & 0o777, 0o600);

    const freshPath = path.join(tmpDir, 'fresh', 'config.json');
    saveConfig({ ntfy: { topic: 'secret' } }, freshPath);
    assert.equal(fs.statSync(freshPath).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(freshPath)).mode & 0o777, 0o700);
  });

  it('getConfigDir returns ~/.anotifier', async () => {
    const { getConfigDir } = await import('../src/config-loader.mjs');
    const dir = getConfigDir();
    assert.ok(dir.endsWith('.anotifier'));
  });
});
