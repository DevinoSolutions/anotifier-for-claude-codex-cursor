// Real-Chrome checks over raw CDP (no browser library): mobile layout, the
// hero rotator, copy buttons and GA events, and a mobile LCP budget. Skips — loudly — when no Chrome is
// installed; CI runners ship one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE_URL, SITE_URL, findChrome, get } from "./site-helpers.mjs";

const CHROME = findChrome();
// Median mobile LCP under 4x CPU and a slow-4G-like link. Before the LCP work
// the live home page measured 2200-3000 ms here; after it, ~1000 ms. The
// budget sits between the two with headroom for slower CI runners.
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS || 2000);
// A cold hosted runner has taken more than 15 s to bring up its first Chrome.
const CHROME_START_MS = Number(process.env.CHROME_START_MS || 45_000);
// The live site has real keys, so a test that stores consent or accepts could
// reach real analytics.
const LIVE = BASE_URL === SITE_URL;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function openBrowser(port) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "an-cdp-"));
  const proc = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  const stop = () => {
    proc.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      /* Chrome may still hold the profile on Windows; the OS tmp cleanup wins */
    }
  };
  try {
    return await connect(port, stop);
  } catch (err) {
    // A Chrome left running keeps this file's process alive, and node --test
    // then waits on it until the CI job times out instead of failing the test.
    stop();
    throw err;
  }
}

