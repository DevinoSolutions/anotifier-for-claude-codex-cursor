// cli/snooze.mjs — pause every notification channel for a while.
import { parseDuration, readSnoozeUntil, writeSnoozeUntil, clearSnooze, formatClock } from '../src/suppress.mjs';
import { c } from './ui.mjs';

const USAGE = 'anotifier snooze <30m | 2h | 90s | 45>   ·   anotifier snooze off';

export async function run(arg) {
  // No argument — report, don't change anything.
  if (!arg) {
    const until = readSnoozeUntil();
    console.log();
    if (until) {
      console.log(`  ${c.warn('⏸')} ${c.white(`Snoozed until ${formatClock(until)}`)} ${c.muted('— all channels silent')}`);
    } else {
      console.log(`  ${c.success('✓')} ${c.white('Not snoozed')}`);
    }
    console.log();
    return;
  }

  if (arg === 'off') {
    const cleared = clearSnooze();
    console.log();
    console.log(cleared
      ? `  ${c.success('✓')} ${c.white('Snooze cancelled')}`
      : `  ${c.success('✓')} ${c.muted('Not snoozed — nothing to cancel')}`);
    console.log();
    return;
  }

  // Strict CLI: an unparseable duration is a user error worth failing on, not
  // something to round to a default. (The hook path is the resilient one.)
  const ms = parseDuration(arg);
  if (ms === null) {
    console.error(`  ${c.error('Invalid duration:')} ${arg}`);
    console.error(`  ${c.muted(USAGE)}`);
    process.exitCode = 1;
    return;
  }

  const until = writeSnoozeUntil(Date.now() + ms);
  console.log();
  console.log(`  ${c.warn('⏸')} ${c.white(`Snoozed until ${formatClock(until)}`)} ${c.muted('— all channels silent')}`);
  console.log(`    ${c.muted('anotifier snooze off')} ${c.muted('to cancel')}`);
  console.log();
}
