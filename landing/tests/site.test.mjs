// HTTP-level checks against a real server (see site-helpers.mjs for BASE_URL).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BASE_URL,
  SITE_URL,
  get,
  meta,
  sitemapPaths,
} from "./site-helpers.mjs";

const AGENT_GUIDES = {
  "/claude-code/": "/guides/claude-code-notifications/",
  "/codex/": "/guides/codex-cli-notifications/",
  "/cursor/": "/guides/cursor-agent-notifications/",
  "/gemini-cli/": "/guides/gemini-cli-notifications/",
};

const paths = await sitemapPaths();
const pages = new Map(
  await Promise.all(
    paths.map(async (p) => {
      const res = await get(p);
      return [p, { ...res, ...meta(res.body) }];
    }),
  ),
);

test(`sitemap lists the core pages (${BASE_URL})`, () => {
  for (const p of [
    "/",
    "/docs/",
    "/guides/",
    "/compare/",
    ...Object.keys(AGENT_GUIDES),
  ]) {
    assert.ok(paths.includes(p), `${p} missing from sitemap`);
  }
});

test("every sitemap page is a 200 with one h1 and a self canonical", () => {
  for (const [p, page] of pages) {
    assert.equal(page.status, 200, `${p} returned ${page.status}`);
    assert.equal(page.h1Count, 1, `${p} has ${page.h1Count} h1 elements`);
    assert.equal(page.canonical, SITE_URL + p, `${p} canonical`);
  }
});

test("titles fit in 60 characters and descriptions in 160", () => {
  const long = [];
  for (const [p, { title, description }] of pages) {
    if (!title || title.length > 60)
      long.push(`${p} title ${title?.length}: ${title}`);
    if (!description || description.length > 160)
      long.push(`${p} description ${description?.length}`);
  }
  assert.deepEqual(long, []);
});

test("titles are unique across the site", () => {
  const seen = new Map();
  for (const [p, { title }] of pages) {
    assert.ok(!seen.has(title), `${p} repeats the title of ${seen.get(title)}`);
    seen.set(title, p);
  }
});

test("agent pages target the product, guides the how-to, and link to each other", () => {
  for (const [agent, guide] of Object.entries(AGENT_GUIDES)) {
    const a = pages.get(agent);
    const g = pages.get(guide);
    assert.match(a.title, /Notifier/, `${agent} title should name the tool`);
    assert.doesNotMatch(
      a.title,
      /Notifications/,
      `${agent} title competes with ${guide}`,
    );
    assert.match(a.h1Text, /^anotifier for /, `${agent} h1`);
    assert.ok(
      a.body.includes(`href="${guide}"`),
      `${agent} does not link ${guide}`,
    );
    assert.ok(
      g.body.includes(`href="${agent}"`),
      `${guide} does not link ${agent}`,
    );
  }
});

test("home: descriptive title and an h1 that reads as one sentence", () => {
  const home = pages.get("/");
  for (const name of ["Claude Code", "Codex", "Cursor", "Gemini"]) {
    assert.ok(home.title.includes(name), `home title lacks ${name}`);
  }
  assert.equal(
    home.h1Text,
    "Know the moment your Claude Code, Codex, Cursor or Gemini CLI agent needs you.",
  );
});

test("home: no render-blocking stylesheet and no early gtag.js preload", () => {
  const { body } = pages.get("/");
  assert.doesNotMatch(
    body,
    /<link[^>]+rel="stylesheet"/,
    "CSS should be inlined",
  );
  assert.doesNotMatch(
    body,
    /<link[^>]+rel="preload"[^>]+(gtag\/js|\/gx4t\/)/,
    "gtag.js is preloaded",
  );
  assert.doesNotMatch(
    body,
    /<link[^>]+(gtag\/js|\/gx4t\/)[^>]+rel="preload"/,
    "gtag.js is preloaded",
  );
});

test("first-party tracking: PostHog via /_t/n4q, gtag via /gx4t, no third-party hosts", async () => {
  const { body } = pages.get("/");
  // This checks the proxy and that nothing points at a third-party host.
  assert.doesNotMatch(
    body,
    /googletagmanager\.com\/gtag/,
    "gtag.js loads from Google",
  );
  assert.doesNotMatch(
    body,
    /api_host[^,]*posthog\.devino\.ca/,
    "PostHog api_host is third-party",
  );
  // nginx forwards /_t/n4q/ to the self-hosted PostHog (CI and production).
  const res = await get("/_t/n4q/static/array.js");
  assert.equal(
    res.status,
    200,
    `/_t/n4q/static/array.js returned ${res.status}`,
  );
  assert.match(res.headers.get("content-type") ?? "", /javascript/);
  assert.equal(
    res.headers.get("set-cookie"),
    null,
    "the proxy passed a cookie on",
  );
  // nginx relays gtag.js from Google for our measurement id only.
  const tag = await get("/gx4t/?id=G-TT12DKE7H6");
  assert.equal(tag.status, 200, `/gx4t/ returned ${tag.status}`);
  assert.match(tag.headers.get("content-type") ?? "", /javascript/);
  assert.equal(
    tag.headers.get("set-cookie"),
    null,
    "the relay passed a cookie on",
  );
  const other = await get("/gx4t/?id=G-XXXXXXXXXX");
  assert.equal(other.status, 404, "/gx4t/ serves other measurement ids");
});

