// tests/suppress.test.mjs — the "stay silent" gate: snooze state + quiet hours.
// The clock and the state path are both dependency-injected, and every
// wall-clock time is built with the LOCAL-time Date constructor, so these pass
// identically at 3am, in CI, and in any timezone.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  parseDuration, formatClock,
  readSnoozeUntil, writeSnoozeUntil, clearSnooze,
  quietHoursWindow, inQuietHours, isSuppressed,
} from '../src/suppress.mjs';

// Local wall-clock time, timezone-independent by construction.
const at = (hours, minutes = 0) => new Date(2026, 0, 15, hours, minutes, 0, 0);

describe('parseDuration', () => {
  it('accepts m / h / s units', () => {
    assert.equal(parseDuration('30m'), 30 * 60 * 1000);
    assert.equal(parseDuration('2h'), 2 * 60 * 60 * 1000);
    assert.equal(parseDuration('90s'), 90 * 1000);
  });

  it('treats a bare number as minutes (the shape people type first)', () => {
    assert.equal(parseDuration('45'), 45 * 60 * 1000);
    assert.equal(parseDuration(45), 45 * 60 * 1000);
  });

  it('is forgiving about case and surrounding whitespace', () => {
    assert.equal(parseDuration(' 2H '), 2 * 60 * 60 * 1000);
  });

  it('rejects garbage', () => {
    for (const bad of ['banana', '', '  ', 'm', '30x', '1.5h', '30 m', '1h30m', null, undefined, {}]) {
      assert.equal(parseDuration(bad), null, `${JSON.stringify(bad)} must not parse`);
    }
  });

  it('rejects zero — a snooze that is already over is a typo, not a request', () => {
    assert.equal(parseDuration('0'), null);
    assert.equal(parseDuration('0m'), null);
    assert.equal(parseDuration('0h'), null);
  });

  it('rejects negatives', () => {
    assert.equal(parseDuration('-5'), null);
    assert.equal(parseDuration('-5m'), null);
  });
});

describe('formatClock', () => {
  it('renders local HH:MM zero-padded', () => {
    assert.equal(formatClock(at(9, 5).getTime()), '09:05');
    assert.equal(formatClock(at(23, 59).getTime()), '23:59');
    assert.equal(formatClock(at(0, 0).getTime()), '00:00');
  });
});

describe('snooze state file', () => {
  let dir, statePath;
  const NOW = at(12, 0).getTime();
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-snooze-'));
    statePath = path.join(dir, '.snooze.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('no state file reads as not snoozed', () => {
    assert.equal(readSnoozeUntil(statePath, NOW), null);
  });

  it('a future deadline reads as snoozed', () => {
    writeSnoozeUntil(NOW + 60_000, statePath);
    assert.equal(readSnoozeUntil(statePath, NOW), NOW + 60_000);
  });

  it('an EXPIRED deadline reads exactly like no snooze, and the dead file is dropped', () => {
    writeSnoozeUntil(NOW - 1, statePath);
    assert.equal(readSnoozeUntil(statePath, NOW), null);
    assert.equal(fs.existsSync(statePath), false, 'expired state should be cleaned up opportunistically');
  });

  it('the deadline is exclusive at the exact millisecond it expires', () => {
    writeSnoozeUntil(NOW, statePath);
    assert.equal(readSnoozeUntil(statePath, NOW), null);
  });

  it('a corrupt state file reads as not snoozed (fail-open)', () => {
    fs.writeFileSync(statePath, '{ not json ,,,');
    assert.equal(readSnoozeUntil(statePath, NOW), null);
  });

  it('a state file holding a JSON scalar or the wrong type reads as not snoozed', () => {
    for (const body of ['null', '7', '"soon"', '[]', '{"until":"later"}', '{}']) {
      fs.writeFileSync(statePath, body);
      assert.equal(readSnoozeUntil(statePath, NOW), null, body);
    }
  });

  it('an unreadable state path never throws', () => {
    // A DIRECTORY where the state file belongs: the read fails with something
    // other than ENOENT, and the cleanup unlink fails too.
    const blocked = path.join(dir, 'blocked.json');
    fs.mkdirSync(blocked);
    assert.equal(readSnoozeUntil(blocked, NOW), null);
  });

  it('writeSnoozeUntil creates the config dir if it does not exist yet', () => {
    const nested = path.join(dir, 'fresh', '.snooze.json');
    writeSnoozeUntil(NOW + 1000, nested);
    assert.equal(readSnoozeUntil(nested, NOW), NOW + 1000);
  });

  it('clearSnooze removes an active snooze and reports that it did', () => {
    writeSnoozeUntil(NOW + 60_000, statePath);
    assert.equal(clearSnooze(statePath), true);
    assert.equal(fs.existsSync(statePath), false);
    assert.equal(readSnoozeUntil(statePath, NOW), null);
  });

  it('clearSnooze on a machine that was never snoozed reports false, not an error', () => {
    assert.equal(clearSnooze(statePath), false);
  });
});

