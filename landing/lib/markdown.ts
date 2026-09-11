import type { Block, DocFaq, DocSection } from "./docs";

/**
 * Renders the same block tree the pages render, as plain markdown. This is what
 * /llms-full.txt serves, so a language model reads exactly the text a human
 * sees — no drift between the two.
 */

function table(head: string[], rows: string[][]): string {
  const esc = (s: string) => s.replace(/\|/g, "\\|");
  const line = (cells: string[]) => `| ${cells.map(esc).join(" | ")} |`;
  return [
    line(head),
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map(line),
  ].join("\n");
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((b) => {
      switch (b.kind) {
        case "p":
          return b.text;
        case "note":
          return `> ${b.text}`;
        case "code":
          return `\`\`\`${b.lang}\n${b.code}\n\`\`\``;
        case "ul":
          return b.items.map((i) => `- ${i}`).join("\n");
        case "ol":
          return b.items.map((item, i) => `${i + 1}. ${item}`).join("\n");
        case "table":
          return table(b.head, b.rows);
      }
    })
    .join("\n\n");
}

export function sectionsToMarkdown(sections: DocSection[]): string {
  return sections
    .map((s) => {
      const parts = [`## ${s.title}`, s.lead, blocksToMarkdown(s.blocks)];
      for (const child of s.children ?? []) {
        parts.push(`### ${child.title}`, blocksToMarkdown(child.blocks));
      }
      return parts.filter(Boolean).join("\n\n");
    })
    .join("\n\n");
}

export function faqToMarkdown(faq: DocFaq[]): string {
  return faq.map((f) => `### ${f.q}\n\n${f.a}`).join("\n\n");
}
