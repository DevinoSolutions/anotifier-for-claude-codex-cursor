// cli/telemetry.mjs — inspect or change the anonymous usage-stats choice.
import { getConfigPath, loadConfigResult, saveConfig } from '../src/config-loader.mjs';
import { telemetryBlockedBy, readState, clearState, track } from '../src/telemetry.mjs';
import { c } from './ui.mjs';

const USAGE = 'anotifier telemetry [status | on | off]';

export async function run(arg = 'status') {
  if (!['status', 'on', 'off'].includes(arg)) {
    console.error(`  ${c.error('Unknown option:')} ${arg}`);
    console.error(`  ${c.muted(USAGE)}`);
    process.exitCode = 1;
    return;
  }

  const { config, problem } = loadConfigResult();
  if (problem && arg !== 'status') {
    // Strict CLI: never rewrite a config.json we could not read cleanly.
    console.error(`  ${c.error('Config error:')} ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  if (arg === 'on' || arg === 'off') {
    config.telemetry = { ...config.telemetry, enabled: arg === 'on' };
    saveConfig(config, getConfigPath());
    // Off also forgets the install id and any counts not yet sent.
    if (arg === 'off') clearState();
    else await track('telemetry_enabled', { via: 'command' }, { config });
  }

  const blocked = telemetryBlockedBy();
  const enabled = config.telemetry?.enabled === true;
  console.log();
  if (enabled && !blocked) {
    console.log(`  ${c.success('✓')} ${c.white('Anonymous usage stats: on')}`);
  } else if (enabled && blocked) {
    console.log(`  ${c.warn('⏸')} ${c.white('Anonymous usage stats: on, but nothing is sent')} ${c.muted(`(${blocked} is set)`)}`);
  } else {
    console.log(`  ${c.muted('○')} ${c.white('Anonymous usage stats: off')}`);
  }

  // Show exactly what the next daily summary would contain — no guessing.
  const state = readState();
  if (enabled && state.counters) {
    console.log(`    ${c.muted('Pending daily summary:')}`);
    for (const line of JSON.stringify(state.counters, null, 2).split('\n')) console.log(`      ${c.muted(line)}`);
  }
  console.log(`    ${c.muted('Never sent: message text, project names, paths, ntfy topics, webhook URLs, hostnames.')}`);
  console.log(`    ${c.muted(enabled ? 'anotifier telemetry off' : 'anotifier telemetry on')} ${c.muted('to change')}`);
  console.log();
}
