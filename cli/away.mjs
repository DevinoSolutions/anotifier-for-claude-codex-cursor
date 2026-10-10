// cli/away.mjs — `anotifier away [duration|off]`: the switch that lets remote
// approval engage (docs/design/remote-approval.md 4.1, D5). Without it the
// approval hook returns no decision at once and the terminal prompt appears.
import { parseDuration, formatClock } from '../src/suppress.mjs';
import { readApproval, readAwayUntil, writeAwayUntil, clearAway, AWAY_MAX_MS } from '../src/approval.mjs';
import { reasonText } from './approval.mjs';
import { c } from './ui.mjs';

const USAGE = 'anotifier away <30m | 2h | 90s | 45>   ·   anotifier away off   (at most 24h)';

function approvalNote() {
  const check = readApproval();
  if (!check.ok) console.log(`    ${c.muted(`Remote approval is ${reasonText(check.reason)}, so away mode has no effect yet.`)}`);
}

export async function run(arg) {
  if (!arg) {
    const until = readAwayUntil();
    console.log();
    console.log(until
      ? `  ${c.warn('●')} ${c.white(`Away until ${formatClock(until)}`)} ${c.muted('— phone approvals engage (experimental)')}`
      : `  ${c.success('✓')} ${c.white('Not away')} ${c.muted('— permission prompts stay at the terminal')}`);
    console.log();
    return;
  }

  if (arg === 'off') {
    const cleared = clearAway();
    console.log();
    console.log(cleared
      ? `  ${c.success('✓')} ${c.white('Away mode off')}`
      : `  ${c.success('✓')} ${c.muted('Not away — nothing to turn off')}`);
    console.log();
    return;
  }

  const ms = parseDuration(arg);
  if (ms === null || ms > AWAY_MAX_MS) {
    console.error(`  ${c.error('Invalid duration:')} ${arg}`);
    console.error(`  ${c.muted(USAGE)}`);
    process.exitCode = 1;
    return;
  }

  const until = writeAwayUntil(Date.now() + ms);
  console.log();
  console.log(`  ${c.warn('●')} ${c.white(`Away until ${formatClock(until)}`)} ${c.muted('— phone approvals engage (experimental)')}`);
  console.log(`    ${c.muted('anotifier away off')} ${c.muted('when you are back')}`);
  approvalNote();
  console.log();
}
