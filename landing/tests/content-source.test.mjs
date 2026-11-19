// Guards on the content source (lib/, app/, components/, public/llms.txt),
// read from disk: no server needed. They catch, before a build, the mistakes
// the rendered-page checks in seo.test.mjs would only show afterwards.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const root = new URL("../", import.meta.url);

// Every .ts/.tsx file under the given folders, as { file, text }.
function sources(...dirs) {
  return dirs.flatMap((dir) =>
    fs
      .readdirSync(new URL(`${dir}/`, root), { recursive: true })
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => ({
        file: `${dir}/${f.replaceAll("\\", "/")}`,
        text: fs.readFileSync(new URL(`${dir}/${f}`, root), "utf8"),
      })),
  );
}
const code = sources("lib", "app", "components");

// components/docs/Inline.tsx splits a string on one pattern whose alternatives
// are `code`, **bold** and [text](url), and the leftmost match wins. A code
// span inside bold or link text starts after the bold or link does, so the
// bold or link wins and the backticks print as they are. The pattern is read
// from Inline.tsx so the two cannot drift apart.
const TOKEN = new RegExp(
  fs
    .readFileSync(new URL("components/docs/Inline.tsx", root), "utf8")
    .match(/const TOKEN = \/(.+)\/g;/)?.[1] ?? "(?!)",
  "g",
);
// The bold and link spans of a string that have a code span inside them.
const wrappedCode = (text) =>
  text
    .split(TOKEN)
    .filter((part, i) => i % 2 === 1 && !part.startsWith("`"))
    .filter((part) => part.includes("`"));

test("the markup guard reads Inline's pattern and matches what it is meant to catch", () => {
  assert.notEqual(TOKEN.source, "(?!)", "TOKEN not found in Inline.tsx");
  assert.deepEqual(wrappedCode("**the `x` flag**"), ["**the `x` flag**"]);
  assert.deepEqual(wrappedCode("**`x`**"), ["**`x`**"]);
  assert.deepEqual(wrappedCode("[the `x` page](/docs/)"), [
    "[the `x` page](/docs/)",
  ]);
  assert.deepEqual(wrappedCode("[`x`](/docs/) and **b**"), ["[`x`](/docs/)"]);
  for (const fine of [
    "**bold** and `code` apart",
    "`**` is not bold",
    "[a link](/docs/) then `code`",
    "`a` **b** [c](/d/)",
    "**a** then `x` then **b**",
    "[a](/b/) then `x` then [c](/d/)",
  ])
    assert.deepEqual(wrappedCode(fine), [], fine);
});

test("no content string wraps code in bold or link text", () => {
  const hits = [];
  for (const { file, text } of code) {
    for (const [i, line] of text.split("\n").entries()) {
      // Comments may talk about the syntax. A template-literal line that
      // starts with "**" is content, so only "//", "/*", "* " and "*/" count.
      if (/^\s*(\/\/|\/\*|\*\/|\*(\s|$))/.test(line)) continue;
      // In a template literal (a backtick-delimited string) a code span is
      // written \`x\` and the unescaped backticks are the delimiters. Read it
      // that way too: delimiters out of the way, escapes as the backticks
      // Inline sees. Plain strings are read as they are.
      const asTemplate = line.replace(/(?<!\\)`/g, '"').replaceAll("\\`", "`");
      for (const span of new Set([
        ...wrappedCode(line),
        ...wrappedCode(asTemplate),
      ]))
        hits.push(`${file}:${i + 1} code inside bold or link text: ${span}`);
    }
  }
  assert.deepEqual(hits, []);
});

// Phrases that name "the release you are reading about" instead of a release a
// feature arrived in: "(as of 1.8.0)", "anotifier 1.8.0 only alerts you". A
// "1.8.0 and later" never goes stale; these do on the next release, and the
// page keeps saying the old number. They must name the current VERSION.
const PINNED_TO_CURRENT = [
  /\bas of (\d+\.\d+\.\d+)/gi,
  /\bthe current (\d+\.\d+\.\d+)/gi,
  /\banotifier (\d+\.\d+\.\d+) only\b/gi,
  /\bsource of anotifier (\d+\.\d+\.\d+)/gi,
  /\banotifier (\d+\.\d+\.\d+): \[/gi,
];
const pinnedVersions = (text) =>
  PINNED_TO_CURRENT.flatMap((re) => [...text.matchAll(re)].map((m) => m[1]));

test("the release-pinned phrase patterns match what they are meant to catch", () => {
  for (const sample of [
    "Not in anotifier (as of 1.2.3), which sends nothing",
    "since anotifier 1.0.0 and in the current 1.2.3.",
    "anotifier 1.2.3 only alerts you",
    "This section follows the source of anotifier 1.2.3: [a](b)",
    "anotifier 1.2.3: [patch-config.mjs](x)",
    "As of 1.2.3, nothing is sent",
    "Anotifier 1.2.3 only alerts you",
  ]) {
    assert.deepEqual(pinnedVersions(sample).slice(-1), ["1.2.3"], sample);
  }
  for (const fine of [
    "anotifier 1.2.3 and later also shows the turn length",
    "from anotifier 1.2.3. It sends one notification",
    "Before 1.2.3 every alert looked the same",
  ])
    assert.deepEqual(pinnedVersions(fine), [], fine);
});

test("every phrase that pins the current release names VERSION", () => {
  const version = fs
    .readFileSync(new URL("lib/site.ts", root), "utf8")
    .match(/export const VERSION = "(\d+\.\d+\.\d+)"/)?.[1];
  assert.ok(version, "lib/site.ts has no VERSION");
  const files = [
    ...code,
    {
      file: "public/llms.txt",
      text: fs.readFileSync(new URL("public/llms.txt", root), "utf8"),
    },
  ];
  const stale = [];
  for (const { file, text } of files) {
    for (const [i, line] of text.split("\n").entries())
      for (const v of pinnedVersions(line))
        if (v !== version)
          stale.push(`${file}:${i + 1} says ${v}, VERSION is ${version}`);
  }
  // lib/antigravity-guides.ts also pins AGY_SRC to a git tag (blob/vX.Y.Z).
  // That is deliberately not asserted: the tag is pushed after the release-docs
  // PR merges, so a link to it would 404 while that PR is open.
  assert.deepEqual(
    stale,
    [],
    "Bump these with VERSION. Also update AGY_SRC in lib/antigravity-guides.ts " +
      "to the new tag, in the first content PR after the tag exists.",
  );
});