async function connect(port, stop) {
  const deadline = Date.now() + CHROME_START_MS;
  let page;
  while (!page) {
    if (Date.now() > deadline)
      throw new Error(
        `Chrome DevTools endpoint never came up in ${CHROME_START_MS} ms`,
      );
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json`)
      ).json();
      page = targets.find((t) => t.type === "page");
    } catch {
      /* not listening yet */
    }
    if (!page) await sleep(250);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  let id = 0;
  const pending = new Map();
  // URLs of every request the page makes, once Network.enable has been sent.
  const requests = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.method === "Network.requestWillBeSent") {
      requests.push(m.params.request.url);
    }
    if (pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const m = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (m.result?.exceptionDetails)
      throw new Error(
        m.result.exceptionDetails.exception?.description ||
          m.result.exceptionDetails.text,
      );
    return m.result.result.value;
  };
  const close = () => {
    ws.close();
    stop();
  };
  await send("Page.enable");
  return { send, evaluate, close, requests };
}

async function load(b, url, waitMs) {
  await b.send("Page.navigate", { url });
  await sleep(waitMs);
}

test(
  "mobile layout: no horizontal overflow and a readable hero",
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    const b = await openBrowser(9341);
    try {
      for (const width of [390, 320]) {
        await b.send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 800,
          deviceScaleFactor: 2,
          mobile: true,
        });
        for (const p of [
          "/",
          "/claude-code/",
          "/docs/",
          "/guides/claude-code-notifications/",
          "/guides/agent-hooks-explained/",
          "/guides/notifications-not-working/",
        ]) {
          await load(b, BASE_URL + p, 2500);
          const v = await b.evaluate(
            `({ iw: innerWidth, sw: document.documentElement.scrollWidth })`,
          );
          assert.ok(
            v.sw <= v.iw,
            `${p} @${width}px scrolls sideways: ${v.sw} > ${v.iw}`,
          );
        }
      }
      await load(b, BASE_URL + "/", 2500);
      const hero = await b.evaluate(`(() => {
      const items = [...document.querySelectorAll('h1 .agentRoll li')];
      return {
        names: items.map((li) => getComputedStyle(li, '::after').content),
        hidden: document.querySelector('h1 .agentRoll')?.getAttribute('aria-hidden'),
        sr: document.querySelector('h1 .srOnly')?.getBoundingClientRect().width,
      };
    })()`);
      assert.deepEqual(hero.names, [
        '"Claude"',
        '"Codex"',
        '"Cursor"',
        '"Gemini"',
        '"Claude"',
      ]);
      assert.equal(hero.hidden, "true");
      assert.ok(hero.sr <= 1, "the screen-reader sentence is visible");
    } finally {
      b.close();
    }
  },
);

// Records the page's gtag() calls. Local and CI builds ship no GA (it is
// env-gated), and on the live site this keeps test clicks out of the real
// analytics: the button and track() code under test are the real ones; only
// the hop to Google is replaced.
const RECORD_GTAG = `window.__gtag = [];
  window.gtag = function () { window.__gtag.push(Array.from(arguments)); };`;
const GA_EVENTS = `window.__gtag
  .filter((a) => a[0] === 'event')
  .map((a) => ({ name: a[1], ...a[2] }))`;

// No analytics request leaves a test: everything under the tracker paths is
// blocked (all of /_t/n4q/, which also carries config.js and the lazy
// recorder that would otherwise pass through to the real PostHog, plus the
// Sentry tunnel and the GA relay at /gx4t/). The browser still logs a blocked
// request, which is what the "requested" assertions read.
const BLOCK_TRACKERS = ["*/_t/n4q/*", "*/_t/s7e*", "*/gx4t/*"];
const blockTrackers = (b) =>
  b.send("Network.setBlockedURLs", { urls: BLOCK_TRACKERS });

// track() sends nothing without the visitor's consent. These tests store
// "accepted" so the recorded gtag() below sees the events. A re-render may then
// mount the real trackers (on the live suite too), so every such test blocks
// the tracker paths first and nothing is ever sent.
const ACCEPT_STORED = `localStorage.setItem('anotifier:consent:v1', 'accepted')`;

async function realClick(b, selector) {
  const at = await b.evaluate(`(async () => {
    const el = document.querySelector(${JSON.stringify(selector)});
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(r));
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await b.send("Input.dispatchMouseEvent", {
      type,
      ...at,
      button: "left",
      clickCount: 1,
    });
  }
}

test(
  "copy buttons copy the code and raise GA events; star clicks too",
  {
    skip:
      (!CHROME && "no Chrome found (set CHROME_PATH)") ||
      (LIVE && "stores consent, which could mount the real trackers"),
  },
  async () => {
    const b = await openBrowser(9345);
    try {
      await b.send("Browser.grantPermissions", {
        origin: new URL(BASE_URL).origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      // Clipboard calls need a focused page, which headless never has.
      await b.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await b.send("Network.enable");
      await blockTrackers(b);
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 2500);
      await b.evaluate(RECORD_GTAG);
      await b.evaluate(ACCEPT_STORED);
      // A real mouse click gives the page the user activation the clipboard
      // API asks for; element.click() would not.
      await realClick(b, ".codeBlock .codeCopy");
      await sleep(300);
      const copied = await b.evaluate(`(async () => {
        const block = document.querySelector('.codeBlock');
        return {
          code: block.querySelector('pre').innerText,
          label: block.querySelector('.codeCopy').textContent,
          events: ${GA_EVENTS},
          clip: await navigator.clipboard.readText(),
        };
      })()`);
      assert.equal(
        // the Windows clipboard stores CRLF line endings
        copied.clip.replaceAll("\r\n", "\n"),
        copied.code,
        "clipboard differs from the block",
      );
      assert.match(copied.label, /copied/i);
      assert.deepEqual(copied.events, [
        {
          name: "copy_command",
          placement: "guide",
          result: "copied",
          command: copied.code.slice(0, 100),
        },
      ]);

      // Keep the page here instead of following the link to GitHub; the
      // React click handler still runs.
      await b.evaluate(
        `document.addEventListener('click', (e) => e.preventDefault(), true)`,
      );
      await realClick(b, "a.starBtn");
      await sleep(200);
      const events = await b.evaluate(GA_EVENTS);
      assert.deepEqual(events.at(-1), { name: "star_click", placement: "nav" });
    } finally {
      b.close();
    }
  },
);

// The guides draw most of the search traffic; their reader should meet the
// one-command install without scrolling past the manual config first.
test(
  "guides show the install command in the first screen, and copying it is tracked",
  {
    skip:
      (!CHROME && "no Chrome found (set CHROME_PATH)") ||
      (LIVE && "stores consent, which could mount the real trackers"),
  },
  async () => {
    const b = await openBrowser(9346);
    try {
      await b.send("Network.enable");
      await blockTrackers(b);
      await b.send("Emulation.setDeviceMetricsOverride", {
        width: 1366,
        height: 768,
        deviceScaleFactor: 1,
        mobile: false,
      });
      for (const p of [
        "/guides/codex-notification-sound/",
        "/guides/codex-cli-notifications/",
        "/guides/claude-code-notification-sound/",
        "/guides/claude-code-notifications/",
        "/guides/cursor-agent-notifications/",
      ]) {
        await load(b, BASE_URL + p, 2000);
        const box = await b.evaluate(`(() => {
          const el = document.querySelector('.guideShortcut .install');
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, vh: innerHeight, text: el.textContent };
        })()`);
        assert.ok(box, `${p}: no install shortcut`);
        assert.match(box.text, /npx anotifier@latest setup/);
        assert.ok(
          box.bottom <= box.vh,
          `${p}: install command ends at ${Math.round(box.bottom)}px, below the ${box.vh}px first screen`,
        );
      }

      await b.send("Browser.grantPermissions", {
        origin: new URL(BASE_URL).origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      await b.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await b.evaluate(RECORD_GTAG);
      await b.evaluate(ACCEPT_STORED);
      await realClick(b, ".guideShortcut .install button");
      await sleep(300);
      const got = await b.evaluate(`(async () => ({
        events: ${GA_EVENTS},
        clip: await navigator.clipboard.readText(),
      }))()`);
      assert.equal(got.clip, "npx anotifier@latest setup");
      assert.deepEqual(got.events, [
        {
          name: "copy_command",
          placement: "guide_hero",
          result: "copied",
          command: "npx anotifier@latest setup",
        },
      ]);
    } finally {
      b.close();
    }
  },
);

test(
  `mobile LCP of the home page stays under ${LCP_BUDGET_MS} ms`,
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    const runs = [];
    for (let i = 0; i < 3; i++) {
      const b = await openBrowser(9342 + i);
      try {
        await b.send("Network.enable");
        await b.send("Network.setCacheDisabled", { cacheDisabled: true });
        await b.send("Network.emulateNetworkConditions", {
          offline: false,
          latency: 150,
          downloadThroughput: (1.6 * 1024 * 1024) / 8,
          uploadThroughput: (750 * 1024) / 8,
        });
        await b.send("Emulation.setCPUThrottlingRate", { rate: 4 });
        await b.send("Emulation.setDeviceMetricsOverride", {
          width: 412,
          height: 823,
          deviceScaleFactor: 2,
          mobile: true,
        });
        await load(b, BASE_URL + "/", 9000);
        const lcp = await b.evaluate(`new Promise((resolve) => {
        new PerformanceObserver((list) => {
          const e = list.getEntries().at(-1);
          resolve({ t: Math.round(e.startTime), el: e.element ? e.element.tagName : null });
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(null), 3000);
      })`);
        assert.ok(lcp, "no largest-contentful-paint entry");
        runs.push(lcp);
      } finally {
        b.close();
      }
    }
    const sorted = runs.map((r) => r.t).sort((a, b) => a - b);
    const median = sorted[1];
    console.log(
      `# home LCP runs: ${runs.map((r) => `${r.t}ms (${r.el})`).join(", ")}; median ${median}ms`,
    );
    assert.ok(
      median <= LCP_BUDGET_MS,
      `median mobile LCP ${median} ms > ${LCP_BUDGET_MS} ms`,
    );
  },
);

// ---- analytics consent ------------------------------------------------------
// The "before a choice" and "after Decline" checks only prove something on a
// keyed build (NEXT_PUBLIC_* set), where the trackers exist to be withheld; a
// keyless build loads none regardless. CI builds keyed (landing.yml).
// PostHog, Google Analytics and Sentry load only after the visitor accepts
// (components/ConsentedAnalytics.tsx). Nothing here is mocked: the requests are
// the ones the real page makes, read off the DevTools network log.

const TRACKERS = /\/_t\/n4q|\/gx4t|\/_t\/s7e/;
const trackerRequests = (urls) => urls.filter((u) => TRACKERS.test(u));
// CI builds with dummy NEXT_PUBLIC_* keys and sets this, so accepting really
// loads the trackers. A keyless build can only check that nothing loads.
const KEYED = process.env.KEYED_BUILD === "1";
const NO_TRACKERS = `({
  posthog: typeof window.posthog,
  gtag: typeof window.gtag,
  dataLayer: typeof window.dataLayer,
  sentry: typeof window.__SENTRY__,
})`;
const stored = `localStorage.getItem('anotifier:consent:v1')`;
const BAR = `document.querySelector('section.consentBar')`;

async function press(b, key) {
  for (const type of ["keyDown", "keyUp"]) {
    await b.send("Input.dispatchKeyEvent", { type, key, code: key });
  }
}

test(
  "before a choice no tracker loads, and the prompt is an accessible bar",
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    // The prompt is drawn after hydration, never part of the static HTML.
    const html = (await get("/")).body;
    assert.doesNotMatch(
      html,
      /<section[^>]*consentBar/,
      "the prompt is in the static HTML",
    );

    const b = await openBrowser(9347);
    try {
      await b.send("Network.enable");
      await blockTrackers(b);
      await b.send("Emulation.setDeviceMetricsOverride", {
        width: 320,
        height: 700,
        deviceScaleFactor: 2,
        mobile: true,
      });
      for (const p of ["/", "/docs/", "/privacy/"]) {
        b.requests.length = 0;
        // Past the load event, and past Sentry's 5 s idle timeout
        await load(b, BASE_URL + p, 7000);
        assert.deepEqual(
          trackerRequests(b.requests),
          [],
          `${p} reached a tracker before any choice`,
        );
        assert.deepEqual(await b.evaluate(NO_TRACKERS), {
          posthog: "undefined",
          gtag: "undefined",
          dataLayer: "undefined",
          sentry: "undefined",
        });
        const bar = await b.evaluate(`(() => {
          const el = ${BAR};
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            label: el.getAttribute('aria-label'),
            position: getComputedStyle(el).position,
            fits: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
            buttons: [...el.querySelectorAll('button')].map((x) => x.textContent),
            privacy: el.querySelector('a')?.getAttribute('href'),
            focusable: (() => {
              const btn = el.querySelector('button');
              btn.focus();
              return document.activeElement === btn;
            })(),
          };
        })()`);
        assert.ok(bar, `${p}: no consent prompt`);
        assert.equal(bar.position, "fixed");
        assert.ok(bar.label, "the prompt has no accessible name");
        assert.ok(bar.fits, `${p}: the prompt does not fit a 320px screen`);
        assert.ok(!bar.overflow, `${p}: the prompt scrolls sideways`);
        assert.deepEqual(bar.buttons, ["Decline", "Accept"]);
        assert.equal(bar.privacy, "/privacy/");
        assert.ok(bar.focusable, "the prompt's buttons cannot take focus");
        assert.equal(await b.evaluate(stored), null);
      }
    } finally {
      b.close();
    }
  },
);

test(
  "declining loads nothing, persists across reloads, and the footer link reopens the prompt",
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    const b = await openBrowser(9348);
    try {
      await b.send("Network.enable");
      await blockTrackers(b);
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 2500);
      await realClick(b, ".consentActions button:first-child");
      await sleep(300);
      assert.equal(await b.evaluate(stored), "declined");
      assert.equal(
        await b.evaluate(BAR),
        null,
        "the prompt stays after Decline",
      );

      b.requests.length = 0;
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 7000);
      assert.equal(
        await b.evaluate(stored),
        "declined",
        "the choice did not persist",
      );
      assert.equal(
        await b.evaluate(BAR),
        null,
        "a declined visitor is asked again",
      );
      assert.deepEqual(trackerRequests(b.requests), []);
      const none = await b.evaluate(NO_TRACKERS);
      assert.equal(none.posthog, "undefined");
      assert.equal(none.gtag, "undefined");

      // ... and on another page of the site.
      b.requests.length = 0;
      await load(b, BASE_URL + "/docs/", 7000);
      assert.equal(await b.evaluate(stored), "declined");
      assert.equal(
        await b.evaluate(BAR),
        null,
        "/docs/ asked a declined visitor",
      );
      assert.deepEqual(trackerRequests(b.requests), []);
      assert.equal((await b.evaluate(NO_TRACKERS)).posthog, "undefined");
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 2500);

      // The footer link brings the prompt back, with focus inside it.
      await realClick(b, "footer .linkBtn");
      await sleep(300);
      const open = await b.evaluate(`(() => ({
        shown: !!${BAR},
        text: ${BAR}?.textContent,
        focusInBar: ${BAR}?.contains(document.activeElement),
      }))()`);
      assert.ok(open.shown, "the footer link did not reopen the prompt");
      assert.match(open.text, /current choice: declined/);
      assert.ok(open.focusInBar, "focus did not move into the prompt");

      // Escape closes it and keeps the earlier choice.
      await press(b, "Escape");
      await sleep(200);
      assert.equal(
        await b.evaluate(BAR),
        null,
        "Escape did not close the prompt",
      );
      assert.equal(await b.evaluate(stored), "declined");
      assert.equal(
        await b.evaluate(`document.activeElement?.className`),
        "linkBtn",
        "focus did not return to the footer link",
      );
    } finally {
      b.close();
    }
  },
);

