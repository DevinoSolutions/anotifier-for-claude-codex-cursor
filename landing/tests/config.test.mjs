// Guards on the tracking configuration. The tracking values are spread over
// the components, nginx.conf, the Dockerfile, .env.example and the two
// workflows that build the site, and a wrong one fails silently: a PostHog host
// set to the direct instance bypassed the first-party /_t/n4q path for days, and
// a Google Analytics id that differs from the one nginx.conf accepts makes
// nginx 404 the tag and every hit. The checks below read files only (no server,
// no network), so they run in the pull-request run. The last two tests ask the
// live site and are skipped everywhere else.
//
// These tests change nothing about what is collected, and there is no consent
// gating anywhere in the site; they only keep the configuration consistent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { BASE_URL, SITE_URL, get } from "./site-helpers.mjs";

const LANDING = new URL("../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, LANDING), "utf8");

const nginx = read("nginx.conf");
const dockerfile = read("Dockerfile");
const envExample = read(".env.example");
const posthog = read("components/PostHog.tsx");
const analytics = read("components/GoogleAnalytics.tsx");
const sentry = read("components/SentryReplay.tsx");
const dokploy = read("../.github/workflows/dokploy.yml");
const landingYml = read("../.github/workflows/landing.yml");

// Every .ts/.tsx file the site is built from.
const sources = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(new URL(dir, LANDING), {
    withFileTypes: true,
  })) {
    const rel = `${dir}${entry.name}`;
    if (entry.isDirectory()) walk(`${rel}/`);
    else if (/\.tsx?$/.test(entry.name)) sources.push([rel, read(rel)]);
  }
};
for (const dir of ["app/", "components/", "lib/"]) walk(dir);

const unique = (list) => [...new Set(list)].sort();
const names = (text, re) => unique([...text.matchAll(re)].map((m) => m[1]));

// ---------------------------------------------------------------------------
// PostHog: the browser only ever talks to the first-party path.
// ---------------------------------------------------------------------------

