// tests/claude-provider.test.mjs — which model provider the Live Claude lane and
// the F1 TUI proof run claude on, and the env it gets.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { claudeProvider, PROXYAI_ANTHROPIC_URL } from '../scripts/lib/provider.mjs';

describe('claudeProvider', () => {
  it('prefers the proxy when PROXYAI_API_KEY is set', () => {
    const p = claudeProvider({ PROXYAI_API_KEY: 'pk-x', ANTHROPIC_API_KEY: 'sk-ant-y' });
    assert.equal(p.label, 'proxyai (sonnet)');
    assert.equal(p.model, 'sonnet');
    assert.equal(p.apiKey, 'pk-x', 'F1 pre-approves the key claude actually gets');
    assert.equal(p.env.ANTHROPIC_BASE_URL, PROXYAI_ANTHROPIC_URL);
    assert.equal(PROXYAI_ANTHROPIC_URL, 'https://proxyai.devino.ca', 'the bare host, no /v1');
    assert.equal(p.env.ANTHROPIC_API_KEY, 'pk-x', 'the proxy key replaces the Anthropic key');
    assert.equal(p.slow, true);
    assert.ok(Number(p.env.API_TIMEOUT_MS) >= 300000);
  });

  it('takes the model from CLAUDE_LANE_MODEL', () => {
    const p = claudeProvider({ PROXYAI_API_KEY: 'pk-x', CLAUDE_LANE_MODEL: 'haiku' });
    assert.equal(p.label, 'proxyai (haiku)');
    assert.equal(p.model, 'haiku');
  });

  it('falls back to the real Anthropic key on haiku, changing no env', () => {
    const p = claudeProvider({ ANTHROPIC_API_KEY: 'sk-ant-y' });
    assert.equal(p.label, 'Anthropic API (haiku)');
    assert.equal(p.model, 'haiku');
    assert.equal(p.apiKey, 'sk-ant-y');
    assert.deepEqual(p.env, {});
    assert.equal(p.slow, false);
  });

  it('treats an empty PROXYAI_API_KEY (unset secret) as absent', () => {
    const p = claudeProvider({ PROXYAI_API_KEY: '', ANTHROPIC_API_KEY: 'sk-ant-y' });
    assert.equal(p.label, 'Anthropic API (haiku)');
  });

  it('returns null with neither key', () => {
    assert.equal(claudeProvider({}), null);
    assert.equal(claudeProvider({ PROXYAI_API_KEY: '', ANTHROPIC_API_KEY: '' }), null);
  });
});
