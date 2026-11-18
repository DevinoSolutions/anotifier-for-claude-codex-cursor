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
  assert.match(
    hits,
    /if \(\$arg_tid != "G-TT12DKE7H6"\) \{\s*return 404;\s*\}/,
    "hits for other GA properties must 404",
  );
  assert.ok(
    hits.includes('if ($args ~ "(^|&)tid=[^&]*&(.*&)?tid=") {'),
    "a second tid must 404 ($arg_tid only reads the first)",
  );
  for (const body of [tag, hits]) {
    // nginx passes every client header on by default, X-Forwarded-For and
    // CF-Connecting-IP included; only these named ones may go to Google.
    assert.match(
      body,
      /proxy_pass_request_headers off;/,
      "the visitor's headers (IP, cookies) would reach Google",
    );
    const sent = [...body.matchAll(/proxy_set_header (\S+)/g)].map((m) => m[1]);
    assert.ok(
      sent.every((h) => ["Host", "User-Agent", "Content-Type"].includes(h)),
      `unexpected header sent to Google: ${sent}`,
    );
    assert.match(body, /proxy_hide_header Set-Cookie;/);
    assert.match(body, /proxy_hide_header Strict-Transport-Security;/);
    assert.match(body, /proxy_ssl_verify on;/);
    assert.doesNotMatch(
      body,
      /add_header/,
      "an add_header here would drop the server-level security headers",
    );
  }
});

// nginx drops the server-level add_header set in any location that declares its
// own (see the comment above the server-level headers in nginx.conf), so every
// location that sets a header must repeat all seven. headers.test.mjs checks
// the same thing over the network, one URL per block; this check is static and
// covers every block, including ones no test requests.
const SECURITY_HEADERS = [
  "X-Content-Type-Options",
  "Referrer-Policy",
  "X-Frame-Options",
  "Permissions-Policy",
  "Strict-Transport-Security",
  "Content-Security-Policy-Report-Only",
  "Reporting-Endpoints",
];
const locationBlocks = () =>
  [...conf.matchAll(/^    location ([^{]+?) \{\n([\s\S]*?)\n    \}\n/gm)].map(
    (m) => ({ head: m[1], body: m[2] }),
  );
const headerNames = (text) =>
  [...text.matchAll(/add_header (\S+)/g)].map((m) => m[1]);
const headerBlocks = () =>
  locationBlocks().filter(({ body }) => headerNames(body).length > 0);

test("nginx: every location that sets add_header repeats the whole security header set", () => {
  const serverLevel = [...conf.matchAll(/^ {4}add_header (\S+)/gm)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    serverLevel.sort(),
    [...SECURITY_HEADERS].sort(),
    "the server-level headers are not the expected seven",
  );
  assert.ok(locationBlocks().length >= 8, "parsed too few locations");
  assert.ok(headerBlocks().length >= 5, "expected the header-setting blocks");
  for (const { head, body } of headerBlocks()) {
    const names = headerNames(body);
    for (const name of SECURITY_HEADERS)
      assert.ok(
        names.includes(name),
        `location ${head} sets add_header but lacks ${name}`,
      );
  }
});

test("nginx: every Content-Security-Policy-Report-Only allows the replay worker", () => {
  const policies = [
    ...conf.matchAll(
      /add_header Content-Security-Policy-Report-Only "([^"]+)"/g,
    ),
  ].map((m) => m[1]);
  // One at server level plus one in every location that sets its own headers,
  // so losing the policy from a single block fails (it used to take two).
  assert.equal(
    policies.length,
    1 + headerBlocks().length,
    "expected a CSP at server level and in every header-setting location",
  );
  for (const policy of policies) {
    assert.ok(
      policy.includes("worker-src 'self' blob:"),
      "a CSP copy lacks worker-src 'self' blob:",
    );
  }
  assert.equal(new Set(policies).size, 1, "the CSP copies differ");
});

test("nginx: llms.txt and llms-full.txt are UTF-8 plain text and no other location sets a charset", () => {
  const pattern = "^/llms(-full)?\\.txt$";
  const body = locationBody(`~ ${pattern}`);
  assert.match(body, /^\s*charset utf-8;$/m);
  // The only charset directive in the whole file is the one in this block.
  assert.equal(
    [...conf.matchAll(/^\s*charset\s/gm)].length,
    1,
    "another location sets a charset (only the two llms files may)",
  );
  // These files used to be served by location /, so nothing else may change.
  assert.match(body, /add_header Cache-Control "public, no-transform" always;/);
  assert.match(body, /try_files \$uri =404;/);
  assert.doesNotMatch(body, /\b(proxy_pass|rewrite|return|default_type)\b/);
  // The pattern covers exactly the two files.
  const re = new RegExp(pattern);
  for (const path of ["/llms.txt", "/llms-full.txt"])
    assert.ok(re.test(path), `${path} is not matched`);
  for (const path of [
    "/llms.txt/",
    "/llms-full.txt.bak",
    "/llms-fullx.txt",
    "/xllms.txt",
    "/guides/llms.txt",
    "/robots.txt",
    "/llms.html",
  ])
    assert.ok(!re.test(path), `${path} must not get the llms charset`);
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

test("nginx: the removed wsl-notify-send guide 301s to its section in one hop", () => {
  const target =
    "/guides/windows-wsl-notifications/$is_args$args#wsl-notify-send";
  for (const path of ["/guides/wsl-notify-send/", "/guides/wsl-notify-send"]) {
    const body = locationBody(`= ${path}`);
    const lines = body
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"));
    assert.deepEqual(
      lines,
      [`location = ${path} {`, `return 301 "${target}";`],
      `${path} must be one exact-match 301 straight to ${target}`,
    );
  }
  // Nothing else may name the old path: no prefix or regex location that
  // would catch other URLs, and no second hop.
  const heads = [...conf.matchAll(/^\s*location\s+([^{]*)\{/gm)]
    .map((m) => m[1].trim())
    .filter((head) => head.includes("wsl-notify-send"));
  assert.deepEqual(heads.sort(), [
    "= /guides/wsl-notify-send",
    "= /guides/wsl-notify-send/",
  ]);
});
