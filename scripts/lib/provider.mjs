// scripts/lib/provider.mjs — which model provider the Claude lanes (Live Claude
// E2E, TUI F1) run on, and how to recognise a provider-side account error.
// Mirrors codexProvider() in scripts/tui/lib.mjs: PROXYAI_API_KEY (our own proxy,
// open models behind the Anthropic Messages API) is preferred and
// ANTHROPIC_API_KEY is the fallback.

// The model provider refused the request for account reasons (no credits, quota,
// bad key). That says nothing about anotifier, so a lane that sees it must fail
// as INFRA, not PRODUCT. Claude Code words the credit error two ways: "Credit
// balance is too low" (print mode) and "Credit balance too low" (TUI).
const API_ACCOUNT_ERROR =
  /no credits remaining|insufficient_quota|exceeded your current quota|check your plan and billing|incorrect api key|invalid_api_key|invalid (x-)?api key|credit balance (is )?too low/i;

// Returns the first line of `text` that is an account error, or null.
export function apiAccountError(text) {
  const line = String(text || '').split('\n').find((l) => API_ACCOUNT_ERROR.test(l));
  return line ? line.trim() : null;
}

// The bare host: Claude Code appends /v1/messages itself.
export const PROXYAI_ANTHROPIC_URL = 'https://proxyai.devino.ca';

// Returns null when neither key is set. Otherwise:
//   label   - for the "provider = ..." log line
//   model   - what to pass to `claude --model`
//   apiKey  - the key claude is given (F1 pre-approves its last 20 characters)
//   env     - variables to put on the claude process (they override inherited ones)
//   slow    - open models are slow to first byte: widen the waits
export function claudeProvider(env = process.env) {
  const pinned = env.CLAUDE_LANE_MODEL;
  if (env.PROXYAI_API_KEY) {
    // Claude Code ids map to proxy tiers by family word, so `sonnet` and `haiku`
    // both work; sonnet is the sturdier of the two for a full TUI session.
    const model = pinned || 'sonnet';
    return {
      label: `proxyai (${model})`,
      model,
      apiKey: env.PROXYAI_API_KEY,
      env: {
        ANTHROPIC_BASE_URL: PROXYAI_ANTHROPIC_URL,
        ANTHROPIC_API_KEY: env.PROXYAI_API_KEY,
        // Claude Code asks for 32k-64k output tokens; free tiers are often 8k-16k.
        CLAUDE_CODE_MAX_OUTPUT_TOKENS: '16384',
        // Client-side per-request timeout; the proxy fails over after 30 s itself.
        API_TIMEOUT_MS: '300000',
      },
      slow: true,
    };
  }
  if (env.ANTHROPIC_API_KEY) {
    // The cheapest model proves the same wiring: every assertion is model-agnostic.
    const model = pinned || 'haiku';
    return { label: `Anthropic API (${model})`, model, apiKey: env.ANTHROPIC_API_KEY, env: {}, slow: false };
  }
  return null;
}
