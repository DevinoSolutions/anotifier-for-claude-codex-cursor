// tests/cli-setup-topic.test.mjs — the default ntfy topic is the only secret
// guarding a public ntfy.sh topic, so it must come from the CSPRNG.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTopic } from '../cli/setup.mjs';

test('default topic is anotifier- plus 16 lowercase alphanumerics', () => {
  for (let i = 0; i < 50; i++) assert.match(generateTopic(), /^anotifier-[a-z0-9]{16}$/);
});

test('topics do not repeat across calls', () => {
  const seen = new Set(Array.from({ length: 200 }, () => generateTopic()));
  assert.equal(seen.size, 200);
});

test('every character is drawn through the injected integer source', () => {
  const bounds = [];
  const topic = generateTopic((max) => { bounds.push(max); return 0; });
  assert.equal(topic, 'anotifier-aaaaaaaaaaaaaaaa');
  assert.deepEqual(bounds, Array(16).fill(36));
});
