// Real-Chrome checks over raw CDP (no browser library): mobile layout, the
// hero rotator, copy buttons and GA events, and a mobile LCP budget. Skips — loudly — when no Chrome is
// installed; CI runners ship one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { BASE_URL, findChrome } from "./site-helpers.mjs";

const CHROME = findChrome();
// Median mobile LCP under 4x CPU and a slow-4G-like link. Before the LCP work
// the live home page measured 2200-3000 ms here; after it, ~1000 ms. The
// budget sits between the two with headroom for slower CI runners.
const LCP_BUDGET_MS = Number(process.env.LCP_BUDGET_MS || 2000);
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
  let targets;
  for (let i = 0; i < 60 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      await sleep(250);
    }
  }
  if (!targets) throw new Error("Chrome DevTools endpoint never came up");
  const ws = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
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
    proc.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    } catch {
      /* Chrome may still hold the profile on Windows; the OS tmp cleanup wins */
    }
  };
  await send("Page.enable");
  return { send, evaluate, close };
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
  { skip: !CHROME && "no Chrome found (set CHROME_PATH)" },
  async () => {
    const b = await openBrowser(9345);
    try {
      await b.send("Browser.grantPermissions", {
        origin: new URL(BASE_URL).origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      // Clipboard calls need a focused page, which headless never has.
      await b.send("Emulation.setFocusEmulationEnabled", { enabled: true });
      await load(b, BASE_URL + "/guides/ntfy-phone-notifications/", 2500);
      await b.evaluate(RECORD_GTAG);
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