test("first-party Sentry tunnel: /_t/s7e is POST-only and reaches Sentry", async () => {
  const { body } = pages.get("/");
  assert.doesNotMatch(
    body,
    /sentry\.devino\.ca/,
    "the page talks to Sentry directly",
  );
  const blocked = await get("/_t/s7e");
  assert.equal(blocked.status, 403, `GET /_t/s7e returned ${blocked.status}`);
  // An empty envelope is rejected by Sentry itself (4xx), which proves nginx
  // forwarded it; a 404/405 or a 5xx would mean the tunnel is not wired.
  const res = await fetch(new URL("/_t/s7e", BASE_URL), {
    method: "POST",
    body: "{}\n",
    redirect: "manual",
  });
  assert.ok(
    res.status >= 200 && res.status < 500 && ![404, 405].includes(res.status),
    `POST /_t/s7e returned ${res.status}`,
  );
  assert.equal(res.headers.get("set-cookie"), null, "the tunnel set a cookie");
});

test("no page carries a consent prompt, and none loads a tracker from a third-party host", () => {
  // The trackers are mounted for every visitor by app/layout.tsx, with no
  // prompt (the browser tests check what loads in a real page).
  for (const [p, { body }] of pages) {
    assert.doesNotMatch(body, /consentBar|consentActions/, `${p} has a prompt`);
    assert.doesNotMatch(
      body,
      /anotifier:consent/,
      `${p} mentions a stored choice`,
    );
    assert.doesNotMatch(body, /googletagmanager\.com\/gtag/, p);
    assert.doesNotMatch(body, /api_host[^,]*posthog\.devino\.ca/, p);
  }
});

test("/privacy/ is in the sitemap, linked from every footer, and names the tools", () => {
  assert.ok(paths.includes("/privacy/"), "/privacy/ missing from sitemap");
  const privacy = pages.get("/privacy/");
  for (const needle of [
    "PostHog",
    "Google Analytics",
    "Sentry",
    "hello@devino.ca",
  ]) {
    assert.ok(
      privacy.body.includes(needle),
      `/privacy/ never mentions ${needle}`,
    );
  }
  assert.doesNotMatch(privacy.body, /Cloudflare Web Analytics/);
  for (const [p, { body }] of pages) {
    assert.ok(
      body.includes('href="/privacy/"'),
      `${p} does not link /privacy/`,
    );
    assert.doesNotMatch(body, /privacy choices/i, `${p} has a choices control`);
  }
});

test("one URL per page: slashless and index.html paths 301 to the canonical", async () => {
  const cases = {
    "/docs": "/docs/",
    "/claude-code": "/claude-code/",
    "/guides/claude-code-notifications": "/guides/claude-code-notifications/",
    "/docs/index.html": "/docs/",
    "/index.html": "/",
  };
  for (const [from, to] of Object.entries(cases)) {
    const res = await get(from);
    assert.equal(res.status, 301, `${from} returned ${res.status}`);
    const loc = res.headers.get("location");
    assert.equal(
      new URL(loc, BASE_URL + from).pathname,
      to,
      `${from} -> ${loc}`,
    );
    assert.ok(!loc.startsWith("http:"), `${from} redirects to insecure ${loc}`);
  }
});

test("unknown paths are real 404s", async () => {
  for (const p of ["/definitely-not-a-page/", "/definitely-not-a-page"]) {
    const res = await get(p);
    assert.equal(res.status, 404, `${p} returned ${res.status}`);
  }
});

test("the 404 page declares no canonical", async () => {
  const res = await get("/definitely-not-a-page/");
  assert.equal(res.status, 404);
  assert.equal(meta(res.body).canonical, null, "404 page has a canonical");
});

const TOPIC_GUIDES = [
  "/guides/claude-code-permission-notifications/",
  "/guides/claude-code-notification-sound/",
  "/guides/codex-notification-sound/",
  "/guides/windows-wsl-notifications/",
  "/guides/macos-linux-notifications/",
  "/guides/agent-hooks-explained/",
  "/guides/notifications-not-working/",
  "/guides/ntfy-phone-notifications/",
];

