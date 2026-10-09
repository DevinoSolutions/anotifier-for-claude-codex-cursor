import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { logHookError } from './error-log.mjs';

const require = createRequire(import.meta.url);
const defaults = require('../config/default-config.json');

// JSON.parse keeps these as own keys; merging them would write into
// Object.prototype (or a constructor's prototype) for the whole process.
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Deep merge b into a (a is mutated)
function deepMerge(a, b) {
  for (const key of Object.keys(b)) {
    if (UNSAFE_KEYS.has(key)) continue;
    if (
      b[key] && typeof b[key] === 'object' && !Array.isArray(b[key]) &&
      a[key] && typeof a[key] === 'object' && !Array.isArray(a[key])
    ) {
      deepMerge(a[key], b[key]);
    } else {
      a[key] = b[key];
    }
  }
  return a;
}

export function getConfigDir() {
  return path.join(os.homedir(), '.anotifier');
}

export function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

const EVENT_OVERRIDE_TYPES = {
  toastSound: 'string',
  priority: 'string',
  // Opt-in override for the priority of Claude's idle "waiting for your input"
  // nag, which src/router.mjs delivers at 'default' instead of the urgent
  // needs_input value. Absent on purpose from default-config.json: only an
  // explicit user value beats the downgrade.
  idleReminderPriority: 'string',
  ntfyTags: 'string',
  toastEnabled: 'boolean',
  ntfyEnabled: 'boolean',
  terminalBellEnabled: 'boolean',
  webhookEnabled: 'boolean',
};
const RENAMED_KEYS = {
  sound: 'toastSound',
  ntfyPriority: 'priority',
};
const PRIORITY_VALUES = ['min', 'low', 'default', 'high', 'urgent'];
// Every event override validated against the ntfy 5-level scale. One list, so a
// new priority-shaped key can never quietly skip the enum check.
const PRIORITY_KEYS = ['priority', 'idleReminderPriority'];
const FORMAT_VALUES = ['generic', 'slack', 'discord', 'telegram'];

