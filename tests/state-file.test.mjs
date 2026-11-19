// tests/state-file.test.mjs — the shared small-JSON-file primitives: reading a
// JSON object, writing atomically, and the exclusive lock file.
import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readJsonFile, readJsonObject, writeFileAtomic, writeJsonAtomic, withLock } from '../src/state-file.mjs';
import { readRecentHookErrors } from '../src/error-log.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

describe('withLock on a lock being released (Windows EPERM)', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-lock-')); });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });

  const eperm = () => Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
  const lockErrors = (label) => readRecentHookErrors(200).filter((e) => e.context === label).length;
  // Fail only for the lock path: on Node 18, appendFileSync (the error log)
  // goes through fs.openSync too, and must keep working.
  const failFor = (method, target) => {
    const real = fs[method];
    mock.method(fs, method, function (p, ...rest) {
      if (p === target) throw eperm();
      return real.call(fs, p, ...rest);
    });
  };

  it('EPERM while a fresh lock file exists is contention: skip quietly', () => {
    const lock = path.join(dir, 's.json.lock');
    fs.writeFileSync(lock, '');
    const before = lockErrors('test:lock-busy');
    failFor('openSync', lock);
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-busy'), null);
    assert.equal(ran, false);
    assert.equal(lockErrors('test:lock-busy'), before, 'not logged');
  });

  it('EPERM with no lock file, still failing on the retry, is a real problem: logged once', () => {
    const lock = path.join(dir, 'missing.json.lock');
    const before = lockErrors('test:lock-perm');
    failFor('openSync', lock);
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-perm'), null);
    assert.equal(ran, false);
    assert.equal(lockErrors('test:lock-perm'), before + 1);
  });

  it('EPERM whose lock vanished before the stat is retried once and then runs', () => {
    const lock = path.join(dir, 'raced.json.lock');
    const before = lockErrors('test:lock-raced');
    const real = fs.openSync;
    let lockOpens = 0;
    mock.method(fs, 'openSync', function (p, ...rest) {
      if (p === lock && ++lockOpens === 1) throw eperm();
      return real.call(fs, p, ...rest);
    });
    assert.equal(withLock(lock, () => 'ran', 'test:lock-raced'), 'ran');
    assert.equal(lockOpens, 2, 'retried exactly once');
    assert.equal(lockErrors('test:lock-raced'), before, 'not logged');
    assert.equal(fs.existsSync(lock), false, 'lock released');
  });

  it('EPERM then EEXIST on the retry is contention: skip quietly', () => {
    const lock = path.join(dir, 'taken.json.lock');
    const before = lockErrors('test:lock-taken');
    const real = fs.openSync;
    let lockOpens = 0;
    mock.method(fs, 'openSync', function (p, ...rest) {
      if (p === lock) {
        lockOpens++;
        throw lockOpens === 1 ? eperm() : Object.assign(new Error('EEXIST: file already exists'), { code: 'EEXIST' });
      }
      return real.call(fs, p, ...rest);
    });
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-taken'), null);
    assert.equal(ran, false);
    assert.equal(lockOpens, 2);
    assert.equal(lockErrors('test:lock-taken'), before, 'not logged');
  });

  it('a non-release error code is logged at once, with no retry', () => {
    const lock = path.join(dir, 'notdir.json.lock');
    const before = lockErrors('test:lock-notdir');
    const real = fs.openSync;
    let lockOpens = 0;
    mock.method(fs, 'openSync', function (p, ...rest) {
      if (p === lock) {
        lockOpens++;
        throw Object.assign(new Error('ENOTDIR: not a directory'), { code: 'ENOTDIR' });
      }
      return real.call(fs, p, ...rest);
    });
    let ran = false;
    assert.equal(withLock(lock, () => { ran = true; return 1; }, 'test:lock-notdir'), null);
    assert.equal(ran, false);
    assert.equal(lockOpens, 1, 'no retry');
    assert.equal(lockErrors('test:lock-notdir'), before + 1);
  });

  it('a stale lock that cannot be deleted is logged, not skipped forever', () => {
    const lock = path.join(dir, 'stuck.json.lock');
    fs.writeFileSync(lock, '');
    const old = new Date(Date.now() - 60000);
    fs.utimesSync(lock, old, old);
    const before = lockErrors('test:lock-stuck');
    failFor('unlinkSync', lock);
    failFor('openSync', lock);
    assert.equal(withLock(lock, () => 1, 'test:lock-stuck'), null);
    assert.equal(lockErrors('test:lock-stuck'), before + 1);
  });
});

