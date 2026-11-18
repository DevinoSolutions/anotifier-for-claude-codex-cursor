// The install funnel, end to end: the command and version the site shows must
// agree with what npm serves, and (on the live site) the command must run.
// Nothing is mocked: the pages come from BASE_URL, the manifest from the npm
// registry, and the CLI from a real `npx` download.
//
// lib/site.ts VERSION is bumped by hand each release, and the release docs are
// merged BEFORE `npm publish` finishes (release.yml runs on the tag). So the
// tests run in two modes, chosen by BASE_URL exactly as browser.test.mjs does:
//
//   LIVE (BASE_URL unset = https://anotifier.io, landing-live.yml): the site
//   and npm must be the same version, the published package must match the
//   badge and `npx anotifier@latest` must run. A mismatch here means the
//   deployed site and npm really disagree.
//
//   Not live (the Landing workflow against the local build, on every PR and
//   on main): the site must state ONE valid version everywhere and it must be
//   at least npm latest. A release's docs can merge ahead of the publish and
//   stay green; forgetting to bump VERSION (site older than npm) stays red.
//   Nothing about the published package is tested here: it is not a property
//   of the pull request.
import { test } from "node:test";
import assert from "node:assert/strict";
import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { BASE_URL, SITE_URL, get } from "./site-helpers.mjs";

const LIVE = BASE_URL === SITE_URL;
const liveOnly = LIVE
  ? false
  : "live site only (BASE_URL is not https://anotifier.io)";

const INSTALL = "npx anotifier@latest setup";

const res = await fetch("https://registry.npmjs.org/anotifier/latest");
if (!res.ok) throw new Error(`npm registry returned ${res.status}`);
const manifest = await res.json();
const LATEST = manifest.version;

// X.Y.Z only: the site never states a prerelease.
const parse = (v) =>
  /^(\d+)\.(\d+)\.(\d+)$/.exec(v)?.slice(1).map(Number) ?? null;
const compare = (a, b) => a.reduce((d, n, i) => d || n - b[i], 0);
if (!parse(LATEST)) throw new Error(`npm latest "${LATEST}" is not X.Y.Z`);

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

// The version the site states, or an error naming every claim that is missing
// or disagrees. Computed once, shared by the tests below.
let stated;
const siteVersion = () => (stated ??= readSiteVersion());
async function readSiteVersion() {
  const bodies = new Map();
  const found = []; // [where, version]
  const problems = [];
  for (const [p, label, re] of CLAIMS) {
    if (!bodies.has(p)) bodies.set(p, await page(p));
    const m = bodies.get(p).match(re);
    if (!m) problems.push(`${p} ${label}: not found (pattern ${re})`);
    else found.push([`${p} ${label}`, m[1]]);
  }
  // "(1.3.1 included)" is a claim about the current release, so it goes stale
  // on every publish. llms-full.txt carries every guide and the docs.
  for (const m of bodies
    .get("/llms-full.txt")
    .matchAll(/\((\d+\.\d+\.\d+) included\)/g))
    found.push([`/llms-full.txt "(${m[1]} included)"`, m[1]]);
  for (const [where, v] of found)
    if (!parse(v)) problems.push(`${where}: "${v}" is not X.Y.Z`);
  const versions = [...new Set(found.map(([, v]) => v))];
  if (versions.length > 1)
    problems.push(
      `the site states ${versions.length} different versions: ${found
        .map(([where, v]) => `${where} v${v}`)
        .join("; ")}`,
    );
  if (problems.length) throw new Error(problems.join("\n"));
  return versions[0];
}

test("every version the site states is the same, valid X.Y.Z", async () => {
  const version = await siteVersion();
  assert.ok(parse(version), `site version "${version}" is not X.Y.Z`);
});

test(
  LIVE
    ? `the site's version equals npm latest (${LATEST})`
    : `the site's version is not older than npm latest (${LATEST})`,
  async () => {
    const site = await siteVersion();
    const order = compare(parse(site), parse(LATEST));
    if (LIVE) {
      // The site is deployed and npm is the registry: they must be the same.
      // Site newer means the release did not finish publishing (the docs ship
      // with the merge, npm.publish with the tag); site older means a deploy
      // or the VERSION bump is missing.
      assert.equal(
        order,
        0,
        order > 0
          ? `the site advertises v${site} but npm latest is v${LATEST}: the release is not published (or the publish has not finished); check the release run for the v${site} tag`
          : `npm latest is v${LATEST} but the site still says v${site}: bump VERSION in landing/lib/site.ts and deploy`,
      );
    } else {
      // A pull request may carry the docs for a release npm does not have
      // yet; only a site OLDER than npm is wrong (the bump was forgotten).
      assert.ok(
        order >= 0,
        `npm latest is v${LATEST} but the site says v${site}: bump VERSION in landing/lib/site.ts`,
      );
    }
  },
);

test("the home page leads with the install command", async () => {
  const home = await page("/");
  assert.ok(home.includes(INSTALL), `home page lacks "${INSTALL}"`);
});

test(
  "the published package matches the badge: zero dependencies, node >= 18",
  { skip: liveOnly },
  () => {
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
  },
);

// Real npx download into a throwaway HOME and npm cache, so the run can't
// reuse a local install or touch the runner's ~/.anotifier. Live only: it
// downloads the published package, which says nothing about a pull request.
const run = promisify(exec);
const home = LIVE
  ? fs.mkdtempSync(path.join(os.tmpdir(), "anotifier-npx-"))
  : "";
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

test(
  "npx anotifier@latest runs and reports npm latest",
  { skip: liveOnly },
  async (t) => {
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const version = await npx("--version");
    assert.match(
      plain(version.stdout),
      new RegExp(`^anotifier v${LATEST.replaceAll(".", "\\.")}$`, "m"),
    );
    // `setup` is the command the site tells visitors to run; it must exist.
    const help = await npx("--help");
    assert.match(plain(help.stdout), /^\s+setup\s+First-time setup wizard/m);
  },
);
