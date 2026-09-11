// tests/support.test.mjs — the support/docs URLs have exactly one home.
//
// SUPPORT_URL must be the package.json `funding.url` (npm's own field, so
// `npm fund` and the CLI can never disagree), and both URLs must be real https
// URLs — a typo here would ship a dead link in every `setup` run.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPPORT_URL, DOCS_URL, SUPPORT_LINE } from '../src/support.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));

describe('src/support.mjs', () => {
  it('SUPPORT_URL is exactly package.json funding.url', () => {
    assert.equal(typeof pkg.funding?.url, 'string', 'package.json must declare funding.url');
    assert.equal(SUPPORT_URL, pkg.funding.url);
  });

  it('both URLs are valid https URLs', () => {
    for (const url of [SUPPORT_URL, DOCS_URL]) {
      const u = new URL(url); // throws on garbage
      assert.equal(u.protocol, 'https:', url);
      assert.ok(u.hostname.includes('.'), url);
    }
  });

  it('DOCS_URL points at the anotifier.io docs page', () => {
    assert.equal(DOCS_URL, 'https://anotifier.io/docs/');
  });

  it('SUPPORT_LINE asks gently and carries the URL verbatim', () => {
    assert.ok(SUPPORT_LINE.includes(SUPPORT_URL));
    assert.match(SUPPORT_LINE, /consider supporting/i);
    assert.ok(!/\n/.test(SUPPORT_LINE), 'single line');
  });

  it('the sponsorship destination is the DevinoSolutions GitHub Sponsors page', () => {
    // If this ever changes, package.json funding.url is the one place to edit.
    assert.equal(SUPPORT_URL, 'https://github.com/sponsors/DevinoSolutions');
  });
});
