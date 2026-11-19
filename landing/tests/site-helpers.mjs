// Shared helpers for the site tests. Nothing here is mocked: every check hits
// a real server — https://anotifier.io by default, or BASE_URL (e.g. the
// static export behind the production nginx.conf in CI).
import fs from "node:fs";

export const BASE_URL = (
  process.env.BASE_URL || "https://anotifier.io"
).replace(/\/+$/, "");
export const SITE_URL = "https://anotifier.io";

// The named entities our pages are rendered with, as the characters they stand
// for. A numeric reference is decoded by its code point.
const ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  middot: "·",
  mdash: "—",
  ndash: "–",
  hellip: "…",
};

// The text an HTML fragment's entities stand for, in one pass so "&amp;quot;"
// ends up as the text "&quot;" and not as a quote.
export const decodeEntities = (s) =>
  s.replace(/&(?:([a-z]+)|#(\d+)|#x([0-9a-f]+));/gi, (all, name, dec, hex) => {
    if (name) return ENTITIES[name] ?? all;
    return String.fromCodePoint(dec ? Number(dec) : parseInt(hex, 16));
  });

// Removes every tag, repeating until none is left so a nested "<<b>script>"
// cannot survive. `replacement` stands in for each tag: "" joins the text on
// both sides, as lib/strip-tags.ts does for the FAQ JSON-LD; " " keeps words
// from running together.
export function stripTags(html, replacement = "") {
  let prev;
  do {
    prev = html;
    html = html.replace(/<[^>]*>/g, replacement);
  } while (html !== prev);
  return html;
}

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

// Each agent page and the how-to guide that answers the same question.
export const AGENT_GUIDES = {
  "/claude-code/": "/guides/claude-code-notifications/",
  "/codex/": "/guides/codex-cli-notifications/",
  "/cursor/": "/guides/cursor-agent-notifications/",
  "/gemini-cli/": "/guides/gemini-cli-notifications/",
};

// The visible FAQ questions and the FAQPage JSON-LD questions of a rendered
// page, so a test can check that the two stay in step.
export function faqQuestions(body) {
  const ld = [
    ...body.matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    ),
  ].flatMap((m) => JSON.parse(m[1]));
  const schemaQs = ld
    .filter((d) => d["@type"] === "FAQPage")
    .flatMap((d) => d.mainEntity.map((q) => q.name));
  const visibleQs = [...body.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map(
    (m) => decodeEntities(stripTags(m[1])),
  );
  return { schemaQs, visibleQs };
}

export function meta(html) {
  const pick = (re) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1]) : null;
  };
  const h1s = [...html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)];
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    canonical: pick(/<link rel="canonical" href="([^"]*)"/),
    h1Count: h1s.length,
    h1Text: h1s[0]
      ? decodeEntities(stripTags(h1s[0][1], " ").replace(/\s+/g, " ").trim())
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
