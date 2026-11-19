// tests/notify-channel-gates.test.mjs — notify.mjs decides per event which of
// toast, ntfy and webhook to send by combining the shared "is this channel on"
// predicates (src/channels.mjs) with the event's own switch. Before the predicates
// were shared, the dispatch site spelled each condition out by hand. This pins
// that the two are the same condition: LEGACY below is the old inline code
// verbatim, and every combination of the values a config file can plausibly hold
// (and some it should not) must give the same answer both ways.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toastOn, ntfyOn, webhookOn } from '../src/channels.mjs';

// notify.mjs before the change, copied as it was.
const LEGACY = {
  toast: (config, eventConfig) => config.toast?.enabled !== false && eventConfig.toastEnabled !== false,
  ntfy: (config, eventConfig) => Boolean(config.ntfy?.enabled && config.ntfy?.topic && eventConfig.ntfyEnabled !== false),
  webhook: (config, eventConfig) => Boolean(config.webhook?.enabled && config.webhook?.url && eventConfig.webhookEnabled !== false),
};

// notify.mjs after: the shared predicate, then the event's own switch.
const SHARED = {
  toast: (config, eventConfig) => toastOn(config) && eventConfig.toastEnabled !== false,
  ntfy: (config, eventConfig) => ntfyOn(config) && eventConfig.ntfyEnabled !== false,
  webhook: (config, eventConfig) => webhookOn(config) && eventConfig.webhookEnabled !== false,
};

const FLAGS = [undefined, true, false, null, 0, 1, '', 'false', 'yes'];
const TEXTS = [undefined, null, '', 't', 0, 5, false];
const EVENT_SWITCH = [undefined, true, false, null, 0, ''];

// Every config.<channel> value: absent, not an object, and each combination of the
// two keys a channel gate reads.
function channelBlocks(secondKey) {
  const blocks = [undefined, null, 0, 'x', {}];
  for (const enabled of FLAGS) for (const second of TEXTS) blocks.push({ enabled, [secondKey]: second });
  return blocks;
}

describe('notify.mjs channel gates: shared predicates are the old inline conditions', () => {
  it('toast: identical for every config.toast value and event switch', () => {
    let rows = 0;
    const blocks = [undefined, null, 0, 'x', {}, ...FLAGS.map((enabled) => ({ enabled }))];
    for (const toast of blocks) {
      for (const sw of EVENT_SWITCH) {
        const config = toast === undefined ? {} : { toast };
        const eventConfig = { toastEnabled: sw };
        assert.equal(SHARED.toast(config, eventConfig), LEGACY.toast(config, eventConfig), JSON.stringify({ toast, sw }));
        rows += 1;
      }
    }
    assert.ok(rows > 50);
  });

  for (const [name, key, second] of [['ntfy', 'ntfyEnabled', 'topic'], ['webhook', 'webhookEnabled', 'url']]) {
    it(`${name}: identical for every enabled/${second} combination and event switch`, () => {
      let rows = 0;
      for (const block of channelBlocks(second)) {
        for (const sw of EVENT_SWITCH) {
          const config = block === undefined ? {} : { [name]: block };
          const eventConfig = { [key]: sw };
          assert.equal(SHARED[name](config, eventConfig), LEGACY[name](config, eventConfig), JSON.stringify({ block, sw }));
          rows += 1;
        }
      }
      assert.ok(rows > 300);
    });
  }

  it('the predicates return real booleans, so the dispatch condition is one too', () => {
    for (const config of [{}, { toast: { enabled: false } }, { ntfy: { enabled: true, topic: 't' } }, { webhook: { enabled: 1, url: 'u' } }]) {
      for (const on of [toastOn, ntfyOn, webhookOn]) assert.equal(typeof on(config), 'boolean');
    }
  });

  it('spells out the contract the table above implies', () => {
    assert.equal(toastOn({}), true, 'toast is on unless explicitly disabled');
    assert.equal(toastOn({ toast: { enabled: false } }), false);
    assert.equal(ntfyOn({ ntfy: { enabled: true } }), false, 'ntfy needs a topic');
    assert.equal(ntfyOn({ ntfy: { enabled: true, topic: 't' } }), true);
    assert.equal(webhookOn({ webhook: { enabled: true } }), false, 'webhook needs a url');
    assert.equal(webhookOn({ webhook: { enabled: true, url: 'https://x' } }), true);
    // An event can still switch a channel off, which the predicates leave to notify.mjs.
    assert.equal(SHARED.toast({}, { toastEnabled: false }), false);
    assert.equal(SHARED.ntfy({ ntfy: { enabled: true, topic: 't' } }, { ntfyEnabled: false }), false);
    assert.equal(SHARED.webhook({ webhook: { enabled: true, url: 'u' } }, { webhookEnabled: false }), false);
  });
});
