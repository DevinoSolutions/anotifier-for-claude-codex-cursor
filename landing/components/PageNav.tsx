import Link from "next/link";
import DiscordIcon from "@/components/DiscordIcon";
import LogoMark from "@/components/LogoMark";
import StarButton from "@/components/StarButton";
import { COMMUNITY_URL, NPM_URL } from "@/lib/site";

function DiscordLink() {
  return (
    <a
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="navDiscord"
      aria-label="Join our Discord"
      title="Join our Discord"
      style={{ display: "inline-flex" }}
    >
      <DiscordIcon size={18} />
    </a>
  );
}

/**
 * Top nav of every page except home (home has its own, in components/home).
 * `product` is the agent and channel pages (Home, npm); `docs` is the docs,
 * guides, compare and privacy pages (Docs, Guides, Compare). The two link
 * rows are spelled out in full, not built from a shared fragment, so each
 * keeps one flat list of children.
 */
export default function PageNav({ variant }: { variant: "product" | "docs" }) {
  return (
    <nav aria-label="Primary">
      <div className="wrap">
        <Link
          href="/"
          aria-label="anotifier home"
          style={{ display: "inline-flex" }}
        >
          <LogoMark size={28} />
        </Link>
        <Link href="/" className="brand">
          anotifier
        </Link>
        {variant === "product" ? (
          <div className="links">
            <Link href="/">Home</Link>
            <a href={NPM_URL}>npm</a>
            <StarButton variant="nav" />
            <DiscordLink />
          </div>
        ) : (
          <div className="links">
            <Link href="/docs/">Docs</Link>
            <Link href="/guides/">Guides</Link>
            <Link href="/compare/" className="navOptional">
              Compare
            </Link>
            <StarButton variant="nav" />
            <DiscordLink />
          </div>
        )}
      </div>
    </nav>
  );
}
