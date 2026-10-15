// Security headers on every kind of response nginx serves. nginx drops the
// server-level add_header set in any location that declares its own (the
// cached static paths and the share images), so each of those repeats the set
// and a header added in one place only would silently vanish from the others.
// Nothing is mocked: every request hits BASE_URL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get } from "./site-helpers.mjs";

const EXPECTED = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "SAMEORIGIN",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

const home = await get("/");
const chunk = home.body.match(/"(\/_next\/static\/[^"]+\.js)"/)?.[1];
if (!chunk) throw new Error("home page references no /_next/static/ script");

// One path per nginx location block, plus the 404 and 301 responses.
const CASES = [
  ["page", "/", 200],
  ["hashed static chunk", chunk, 200],
  ["public asset", "/assets/icons/claude.png", 200],
  ["share image", "/docs/opengraph-image", 200],
  ["404 page", "/no-such-page/", 404],
  ["trailing-slash redirect", "/docs", 301],
];

for (const [label, path, status] of CASES) {
  test(`security headers on the ${label} (${path})`, async () => {
    const res = await get(path);
    assert.equal(res.status, status, `${path} returned ${res.status}`);
    const missing = Object.entries(EXPECTED)
      .filter(([name, value]) => res.headers.get(name) !== value)
      .map(([name]) => `${name}: ${res.headers.get(name) ?? "(missing)"}`);
    assert.deepEqual(missing, [], `${path} header mismatch`);
  });
}

// The CSP is report-only on purpose: it must reach Sentry on every response
// kind, and no enforcing Content-Security-Policy may be sent alongside it.
const REPORT_URI =
  "https://sentry.devino.ca/api/67/security/?sentry_key=e21aa0bbfe20dd9af962a439a345522e";

for (const [label, path, status] of CASES) {
  test(`report-only CSP on the ${label} (${path})`, async () => {
    const res = await get(path);
    assert.equal(res.status, status, `${path} returned ${res.status}`);
    const policy = res.headers.get("content-security-policy-report-only");
    assert.ok(policy, `${path} has no Content-Security-Policy-Report-Only`);
    assert.ok(
      policy.includes(`report-uri ${REPORT_URI}`),
      `${path} policy lacks the Sentry report-uri`,
    );
    assert.ok(policy.includes("report-to csp-endpoint"), "no report-to");
    assert.ok(policy.includes("frame-ancestors 'self'"), "no frame-ancestors");
    assert.equal(
      res.headers.get("reporting-endpoints"),
      `csp-endpoint="${REPORT_URI}"`,
    );
    assert.equal(
      res.headers.get("content-security-policy"),
      null,
      `${path} must not send an enforcing Content-Security-Policy`,
    );
  });
}

// Pages carry Cache-Control: no-transform so Cloudflare leaves the HTML alone
// and never injects its Web Analytics beacon (static.cloudflareinsights.com), a
// third-party script that duplicates PostHog. The same directive stops
// Cloudflare compressing the page, so nginx's own gzip has to reach visitors.
// Cached static paths keep their own Cache-Control and stay transformable.
const PAGES = [
  ["page", "/", 200],
  ["guide", "/guides/claude-code-notification-sound/", 200],
  ["404 page", "/no-such-page/", 404],
];

for (const [label, path, status] of PAGES) {
  test(`no Cloudflare beacon on the ${label} (${path})`, async () => {
    const res = await get(path, {
      headers: {
        "user-agent": "anotifier-site-tests",
        "accept-encoding": "gzip",
      },
    });
    assert.equal(res.status, status, `${path} returned ${res.status}`);
    assert.ok(
      (res.headers.get("cache-control") ?? "").includes("no-transform"),
      `${path} lacks Cache-Control: no-transform`,
    );
    assert.equal(
      res.headers.get("content-encoding"),
      "gzip",
      `${path} is not gzipped by nginx`,
    );
    assert.ok(
      !res.body.includes("cloudflareinsights"),
      `${path} has the Cloudflare Web Analytics beacon`,
    );
  });
}

test("hashed static chunks keep their own immutable Cache-Control", async () => {
  const res = await get(chunk);
  assert.equal(
    res.headers.get("cache-control"),
    "public, max-age=31536000, immutable",
  );
});
