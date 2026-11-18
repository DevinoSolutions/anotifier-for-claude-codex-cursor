// tests/channels.test.mjs — the channel enable gates and the fan-out shared by
// the usage, context and update notices.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toastOn, ntfyOn, webhookOn, hasChannel, sendToChannels } from '../src/channels.mjs';
import { useFakeHome } from './fake-home.mjs';
useFakeHome();

describe('enable gates', () => {
  it('toast is on unless explicitly disabled', () => {
    for (const c of [undefined, null, {}, { toast: {} }, { toast: { enabled: true } }, { toast: { enabled: undefined } }]) {
      assert.equal(toastOn(c), true, JSON.stringify(c));
    }
    assert.equal(toastOn({ toast: { enabled: false } }), false);
  });

  it('ntfy needs enabled AND a topic', () => {
    assert.equal(ntfyOn({ ntfy: { enabled: true, topic: 't' } }), true);
    for (const c of [undefined, {}, { ntfy: {} }, { ntfy: { enabled: true } }, { ntfy: { enabled: true, topic: '' } }, { ntfy: { enabled: false, topic: 't' } }]) {
      assert.equal(ntfyOn(c), false, JSON.stringify(c));
    }
  });

  it('webhook needs enabled AND a url', () => {
    assert.equal(webhookOn({ webhook: { enabled: true, url: 'https://x.invalid' } }), true);
    for (const c of [undefined, {}, { webhook: {} }, { webhook: { enabled: true } }, { webhook: { enabled: true, url: '' } }, { webhook: { enabled: false, url: 'https://x.invalid' } }]) {
      assert.equal(webhookOn(c), false, JSON.stringify(c));
    }
  });

  it('gates always return real booleans', () => {
    assert.equal(typeof ntfyOn({ ntfy: { enabled: 'yes', topic: 't' } }), 'boolean');
    assert.equal(typeof webhookOn({ webhook: { enabled: 1, url: 'u' } }), 'boolean');
  });

  it('hasChannel is true when any one is on', () => {
    assert.equal(hasChannel({}), true, 'toast defaults on');
    assert.equal(hasChannel(undefined), true);
    const off = { toast: { enabled: false } };
    assert.equal(hasChannel(off), false);
    assert.equal(hasChannel({ ...off, ntfy: { enabled: true, topic: 't' } }), true);
    assert.equal(hasChannel({ ...off, webhook: { enabled: true, url: 'u' } }), true);
    assert.equal(hasChannel({ ...off, ntfy: { enabled: true }, webhook: { enabled: true } }), false);
  });
});

describe('sendToChannels', () => {
  function rig() {
    const calls = { toast: [], ntfy: [], webhook: [] };
    return {
      calls,
      deps: {
        resolveBackend: async () => async (x) => { calls.toast.push(x); },
        ntfy: async (c, x) => { calls.ntfy.push([c, x]); },
        webhook: async (c, x) => { calls.webhook.push([c, x]); },
      },
    };
  }
  const all = {
    toast: { enabled: true },
    ntfy: { enabled: true, topic: 'tp' },
    webhook: { enabled: true, url: 'https://example.invalid/h' },
  };
  const n = { title: 't', message: 'm' };

  it('sends every notification through every channel that is on, with the channel config', async () => {
    const { calls, deps } = rig();
    const res = await sendToChannels(all, [n, { ...n, title: 'u' }], deps);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [2, 2, 2]);
    assert.equal(calls.ntfy[0][0], all.ntfy);
    assert.equal(calls.webhook[0][0], all.webhook);
    assert.equal(calls.toast[0], n);
    assert.equal(res.length, 6);
    assert.ok(res.every((r) => r.status === 'fulfilled'));
  });

  it('skips channels that are off or incomplete', async () => {
    const { calls, deps } = rig();
    const res = await sendToChannels({
      toast: { enabled: false },
      ntfy: { enabled: true, topic: '' },
      webhook: { enabled: true, url: '' },
    }, [n], deps);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [0, 0, 0]);
    assert.deepEqual(res, []);
  });

  it('with no config at all: toast only', async () => {
    const { calls, deps } = rig();
    await sendToChannels(undefined, [n], deps);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [1, 0, 0]);
  });

  it('settles every channel: one that rejects does not stop the others, and is reported', async () => {
    const { calls, deps } = rig();
    deps.ntfy = async () => { throw new Error('boom'); };
    const res = await sendToChannels(all, [n], deps);
    assert.equal(calls.toast.length, 1);
    assert.equal(calls.webhook.length, 1);
    assert.deepEqual(res.map((r) => r.status), ['fulfilled', 'rejected', 'fulfilled']);
    assert.equal(res[1].reason.message, 'boom');
  });

  it('a toast backend that fails to resolve is a rejected result, not a throw', async () => {
    const { calls, deps } = rig();
    deps.resolveBackend = async () => { throw new Error('broken install'); };
    const res = await sendToChannels(all, [n], deps);
    assert.equal(res[0].status, 'rejected');
    assert.equal(calls.ntfy.length, 1);
    assert.equal(calls.webhook.length, 1);
  });

  it('notificationFor and ntfyConfig shape what each channel receives', async () => {
    const { calls, deps } = rig();
    await sendToChannels(all, [n], {
      ...deps,
      ntfyConfig: { ...all.ntfy, click: 'https://c.invalid' },
      notificationFor: (channel, x) => ({ ...x, channel }),
    });
    assert.equal(calls.toast[0].channel, 'toast');
    assert.equal(calls.ntfy[0][1].channel, 'ntfy');
    assert.equal(calls.webhook[0][1].channel, 'webhook');
    assert.equal(calls.ntfy[0][0].click, 'https://c.invalid');
    assert.equal(calls.ntfy[0][0].topic, 'tp');
  });

  it('an empty list sends nothing', async () => {
    const { calls, deps } = rig();
    assert.deepEqual(await sendToChannels(all, [], deps), []);
    assert.deepEqual([calls.toast.length, calls.ntfy.length, calls.webhook.length], [0, 0, 0]);
  });
});