test("sitemap lists the platform and topic guides", () => {
  for (const p of TOPIC_GUIDES) {
    assert.ok(paths.includes(p), `${p} missing from sitemap`);
  }
});

test("home links every guide, so crawlers reach them from the top page", () => {
  const { body } = pages.get("/");
  const guides = paths.filter((p) => /^\/guides\/.+\/$/.test(p));
  assert.ok(guides.length > 0, "no guides in the sitemap");
  const missing = guides.filter((g) => !body.includes(`href="${g}"`));
  assert.deepEqual(missing, [], "guides the home page does not link");
});

test("/vscode/ and /discord/ are linked from the body of guides or docs, not only the footer", () => {
  const readers = paths.filter(
    (p) => /^\/guides\/.+\/$/.test(p) || p === "/docs/",
  );
  for (const target of ["/vscode/", "/discord/"]) {
    const linkers = readers.filter((p) =>
      pages
        .get(p)
        .body.replace(/<footer[\s\S]*?<\/footer>/, "")
        .includes(`href="${target}"`),
    );
    assert.ok(
      linkers.length >= 2,
      `${target} is linked from ${linkers.length} guide or docs bodies`,
    );
  }
});

const metaContent = (html, key) =>
  html.match(
    new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`),
  )?.[1] ?? null;

test("every subpage has its own share image, served as a PNG", async () => {
  for (const [p, { body }] of pages) {
    if (p === "/") continue;
    const og = metaContent(body, "og:image");
    const tw = metaContent(body, "twitter:image");
    assert.ok(og && tw, `${p} lacks og:image or twitter:image`);
    // Per-page paths also make every image unique.
    assert.equal(new URL(og).pathname, `${p}opengraph-image`, `${p} og:image`);
    assert.equal(new URL(tw).pathname, `${p}twitter-image`, `${p} twitter`);

    const res = await fetch(BASE_URL + new URL(og).pathname, {
      headers: { "user-agent": "anotifier-site-tests" },
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.equal(res.status, 200, `${og} returned ${res.status}`);
    assert.equal(res.headers.get("content-type"), "image/png", og);
    assert.deepEqual([...bytes.slice(0, 4)], [0x89, 0x50, 0x4e, 0x47], og);
  }
});

test("docs and guide code blocks each have a copy button", () => {
  for (const [p, { body }] of pages) {
    if (p !== "/docs/" && !/^\/guides\/.+/.test(p)) continue;
    const pres = (body.match(/<pre[\s>]/g) || []).length;
    const blocks = (body.match(/<div class="codeBlock">/g) || []).length;
    const buttons = (body.match(/<button[^>]*class="codeCopy/g) || []).length;
    assert.ok(pres > 0, `${p} has no code blocks`);
    assert.equal(blocks, pres, `${p}: code blocks without a wrapper`);
    assert.equal(buttons, pres, `${p}: code blocks without a copy button`);
  }
});

test("GitHub links keep their visible text as the accessible name", () => {
  const override =
    /<a(?=[^>]*href="https:\/\/github\.com\/DevinoSolutions\/anotifier[^"]*")(?=[^>]*aria-label=)[^>]*>/;
  for (const [p, { body }] of pages) {
    assert.doesNotMatch(body, override, `${p} aria-labels a GitHub link`);
  }
});

test("sitemap lastmod is each page's own date, and guides show the same one", async () => {
  const { body } = await get("/sitemap.xml");
  const lastmod = new Map(
    [
      ...body.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g),
    ].map((m) => [m[1].replace(SITE_URL, ""), m[2].slice(0, 10)]),
  );
  assert.equal(lastmod.size, paths.length, "every sitemap URL has a lastmod");
  const guides = [...lastmod].filter(([p]) => /^\/guides\/.+/.test(p));
  for (const [p, date] of guides) {
    const shown = pages
      .get(p)
      .body.match(/Updated (?:<!-- -->)?(\d{4}-\d{2}-\d{2})/)?.[1];
    assert.equal(shown, date, `${p}: visible Updated date vs sitemap lastmod`);
  }
  const newestGuide = guides
    .map(([, d]) => d)
    .sort()
    .at(-1);
  assert.equal(lastmod.get("/guides/"), newestGuide, "/guides/ lastmod");
});

test("every guide offers the install command before its first section", () => {
  const guides = [...pages].filter(([p]) => /^\/guides\/.+/.test(p));
  assert.ok(guides.length > 0, "no guides in the sitemap");
  for (const [p, { body }] of guides) {
    const main = body.slice(body.indexOf("<h1"));
    const beforeH2 = main.slice(0, main.indexOf("<h2"));
    assert.match(
      beforeH2,
      /npx anotifier@latest setup/,
      `${p}: install command only appears after the first section`,
    );
    assert.match(beforeH2, /<button/, `${p}: no copy button by the command`);
  }
});