test(
  "track() is a no-op without consent",
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    const b = await openBrowser(9350);
    try {
      await b.send("Browser.grantPermissions", {
        origin: new URL(BASE_URL).origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      await b.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await b.send("Network.enable");
      await blockTrackers(b);
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 2500);
      // Fakes stand in for the trackers; with no choice made they stay unused.
      await b.evaluate(`${RECORD_GTAG}
        window.__ph = [];
        window.posthog = {
          capture: function () { window.__ph.push(Array.from(arguments)); },
          createPersonProfile: function () { window.__ph.push(['profile']); },
        };`);
      assert.equal(await b.evaluate(stored), null);
      await realClick(b, ".codeBlock .codeCopy");
      await sleep(400);
      const seen = await b.evaluate(`({
        gtag: window.__gtag.length,
        ph: window.__ph.length,
        label: document.querySelector('.codeBlock .codeCopy').textContent,
      })`);
      assert.match(seen.label, /copied/i, "the copy button did not work");
      assert.equal(seen.gtag, 0, "gtag was called without consent");
      assert.equal(seen.ph, 0, "posthog was called without consent");
    } finally {
      b.close();
    }
  },
);

test(
  "declining with browser storage blocked leaves the page intact",
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    const b = await openBrowser(9351);
    try {
      await b.send("Network.enable");
      await blockTrackers(b);
      await b.send("Page.addScriptToEvaluateOnNewDocument", {
        source: `for (const name of ['localStorage', 'sessionStorage']) {
          Object.defineProperty(window, name, {
            configurable: true,
            get() { throw new DOMException('The operation is insecure.', 'SecurityError'); },
          });
        }`,
      });
      await load(b, BASE_URL + "/docs/", 3000);
      const before = await b.evaluate(`document.body.innerText.length`);
      assert.ok(before > 500, "the page did not render with storage blocked");
      await realClick(b, ".consentActions button:first-child");
      await sleep(800);
      const after = await b.evaluate(`({
        len: document.body.innerText.length,
        h1: document.querySelector('h1')?.textContent,
        bar: !!${BAR},
      })`);
      assert.ok(after.h1, "the page blanked after Decline");
      assert.ok(
        after.len >= before * 0.9,
        `page text shrank: ${before} -> ${after.len}`,
      );
      assert.equal(after.bar, false, "the prompt stays after Decline");
    } finally {
      b.close();
    }
  },
);

