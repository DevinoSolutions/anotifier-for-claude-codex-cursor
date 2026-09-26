// Every link a visitor can click, checked against the real destination. A CTA
// that 404s, or that redirects somewhere other than the page it names, is a
// dead end in the funnel even when the page it sits on is fine. Nothing is
// mocked: internal links hit BASE_URL, external links hit the real sites.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { SITE_URL, get, sitemapPaths } from "./site-helpers.mjs";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const SPONSORS = /^https:\/\/github\.com\/sponsors\//;

// href -> Set of pages it appears on, for every <a> on every sitemap page.
const internal = new Map();
const external = new Map();
const note = (map, key, page) => {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(page);
};
for (const page of await sitemapPaths()) {
  const { body } = await get(page);
  for (const [, raw] of body.matchAll(/<a\b[^>]*\shref="([^"]+)"/g)) {
    const href = raw.replaceAll("&amp;", "&");
    if (/^(#|mailto:|tel:|javascript:)/.test(href)) continue;
    const url = new URL(href, SITE_URL + page);
    url.hash = "";
    if (url.origin === SITE_URL)
      note(internal, url.pathname + url.search, page);
    else note(external, url.href, page);
  }
}
const where = (map, key) => [...map.get(key)].slice(0, 3).join(", ");

test("every internal link answers 200 without a redirect", async () => {
  const broken = [];
  for (const path of internal.keys()) {
    const { status, headers } = await get(path);
    if (status !== 200) {
      const loc = headers.get("location");
      broken.push(
        `${path} -> ${status}${loc ? ` ${loc}` : ""} (on ${where(internal, path)})`,
      );
    }
  }
  // A floor, so a crawl that silently finds nothing cannot pass.
  assert.ok(internal.size > 10, `only ${internal.size} internal links found`);
  assert.deepEqual(broken, []);
});

// The same URL with or without a trailing slash is the same page.
const samePage = (a, b) =>
  a.host === b.host &&
  a.pathname.replace(/\/+$/, "").toLowerCase() ===
    b.pathname.replace(/\/+$/, "").toLowerCase();

async function land(href) {
  const res = await fetch(href, {
    headers: { "user-agent": BROWSER_UA },
    signal: AbortSignal.timeout(20000),
  });
  await res.body?.cancel();
  return { status: res.status, final: new URL(res.url) };
}

test("every external link lands on the page it names", async (t) => {
  const broken = [];
  const unverified = [];
  const hrefs = [...external.keys()].filter((h) => !SPONSORS.test(h));
  for (const href of hrefs) {
    const want = new URL(href);
    // npm answers bots with a 403 wall, so check the package through the
    // registry API instead of the website.
    if (
      want.host === "www.npmjs.com" &&
      want.pathname.startsWith("/package/")
    ) {
      const pkg = want.pathname.slice("/package/".length);
      const reg = await fetch(`https://registry.npmjs.org/${pkg}`, {
        signal: AbortSignal.timeout(20000),
      });
      await reg.body?.cancel();
      if (reg.status !== 200)
        broken.push(
          `${href} -> registry ${reg.status} (on ${where(external, href)})`,
        );
      continue;
    }
    let r;
    try {
      r = await land(href);
    } catch (err) {
      unverified.push(
        `${href}: ${err.name === "TimeoutError" ? "timed out" : err.message}`,
      );
      continue;
    }
    if (r.status === 429 || r.status >= 500) {
      unverified.push(`${href}: ${r.status}`);
    } else if (r.status >= 400) {
      broken.push(`${href} -> ${r.status} (on ${where(external, href)})`);
    } else if (!samePage(want, r.final)) {
      broken.push(
        `${href} -> redirected to ${r.final.href} (on ${where(external, href)})`,
      );
    }
  }
  // Rate limits and outages on someone else's site are not our broken link,
  // but they are not a pass either: say which links went unchecked.
  for (const u of unverified) t.diagnostic(`unverified: ${u}`);
  assert.ok(hrefs.length > 5, `only ${hrefs.length} external links found`);
  assert.ok(
    unverified.length < hrefs.length / 2,
    `too many links unverifiable:\n${unverified.join("\n")}`,
  );
  assert.deepEqual(broken, []);
});

// Kept apart from the check above because it is known to fail today: the
// DevinoSolutions org is not enrolled in GitHub Sponsors, so the page
// redirects to the org profile. `todo` reports the failure without failing
// the run; once Sponsors is live this passes and the todo comes off.
test(
  "the support link lands on a live GitHub Sponsors page",
  { todo: "DevinoSolutions is not enrolled in GitHub Sponsors yet" },
  async () => {
    const pkg = JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    const sponsors = [...external.keys()].filter((h) => SPONSORS.test(h));
    assert.ok(sponsors.length > 0, "no support link found on the site");
    // The CLI prints package.json funding.url; it must be the same page.
    for (const href of new Set(
      [...sponsors, pkg.funding?.url].filter(Boolean),
    )) {
      const { status, final } = await land(href);
      assert.equal(status, 200, `${href} returned ${status}`);
      assert.ok(
        samePage(new URL(href), final),
        `${href} redirected to ${final.href}`,
      );
    }
  },
);
