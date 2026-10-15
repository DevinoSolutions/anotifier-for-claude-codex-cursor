// Static checks on nginx.conf, the one file that decides what the first-party
// tunnels can reach. They read the config from disk, so no server is needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const conf = fs.readFileSync(new URL("../nginx.conf", import.meta.url), "utf8");

// Body of `location <head> { ... }`, up to its first closing brace on a line of
// its own (the blocks here nest at most one level, e.g. limit_except).
function locationBody(head) {
  const start = conf.indexOf(`location ${head} {`);
  assert.notEqual(start, -1, `nginx.conf has no "location ${head}"`);
  const end = conf.indexOf("\n    }\n", start);
  return conf.slice(start, end);
}

test("nginx: /_t/s7e is an exact-match POST-only tunnel to project 67 only", () => {
  const body = locationBody("= /_t/s7e");
  const upstreams = [...body.matchAll(/proxy_pass\s+([^;]+);/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    upstreams,
    ["https://$sentry/api/67/envelope/"],
    "the tunnel must forward to /api/67/envelope/ and nothing else",
  );
  assert.match(body, /set \$sentry sentry\.devino\.ca;/);
  assert.match(body, /limit_except POST \{\s*deny all;\s*\}/, "not POST only");
  assert.match(body, /client_max_body_size 2m;/);
  assert.match(body, /proxy_set_header Cookie "";/, "cookies are forwarded");
  assert.match(body, /proxy_hide_header Set-Cookie;/);
  assert.match(body, /proxy_ssl_verify on;/);
  assert.doesNotMatch(body, /\brewrite\b/, "the request path must not be used");
  assert.doesNotMatch(
    body,
    /add_header/,
    "an add_header here would drop the server-level security headers",
  );
});

test("nginx: only the first-party tunnels proxy, each to a fixed upstream", () => {
  const upstreams = [...conf.matchAll(/proxy_pass\s+([^;]+);/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(upstreams.sort(), [
    "https://$ga/g/collect$is_args$args",
    "https://$gtm/gtag/js?id=G-TT12DKE7H6",
    "https://$posthog",
    "https://$sentry/api/67/envelope/",
  ]);
});

test("nginx: the GA relay serves our gtag.js and the collect endpoint only", () => {
  const tag = locationBody("= /gx4t/");
  assert.match(tag, /set \$gtm www\.googletagmanager\.com;/);
  assert.match(tag, /limit_except GET \{\s*deny all;\s*\}/, "not GET only");
  assert.match(
    tag,
    /if \(\$arg_id != "G-TT12DKE7H6"\) \{\s*return 404;\s*\}/,
    "other measurement ids must 404",
  );
  const hits = locationBody("= /gx4t/g/collect");
  assert.match(hits, /set \$ga www\.google-analytics\.com;/);
  assert.match(hits, /limit_except GET POST \{\s*deny all;\s*\}/);
  assert.match(hits, /client_max_body_size 64k;/);
  for (const body of [tag, hits]) {
    assert.match(body, /proxy_set_header Cookie "";/, "cookies are forwarded");
    assert.match(body, /proxy_hide_header Set-Cookie;/);
    assert.match(body, /proxy_ssl_verify on;/);
    assert.doesNotMatch(
      body,
      /X-Forwarded-For|X-Real-IP|remote_addr/,
      "the visitor's IP address must not reach Google",
    );
    assert.doesNotMatch(
      body,
      /add_header/,
      "an add_header here would drop the server-level security headers",
    );
  }
});

test("nginx: every Content-Security-Policy-Report-Only allows the replay worker", () => {
  const policies = [
    ...conf.matchAll(
      /add_header Content-Security-Policy-Report-Only "([^"]+)"/g,
    ),
  ].map((m) => m[1]);
  assert.ok(
    policies.length >= 4,
    "expected a CSP in every header-setting block",
  );
  for (const policy of policies) {
    assert.ok(
      policy.includes("worker-src 'self' blob:"),
      "a CSP copy lacks worker-src 'self' blob:",
    );
  }
});

test("nginx: pages are sent no-transform on every status", () => {
  const body = locationBody("/");
  assert.match(
    body,
    /add_header Cache-Control "public, no-transform" always;/,
    "location / must send no-transform (keeps the Cloudflare beacon out)",
  );
  assert.match(
    body,
    /add_header Content-Security-Policy-Report-Only /,
    "location / sets add_header, so it must repeat the security headers",
  );
});
