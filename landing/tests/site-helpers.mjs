// Shared helpers for the site tests. Nothing here is mocked: every check hits
// a real server — https://anotifier.io by default, or BASE_URL (e.g. the
// static export behind the production nginx.conf in CI).
import fs from "node:fs";

export const BASE_URL = (
  process.env.BASE_URL || "https://anotifier.io"
).replace(/\/+$/, "");
export const SITE_URL = "https://anotifier.io";

const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#x27": "'",
  "#39": "'",
};
const decode = (s) =>
  s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (_, e) => ENTITIES[e]);

export async function get(path, init = {}) {
  const res = await fetch(BASE_URL + path, {
    redirect: "manual",
    headers: { "user-agent": "anotifier-site-tests" },
    ...init,
  });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

// Paths of every page in the live sitemap, so a new page is covered the moment
// it ships without touching the tests.
export async function sitemapPaths() {
  const { status, body } = await get("/sitemap.xml");
  if (status !== 200) throw new Error(`sitemap.xml returned ${status}`);
  return [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) =>
    m[1].replace(SITE_URL, ""),
  );
}

export function meta(html) {
  const pick = (re) => {
    const m = html.match(re);
    return m ? decode(m[1]) : null;
  };
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    h1Count: h1s.length,
    h1Text: h1s[0]
      ? decode(
          h1s[0][1]
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        )
      : null,
  };
}

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
];
export const findChrome = () =>
  CHROME_CANDIDATES.find((p) => p && fs.existsSync(p)) || null;
