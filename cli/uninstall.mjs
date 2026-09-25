// cli/uninstall.mjs
import os from 'node:os';
import readline from 'node:readline';
import path from 'node:path';
import { getConfigDir } from '../src/config-loader.mjs';
import { unpatchAll } from '../setup/patch-config.mjs';
import { execFileSync } from 'node:child_process';
import { c, spinner } from './ui.mjs';

const FOCUS_KEY = 'HKCU\\Software\\Classes\\agentfocus';

// toast.ps1 registers the agentfocus:// click-to-focus protocol in HKCU on the
// first toast. Remove it on uninstall, but only when its command still points at
// our focus.vbs, so a same-named protocol from another tool is left alone.
// `reg` is injectable so tests never touch the real registry.
export function removeFocusProtocol({
  reg = (args) => execFileSync('reg', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 }),
} = {}) {
  let command;
  try { command = reg(['query', `${FOCUS_KEY}\\shell\\open\\command`, '/ve']); }
  catch { return { tool: 'agentfocus://', ok: true, reason: 'not registered' }; }
  if (!/focus\.vbs/i.test(String(command))) {
    return { tool: 'agentfocus://', ok: true, reason: 'left alone (registered by another program)' };
  }
  try {
    reg(['delete', FOCUS_KEY, '/f']);
    return { tool: 'agentfocus://', ok: true, reason: 'click-to-focus protocol removed' };
  } catch (err) {
    return { tool: 'agentfocus://', ok: false, reason: `could not delete ${FOCUS_KEY}: ${err.message}` };
  }
}

export async function run() {
  // Nothing is written before the confirmation, so Ctrl+C here is a clean abort.
  process.on('SIGINT', () => {
    console.log(`\n  ${c.error('aborted — nothing removed')}`);
    process.exit(130);
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  console.log();
  console.log(`  ${c.bold('anotifier')} ${c.accent('uninstall')}`);
  console.log();

  // Resolve on EOF/close too, so a non-TTY stdin can't hang the prompt forever.
  const answer = await new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    rl.question(`  ${c.warn('?')} Remove anotifier hooks from all tools? ${c.muted('(y/N)')} `, finish);
    rl.on('close', () => finish(''));
  });

  if (answer.trim().toLowerCase() !== 'y') {
    console.log(`  ${c.muted('Cancelled.')}\n`);
    rl.close();
    return;
  }

  const backupDir = path.join(getConfigDir(), 'backups');
  const spin = spinner('Removing hooks...');
  const results = unpatchAll(os.homedir(), backupDir);
  if (os.platform() === 'win32') results.push(removeFocusProtocol());
  spin.stop('Processed all tools');

  let anyFailed = false;
  for (const r of results) {
    if (r.ok) {
      console.log(`    ${c.success('✓')} ${c.white(r.tool)} ${c.muted(r.reason)}`);
    } else {
      anyFailed = true;
      console.log(`    ${c.error('✗')} ${c.white(r.tool)} ${c.error(r.reason)}`);
    }
  }

  console.log();
  console.log(`    ${c.muted('Backups saved to')} ${c.white(backupDir)}`);
  console.log(`    ${c.muted('Config at ~/.anotifier/ preserved — delete manually if desired.')}`);
  console.log();

  if (anyFailed) process.exitCode = 1;
  rl.close();
}
