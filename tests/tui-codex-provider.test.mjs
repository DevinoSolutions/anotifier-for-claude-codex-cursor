// tests/tui-codex-provider.test.mjs — which model provider the F2 TUI proof's
// codex runs on, and the config it writes for it.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { codexProvider, PROXYAI_BASE_URL } from '../scripts/tui/lib.mjs';

describe('codexProvider', () => {
  it('prefers the proxy when PROXYAI_API_KEY is set', () => {
    const p = codexProvider({ PROXYAI_API_KEY: 'pk-x', OPENAI_API_KEY: 'sk-y' });
    assert.equal(p.label, 'proxyai (sonnet)');
    assert.equal(p.auth, null, 'a custom provider needs no auth.json');
    assert.deepEqual(p.env, { PROXY_API_KEY: 'pk-x' });
    assert.match(p.config, /^approval_policy = "untrusted"$/m);
    assert.match(p.config, /^model_provider = "proxyai"$/m);
    assert.match(p.config, /^wire_api = "responses"$/m);
    assert.ok(p.config.includes(`base_url = "${PROXYAI_BASE_URL}"`));
    assert.ok(!p.config.includes('pk-x'), 'the key never lands in config.toml');
  });

  it('keeps top-level keys ahead of the first TOML table', () => {
    const { config } = codexProvider({ PROXYAI_API_KEY: 'pk-x' });
    const firstTable = config.indexOf('\n[');
    for (const key of ['approval_policy', 'model =', 'model_provider', 'model_context_window']) {
      assert.ok(config.indexOf(key) < firstTable, `${key} sits before the first table`);
    }
    assert.match(config, /^\[features\]\nhooks = true$/m);
  });

  it('takes the model from TUI_CODEX_MODEL', () => {
    const p = codexProvider({ PROXYAI_API_KEY: 'pk-x', TUI_CODEX_MODEL: 'glm-5.3' });
    assert.equal(p.label, 'proxyai (glm-5.3)');
    assert.match(p.config, /^model = "glm-5.3"$/m);
  });

  it('falls back to the OpenAI API with an auth.json body', () => {
    const p = codexProvider({ OPENAI_API_KEY: 'sk-y' });
    assert.equal(p.label, 'OpenAI API');
    assert.deepEqual(p.auth, { OPENAI_API_KEY: 'sk-y' });
    assert.deepEqual(p.env, {});
    assert.equal(p.config, 'approval_policy = "untrusted"\n[features]\nhooks = true\n');
  });

  it('returns null with neither key', () => {
    assert.equal(codexProvider({}), null);
  });
});