// "HH:MM" on a 24-hour clock → minutes since midnight, or null when unusable.
// Exported because the quiet-hours window is evaluated at notify time in
// src/suppress.mjs: one definition keeps the validator and the runtime from
// disagreeing about what counts as a time.
export function parseHHMM(value) {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

// Shallow schema check. Wrong-typed keys are DELETED from the user object
// (defaults win) and reported, so a bad value can never poison the runtime.
// Unknown keys are reported but kept — they are usually typos.
function validateUserConfig(user) {
  const issues = [];
  const checkBlock = (blockName, spec) => {
    const block = user[blockName];
    if (block === undefined) return;
    if (typeof block !== 'object' || block === null || Array.isArray(block)) {
      issues.push(`"${blockName}" must be an object`);
      delete user[blockName];
      return;
    }
    for (const [key, val] of Object.entries(block)) {
      const expected = spec[key];
      if (!expected) { issues.push(`unknown key "${blockName}.${key}"`); continue; }
      if (typeof val !== expected) {
        issues.push(`"${blockName}.${key}" must be a ${expected}, got ${typeof val}`);
        delete block[key];
      }
    }
  };

  checkBlock('ntfy', { enabled: 'boolean', server: 'string', topic: 'string', click: 'string', icon: 'string', richContent: 'boolean' });
  checkBlock('toast', { enabled: 'boolean', clickToFocus: 'boolean', richContent: 'boolean', disabledBySetup: 'boolean' });
  checkBlock('terminalBell', { enabled: 'boolean' });
  checkBlock('webhook', { enabled: 'boolean', url: 'string', format: 'string', chatId: 'string', authorization: 'string', richContent: 'boolean' });
  checkBlock('sentry', { enabled: 'boolean', dsn: 'string' });
  checkBlock('updateCheck', { enabled: 'boolean' });
  checkBlock('telemetry', { enabled: 'boolean', asked: 'boolean' });

  // Usage-limit warning thresholds: percentages in (0, 100]. A bad list is
  // dropped so the 70/85/95 default applies rather than no warnings at all.
  // Checked before checkBlock, which only knows typeof (an array is 'object').
  const usage = user.usageAlerts;
  if (usage && typeof usage === 'object' && !Array.isArray(usage) && usage.thresholds !== undefined) {
    const t = usage.thresholds;
    if (!Array.isArray(t) || !t.length || !t.every((n) => typeof n === 'number' && n > 0 && n <= 100)) {
      issues.push(`"usageAlerts.thresholds" must be a list of percentages above 0 and at most 100, got ${JSON.stringify(t)}`);
      delete usage.thresholds;
    }
  }
  checkBlock('usageAlerts', { enabled: 'boolean', thresholds: 'object' });

  // Context warning threshold: one percentage in (0, 100] of the auto-compact
  // window. A bad value is dropped so the 85 default applies.
  const context = user.contextAlerts;
  if (context && typeof context === 'object' && !Array.isArray(context) && context.threshold !== undefined) {
    const t = context.threshold;
    if (typeof t !== 'number' || !(t > 0 && t <= 100)) {
      issues.push(`"contextAlerts.threshold" must be a percentage above 0 and at most 100, got ${JSON.stringify(t)}`);
      delete context.threshold;
    }
  }
  checkBlock('contextAlerts', { enabled: 'boolean', threshold: 'number' });

  // Quiet hours is the one block where a bad value must NOT fall through to the
  // defaults: silently silencing every channel from 22:00 to 08:00 because a
  // time string had a typo is the worst failure mode this config has. So an
  // unusable from/to drops `enabled` too, landing on the default `false`. Runs
  // BEFORE the checkBlock below, which would otherwise delete a wrong-typed
  // time before this pass could see it (and let the default window win).
  const quiet = user.quietHours;
  if (quiet && typeof quiet === 'object' && !Array.isArray(quiet)) {
    for (const key of ['from', 'to']) {
      if (quiet[key] !== undefined && parseHHMM(quiet[key]) === null) {
        issues.push(`"quietHours.${key}" must be a "HH:MM" 24-hour time, got ${JSON.stringify(quiet[key])} — quiet hours disabled`);
        delete quiet[key];
        delete quiet.enabled;
      }
    }
  }
  checkBlock('quietHours', { enabled: 'boolean', from: 'string', to: 'string' });

  // Webhook format is a fixed preset enum (like event priority): an invalid
  // value is dropped so the 'generic' default wins. Telegram addresses the
  // message by chatId — flag its absence but keep the format so the missing
  // chatId surfaces as a logged hint at send time, not a silent drop.
  const webhook = user.webhook;
  if (webhook && typeof webhook === 'object' && !Array.isArray(webhook)) {
    if (typeof webhook.format === 'string' && !FORMAT_VALUES.includes(webhook.format)) {
      issues.push(`"webhook.format" must be one of ${FORMAT_VALUES.join('|')}, got "${webhook.format}"`);
      delete webhook.format;
    }
    if (webhook.format === 'telegram' && !webhook.chatId) {
      issues.push('"webhook.format" is "telegram" but "webhook.chatId" is missing');
    }
  }

  if (user.events !== undefined) {
    if (typeof user.events !== 'object' || user.events === null) {
      issues.push('"events" must be an object');
      delete user.events;
    } else {
      for (const [eventName, overrides] of Object.entries(user.events)) {
        if (typeof overrides !== 'object' || overrides === null) {
          issues.push(`"events.${eventName}" must be an object`);
          delete user.events[eventName];
          continue;
        }
        for (const [key, val] of Object.entries(overrides)) {
          if (RENAMED_KEYS[key]) {
            issues.push(`"events.${eventName}.${key}" was renamed to "${RENAMED_KEYS[key]}" — update your config.json`);
            continue;
          }
          const expected = EVENT_OVERRIDE_TYPES[key];
          if (!expected) { issues.push(`unknown key "events.${eventName}.${key}"`); continue; }
          if (typeof val !== expected) {
            issues.push(`"events.${eventName}.${key}" must be a ${expected}, got ${typeof val}`);
            delete overrides[key];
          } else if (PRIORITY_KEYS.includes(key) && !PRIORITY_VALUES.includes(val)) {
            issues.push(`"events.${eventName}.${key}" must be one of ${PRIORITY_VALUES.join('|')}, got "${val}"`);
            delete overrides[key];
          }
        }
      }
    }
  }

  // `sources` overrides the per-tool label/icon shown on notifications. It nests
  // one level (sources.<tool>.{label,icon}) like `events`, so it needs its own
  // pass rather than a flat checkBlock. A control char in a label — especially a
  // newline — would corrupt the ntfy Title/Icon HTTP headers at send time, so a
  // label/icon that isn't a single clean line is rejected (defaults win).
  if (user.sources !== undefined) {
    if (typeof user.sources !== 'object' || user.sources === null || Array.isArray(user.sources)) {
      issues.push('"sources" must be an object');
      delete user.sources;
    } else {
      for (const [tool, spec] of Object.entries(user.sources)) {
        if (typeof spec !== 'object' || spec === null || Array.isArray(spec)) {
          issues.push(`"sources.${tool}" must be an object`);
          delete user.sources[tool];
          continue;
        }
        for (const [key, val] of Object.entries(spec)) {
          if (key !== 'label' && key !== 'icon') {
            issues.push(`unknown key "sources.${tool}.${key}"`);
            continue;
          }
          if (typeof val !== 'string') {
            issues.push(`"sources.${tool}.${key}" must be a string, got ${typeof val}`);
            delete spec[key];
          } else if ([...val].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f)) {
            issues.push(`"sources.${tool}.${key}" must be a single-line string (no control characters)`);
            delete spec[key];
          }
        }
      }
    }
  }

  const knownTop = ['ntfy', 'toast', 'terminalBell', 'webhook', 'sentry', 'updateCheck', 'telemetry', 'usageAlerts', 'contextAlerts', 'quietHours', 'events', 'sources'];
  for (const key of Object.keys(user)) {
    if (!knownTop.includes(key)) issues.push(`unknown key "${key}"`);
  }
  return issues;
}

