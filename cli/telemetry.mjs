// cli/telemetry.mjs — inspect or change the anonymous usage-stats choice.
import { getConfigPath, loadConfigResult, saveConfig } from '../src/config-loader.mjs';
import { telemetryBlockedBy, readState, clearState, track } from '../src/telemetry.mjs';
import { askYN, c, log } from './ui.mjs';

const USAGE = 'anotifier telemetry [status | on | off]';
const ISSUES_URL = 'https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/issues';

// Has the user already made this choice? An earlier `telemetry on|off` or setup
// answer is recorded as telemetry.asked; a stored `enabled: true` always counts.
// A bare `enabled: false` is just the shipped default (every config write saves
// it), so it does NOT count as an answer.
export function hasAnswered(config) {
  return config?.telemetry?.asked === true || config?.telemetry?.enabled === true;
}

// The usage-stats step of `anotifier setup`. Only a first-time setup on a real
// terminal (stdin AND stdout) asks, default Yes. Every other situation leaves the
// stored choice exactly as it was, which on a fresh install means OFF:
//   - piped / agent-driven setups (no TTY), including commands/setup.md,
//   - input that closes (EOF) before an answer,
//   - a choice made earlier (re-running setup never overrides it),
//   - DO_NOT_TRACK / ANOTIFIER_TELEMETRY=0 / CI.
// Mutates config.telemetry; the caller saves. Returns what happened.
export async function resolveSetupConsent(rl, config, {
  interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  env = process.env,
  ask = askYN,
  say = log,
} = {}) {
  config.telemetry ??= {};
  const enabled = config.telemetry.enabled === true;
  const change = enabled ? 'anotifier telemetry off' : 'anotifier telemetry on';

  const blocked = telemetryBlockedBy(env);
  if (blocked) {
    say(`  Usage stats: nothing is sent (${blocked} is set); the stored choice is unchanged`, 'dim');
    return 'blocked';
  }
  if (hasAnswered(config)) {
    say(`  Usage stats: ${enabled ? 'on' : 'off'}, unchanged (change it with \`${change}\`)`, 'dim');
    return enabled ? 'kept-on' : 'kept-off';
  }
  if (!interactive) {
    say('  Usage stats: off (run `anotifier telemetry on` to share anonymous usage stats)', 'dim');
    return 'non-interactive';
  }

  say('  Anonymous usage stats (optional): command results and delivery counts go to anotifier\'s own PostHog.');
  say('  Never message text, project names or paths. Turn it off any time: anotifier telemetry off', 'dim');
  const answer = await ask(rl, 'Share anonymous usage stats?', true, { eof: null });
  if (answer === null) {
    // Input closed before an answer: that is not consent.
    say('  Usage stats: off (run `anotifier telemetry on` to share anonymous usage stats)', 'dim');
    return 'eof';
  }
  config.telemetry.enabled = answer;
  config.telemetry.asked = true;
  return answer ? 'yes' : 'no';
}

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

  let forgottenId = null;
  if (arg === 'on' || arg === 'off') {
    config.telemetry = { ...config.telemetry, enabled: arg === 'on', asked: true };
    saveConfig(config, getConfigPath());
    // Off also forgets the install id and any counts not yet sent.
    if (arg === 'off') {
      forgottenId = readState().installId ?? null;
      clearState();
    } else track('telemetry_enabled', { via: 'command' }, { config });
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

  const state = readState();
  if (enabled) {
    // The install id is the only handle for a deletion request, so show it.
    console.log(`    ${c.muted('Install id:')} ${state.installId ?? c.muted('(created when the first event is sent)')}`);
    // Show exactly what the next daily summary would contain — no guessing.
    if (state.counters) {
      console.log(`    ${c.muted('Pending daily summary:')}`);
      for (const line of JSON.stringify(state.counters, null, 2).split('\n')) console.log(`      ${c.muted(line)}`);
    }
  }
  if (arg === 'off') {
    console.log(`    ${c.muted('Deleted the local install id and pending counts.')}`);
    if (forgottenId) {
      console.log(`    ${c.muted(`To have stats already sent under that id (${forgottenId}) deleted, open an issue: ${ISSUES_URL}`)}`);
    }
  }
  console.log(`    ${c.muted('Never sent: message text, project names, paths, ntfy topics, webhook URLs, hostnames.')}`);
  console.log(`    ${c.muted(enabled ? 'anotifier telemetry off' : 'anotifier telemetry on')} ${c.muted('to change')}`);
  console.log();
}