describe('withLock stale age', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-lock-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const ageBy = (file, ms) => {
    const old = new Date(Date.now() - ms);
    fs.utimesSync(file, old, old);
  };

  it('defaults to 5 s: a 3 s old lock is live, a 10 s old one is taken over', () => {
    const lock = path.join(dir, 'a.lock');
    fs.writeFileSync(lock, '');
    ageBy(lock, 3000);
    assert.equal(withLock(lock, () => 'ran', 'test:stale-default'), null);
    ageBy(lock, 10000);
    assert.equal(withLock(lock, () => 'ran', 'test:stale-default'), 'ran');
  });

  it('staleMs is a parameter: the same 3 s old lock is taken over at staleMs 1000', () => {
    const lock = path.join(dir, 'b.lock');
    fs.writeFileSync(lock, '');
    ageBy(lock, 3000);
    assert.equal(withLock(lock, () => 'ran', 'test:stale-param', { staleMs: 1000 }), 'ran');
  });

  it('releases the lock when fn throws, and lets the error out', () => {
    const lock = path.join(dir, 'c.lock');
    assert.throws(() => withLock(lock, () => { throw new Error('boom'); }, 'test:throws'), /boom/);
    assert.equal(fs.existsSync(lock), false);
  });

  it('creates the lock directory when it is missing', () => {
    const lock = path.join(dir, 'nested', 'deeper', 'd.lock');
    assert.equal(withLock(lock, () => 1, 'test:mkdir'), 1);
  });
});

describe('readJsonFile', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-read-')); });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });

  it('ok: the parsed object', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, '{"a":1}');
    assert.deepEqual(readJsonFile(file), { status: 'ok', data: { a: 1 } });
  });

  it('an empty object is ok, not corrupt', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, '{}');
    assert.deepEqual(readJsonFile(file), { status: 'ok', data: {} });
  });

  it('missing: ENOENT', () => {
    assert.deepEqual(readJsonFile(path.join(dir, 'nope.json')), { status: 'missing', data: {} });
  });

  it('corrupt: unparseable text, and JSON that is not a plain object', () => {
    const file = path.join(dir, 's.json');
    for (const body of ['{not json', '', 'null', '7', '"x"', '[1,2]', 'true']) {
      fs.writeFileSync(file, body);
      assert.deepEqual(readJsonFile(file), { status: 'corrupt', data: {} }, JSON.stringify(body));
    }
  });

  it('unreadable: any other read error, with the error attached', () => {
    const blocked = path.join(dir, 'blocked.json');
    fs.mkdirSync(blocked); // a directory where the file belongs: EISDIR
    const r = readJsonFile(blocked);
    assert.equal(r.status, 'unreadable');
    assert.deepEqual(r.data, {});
    assert.ok(r.error instanceof Error);
  });

  it('unreadable: an injected EBUSY / EACCES / EPERM is not turned into "empty"', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, '{"a":1}');
    for (const code of ['EBUSY', 'EACCES', 'EPERM']) {
      const real = fs.readFileSync;
      mock.method(fs, 'readFileSync', function (p, ...rest) {
        if (p === file) throw Object.assign(new Error(code), { code });
        return real.call(fs, p, ...rest);
      });
      try {
        const r = readJsonFile(file);
        assert.equal(r.status, 'unreadable', code);
        assert.equal(r.error.code, code);
      } finally {
        mock.restoreAll();
      }
    }
  });
});

