// Source-level guards for the analytics wiring (nothing is mocked and no
// server is needed): these read the components that decide what is sent.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

function sources(dir) {
  return fs
    .readdirSync(path.join(root, dir), { withFileTypes: true })
    .flatMap((e) => {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) return sources(rel);
      return /\.tsx$/.test(e.name) ? [rel] : [];
    });
}

test("every analytics loader skips automated browsers", () => {
  assert.match(read("lib/track.ts"), /export function isAutomated/);
  for (const f of [
    "components/PostHog.tsx",
    "components/GoogleAnalytics.tsx",
    "components/SentryReplay.tsx",
  ]) {
    assert.match(read(f), /isAutomated/, `${f} must check isAutomated`);
  }
});

test("GA4 events use the beacon transport so a navigating click is kept", () => {
  assert.match(read("lib/track.ts"), /transport_type: "beacon"/);
});

test("every CopyButton and StarButton usage names its placement", () => {
  const files = [...sources("app"), ...sources("components")];
  for (const f of files) {
    const src = read(f);
    for (const m of src.matchAll(
      /<(CopyButton|StarButton|CodeBlock)\b[^>]*?\/?>/gs,
    )) {
      if (f.endsWith("CodeBlock.tsx") || f.endsWith("Nav.tsx")) continue;
      assert.match(
        m[0],
        /placement=|variant=|placement,/,
        `${f}: ${m[0].slice(0, 80)}`,
      );
    }
  }
});

function loadIsAutomated() {
  const src = read("lib/track.ts");
  const m = src.match(/export function isAutomated[sS]*?
}
/);
  assert.ok(m, "isAutomated not found");
  return (env) =>
    vm.runInNewContext(
      `${m[0].replace("export ", "").replace(/(): boolean/, "()")}; isAutomated()`,
      env,
    );
}

test("isAutomated classifies browsers", () => {
  const run = loadIsAutomated();
  const desk = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/155.0.0.0";
  const env = (nav, scr, w) => ({
    navigator: nav,
    screen: scr,
    window: { innerWidth: w },
  });
  const big = { width: 1920, height: 1080 };
  assert.equal(run(env({ webdriver: true, userAgent: desk }, big, 1920)), true);
  assert.equal(run(env({ userAgent: "HeadlessChrome/155" }, big, 1920)), true);
  assert.equal(run(env({ userAgent: "anotifier-site-tests" }, big, 1920)), true);
  const small = { width: 800, height: 600 };
  assert.equal(run(env({ userAgent: desk }, small, 1920)), true);
  assert.equal(run(env({ userAgent: desk }, small, 800)), false);
  assert.equal(run(env({ userAgent: desk }, big, 1920)), false);
  assert.equal(
    run(env({ userAgent: "Mozilla/5.0 (iPhone) Mobile" }, { width: 390, height: 844 }, 390)),
    false,
  );
  assert.equal(run({}), false);
});
