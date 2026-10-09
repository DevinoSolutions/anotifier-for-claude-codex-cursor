// tests/status-usage-alerts.test.mjs — the "Usage alerts" line in `anotifier status`.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { claudeStatuslineWired, usageAlertsValue, contextAlertsValue } from '../cli/status.mjs';

const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

describe('status usage alerts line', () => {
  let home;
  beforeEach(() => { home = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-status-ua-')); });
  afterEach(() => fs.rmSync(home, { recursive: true, force: true }));
  const write = (obj) => {
    fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify(obj));
  };

  it('claudeStatuslineWired: true for ours, false for another or none, null when unreadable', () => {
    assert.equal(claudeStatuslineWired(home), null);
    write({});
    assert.equal(claudeStatuslineWired(home), false);
    write({ statusLine: { type: 'command', command: '~/my-line.sh' } });
    assert.equal(claudeStatuslineWired(home), false);
    write({ statusLine: { type: 'command', command: 'node "/x/anotifier/src/statusline.mjs"' } });
    assert.equal(claudeStatuslineWired(home), true);
    fs.writeFileSync(path.join(home, '.claude', 'settings.json'), '{bad');
    assert.equal(claudeStatuslineWired(home), null);
  });

  it('usageAlertsValue shows thresholds and wiring, or disabled', () => {
    const on = { usageAlerts: { enabled: true, thresholds: [70, 85, 95] } };
    assert.equal(strip(usageAlertsValue(on, true)), '70/85/95% · statusline wired');
    assert.equal(strip(usageAlertsValue(on, false)), '70/85/95% · statusline not wired');
    assert.equal(strip(usageAlertsValue(on, null)), '70/85/95% · statusline not wired');
    assert.equal(strip(usageAlertsValue({ usageAlerts: { enabled: false } }, true)), 'disabled');
    assert.equal(strip(usageAlertsValue({ usageAlerts: { thresholds: [50] } }, true)), '50% · statusline wired');
  });

  it('contextAlertsValue shows the threshold, or disabled', () => {
    assert.equal(strip(contextAlertsValue({ contextAlerts: { enabled: true, threshold: 85 } })), '85% of auto-compact window');
    assert.equal(strip(contextAlertsValue({ contextAlerts: { threshold: 60 } })), '60% of auto-compact window');
    assert.equal(strip(contextAlertsValue({})), '85% of auto-compact window');
    assert.equal(strip(contextAlertsValue({ contextAlerts: { enabled: false } })), 'disabled');
  });
});
