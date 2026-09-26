// The install funnel, end to end: the command and version the site shows must
// be what npm actually serves, and the command must run. lib/site.ts VERSION is
// bumped by hand each release, so a release without the bump (or a bump before
// the publish) leaves the site advertising a version npm doesn't have. Nothing
// is mocked: the pages come from BASE_URL, the manifest from the npm registry,
// and the CLI from a real `npx` download.
import { test } from "node:test";
import assert from "node:assert/strict";
import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { get } from "./site-helpers.mjs";

const INSTALL = "npx anotifier@latest setup";

const res = await fetch("https://registry.npmjs.org/anotifier/latest");
if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
const manifest = await res.json();
const LATEST = manifest.version;

// React splits text around interpolations with <!-- --> markers.
const page = async (p) => {
  const { status, body } = await get(p);
  assert.equal(status, 200, `${p} returned ${status}`);
  return body.replaceAll("<!-- -->", "");
};

// Every place the site states a version, as [page, label, pattern].
const CLAIMS = [
  ["/", "hero badge", /v(\d+\.\d+\.\d+)\s*·\s*zero dependencies/],
  ["/", "JSON-LD softwareVersion", /"softwareVersion":"([^"]+)"/],
  ["/docs/", "docs kicker", /REFERENCE · v(\d+\.\d+\.\d+)/],
  ["/docs/", "docs updated line", /for v(\d+\.\d+\.\d+) ·/],
  ["/docs/", "JSON-LD softwareVersion", /"softwareVersion":"([^"]+)"/],
  ["/llms-full.txt", "header", /^> Version (\d+\.\d+\.\d+),/m],
];

test(`every version the site states is npm latest (${LATEST})`, async () => {
  const bodies = new Map();
  const wrong = [];
  for (const [p, label, re] of CLAIMS) {
    if (!bodies.has(p)) bodies.set(p, await page(p));
    const m = bodies.get(p).match(re);
    if (!m) wrong.push(`${p} ${label}: not found (pattern ${re})`);
    else if (m[1] !== LATEST) wrong.push(`${p} ${label}: v${m[1]}`);
  }
  assert.deepEqual(
    wrong,
    [],
    `npm latest is ${LATEST}; bump VERSION in landing/lib/site.ts`,
  );
});

test("the home page leads with the install command", async () => {
  const home = await page("/");
  assert.ok(home.includes(INSTALL), `home page lacks "${INSTALL}"`);
});

test("the published package matches the badge: zero dependencies, node >= 18", () => {
  assert.deepEqual(
    Object.keys(manifest.dependencies || {}),
    [],
    "the site says zero dependencies",
  );
  assert.match(
    manifest.engines?.node || "",
    /^>=\s*18(\.0){0,2}$/,
    "the site says node ≥ 18",
  );
});

// Real npx download into a throwaway HOME and npm cache, so the run can't
// reuse a local install or touch the runner's ~/.anotifier.
const run = promisify(exec);
const home = fs.mkdtempSync(path.join(os.tmpdir(), "anotifier-npx-"));
const npx = (arg) =>
  run(`npx -y anotifier@latest ${arg}`, {
    timeout: 180_000,
    env: {
      ...process.env,
      HOME: home,
      USERPROFILE: home,
      npm_config_cache: path.join(home, "npm-cache"),
      npm_config_update_notifier: "false",
      NO_COLOR: "1",
    },
  });
// eslint-disable-next-line no-control-regex
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

test("npx anotifier@latest runs and reports npm latest", async (t) => {
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const version = await npx("--version");
  assert.match(
    plain(version.stdout),
    new RegExp(`^anotifier v${LATEST.replaceAll(".", "\\.")}$`, "m"),
  );
  // `setup` is the command the site tells visitors to run; it must exist.
  const help = await npx("--help");
  assert.match(plain(help.stdout), /^\s+setup\s+First-time setup wizard/m);
});
