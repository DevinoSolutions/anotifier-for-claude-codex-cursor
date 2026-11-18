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

// A request that dies at the network level (a reset or terminated TLS socket:
// undici's "fetch failed" / "terminated") never got an answer, so it says
// nothing about the page. The live suite makes hundreds of them from a hosted
// runner through Cloudflare, and a single dropped connection used to fail a
// whole test. Only that case is retried, and only for requests that are safe to
// repeat; any HTTP answer, whatever its status, is returned as received so the
// assertions on it are unchanged. A request that keeps failing still throws,
// now naming the URL.
const ATTEMPTS = 4;
const RETRY_DELAY_MS = 400;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Runs `attempt` (a fetch plus the read of its body), repeating it when it
// throws. `attempt` must be safe to repeat.
export async function retried(url, attempt, method = "GET") {
  for (let n = 1; ; n++) {
    try {
      return await attempt();
    } catch (err) {
      const safe = ["GET", "HEAD"].includes(method.toUpperCase());
      if (!safe || n === ATTEMPTS) {
        throw new Error(
          `${method} ${url} failed after ${n} attempt(s): ${err.message}${err.cause?.code ? ` (${err.cause.code})` : ""}`,
          { cause: err },
        );
      }
      await wait(RETRY_DELAY_MS * n);
    }
  }
}

export function get(path, init = {}) {
  const url = BASE_URL + path;
  return retried(
    url,
    async () => {
      const res = await fetch(url, {
        redirect: "manual",
        headers: { "user-agent": "anotifier-site-tests" },
        ...init,
      });
      return {
        status: res.status,
        headers: res.headers,
        body: await res.text(),
      };
    },
    init.method,
  );
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
