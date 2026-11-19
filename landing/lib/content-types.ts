/**
 * Shapes shared by the content data files (docs, guides, agents, channels,
 * compare). One definition per concept, so a field added for one page kind
 * cannot silently drift from its twin on another.
 *
 * Inline markup allowed inside a `Block` string: `code`, **bold** and
 * [text](url), rendered by components/docs/Inline.tsx. The same tree renders
 * to markdown for /llms-full.txt (lib/markdown.ts).
 */

export type Block =
  | { kind: "p"; text: string }
  | { kind: "code"; lang: string; code: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][] }
  | { kind: "note"; text: string };

/** A titled run of blocks: a docs subsection or a guide section. */
interface SubSection {
  id: string;
  title: string;
  blocks: Block[];
}

/** A section of an agent or channel page, with its kicker label. */
export interface PageSection {
  id: string;
  kicker: string;
  title: string;
  blocks: Block[];
}

/** A headline whose middle part (`em`) is emphasised. */
export interface Heading {
  pre: string;
  em: string;
  post: string;
}

/** A question with a plain-text answer (docs and guides). */
export interface DocFaq {
  q: string;
  a: string;
}

/** A question whose answer is inner HTML (agent and channel pages). */
export interface HtmlFaq {
  q: string;
  /** Inner HTML of the answer container (simple inline tags: <p>, <code>, <a>). */
  aHtml: string;
}

/** A page whose sitemap <lastmod> comes from its own entry. */
export interface Dated {
  /** Last significant edit of this page's content (YYYY-MM-DD): the
      sitemap <lastmod>. Bump it when you change the entry, not on every build. */
  updated: string;
}

/** One H2 section of the docs page. */
export interface DocSection {
  id: string;
  /** H2 text. Phrased as the question or task a reader (or an LLM) has. */
  title: string;
  /** One-sentence direct answer that opens the section. */
  lead: string;
  blocks: Block[];
  children?: SubSection[];
}

/** A long-form guide (lib/guides.ts and the guide files it collects). */
export interface Guide extends Dated {
  slug: string;
  /** "agent": how to get notified by one agent. "topic": a platform or
      feature (Windows, hooks, ntfy, troubleshooting) across every agent. */
  kind: "agent" | "topic";
  /** Agent slug on this site, for cross-links (/claude-code/ etc.). */
  agentSlug?: string;
  /** Short label for the kicker, cards, and breadcrumb. */
  name: string;
  icon?: string;
  title: string;
  description: string;
  h1: string;
  intro: string;
  sections: SubSection[];
  faqs: DocFaq[];
}