describe('quietHoursWindow — when the feature is inert', () => {
  it('null for a missing block or enabled: false (the default)', () => {
    assert.equal(quietHoursWindow(undefined), null);
    assert.equal(quietHoursWindow({ from: '22:00', to: '08:00' }), null);
    assert.equal(quietHoursWindow({ enabled: false, from: '22:00', to: '08:00' }), null);
  });

  it('null when from === to — a zero-length window is OFF, never all-day', () => {
    assert.equal(quietHoursWindow({ enabled: true, from: '09:00', to: '09:00' }), null);
  });

  it('null for a malformed time — degrades to disabled rather than guessing', () => {
    for (const bad of ['banana', '25:00', '22:60', '2200', '22:0', '', 8, null]) {
      assert.equal(quietHoursWindow({ enabled: true, from: bad, to: '08:00' }), null, JSON.stringify(bad));
      assert.equal(quietHoursWindow({ enabled: true, from: '22:00', to: bad }), null, JSON.stringify(bad));
    }
  });

  it('returns the parsed window for a usable block', () => {
    assert.deepEqual(quietHoursWindow({ enabled: true, from: '22:00', to: '08:00' }), {
      from: '22:00', to: '08:00', fromMin: 1320, toMin: 480,
    });
  });
});

describe('inQuietHours — window containment', () => {
  const overnight = { enabled: true, from: '22:00', to: '08:00' };
  const daytime = { enabled: true, from: '08:00', to: '22:00' };

  it('a midnight-spanning window covers BOTH sides of midnight', () => {
    assert.equal(inQuietHours(overnight, at(22, 0)), true, 'start of the evening leg');
    assert.equal(inQuietHours(overnight, at(23, 59)), true, 'end of the evening leg');
    assert.equal(inQuietHours(overnight, at(0, 0)), true, 'midnight itself');
    assert.equal(inQuietHours(overnight, at(3, 30)), true, 'the small hours');
    assert.equal(inQuietHours(overnight, at(7, 59)), true, 'end of the morning leg');
  });

  it('a midnight-spanning window leaves the day alone', () => {
    assert.equal(inQuietHours(overnight, at(8, 0)), false, 'end is exclusive');
    assert.equal(inQuietHours(overnight, at(12, 0)), false);
    assert.equal(inQuietHours(overnight, at(21, 59)), false, 'start is inclusive, one minute early is not');
  });

  it('a same-day window (08:00-22:00, no midnight span) works too', () => {
    assert.equal(inQuietHours(daytime, at(8, 0)), true, 'start inclusive');
    assert.equal(inQuietHours(daytime, at(15, 0)), true);
    assert.equal(inQuietHours(daytime, at(21, 59)), true);
    assert.equal(inQuietHours(daytime, at(22, 0)), false, 'end exclusive');
    assert.equal(inQuietHours(daytime, at(7, 59)), false);
    assert.equal(inQuietHours(daytime, at(23, 0)), false);
  });

  it('a one-minute window is honored exactly', () => {
    const sliver = { enabled: true, from: '13:00', to: '13:01' };
    assert.equal(inQuietHours(sliver, at(12, 59)), false);
    assert.equal(inQuietHours(sliver, at(13, 0)), true);
    assert.equal(inQuietHours(sliver, at(13, 1)), false);
  });

  it('an inert block is never inside the window, at any hour', () => {
    for (let h = 0; h < 24; h++) {
      assert.equal(inQuietHours({ enabled: false, from: '22:00', to: '08:00' }, at(h)), false);
      assert.equal(inQuietHours({ enabled: true, from: '09:00', to: '09:00' }, at(h)), false);
      assert.equal(inQuietHours({ enabled: true, from: 'banana', to: '08:00' }, at(h)), false);
      assert.equal(inQuietHours(undefined, at(h)), false);
    }
  });
});

describe('isSuppressed — the single gate the hook path asks', () => {
  let dir, statePath;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aan-suppress-'));
    statePath = path.join(dir, '.snooze.json');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const noon = at(12, 0).getTime();
  const night = at(23, 0).getTime();
  const overnight = { quietHours: { enabled: true, from: '22:00', to: '08:00' } };

  it('null when nothing is asking for quiet', () => {
    assert.equal(isSuppressed({}, { statePath, now: noon }), null);
    assert.equal(isSuppressed(overnight, { statePath, now: noon }), null);
  });

  it('an active snooze suppresses on its own, outside any quiet window', () => {
    writeSnoozeUntil(noon + 60_000, statePath);
    assert.deepEqual(isSuppressed({}, { statePath, now: noon }), { reason: 'snooze', until: noon + 60_000 });
  });

  it('an expired snooze does not suppress', () => {
    writeSnoozeUntil(noon - 1, statePath);
    assert.equal(isSuppressed({}, { statePath, now: noon }), null);
  });

  it('a corrupt state file does not suppress', () => {
    fs.writeFileSync(statePath, 'not json at all');
    assert.equal(isSuppressed({}, { statePath, now: noon }), null);
  });

  it('quiet hours suppresses on its own, with no snooze in sight', () => {
    assert.deepEqual(isSuppressed(overnight, { statePath, now: night }), {
      reason: 'quietHours', from: '22:00', to: '08:00',
    });
  });

  it('either source alone is enough — and both at once still suppresses', () => {
    writeSnoozeUntil(night + 60_000, statePath);
    assert.equal(isSuppressed(overnight, { statePath, now: night }).reason, 'snooze');
  });

  it('a missing config never throws (defaults are absent on a fresh install)', () => {
    assert.equal(isSuppressed(undefined, { statePath, now: noon }), null);
  });
});
