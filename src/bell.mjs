// src/bell.mjs — Terminal bell notification channel.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { execFailureReason, noteFailure } from './channel-failure.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BELL_SCRIPT = path.join(__dirname, '..', 'assets', 'windows', 'bell.ps1');

export async function sendBellWindows() {
  return new Promise((resolve) => {
    execFile('pwsh', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', BELL_SCRIPT,
    ], { timeout: 5000 }, (err) => {
      if (err) noteFailure('bell', execFailureReason(err));
      resolve(!err);
    });
  });
}

export async function sendBellUnix() {
  // Strategy 1: write BEL to /dev/tty
  try {
    const fd = fs.openSync('/dev/tty', 'w');
    fs.writeSync(fd, '\x07');
    fs.closeSync(fd);
    return true;
  } catch {
    // /dev/tty unavailable (no controlling terminal) — try tmux fallback
  }

  // Strategy 2: tmux pane tty
  const tmuxPane = process.env.TMUX_PANE;
  if (tmuxPane) {
    try {
      const ttyPath = await new Promise((resolve, reject) => {
        execFile('tmux', [
          'display-message', '-p', '-t', tmuxPane, '#{pane_tty}',
        ], { timeout: 5000 }, (err, stdout) => {
          if (err) return reject(err);
          const p = (stdout || '').trim();
          if (!p) return reject(new Error('empty tty path'));
          resolve(p);
        });
      });
      const fd = fs.openSync(ttyPath, 'w');
      fs.writeSync(fd, '\x07');
      fs.closeSync(fd);
      return true;
    } catch {
      // tmux fallback failed
    }
  }

  // Nothing to ring: a hook has no controlling terminal (and no tmux pane
  // either). Not a fault in the bell, but it is counted as a failed send.
  noteFailure('bell', 'no_tty');
  return false;
}

export async function sendBell() {
  try {
    if (os.platform() === 'win32') return await sendBellWindows();
    return await sendBellUnix();
  } catch {
    noteFailure('bell', 'other');
    return false;
  }
}