// Load defaults + user config, reporting exactly what is wrong with the user
// file instead of silently pretending it does not exist.
// problem: null | { type: 'read'|'parse'|'validate', message: string }
export function loadConfigResult(configPath = getConfigPath()) {
  const config = JSON.parse(JSON.stringify(defaults)); // deep clone defaults

  let raw;
  try {
    raw = fs.readFileSync(configPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { config, problem: null }; // no user config — defaults are the contract
    return { config, problem: { type: 'read', message: `cannot read ${configPath}: ${err.message}` } };
  }

  let user;
  try {
    user = JSON.parse(raw);
  } catch (err) {
    return { config, problem: { type: 'parse', message: `${configPath} is not valid JSON (${err.message}) — using defaults` } };
  }

  const issues = validateUserConfig(user);
  deepMerge(config, user);
  const problem = issues.length
    ? { type: 'validate', message: `${configPath}: ${issues.join('; ')}` }
    : null;
  return { config, problem };
}

// Hook-path loader: never throws, but a broken user config is logged to
// errors.log (and Sentry when enabled) instead of being silently ignored.
// CLI commands should prefer loadConfigResult and fail loud on problem.
export function loadConfig(configPath = getConfigPath()) {
  const { config, problem } = loadConfigResult(configPath);
  if (problem) logHookError(`config:${problem.type}`, new Error(problem.message));
  return config;
}

// Atomic write: temp file + rename so a crash mid-write can never leave a
// truncated config.json behind. The file can hold webhook URLs, the ntfy topic
// and the Sentry DSN, so it is written owner-only (0600) and a newly created
// directory is 0700. The rename replaces any older 0644 file.
export function saveConfig(config, configPath = getConfigPath()) {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmpPath = `${configPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(config, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  try { fs.chmodSync(tmpPath, 0o600); } catch { /* Windows: no POSIX modes */ }
  fs.renameSync(tmpPath, configPath);
}
