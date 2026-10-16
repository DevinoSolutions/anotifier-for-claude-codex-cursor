// tests/sound-files.test.mjs — custom sound files for toastSound: path detection,
// per-platform command building, the silent toast while a file plays, and the
// fallback to the default sound. Spawn, execFile and the logger are injected, so
// nothing here plays a sound or shows a toast.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  SOUND_EXTENSIONS, checkSoundFile, isSoundFilePath, linuxPlayers, playFirst, prepareSoundFile,
  resolveSoundPath, startDetached, windowsPlayerArgs,
} from '../src/platforms/sound.mjs';
import { sendToast as windowsToast } from '../src/platforms/windows.mjs';
import { sendToast as macToast } from '../src/platforms/macos.mjs';
import { sendToast as linuxToast, buildNotifySendArgs } from '../src/platforms/linux.mjs';
import { sendToast as wslToast } from '../src/platforms/wsl.mjs';
import { acceptSoundAnswer } from '../cli/config.mjs';
import { testToastSound } from '../cli/test.mjs';
import { soundFilesCheck } from '../cli/doctor-checks.mjs';
import { loadConfigResult } from '../src/config-loader.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

let dir;
let wav;
let mp3;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'anotifier-sound-'));
  wav = path.join(dir, 'done.wav');
  mp3 = path.join(dir, 'done.mp3');
  fs.writeFileSync(wav, 'RIFF');
  fs.writeFileSync(mp3, 'ID3');
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// A spawn stand-in: records every call; `fails` names the commands that cannot
// start (the 'error' event), every other one reports 'spawn'.
function fakeSpawn(fails = []) {
  const calls = [];
  const spawnImpl = (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    child.unref = () => {};
    setImmediate(() => child.emit(fails.includes(command) ? 'error' : 'spawn', Object.assign(new Error('x'), { code: 'ENOENT' })));
    return child;
  };
  return { spawnImpl, calls };
}

// An execFile stand-in for the toast process: records the call, succeeds.
function fakeExecFile() {
  const calls = [];
  const execFileImpl = (command, args, options, cb) => { calls.push({ command, args }); cb(null, '', ''); };
  return { execFileImpl, calls };
}

const logger = () => {
  const entries = [];
  return { entries, log: (context, error, extra) => entries.push({ context, message: error.message, extra }) };
};

describe('isSoundFilePath — names stay names, paths and audio files are files', () => {
  it('sound names are not files', () => {
    for (const name of ['Default', 'IM', 'Reminder', 'Mail', 'SMS', 'Alarm', 'Alarm10', 'Call3', 'Glass', 'Sosumi', '']) {
      assert.equal(isSoundFilePath(name), false, name);
    }
  });
  it('absolute, home-relative and separator-bearing values are files', () => {
    for (const value of ['/home/me/done.wav', '~/sounds/done', '~\\sounds\\done', 'C:\\Sounds\\done', 'C:/Sounds/done', 'sounds/done', 'sounds\\done', '/usr/share/sounds/x']) {
      assert.equal(isSoundFilePath(value), true, value);
    }
  });
  it('a bare name with an audio extension is a file, case-insensitively', () => {
    for (const ext of SOUND_EXTENSIONS) {
      assert.equal(isSoundFilePath(`ding${ext}`), true, ext);
      assert.equal(isSoundFilePath(`ding${ext.toUpperCase()}`), true, ext.toUpperCase());
    }
    assert.equal(isSoundFilePath('ding.txt'), false);
  });
  it('non-strings are not files', () => {
    for (const value of [undefined, null, 5, {}, []]) assert.equal(isSoundFilePath(value), false);
  });
});

