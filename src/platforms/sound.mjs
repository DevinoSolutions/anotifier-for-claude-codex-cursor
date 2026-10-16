// src/platforms/sound.mjs — custom sound files for `toastSound`.
// `toastSound` is normally a name (Windows BurntToast "IM", a macOS system sound
// …). It can also be a path to the user's own audio file; this module decides
// which one a value is, finds the file, and starts a detached player so the hook
// never waits for the sound to finish. Each platform backend wires it in.
//
// Privacy: the path is the user's own filesystem layout. It is never put in an
// error-log entry, because logHookError mirrors entries to Sentry when the user
// opted in. Failures are logged as fixed messages with a reason code only.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigDir } from '../config-loader.mjs';
import { logHookError } from '../error-log.mjs';

export const SOUND_EXTENSIONS = ['.wav', '.mp3', '.aiff', '.aif', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac'];

// Windows player script (see assets/windows/play-sound.ps1), shared by the
// native Windows backend and the WSL backend.
export const PLAY_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'windows', 'play-sound.ps1');

// A toastSound value is a file when it starts with ~/ or ~\, is an absolute
// path, contains a path separator, or ends in a known audio extension
// (case-insensitive). The sound names (IM, Glass, Alarm10 …) have none of
// those, so every name that worked before still means the same thing.
export function isSoundFilePath(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (!v) return false;
  if (v.startsWith('~/') || v.startsWith('~\\')) return true;
  if (path.isAbsolute(v) || /^[A-Za-z]:[\\/]/.test(v)) return true;
  if (v.includes('/') || v.includes('\\')) return true;
  return SOUND_EXTENSIONS.includes(path.extname(v).toLowerCase());
}

// The absolute path a file-valued toastSound points at. ~ is the home
// directory; a relative path is relative to ~/.anotifier (the hook runs in
// whatever project directory the agent has open, so the cwd means nothing).
export function resolveSoundPath(value, { home = os.homedir(), configDir = getConfigDir() } = {}) {
  const v = String(value).trim();
  if (v === '~' || v.startsWith('~/') || v.startsWith('~\\')) return path.join(home, v.slice(1));
  return path.resolve(configDir, v);
}

// { path } for a readable regular file, otherwise { path, reason }.
export function checkSoundFile(value, deps = {}) {
  const file = resolveSoundPath(value, deps);
  const { statSync = fs.statSync, accessSync = fs.accessSync } = deps;
  try {
    if (!statSync(file).isFile()) return { path: file, reason: 'not a file' };
    accessSync(file, fs.constants.R_OK);
    return { path: file };
  } catch (err) {
    return { path: file, reason: err?.code === 'ENOENT' ? 'file not found' : 'file not readable' };
  }
}

// The file to play for this toastSound, or null when it is a plain name (nothing
// to do) or the file is unusable (logged once, without the path; the caller then
// behaves as if no file was set).
export function prepareSoundFile(toastSound, context, { log = logHookError, ...deps } = {}) {
  if (!isSoundFilePath(toastSound)) return null;
  const checked = checkSoundFile(toastSound, deps);
  if (!checked.reason) return checked.path;
  log(context, new Error('custom sound file unusable, no custom sound will play'), { reason: checked.reason });
  return null;
}

// Start a detached player and resolve true once the OS has spawned it, false when
// it could not be started (not installed). It is never awaited to completion:
// the sound outlives the hook. Never throws.
export function startDetached(command, args, { spawnImpl = spawn, windowsHide = false } = {}) {
  return new Promise((resolve) => {
    try {
      const child = spawnImpl(command, args, { detached: true, stdio: 'ignore', windowsHide });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref?.(); resolve(true); });
    } catch {
      resolve(false);
    }
  });
}

// Try each [command, args] in order; true when one started. When none does the
// failure is logged once (the player names only, never the file).
export async function playFirst(candidates, context, { log = logHookError, ...deps } = {}) {
  for (const [command, args] of candidates) {
    if (await startDetached(command, args, deps)) return true;
  }
  log(context, new Error('no sound player could be started, no custom sound will play'), { tried: candidates.map(([command]) => command) });
  return false;
}

// Linux players, in preference order. aplay only reads WAV.
export function linuxPlayers(file) {
  const players = [['pw-play', [file]], ['paplay', [file]]];
  if (path.extname(file).toLowerCase() === '.wav') players.push(['aplay', ['-q', file]]);
  return players;
}

// Windows: play-sound.ps1 plays .wav with System.Media.SoundPlayer and the rest
// with PresentationCore's MediaPlayer. `detach` makes the script relaunch itself
// as its own hidden process and exit at once (the WSL path, where the caller
// waits for the interop process).
export function windowsPlayerArgs(scriptPath, file, { detach = false } = {}) {
  return ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Path', file, ...(detach ? ['-Detach', 'true'] : [])];
}
