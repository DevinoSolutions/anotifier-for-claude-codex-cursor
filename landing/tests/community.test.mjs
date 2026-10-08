// The community invite on the site: one permanent invite, linked from the nav
// and footer of every page and from the help spots (docs, guides,
// troubleshooting), always in a new tab. Runs against BASE_URL like the rest
// of the site suite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { get, sitemapPaths } from "./site-helpers.mjs";

const CANONICAL = "https://discord.gg/CWDxfEJGcS";
const INVITE =
  /https?:\/\/(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[A-Za-z0-9-]+/g;

const pages = new Map();
for (const path of await sitemapPaths())
  pages.set(path, (await get(path)).body);
const llms = (await get("/llms.txt")).body;

/** `<a ...>` opening tags whose href is the canonical invite. */
const inviteTags = (html) =>
  [...html.matchAll(/<a\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(`href="${CANONICAL}"`));

test("no other Discord invite appears on any page or in llms.txt", () => {
  for (const [path, html] of [...pages, ["/llms.txt", llms]]) {
    for (const [url] of html.matchAll(INVITE)) {
      assert.equal(url, CANONICAL, `${path} links a non-canonical invite`);
    }
  }
});

test("every page links it from the nav (labelled icon) and the footer", () => {
  assert.ok(pages.size > 10, `only ${pages.size} pages in the sitemap`);
  for (const [path, html] of pages) {
    const nav = html.slice(html.indexOf("<nav"), html.indexOf("</nav>"));
    assert.ok(
      inviteTags(nav).some((t) => t.includes('aria-label="Join our Discord"')),
      `${path}: no labelled Discord button in the nav`,
    );
    const footer = html.slice(html.lastIndexOf("<footer"));
    assert.ok(
      inviteTags(footer).length > 0,
      `${path}: no Discord link in the footer`,
    );
  }
});

test("every invite link opens in a new tab without an opener", () => {
  for (const [path, html] of pages) {
    for (const tag of inviteTags(html)) {
      assert.match(tag, /target="_blank"/, `${path}: ${tag}`);
      assert.match(tag, /rel="noopener noreferrer"/, `${path}: ${tag}`);
    }
  }
});

test("the help spots point at it: docs, guides and troubleshooting", () => {
  for (const path of [
    "/docs/",
    "/guides/claude-code-notifications/",
    "/guides/notifications-not-working/",
  ]) {
    const main = pages.get(path) ?? "";
    const body = main.slice(
      main.indexOf("</nav>"),
      main.lastIndexOf("<footer"),
    );
    assert.ok(
      inviteTags(body).length > 0,
      `${path}: no Discord link outside the chrome`,
    );
  }
  assert.ok(llms.includes(CANONICAL), "llms.txt");
});

test("the home JSON-LD lists it in sameAs", () => {
  const home = pages.get("/") ?? "";
  const graphs = [
    ...home.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].map((m) => JSON.parse(m[1]));
  const nodes = graphs.flatMap((g) => g["@graph"] ?? [g]);
  const app = nodes.find((n) => n["@type"] === "SoftwareApplication");
  assert.ok(app?.sameAs?.includes(CANONICAL), "SoftwareApplication.sameAs");
});