describe('resolveSoundPath / checkSoundFile', () => {
  it('~ is the home directory, a relative path is relative to the config dir', () => {
    assert.equal(resolveSoundPath('~/s/a.wav', { home: '/h', configDir: '/h/.anotifier' }), path.join('/h', 's', 'a.wav'));
    assert.equal(resolveSoundPath('~\\s\\a.wav', { home: '/h', configDir: '/c' }), path.join('/h', '\\s\\a.wav'));
    assert.equal(resolveSoundPath('a.wav', { home: '/h', configDir: '/c' }), path.resolve('/c', 'a.wav'));
    assert.equal(resolveSoundPath(wav, { home: '/h', configDir: '/c' }), wav);
  });
  it('reports a readable file, a missing file and a directory', () => {
    assert.deepEqual(checkSoundFile(wav), { path: wav });
    assert.equal(checkSoundFile(path.join(dir, 'nope.wav')).reason, 'file not found');
    assert.equal(checkSoundFile(dir).reason, 'not a file');
  });
});

describe('prepareSoundFile', () => {
  it('returns null for a plain name without logging', () => {
    const { entries, log } = logger();
    assert.equal(prepareSoundFile('IM', 'toast:test', { log }), null);
    assert.equal(entries.length, 0);
  });
  it('returns the absolute path of a usable file', () => {
    assert.equal(prepareSoundFile(wav, 'toast:test', { log: () => assert.fail('no log expected') }), wav);
  });
  it('logs once for a missing file, and the log never contains the path', () => {
    const { entries, log } = logger();
    const missing = path.join(dir, 'secret-name-nope.wav');
    assert.equal(prepareSoundFile(missing, 'toast:test', { log }), null);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].extra.reason, 'file not found');
    assert.ok(!JSON.stringify(entries).includes('secret-name'));
    assert.ok(!JSON.stringify(entries).includes(dir));
  });
});

describe('startDetached / playFirst', () => {
  it('spawns detached with ignored stdio and resolves true once spawned', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    assert.equal(await startDetached('afplay', ['/a.wav'], { spawnImpl }), true);
    assert.equal(calls[0].options.detached, true);
    assert.equal(calls[0].options.stdio, 'ignore');
  });
  it('resolves false when the player cannot start, and when spawn throws', async () => {
    assert.equal(await startDetached('x', [], { spawnImpl: fakeSpawn(['x']).spawnImpl }), false);
    assert.equal(await startDetached('x', [], { spawnImpl: () => { throw new Error('boom'); } }), false);
  });
  it('tries the next player and stops at the first that starts', async () => {
    const { spawnImpl, calls } = fakeSpawn(['a']);
    const { entries, log } = logger();
    assert.equal(await playFirst([['a', []], ['b', []], ['c', []]], 'ctx', { spawnImpl, log }), true);
    assert.deepEqual(calls.map((c) => c.command), ['a', 'b']);
    assert.equal(entries.length, 0);
  });
  it('logs once, naming only the players, when none starts', async () => {
    const { spawnImpl } = fakeSpawn(['a', 'b']);
    const { entries, log } = logger();
    assert.equal(await playFirst([['a', ['/secret/x.wav']], ['b', []]], 'ctx', { spawnImpl, log }), false);
    assert.equal(entries.length, 1);
    assert.deepEqual(entries[0].extra.tried, ['a', 'b']);
    assert.ok(!JSON.stringify(entries).includes('secret'));
  });
});

describe('player command building', () => {
  it('linux: pw-play, paplay, then aplay for WAV only', () => {
    assert.deepEqual(linuxPlayers('/a.wav'), [['pw-play', ['/a.wav']], ['paplay', ['/a.wav']], ['aplay', ['-q', '/a.wav']]]);
    assert.deepEqual(linuxPlayers('/a.mp3').map(([command]) => command), ['pw-play', 'paplay']);
  });
  it('windows: play-sound.ps1 with -Path, and -Detach for WSL', () => {
    const args = windowsPlayerArgs('C:\\p.ps1', 'C:\\a.mp3');
    assert.deepEqual(args.slice(-4), ['-File', 'C:\\p.ps1', '-Path', 'C:\\a.mp3']);
    assert.ok(!args.includes('-Detach'));
    assert.deepEqual(windowsPlayerArgs('p', 'a', { detach: true }).slice(-2), ['-Detach', 'true']);
  });
  it('linux notify-send args never carry a sound hint (libnotify 0.7.9 rejects boolean hints)', () => {
    const n = { title: 'T', message: 'm', priority: 'low' };
    assert.deepEqual(buildNotifySendArgs(n, ''), ['--urgency', 'low', '--', 'T', 'm']);
  });
});

