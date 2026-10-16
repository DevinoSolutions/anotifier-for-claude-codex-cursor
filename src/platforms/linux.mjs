// src/platforms/linux.mjs
import { execFile } from 'node:child_process';
import { getConfigDir } from '../config-loader.mjs';
import { logHookError } from '../error-log.mjs';
import { linuxPlayers, playFirst, prepareSoundFile } from './sound.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// notification.priority uses the app-wide ntfy scale; notify-send only knows
// low|normal|critical.
export const URGENCY_MAP = {
  urgent: 'critical',
  high: 'normal',
  default: 'low',
  low: 'low',
  min: 'low',
};

// notify-send parses positionals with GLib GOption: any argument before the
// `--` end-of-options guard that begins with `-` is taken as an (unknown) option
// and the call fails. The message body is agent-controlled — rich content can
// start with a dash ("- Fixed the bug") — so options MUST come first, then `--`,
// then title/message, or a dash-leading toast silently never fires.
//
// `silent` (a custom sound file is playing) asks the daemon not to add its own
// sound; daemons that ignore the hint do no harm, since we send no sound-name.
export function buildNotifySendArgs(notification, iconPath, { silent = false } = {}) {
  return [
    '--urgency', URGENCY_MAP[notification.priority] || 'low',
    ...(iconPath ? ['--icon', iconPath] : []),
    ...(silent ? ['--hint', 'boolean:suppress-sound:true'] : []),
    '--',
    notification.title,
    notification.message,
  ];
}

// deps are injectable for tests: execFile, the spawn that starts the sound
// player, and the error logger.
export async function sendToast(notification, deps = {}) {
  const { execFileImpl = execFile, log = logHookError, ...soundDeps } = deps;

  // Linux toasts have no sound of their own, so a custom sound file is the only
  // case where anything plays: first of pw-play, paplay, aplay (WAV only).
  const file = prepareSoundFile(notification.toastSound, 'toast:linux', { log, ...soundDeps });
  const playing = file ? await playFirst(linuxPlayers(file), 'toast:linux', { log, ...soundDeps }) : false;

  return new Promise((resolve) => {
    // Per-source icon: assets/icons/<source>.png, fallback to legacy icon.png
    const iconsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'icons');
    let iconPath = notification.source ? path.join(iconsDir, `${notification.source}.png`) : '';
    if (!iconPath || !fs.existsSync(iconPath)) {
      iconPath = path.join(getConfigDir(), 'icon.png');
    }
    const args = buildNotifySendArgs(notification, fs.existsSync(iconPath) ? iconPath : '', { silent: playing });

    execFileImpl('notify-send', args, { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) log('toast:linux', err, { stderr: (stderr || '').slice(0, 400) });
      resolve(!err);
    });
  });
}