test(
  "accepting loads the trackers; withdrawing stops them",
  {
    skip:
      (!CHROME && "no Chrome found (set CHROME_PATH)") ||
      (LIVE && "would send real analytics from the live site") ||
      (!KEYED && "needs a build with NEXT_PUBLIC_* keys (KEYED_BUILD=1)"),
  },
  async () => {
    const b = await openBrowser(9349);
    try {
      await b.send("Network.enable");
      await blockTrackers(b);
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 2500);
      await realClick(b, ".consentActions button:last-child");
      await sleep(7000);
      assert.equal(await b.evaluate(stored), "accepted");
      assert.equal(await b.evaluate(BAR), null);
      const urls = trackerRequests(b.requests);
      assert.ok(
        urls.some((u) => u.includes("/_t/n4q/static/array.js")),
        `PostHog did not load: ${urls}`,
      );
      assert.ok(
        urls.some((u) => u.includes("/gx4t/?id=")),
        `Google Analytics did not load: ${urls}`,
      );
      const after = await b.evaluate(NO_TRACKERS);
      assert.equal(after.posthog, "object");
      assert.equal(after.gtag, "function");
      assert.equal(after.dataLayer, "object");
      // GA sends its hits to the nginx relay, with signals and ads off.
      const gaConfig = await b.evaluate(`JSON.stringify([...window.dataLayer]
        .map((a) => Array.from(a)).find((a) => a[0] === "config")?.[2] ?? null)`);
      const ga = JSON.parse(gaConfig);
      assert.ok(ga?.transport_url?.endsWith("/gx4t"), `transport_url: ${gaConfig}`);
      assert.equal(ga.allow_google_signals, false);
      assert.equal(ga.allow_ad_personalization_signals, false);
      assert.equal(after.sentry, "object", "Sentry did not start");

      // Withdraw from the footer: the page reloads without any of them.
      await realClick(b, "footer .linkBtn");
      await sleep(300);
      b.requests.length = 0;
      await realClick(b, ".consentActions button:first-child");
      await sleep(7000);
      assert.equal(await b.evaluate(stored), "declined");
      assert.deepEqual(await b.evaluate(NO_TRACKERS), {
        posthog: "undefined",
        gtag: "undefined",
        dataLayer: "undefined",
        sentry: "undefined",
      });
      assert.deepEqual(trackerRequests(b.requests), []);
    } finally {
      b.close();
    }
  },
);
