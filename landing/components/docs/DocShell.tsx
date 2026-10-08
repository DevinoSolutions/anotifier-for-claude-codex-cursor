import type { ReactNode } from "react";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import SiteFooter from "@/components/SiteFooter";
import StarButton from "@/components/StarButton";
import DiscordIcon from "@/components/DiscordIcon";
import { COMMUNITY_URL } from "@/lib/site";

/**
 * Chrome shared by every long-form page (docs, guides, compare): the compact
 * nav, breadcrumb-ready header slot, and the site footer. Content pages import
 * agent-page.css + docs.css themselves so the CSS ships once per route.
 */
export default function DocShell({
  crumb,
  children,
}: {
  crumb: string;
  children: ReactNode;
}) {
  return (
    <>
      <nav>
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
          <div className="links">
            <Link href="/docs/">Docs</Link>
            <Link href="/guides/">Guides</Link>
            <Link href="/compare/" className="navOptional">
              Compare
            </Link>
            <StarButton variant="nav" />
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
          </div>
        </div>
      </nav>

      <div className="wrap">
        <div className="crumb" style={{ paddingTop: "40px" }}>
          <Link href="/">anotifier</Link> / <span>{crumb}</span>
        </div>
        {children}
      </div>

      <SiteFooter />
    </>
  );
}