const argValue = (args, flag) => args[args.indexOf(flag) + 1];

describe('windows sendToast with a sound file', () => {
  const note = (toastSound) => ({ title: 'T', message: 'M', toastSound });

  it('plays the file in a detached pwsh and sends the toast silent with the default sound name', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    const r = await windowsToast(note(wav), { platform: 'win32', spawnImpl, execFileImpl: toast.execFileImpl, log: () => {} });
    assert.equal(r, true);
    assert.equal(calls[0].command, 'pwsh');
    assert.equal(argValue(calls[0].args, '-Path'), wav);
    assert.equal(calls[0].options.windowsHide, true);
    assert.equal(argValue(toast.calls[0].args, '-Silent'), 'true');
    assert.equal(argValue(toast.calls[0].args, '-Sound'), 'Default');
    assert.ok(!toast.calls[0].args.includes(wav), 'the path never reaches toast.ps1');
  });

  it('a missing file keeps the default sound (not silent), logs once, and still sends the toast', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    const { entries, log } = logger();
    const r = await windowsToast(note(path.join(dir, 'gone.wav')), { platform: 'win32', spawnImpl, execFileImpl: toast.execFileImpl, log });
    assert.equal(r, true);
    assert.equal(calls.length, 0, 'no player for a missing file');
    assert.ok(!toast.calls[0].args.includes('-Silent'));
    assert.equal(argValue(toast.calls[0].args, '-Sound'), 'Default');
    assert.equal(entries.length, 1);
  });

  it('a player that cannot start leaves the toast with its sound', async () => {
    const { spawnImpl } = fakeSpawn(['pwsh']);
    const toast = fakeExecFile();
    const { entries, log } = logger();
    assert.equal(await windowsToast(note(mp3), { platform: 'win32', spawnImpl, execFileImpl: toast.execFileImpl, log }), true);
    assert.ok(!toast.calls[0].args.includes('-Silent'));
    assert.equal(entries.length, 1);
  });

  it('a plain sound name is unchanged: passed to -Sound, no player, not silent', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    await windowsToast(note('Reminder'), { platform: 'win32', spawnImpl, execFileImpl: toast.execFileImpl, log: () => {} });
    assert.equal(calls.length, 0);
    assert.equal(argValue(toast.calls[0].args, '-Sound'), 'Reminder');
    assert.ok(!toast.calls[0].args.includes('-Silent'));
  });

  it('resolves false off Windows without spawning anything', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    assert.equal(await windowsToast(note(wav), { platform: 'linux', spawnImpl }), false);
    assert.equal(calls.length, 0);
  });
});

describe('macos sendToast with a sound file', () => {
  const note = (toastSound) => ({ title: 'T', message: 'M', toastSound });

  it('plays the file with afplay and sends the notification without a sound clause', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    assert.equal(await macToast(note(wav), { spawnImpl, execFileImpl: toast.execFileImpl, log: () => {} }), true);
    assert.deepEqual([calls[0].command, calls[0].args], ['afplay', [wav]]);
    const script = toast.calls[0].args[1];
    assert.match(script, /^display notification "M" with title "T"$/);
    assert.ok(!script.includes('sound name'));
  });

  it('a missing file logs once and sends the notification with no player', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    const { entries, log } = logger();
    assert.equal(await macToast(note(path.join(dir, 'gone.aiff')), { spawnImpl, execFileImpl: toast.execFileImpl, log }), true);
    assert.equal(calls.length, 0);
    assert.equal(entries.length, 1);
    assert.ok(!toast.calls[0].args[1].includes('sound name'));
  });

  it('a sound name still maps to a system sound', async () => {
    const toast = fakeExecFile();
    await macToast(note('IM'), { spawnImpl: fakeSpawn().spawnImpl, execFileImpl: toast.execFileImpl, log: () => {} });
    assert.match(toast.calls[0].args[1], /sound name "Glass"$/);
  });
});