describe('writeFileAtomic', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-write-')); });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });
  const noModes = process.platform === 'win32' && 'no POSIX modes on Windows';

  it('writes the content, creates missing directories and leaves no temp file', () => {
    const file = path.join(dir, 'a', 'b', 's.json');
    writeFileAtomic(file, 'hello');
    assert.equal(fs.readFileSync(file, 'utf8'), 'hello');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['s.json']);
  });

  it('replaces an existing file in place', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, 'old');
    writeFileAtomic(file, 'new');
    assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  });

  it('writeJsonAtomic stores compact JSON', () => {
    const file = path.join(dir, 's.json');
    writeJsonAtomic(file, { a: [1, 2], b: 'x' });
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":[1,2],"b":"x"}');
  });

  it('mode: owner-only file, and a directory created on the way gets dirMode', { skip: noModes }, () => {
    const file = path.join(dir, 'new-dir', 's.json');
    writeFileAtomic(file, 'secret', { mode: 0o600, dirMode: 0o700 });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
  });

  it('mode: replaces an older, looser file with an owner-only one', { skip: noModes }, () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, 'old', { mode: 0o644 });
    fs.chmodSync(file, 0o644);
    writeFileAtomic(file, 'new', { mode: 0o600 });
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  });

  it('mkdir: false does not create the directory, and throws when it is missing', () => {
    const file = path.join(dir, 'missing', 's.json');
    assert.throws(() => writeFileAtomic(file, 'x', { mkdir: false }), { code: 'ENOENT' });
    assert.equal(fs.existsSync(path.dirname(file)), false);
    fs.mkdirSync(path.dirname(file));
    writeFileAtomic(file, 'x', { mkdir: false });
    assert.equal(fs.readFileSync(file, 'utf8'), 'x');
  });

  it('a failed rename throws and the old content is untouched', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, 'old');
    const real = fs.renameSync;
    mock.method(fs, 'renameSync', function (from, to, ...rest) {
      if (to === file) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      return real.call(fs, from, to, ...rest);
    });
    assert.throws(() => writeFileAtomic(file, 'new'), { code: 'EPERM' });
    mock.restoreAll();
    assert.equal(fs.readFileSync(file, 'utf8'), 'old');
  });

  // The rename and the wait are injected, so these neither touch the real
  // renameSync nor sleep.
  const flaky = (failures, code, real = fs.renameSync) => {
    const calls = [];
    const rename = (from, to) => {
      calls.push([from, to]);
      if (calls.length <= failures) throw Object.assign(new Error(code), { code });
      return real(from, to);
    };
    return { rename, calls };
  };
  const waits = () => { const ms = []; return { ms, sleep: (n) => ms.push(n) }; };

  it('success path: exactly one rename and no wait', () => {
    const file = path.join(dir, 's.json');
    const { rename, calls } = flaky(0, 'EPERM');
    const { ms, sleep } = waits();
    writeFileAtomic(file, 'new', { rename, sleep });
    assert.equal(calls.length, 1);
    assert.deepEqual(ms, []);
    assert.equal(fs.readFileSync(file, 'utf8'), 'new');
  });

  for (const code of ['EPERM', 'EBUSY', 'EACCES']) {
    it(`${code} twice, then it goes through: waits 75 ms between tries and leaves no temp file`, () => {
      const file = path.join(dir, 's.json');
      fs.writeFileSync(file, 'old');
      const { rename, calls } = flaky(2, code);
      const { ms, sleep } = waits();
      writeFileAtomic(file, 'new', { rename, sleep });
      assert.equal(calls.length, 3);
      assert.deepEqual(ms, [75, 75]);
      assert.equal(fs.readFileSync(file, 'utf8'), 'new');
      assert.deepEqual(fs.readdirSync(dir), ['s.json']);
    });
  }

  it('always failing: four renames, three waits (about 225 ms), the temp file removed, the original error thrown, the old file intact', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, 'old');
    const failure = Object.assign(new Error('EBUSY'), { code: 'EBUSY' });
    const calls = [];
    const { ms, sleep } = waits();
    assert.throws(
      () => writeFileAtomic(file, 'new', { rename: (...a) => { calls.push(a); throw failure; }, sleep }),
      (err) => err === failure,
    );
    assert.equal(calls.length, 4);
    assert.deepEqual(ms, [75, 75, 75]);
    assert.deepEqual(fs.readdirSync(dir), ['s.json']);
    assert.equal(fs.readFileSync(file, 'utf8'), 'old');
  });

  it('an error that is not a lock (ENOENT, EIO) fails at once: one rename, no wait, temp file removed', () => {
    for (const code of ['ENOENT', 'EIO', 'EXDEV']) {
      const file = path.join(dir, `${code}.json`);
      const { rename, calls } = flaky(99, code);
      const { ms, sleep } = waits();
      assert.throws(() => writeFileAtomic(file, 'new', { rename, sleep }), { code });
      assert.equal(calls.length, 1, code);
      assert.deepEqual(ms, [], code);
      assert.equal(fs.existsSync(file), false);
    }
    assert.deepEqual(fs.readdirSync(dir), []);
  });

  it('writeJsonAtomic passes the same options through', () => {
    const file = path.join(dir, 's.json');
    const { rename, calls } = flaky(1, 'EPERM');
    const { ms, sleep } = waits();
    writeJsonAtomic(file, { a: 1 }, { rename, sleep });
    assert.equal(calls.length, 2);
    assert.deepEqual(ms, [75]);
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}');
  });

  it('a failed write of the temp file itself leaves nothing behind and throws as before', () => {
    const real = fs.writeFileSync;
    mock.method(fs, 'writeFileSync', function (p, ...rest) {
      if (String(p).endsWith('.tmp')) {
        real.call(fs, p, 'partial');
        throw Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' });
      }
      return real.call(fs, p, ...rest);
    });
    const file = path.join(dir, 's.json');
    assert.throws(() => writeFileAtomic(file, 'new'), { code: 'ENOSPC' });
    mock.restoreAll();
    assert.deepEqual(fs.readdirSync(dir), []);
  });
});

