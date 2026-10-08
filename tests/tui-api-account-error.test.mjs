// tests/tui-api-account-error.test.mjs — the TUI proofs must report a model
// provider's account error (no credits, quota, bad key) as INFRA, not as an
// anotifier PRODUCT failure. Pure pane-text matching; no tmux needed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiAccountError } from '../scripts/tui/lib.mjs';

describe('apiAccountError', () => {
  it('finds the out-of-credits line codex 0.144 printed in CI', () => {
    const pane = [
      '› y',
      '■ stream disconnected before completion: You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.',
      '› Write tests for @filename',
    ].join('\n');
    assert.match(apiAccountError(pane), /^■ stream disconnected before completion: You have no credits remaining/);
  });

  it('matches quota and bad-key errors', () => {
    assert.ok(apiAccountError('error: insufficient_quota'));
    assert.ok(apiAccountError('You exceeded your current quota, please check your plan and billing details.'));
    assert.ok(apiAccountError('401 Incorrect API key provided'));
    assert.ok(apiAccountError('Your credit balance is too low to access the Anthropic API.'));
  });

  it('finds the out-of-credits line the claude TUI printed in CI', () => {
    const pane = [
      '> Reply with the single word OK.',
      '  Credit balance too low · Add funds: https://platform.claude.com/settings/billing',
    ].join('\n');
    assert.equal(apiAccountError(pane), 'Credit balance too low · Add funds: https://platform.claude.com/settings/billing');
    assert.ok(apiAccountError('claude stdout: Credit balance is too low'));
  });

  it('returns null for a normal pane, an approval modal, or nothing', () => {
    assert.equal(apiAccountError('Would you like to run the following command?\n1. Yes, proceed (y)'), null);
    assert.equal(apiAccountError(''), null);
    assert.equal(apiAccountError(undefined), null);
  });
});