describe('linux sendToast with a sound file', () => {
  const note = (toastSound) => ({ title: 'T', message: 'M', priority: 'low', toastSound });

  it('plays with the first available player and sends the plain toast', async () => {
    const { spawnImpl, calls } = fakeSpawn(['pw-play']);
    const toast = fakeExecFile();
    assert.equal(await linuxToast(note(wav), { spawnImpl, execFileImpl: toast.execFileImpl, log: () => {} }), true);
    assert.deepEqual(calls.map((c) => c.command), ['pw-play', 'paplay']);
    assert.ok(!toast.calls[0].args.includes('--hint'));
    assert.ok(!toast.calls[0].args.includes(wav));
  });

  it('an mp3 with only aplay installed finds no player: logged, toast still sent', async () => {
    const { spawnImpl, calls } = fakeSpawn(['pw-play', 'paplay', 'aplay']);
    const toast = fakeExecFile();
    const { entries, log } = logger();
    assert.equal(await linuxToast(note(mp3), { spawnImpl, execFileImpl: toast.execFileImpl, log }), true);
    assert.ok(!calls.some((c) => c.command === 'aplay'), 'aplay is never tried for a non-WAV file');
    assert.ok(!toast.calls[0].args.includes('--hint'));
    assert.equal(entries.length, 1);
  });

  it('a missing file plays nothing and sends the plain toast', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    const { entries, log } = logger();
    await linuxToast(note(path.join(dir, 'gone.wav')), { spawnImpl, execFileImpl: toast.execFileImpl, log });
    assert.equal(calls.length, 0);
    assert.ok(!toast.calls[0].args.includes('--hint'));
    assert.equal(entries.length, 1);
  });

  it('a sound name changes nothing on Linux', async () => {
    const { spawnImpl, calls } = fakeSpawn();
    const toast = fakeExecFile();
    await linuxToast(note('IM'), { spawnImpl, execFileImpl: toast.execFileImpl, log: () => {} });
    assert.equal(calls.length, 0);
    assert.ok(!toast.calls[0].args.includes('--hint'));
  });
});

