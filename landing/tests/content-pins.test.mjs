// Page-specific pins: the copy, sections, examples and links one page has to
// keep. They change with the content, unlike the generic invariants in
// seo.test.mjs. Runs against BASE_URL (see site-helpers.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_GUIDES,
  decodeEntities,
  faqQuestions,
  get,
  meta,
  sitemapPaths,
} from "./site-helpers.mjs";

const paths = await sitemapPaths();
const pages = new Map(
  await Promise.all(
    paths.map(async (p) => {
      const res = await get(p);
      return [p, { ...res, ...meta(res.body) }];
    }),
  ),
);

test("agent pages target the product, guides the how-to, and link to each other", () => {
  for (const [agent, guide] of Object.entries(AGENT_GUIDES)) {
    const a = pages.get(agent);
    const g = pages.get(guide);
    assert.match(a.title, /Notifier/, `${agent} title should name the tool`);
    assert.doesNotMatch(
      a.title,
      /Notifications/,
      `${agent} title competes with ${guide}`,
    );
    assert.match(
      a.h1Text,
      agent === "/claude-code/"
        ? /^anotifier: the Claude Code notifier /
        : /^anotifier for /,
      `${agent} h1`,
    );
    assert.ok(
      a.body.includes(`href="${guide}"`),
      `${agent} does not link ${guide}`,
    );
    assert.ok(
      g.body.includes(`href="${agent}"`),
      `${guide} does not link ${agent}`,
    );
  }
});

test("/claude-code/ compares the options, shows the hand-written hooks, and keeps FAQ schema in step", () => {
  const { body } = pages.get("/claude-code/");
  for (const id of ["options", "by-hand"]) {
    assert.ok(body.includes(`id="${id}"`), `/claude-code/ lacks #${id}`);
  }
  assert.ok(
    body.includes('<th scope="col">'),
    "/claude-code/ comparison table has no column headers",
  );

  const { schemaQs, visibleQs } = faqQuestions(body);
  assert.ok(visibleQs.length > 0, "/claude-code/ shows no FAQ questions");
  for (const q of visibleQs) {
    assert.ok(schemaQs.includes(q), `FAQ "${q}" is missing from the JSON-LD`);
  }

  for (const guide of [
    "/guides/claude-code-notifications/",
    "/guides/claude-code-permission-notifications/",
  ]) {
    assert.match(
      pages.get(guide).body,
      /<a[^>]+href="\/claude-code\/"[^>]*>\s*Claude Code notifier\s*<\/a>/,
      `${guide} has no "Claude Code notifier" link to /claude-code/`,
    );
  }
});

test("the Cursor guide leads with the answer, shows valid hooks.json examples, and keeps FAQ schema in step", () => {
  const g = pages.get("/guides/cursor-agent-notifications/");
  assert.match(g.title, /^Cursor Notification When Done/, "guide title");
  for (const id of [
    "built-in",
    "hook",
    "hook-os",
    "anotifier",
    "phone",
    "windows",
    "troubleshooting",
    "mute",
    "faq",
  ]) {
    assert.ok(g.body.includes(`id="${id}"`), `Cursor guide lacks #${id}`);
  }

  // The paragraph under the h1 is the direct answer.
  const sub = g.body.match(/<p class="sub">([\s\S]*?)<\/p>/)?.[1] ?? "";
  assert.match(sub, /sound/, "intro does not mention the built-in sound");
  assert.match(sub, /hooks\.json/, "intro does not mention hooks.json");

  // Every hooks.json example parses and has the shape Cursor documents.
  const hookFiles = [
    ...g.body.matchAll(/<pre data-lang="json"><code>([\s\S]*?)<\/code>/g),
  ]
    .map((m) => JSON.parse(decodeEntities(m[1])))
    .filter((j) => j.hooks);
  assert.ok(
    hookFiles.length >= 4,
    `only ${hookFiles.length} hooks.json examples`,
  );
  for (const file of hookFiles) {
    assert.equal(file.version, 1, "hooks.json example without version 1");
    assert.deepEqual(Object.keys(file.hooks), ["stop"]);
    for (const entry of file.hooks.stop) {
      assert.equal(typeof entry.command, "string", "stop entry has no command");
    }
  }

  const { schemaQs, visibleQs } = faqQuestions(g.body);
  assert.ok(visibleQs.length >= 4, `only ${visibleQs.length} FAQ questions`);
  assert.deepEqual(schemaQs, visibleQs, "FAQ JSON-LD differs from the page");

  for (const href of [
    "/cursor/",
    "/guides/notifications-not-working/",
    "/guides/ntfy-phone-notifications/",
  ]) {
    assert.ok(
      g.body.includes(`href="${href}`),
      `Cursor guide does not link ${href}`,
    );
  }
});

