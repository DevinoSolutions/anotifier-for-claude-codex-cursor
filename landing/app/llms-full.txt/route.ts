import { AGENTS } from "@/lib/agents";
import { CHANNELS } from "@/lib/channels";
import { DOCS, DOCS_DESCRIPTION, DOCS_FAQ } from "@/lib/docs";
import { GUIDES } from "@/lib/guides";
import { ALTERNATIVES, COMPARE_INTRO } from "@/lib/alternatives";
import {
  absoluteLinks,
  blocksToMarkdown,
  faqToMarkdown,
  sectionsToMarkdown,
} from "@/lib/markdown";
import { PAGE_UPDATED, SITE_URL, VERSION } from "@/lib/site";

// Static export: rendered once at build time into out/llms-full.txt.
export const dynamic = "force-static";

/** The newest content edit anywhere on the site: the latest `updated` of any
    page, so nobody has to bump a second date by hand. ISO dates sort as text. */
const CONTENT_UPDATED = [
  ...Object.values(PAGE_UPDATED),
  ...GUIDES.map((g) => g.updated),
  ...AGENTS.map((a) => a.updated),
  ...CHANNELS.map((c) => c.updated),
].reduce((newest, date) => (date > newest ? date : newest));

export function GET() {
  const parts: string[] = [
    "# anotifier — full documentation (plain text for language models)",
    "",
    `> ${DOCS_DESCRIPTION}`,
    `> Version ${VERSION}, updated ${CONTENT_UPDATED}. Canonical HTML: ${SITE_URL}/docs/`,
    "",
    sectionsToMarkdown(DOCS),
    "",
    "## Frequently asked questions",
    "",
    faqToMarkdown(DOCS_FAQ),
    "",
    "# Setup guides",
    "",
    ...GUIDES.map((g) =>
      [
        `## ${g.h1}`,
        `Canonical: ${SITE_URL}/guides/${g.slug}/`,
        "",
        g.intro,
        "",
        g.sections
          .map((s) => `### ${s.title}\n\n${blocksToMarkdown(s.blocks)}`)
          .join("\n\n"),
        "",
        "### FAQ",
        "",
        faqToMarkdown(g.faqs),
      ].join("\n"),
    ),
    "",
    "# anotifier compared with alternatives",
    "",
    `Canonical: ${SITE_URL}/compare/`,
    "",
    COMPARE_INTRO,
    "",
    ...ALTERNATIVES.map((a) =>
      [
        `## ${a.name}`,
        `${a.kind} · ${a.url}`,
        "",
        ...a.facts.map((f) => `- ${f}`),
        "",
        `Fit: ${a.verdict}`,
      ].join("\n"),
    ),
  ];
  return new Response(absoluteLinks(parts.join("\n")), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