describe('wsl sendToast with a sound file', () => {
  // wslpath and PowerShell are injected; a Windows path is the Linux one with a
  // marker so the translation is visible.
  function fakeRun({ playerOk = true } = {}) {
    const powershell = [];
    const toasts = [];
    return {
      powershell,
      toasts,
      run: {
        toWindowsPath: async (p) => `WIN:${p}`,
        runPowerShell: async (exe, args) => { powershell.push({ exe, args }); return { ok: playerOk }; },
        runToast: async (exe, script, title, message, silent) => { toasts.push({ exe, silent }); return { ok: true }; },
      },
    };
  }
  const note = (toastSound) => ({ title: 'T', message: 'M', toastSound });

  it('starts the Windows player with the translated path and sends a silent toast', async () => {
    const f = fakeRun();
    assert.equal(await wslToast(note(wav), { log: () => {}, run: f.run }), true);
    assert.equal(f.powershell.length, 1);
    assert.equal(argValue(f.powershell[0].args, '-Path'), `WIN:${wav}`);
    assert.deepEqual(f.powershell[0].args.slice(-2), ['-Detach', 'true']);
    assert.equal(f.toasts[0].silent, true);
  });

  it('a missing file starts no player and the toast is not silent', async () => {
    const f = fakeRun();
    const { entries, log } = logger();
    assert.equal(await wslToast(note(path.join(dir, 'gone.wav')), { log, run: f.run }), true);
    assert.equal(f.powershell.length, 0);
    assert.equal(f.toasts[0].silent, false);
    assert.equal(entries.length, 1);
  });

  it('the toast does not wait for the player, and is silenced optimistically', async () => {
    let releasePlayer;
    const gate = new Promise((resolve) => { releasePlayer = resolve; });
    const f = fakeRun();
    f.run.runPowerShell = async (exe, args) => { f.powershell.push({ exe, args }); await gate; return { ok: true }; };
    const done = wslToast(note(wav), { log: () => {}, run: f.run });
    // The toast is delivered while the player launch is still pending.
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(f.toasts.length, 1);
    assert.equal(f.toasts[0].silent, true);
    let settled = false;
    done.then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, 'sendToast resolves only once the player launch settled');
    releasePlayer();
    assert.equal(await done, true);
  });

  it('a player launch that fails is logged once without the path, and the toast is still sent', async () => {
    const f = fakeRun({ playerOk: false });
    const { entries, log } = logger();
    assert.equal(await wslToast(note(wav), { log, run: f.run }), true);
    assert.equal(f.toasts.length, 1);
    assert.equal(entries.length, 1);
    assert.ok(!JSON.stringify(entries).includes(dir));
  });

  it('a name sends the toast exactly as before', async () => {
    const f = fakeRun();
    await wslToast(note('IM'), { log: () => {}, run: f.run });
    assert.equal(f.powershell.length, 0);
    assert.equal(f.toasts[0].silent, false);
  });
});

describe('config: a path passes validation, and the CLI checks it', () => {
  it('config-loader keeps a toastSound path as written, with no validation problem', () => {
    const file = path.join(dir, 'config.json');
    fs.writeFileSync(file, JSON.stringify({ events: { task_complete: { toastSound: '~/sounds/done.mp3' }, needs_input: { toastSound: 'C:/Sounds/ask.wav' } } }));
    const { config, problem } = loadConfigResult(file);
    assert.equal(problem, null);
    assert.equal(config.events.task_complete.toastSound, '~/sounds/done.mp3');
    assert.equal(config.events.needs_input.toastSound, 'C:/Sounds/ask.wav');
  });

  it('config sounds accepts a name or an existing file, and keeps the old value for a missing one', () => {
    assert.deepEqual(acceptSoundAnswer('Reminder', 'IM'), { value: 'Reminder' });
    assert.deepEqual(acceptSoundAnswer('', 'IM'), { value: 'IM' });
    assert.deepEqual(acceptSoundAnswer(` ${wav} `, 'IM'), { value: wav });
    const bad = acceptSoundAnswer(path.join(dir, 'typo.wav'), 'IM');
    assert.equal(bad.value, 'IM');
    assert.match(bad.error, /file not found/);
  });

  it('test toast uses the first configured sound file, else Default', () => {
    assert.equal(testToastSound({ events: { a: { toastSound: 'IM' }, b: { toastSound: '~/x.wav' } } }), '~/x.wav');
    assert.equal(testToastSound({ events: { a: { toastSound: 'IM' } } }), 'Default');
    assert.equal(testToastSound({}), 'Default');
  });

  it('doctor reports nothing without a file, ok for a found one, and warns (naming events, not paths) for a missing one', () => {
    assert.equal(soundFilesCheck({ events: { a: { toastSound: 'IM' } } }), null);
    assert.equal(soundFilesCheck({ events: { a: { toastSound: wav } } }).status, 'ok');
    const row = soundFilesCheck({ events: { a: { toastSound: wav }, needs_input: { toastSound: path.join(dir, 'gone.wav') } } });
    assert.equal(row.status, 'warn');
    assert.match(row.detail, /needs_input/);
    assert.ok(!row.detail.includes(dir));
  });
});
