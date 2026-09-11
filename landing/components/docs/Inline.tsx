import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Renders the tiny inline grammar used by lib/docs.ts, lib/guides.ts and
 * lib/alternatives.ts: `code`, **bold**, and [text](url). Deliberately not a
 * markdown parser — three constructs, no surprises, no dependency.
 */
const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;

export default function Inline({ text }: { text: string }) {
  const parts = text.split(TOKEN);
  return (
    <>
      {parts.map((part, i) => {
        if (!part) return null;
        if (part.startsWith("`") && part.endsWith("`")) {
          return <code key={i}>{part.slice(1, -1)}</code>;
        }
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const [, label, href] = link;
          const node: ReactNode = href.startsWith("/") ? (
            <Link key={i} href={href}>
              {label}
            </Link>
          ) : (
            <a key={i} href={href}>
              {label}
            </a>
          );
          return node;
        }
        return part;
      })}
    </>
  );
}