describe('readJsonObject', () => {
  let dir;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-readobj-')); });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });
  const errorsFor = (label) => readRecentHookErrors(200).filter((e) => e.context === label).length;

  it('the object when ok; {} when missing or corrupt', () => {
    const file = path.join(dir, 's.json');
    assert.deepEqual(readJsonObject(file), {});
    fs.writeFileSync(file, '{"a":1}');
    assert.deepEqual(readJsonObject(file), { a: 1 });
    fs.writeFileSync(file, '[1,');
    assert.deepEqual(readJsonObject(file), {});
  });

  it('null, and logged under the label, when the file cannot be read', () => {
    const file = path.join(dir, 's.json');
    fs.writeFileSync(file, '{"a":1}');
    const real = fs.readFileSync;
    mock.method(fs, 'readFileSync', function (p, ...rest) {
      if (p === file) throw Object.assign(new Error('busy'), { code: 'EBUSY' });
      return real.call(fs, p, ...rest);
    });
    const before = errorsFor('test:read-object');
    assert.equal(readJsonObject(file, 'test:read-object'), null);
    assert.equal(errorsFor('test:read-object'), before + 1);
    assert.equal(readJsonObject(file), null, 'without a label it is just not logged');
    assert.equal(errorsFor('test:read-object'), before + 1);
  });
});

