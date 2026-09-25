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
    /<link[^>]+rel="preload"[^>]+gtag\/js/,
    "gtag.js is preloaded",
  );
  assert.doesNotMatch(
    body,
    /<link[^>]+gtag\/js[^>]+rel="preload"/,
    "gtag.js is preloaded",
  );
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
