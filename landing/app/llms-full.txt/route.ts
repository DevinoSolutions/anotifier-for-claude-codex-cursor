import { DOCS, DOCS_DESCRIPTION, DOCS_FAQ } from "@/lib/docs";
import { GUIDES } from "@/lib/guides";
import { ALTERNATIVES, COMPARE_INTRO } from "@/lib/alternatives";
import {
  blocksToMarkdown,
  faqToMarkdown,
  sectionsToMarkdown,
} from "@/lib/markdown";
import { CONTENT_UPDATED, SITE_URL, VERSION } from "@/lib/site";

// Static export: rendered once at build time into out/llms-full.txt.
export const dynamic = "force-static";

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
  return new Response(parts.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