test("the Claude Code hub leads with the answer, explains the events, shows valid JSON, keeps FAQ schema in step and is linked from the pages around it", () => {
  const hub = "/guides/claude-code-notifications/";
  const g = pages.get(hub);
  assert.match(g.title, /^Claude Code Notifications When/, "guide title");
  assert.match(
    g.h1Text,
    /^Claude Code notifications: get alerted when it finishes or needs you$/,
    "guide h1",
  );
  for (const id of [
    "answer",
    "events",
    "channels",
    "built-in",
    "hook",
    "phone",
    "anotifier",
    "quiet",
    "troubleshooting",
    "faq",
  ]) {
    assert.ok(g.body.includes(`id="${id}"`), `Claude Code hub lacks #${id}`);
  }

  // The paragraph under the h1 is the direct answer: both events, and the
  // one-command route.
  const sub = g.body.match(/<p class="sub">([\s\S]*?)<\/p>/)?.[1] ?? "";
  assert.match(sub, /Stop/, "intro does not name the Stop event");
  assert.match(sub, /Notification/, "intro does not name Notification");
  assert.match(sub, /npx anotifier@latest setup/, "intro has no setup command");

  // Every JSON example parses. Hook examples use only the two events the
  // guide teaches, each with a command handler; the config example sets a
  // quiet-hours window of valid HH:MM times.
  const blocks = [
    ...g.body.matchAll(/<pre data-lang="json"><code>([\s\S]*?)<\/code>/g),
  ].map((m) => JSON.parse(decodeEntities(m[1])));
  const hookFiles = blocks.filter((j) => j.hooks);
  assert.ok(hookFiles.length >= 2, `only ${hookFiles.length} hook examples`);
  for (const file of hookFiles) {
    for (const [event, groups] of Object.entries(file.hooks)) {
      assert.ok(["Stop", "Notification"].includes(event), `hook ${event}`);
      for (const group of groups) {
        for (const h of group.hooks) {
          assert.equal(h.type, "command", `${event} handler type`);
          assert.equal(typeof h.command, "string", `${event} has no command`);
        }
      }
    }
  }
  const quiet = blocks.find((j) => j.quietHours)?.quietHours;
  assert.ok(quiet, "no quietHours example");
  assert.equal(quiet.enabled, true);
  assert.match(quiet.from, /^([01]\d|2[0-3]):[0-5]\d$/, "quietHours.from");
  assert.match(quiet.to, /^([01]\d|2[0-3]):[0-5]\d$/, "quietHours.to");

  const { schemaQs, visibleQs } = faqQuestions(g.body);
  assert.ok(visibleQs.length >= 7, `only ${visibleQs.length} FAQ questions`);
  assert.deepEqual(schemaQs, visibleQs, "FAQ JSON-LD differs from the page");
  for (const topic of [/finishes/, /permission/, /phone/, /Slack/, /night/]) {
    assert.ok(
      visibleQs.some((q) => topic.test(q)),
      `no FAQ question matches ${topic}`,
    );
  }

  // Links out to the neighbouring pages.
  for (const href of [
    "/guides/claude-code-permission-notifications/",
    "/guides/claude-code-notification-sound/",
    "/guides/ntfy-phone-notifications/",
    "/guides/windows-wsl-notifications/",
    "/guides/macos-linux-notifications/",
    "/guides/notifications-not-working/",
    "/guides/claude-code-usage-limit-notifications/",
    "/slack/",
    "/discord/",
    "/telegram/",
    "/phone/",
    "/claude-code/",
  ]) {
    assert.ok(g.body.includes(`href="${href}`), `hub does not link ${href}`);
  }

  // Links in from the pages around it.
  for (const from of [
    "/",
    "/claude-code/",
    "/docs/",
    "/guides/",
    "/guides/claude-code-notification-sound/",
    "/guides/claude-code-permission-notifications/",
    "/guides/ntfy-phone-notifications/",
    "/guides/notifications-not-working/",
    "/guides/ccnotify/",
    "/guides/claude-code-auto-compact-warning/",
  ]) {
    assert.ok(
      pages.get(from).body.includes(`href="${hub}"`),
      `${from} does not link the hub`,
    );
  }
});

test("home: descriptive title and an h1 that reads as one sentence", () => {
  const home = pages.get("/");
  for (const name of ["Claude Code", "Codex", "Cursor", "Gemini"]) {
    assert.ok(home.title.includes(name), `home title lacks ${name}`);
  }
  assert.equal(
    home.h1Text,
    "Know the moment your Claude Code, Codex, Cursor or Gemini CLI agent needs you.",
  );
});

const TOPIC_GUIDES = [
  "/guides/claude-code-permission-notifications/",
  "/guides/claude-code-notification-sound/",
  "/guides/codex-notification-sound/",
  "/guides/windows-wsl-notifications/",
  "/guides/macos-linux-notifications/",
  "/guides/agent-hooks-explained/",
  "/guides/notifications-not-working/",
  "/guides/ntfy-phone-notifications/",
];

test("sitemap lists the platform and topic guides", () => {
  for (const p of TOPIC_GUIDES) {
    assert.ok(paths.includes(p), `${p} missing from sitemap`);
  }
});