describe('readJsonObject: a file that stays unreadable is logged at most once per interval', () => {
  let dir, file;
  const HOUR = 60 * 60 * 1000;
  const T0 = 1_700_000_000_000;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'an-readlog-'));
    file = path.join(dir, 's.json');
  });
  afterEach(() => { mock.restoreAll(); fs.rmSync(dir, { recursive: true, force: true }); });

  // A label unique to this test's directory, so earlier tests' lines never count.
  const label = () => `test:unreadable-${path.basename(dir)}`;
  const logged = (l) => readRecentHookErrors(500).filter((e) => e.context === l).length;
  // Fail reads of the given files with EACCES; everything else reads normally.
  const failRead = (...targets) => {
    const real = fs.readFileSync;
    mock.method(fs, 'readFileSync', function (p, ...rest) {
      if (targets.includes(p)) throw Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' });
      return real.call(fs, p, ...rest);
    });
  };

  it('N consecutive unreadable rounds log one line, and every round still skips', () => {
    fs.writeFileSync(file, '{"a":1}');
    failRead(file);
    const l = label();
    for (let i = 0; i < 20; i++) assert.equal(readJsonObject(file, l, { now: T0 + i * 1000 }), null);
    assert.equal(logged(l), 1);
  });

  it('logs again once the interval has passed, then stays quiet again', () => {
    fs.writeFileSync(file, '{"a":1}');
    failRead(file);
    const l = label();
    readJsonObject(file, l, { now: T0 });
    readJsonObject(file, l, { now: T0 + HOUR - 1 });
    assert.equal(logged(l), 1, 'just under an hour: still quiet');
    readJsonObject(file, l, { now: T0 + HOUR });
    assert.equal(logged(l), 2);
    readJsonObject(file, l, { now: T0 + HOUR + 5000 });
    assert.equal(logged(l), 2);
  });

  it('the interval is a parameter', () => {
    fs.writeFileSync(file, '{"a":1}');
    failRead(file);
    const l = label();
    readJsonObject(file, l, { now: T0, logIntervalMs: 1000 });
    readJsonObject(file, l, { now: T0 + 999, logIntervalMs: 1000 });
    readJsonObject(file, l, { now: T0 + 1000, logIntervalMs: 1000 });
    assert.equal(logged(l), 2);
  });

  it('a readable round in between breaks nothing: it reads normally and the limiter carries on', () => {
    fs.writeFileSync(file, '{"a":1}');
    const l = label();
    failRead(file);
    assert.equal(readJsonObject(file, l, { now: T0 }), null);
    mock.restoreAll();
    assert.deepEqual(readJsonObject(file, l, { now: T0 + 1000 }), { a: 1 });
    failRead(file);
    assert.equal(readJsonObject(file, l, { now: T0 + 2000 }), null);
    assert.equal(logged(l), 1, 'still inside the interval of the first line');
    assert.equal(readJsonObject(file, l, { now: T0 + HOUR + 1 }), null);
    assert.equal(logged(l), 2);
  });

  it('a healthy file never gets a marker, and neither does a call with no label', () => {
    fs.writeFileSync(file, '{"a":1}');
    readJsonObject(file, label());
    assert.equal(fs.existsSync(`${file}.logged`), false);
    failRead(file);
    readJsonObject(file); // unreadable, no label: nothing to log
    assert.equal(fs.existsSync(`${file}.logged`), false);
  });

  it('files are limited independently', () => {
    const other = path.join(dir, 'other.json');
    fs.writeFileSync(file, '{}');
    fs.writeFileSync(other, '{}');
    failRead(file, other);
    const l = label();
    readJsonObject(file, l, { now: T0 });
    readJsonObject(other, l, { now: T0 });
    readJsonObject(file, l, { now: T0 + 1 });
    readJsonObject(other, l, { now: T0 + 1 });
    assert.equal(logged(l), 2);
  });

  it('a garbled marker, or a marker from the future (clock moved back), counts as never logged', () => {
    fs.writeFileSync(file, '{}');
    failRead(file);
    const l = label();
    fs.writeFileSync(`${file}.logged`, 'not a number');
    readJsonObject(file, l, { now: T0 });
    assert.equal(logged(l), 1);
    fs.writeFileSync(`${file}.logged`, String(T0 + 10 * HOUR));
    readJsonObject(file, l, { now: T0 });
    assert.equal(logged(l), 2);
  });

  it('a marker that cannot be written is swallowed, and then nothing is logged (no per-round flood)', () => {
    fs.writeFileSync(file, '{}');
    const real = fs.writeFileSync;
    mock.method(fs, 'writeFileSync', function (p, ...rest) {
      if (p === `${file}.logged`) throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
      return real.call(fs, p, ...rest);
    });
    failRead(file);
    const l = label();
    for (let i = 0; i < 10; i++) assert.equal(readJsonObject(file, l, { now: T0 + i }), null);
    assert.equal(logged(l), 0);
    assert.equal(fs.existsSync(`${file}.logged`), false);
  });

  it('a marker path that is a directory (cannot be read or written) is swallowed too', () => {
    fs.writeFileSync(file, '{}');
    fs.mkdirSync(`${file}.logged`);
    failRead(file);
    const l = label();
    assert.equal(readJsonObject(file, l, { now: T0 }), null);
    assert.equal(logged(l), 0);
  });
});