test("PostHog: api_host is the constant first-party path, never an absolute URL", () => {
  const path = posthog.match(/^const POSTHOG_PATH = "([^"]*)";$/m)?.[1];
  assert.ok(path, 'components/PostHog.tsx has no `const POSTHOG_PATH = "..."`');
  assert.match(path, /^\/_t\/[a-z0-9]+$/, `POSTHOG_PATH is ${path}`);
  assert.match(
    posthog,
    /api_host: \$\{JSON\.stringify\(POSTHOG_PATH\)\}/,
    "posthog.init must take its api_host from POSTHOG_PATH and nothing else",
  );
  // The one absolute URL the init call may carry is ui_host, which only
  // builds links to the dashboard; no event goes there.
  const init = posthog.split("\n").find((l) => l.startsWith("posthog.init("));
  assert.ok(init, "posthog.init(...) line not found");
  assert.deepEqual(
    init.match(/https?:\/\/[^"'\s,)]+/g),
    ["https://posthog.devino.ca"],
    "posthog.init may name only ui_host as an absolute URL",
  );
  assert.match(init, /ui_host: "https:\/\/posthog\.devino\.ca"/);
});

test("no environment variable or build argument can set an analytics host", () => {
  // The variable that once carried the direct PostHog host is gone everywhere.
  const mentions = sources
    .filter(([, text]) => /POSTHOG_HOST/.test(text))
    .map(([file]) => file);
  assert.deepEqual(mentions, [], "a source file reads POSTHOG_HOST");
  // ...and no place that declares or sets a build value names a host-like one.
  const declared = {
    "Dockerfile ARG": names(dockerfile, /^ARG (NEXT_PUBLIC_[A-Z0-9_]+)=/gm),
    ".env.example": names(envExample, /^(NEXT_PUBLIC_[A-Z0-9_]+)=/gm),
    "dokploy.yml NAMES": (dokploy.match(/^\s*NAMES: (.+)$/m)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean),
    "landing.yml build env": names(
      landingYml,
      /^\s+(NEXT_PUBLIC_[A-Z0-9_]+):/gm,
    ),
  };
  for (const [where, list] of Object.entries(declared)) {
    assert.ok(list.length >= 2, `${where}: found ${list.length} names`);
    const hostLike = list.filter((n) => /HOST|URL|ENDPOINT|API/.test(n));
    assert.deepEqual(hostLike, [], `${where} sets a host-like value`);
  }
  // Only NEXT_PUBLIC_* values are inlined into the browser bundle, and only
  // these three components read one.
  const readers = sources
    .filter(([, text]) => /process\.env\.NEXT_PUBLIC_/.test(text))
    .map(([file]) => file)
    .sort();
  assert.deepEqual(readers, [
    "components/GoogleAnalytics.tsx",
    "components/PostHog.tsx",
    "components/SentryReplay.tsx",
  ]);
});

test("the NEXT_PUBLIC_* names agree across the components, Dockerfile, .env.example and workflows", () => {
  const fromComponents = names(
    sources.map(([, text]) => text).join("\n"),
    /process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g,
  );
  assert.ok(fromComponents.length >= 3, "found no NEXT_PUBLIC_ reads");
  const fromEnvExample = names(envExample, /^(NEXT_PUBLIC_[A-Z0-9_]+)=/gm);
  const dockerArgs = names(dockerfile, /^ARG (NEXT_PUBLIC_[A-Z0-9_]+)=/gm);
  const dockerEnvs = names(dockerfile, /^ENV (NEXT_PUBLIC_[A-Z0-9_]+)=/gm);
  const dokployNames = unique(
    (dokploy.match(/^\s*NAMES: (.+)$/m)?.[1] ?? "")
      .split(/\s+/)
      .filter(Boolean),
  );
  assert.deepEqual(fromEnvExample, fromComponents, ".env.example");
  assert.deepEqual(dockerArgs, fromComponents, "Dockerfile ARG lines");
  assert.deepEqual(dockerEnvs, fromComponents, "Dockerfile ENV lines");
  assert.deepEqual(dokployNames, fromComponents, "dokploy.yml NAMES");
  // CI's dummy build may set only values the site reads.
  const ciBuild = names(landingYml, /^\s+(NEXT_PUBLIC_[A-Z0-9_]+):/gm);
  assert.ok(ciBuild.length >= 3, "landing.yml sets no NEXT_PUBLIC_ values");
  for (const name of ciBuild)
    assert.ok(fromComponents.includes(name), `landing.yml sets unread ${name}`);
});

// ---------------------------------------------------------------------------
// Google Analytics: the id nginx accepts is the id the build ships.
// ---------------------------------------------------------------------------

const GA_ID = /G-[A-Z0-9]{6,}/g;
const realGaIds = (text) =>
  unique((text.match(GA_ID) ?? []).filter((id) => !/^G-X+$/.test(id)));

test("GA: nginx.conf accepts exactly one measurement id, everywhere it names it", () => {
  const ids = realGaIds(nginx);
  assert.equal(ids.length, 1, `nginx.conf names ${ids.length} GA ids: ${ids}`);
  assert.equal(
    (nginx.match(GA_ID) ?? []).length,
    3,
    "expected the id in the /gx4t/ filter, its proxy_pass and the collect filter",
  );
  // The tests that hard-code the production id must agree with nginx.conf.
  for (const file of ["tests/nginx.test.mjs", "tests/site.test.mjs"]) {
    assert.deepEqual(realGaIds(read(file)), ids, `${file} uses another GA id`);
  }
  // CI builds with a dummy id that nginx 404s, so a CI run can never send a
  // hit to the production property.
  const ciId = landingYml.match(
    /NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: (G-[A-Z0-9]+)/,
  )?.[1];
  assert.ok(ciId, "landing.yml builds with no GA id");
  assert.ok(!ids.includes(ciId), "CI builds with the production GA id");
});

test("the production build refuses a GA id, Sentry DSN or PostHog key nginx would not serve", () => {
  const guard =
    dokploy.match(/Tracking guard[\s\S]*?set_names=\(\)/)?.[0] ?? "";
  assert.ok(guard, "dokploy.yml lost its tracking guard");
  assert.match(
    guard,
    /landing\/nginx\.conf/,
    "GA id is not checked against nginx.conf",
  );
  assert.match(
    guard,
    /arg_\(id\|tid\)/,
    "GA guard does not read both relay filters",
  );
  assert.match(guard, /NEXT_PUBLIC_GOOGLE_ANALYTICS_ID/);
  assert.match(guard, /phc_/, "PostHog key shape is not checked");
  // Run the guard's own two grep patterns (read out of dokploy.yml, not copied
  // here) over nginx.conf: they must find exactly the one GA id, in both relay
  // filters. If nginx.conf is restructured so the guard would find nothing, PR
  // CI fails here instead of the deploy.
  const [, filterPattern, idPattern] =
    guard.match(
      /grep -oE '([^']+)' landing\/nginx\.conf \| grep -oE '([^']+)'/,
    ) ?? [];
  assert.ok(filterPattern && idPattern, "the guard's GA id extraction changed");
  const filters = nginx.match(new RegExp(filterPattern, "g")) ?? [];
  assert.equal(
    filters.length,
    2,
    `the guard finds ${filters.length} GA filters`,
  );
  assert.deepEqual(
    unique(filters.flatMap((f) => f.match(new RegExp(idPattern, "g")) ?? [])),
    realGaIds(nginx),
    "the guard would not extract the one GA id nginx.conf accepts",
  );
  // The DSN guard names the same Sentry project as the nginx tunnel.
  const tunnelProject = nginx.match(
    /proxy_pass https:\/\/\$sentry\/api\/(\d+)\/envelope\//,
  )?.[1];
  assert.ok(tunnelProject, "nginx.conf has no Sentry tunnel upstream");
  assert.ok(
    guard.includes(`sentry\\.devino\\.ca/${tunnelProject}$`),
    `the DSN guard does not require project ${tunnelProject}`,
  );
  // CI's dummy DSN and the CSP report-uri use the same project.
  assert.match(
    landingYml,
    new RegExp(
      `NEXT_PUBLIC_SENTRY_DSN: .*sentry\\.devino\\.ca/${tunnelProject}\\b`,
    ),
  );
  assert.ok(
    nginx.includes(`https://sentry.devino.ca/api/${tunnelProject}/security/`),
    "the CSP report-uri names another Sentry project",
  );
});

// ---------------------------------------------------------------------------
// Tunnel paths: what the components call is what nginx serves.
// ---------------------------------------------------------------------------

const locations = unique(
  [...nginx.matchAll(/^\s*location\s+([^{]*?)\s*\{/gm)].map((m) => m[1]),
);

test("the tunnel paths the components use are nginx locations", () => {
  const postHogPath = posthog.match(/^const POSTHOG_PATH = "([^"]+)";$/m)?.[1];
  assert.ok(
    locations.includes(`^~ ${postHogPath}/`),
    `nginx.conf has no "location ^~ ${postHogPath}/" for PostHog`,
  );
  const sentryPath = sentry.match(/tunnel: "([^"]+)"/)?.[1];
  assert.ok(sentryPath, "SentryReplay.tsx sets no tunnel");
  assert.ok(
    locations.includes(`= ${sentryPath}`),
    `nginx.conf has no "location = ${sentryPath}" for the Sentry tunnel`,
  );
  const gaLoader = analytics.match(
    /src=\{`(\/[a-z0-9]+\/)\?id=\$\{gaId\}`\}/,
  )?.[1];
  const gaBase = analytics.match(
    /transport_url: location\.origin \+ '(\/[a-z0-9]+)'/,
  )?.[1];
  assert.ok(
    gaLoader && gaBase,
    "GoogleAnalytics.tsx loader or transport_url not found",
  );
  assert.equal(
    `${gaBase}/`,
    gaLoader,
    "loader and transport_url use different paths",
  );
  assert.ok(
    locations.includes(`= ${gaLoader}`),
    `no "location = ${gaLoader}" for gtag.js`,
  );
  assert.ok(
    locations.includes(`= ${gaBase}/g/collect`),
    `no "location = ${gaBase}/g/collect" for GA hits`,
  );
});

test("each tunnel location relays to a fixed host in nginx.conf, not to a variable one", () => {
  const upstreamHosts = unique(
    [...nginx.matchAll(/^\s*set \$(?:posthog|gtm|ga|sentry) ([^;]+);/gm)].map(
      (m) => m[1],
    ),
  );
  assert.deepEqual(upstreamHosts, [
    "posthog.devino.ca",
    "sentry.devino.ca",
    "www.google-analytics.com",
    "www.googletagmanager.com",
  ]);
});

// ---------------------------------------------------------------------------
// Live site only: what is actually served agrees with nginx.conf.
// ---------------------------------------------------------------------------

const LIVE = BASE_URL === SITE_URL;
const onlyLive = LIVE
  ? false
  : "needs the live site: BASE_URL is not https://anotifier.io";

test(
  "live: the GA id the page ships is the one the /gx4t relay accepts",
  { skip: onlyLive },
  async () => {
    const [expected] = realGaIds(nginx);
    const { status, body } = await get("/");
    assert.equal(status, 200);
    const shipped = unique([
      ...[...body.matchAll(/gtag\('config', '(G-[A-Z0-9]+)'/g)].map(
        (m) => m[1],
      ),
      ...[...body.matchAll(/\/gx4t\/\?id=(G-[A-Z0-9]+)/g)].map((m) => m[1]),
    ]);
    assert.deepEqual(
      shipped,
      [expected],
      `the page ships GA id(s) ${shipped}, the relay in nginx.conf accepts ${expected}`,
    );
    // The relay must answer for the id the page really requests.
    const tag = await get(`/gx4t/?id=${shipped[0]}`);
    assert.equal(
      tag.status,
      200,
      `/gx4t/?id=${shipped[0]} returned ${tag.status}`,
    );
    assert.match(tag.headers.get("content-type") ?? "", /javascript/);
  },
);

test(
  "live: the PostHog api_host and Sentry DSN project the page ships are the tunnels",
  { skip: onlyLive },
  async () => {
    const { body } = await get("/");
    const hosts = unique(
      [...body.matchAll(/api_host: ?\\?"([^"\\]+)\\?"/g)].map((m) => m[1]),
    );
    const postHogPath = posthog.match(
      /^const POSTHOG_PATH = "([^"]+)";$/m,
    )?.[1];
    assert.deepEqual(
      hosts,
      [postHogPath],
      `api_host is ${hosts}, not ${postHogPath}`,
    );
    // The DSN sits in a lazily loaded chunk; the key itself is never printed.
    const chunks = unique(
      [...body.matchAll(/\/_next\/static\/[^"\\]+\.js/g)].map((m) => m[0]),
    );
    const projects = new Set();
    for (const chunk of chunks) {
      const js = (await get(chunk)).body;
      for (const m of js.matchAll(
        /https:\/\/[0-9a-f]+@sentry\.devino\.ca\/(\d+)/g,
      ))
        projects.add(m[1]);
    }
    const tunnelProject = nginx.match(
      /proxy_pass https:\/\/\$sentry\/api\/(\d+)\/envelope\//,
    )?.[1];
    assert.deepEqual(
      [...projects],
      [tunnelProject],
      `the shipped Sentry DSN is for project(s) ${[...projects]}, the tunnel relays to ${tunnelProject}`,
    );
  },
);
