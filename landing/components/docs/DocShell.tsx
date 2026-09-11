import type { ReactNode } from "react";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import { GITHUB_URL, NPM_URL, SUPPORT_URL } from "@/lib/site";

/**
 * Chrome shared by every long-form page (docs, guides, compare): the compact
 * nav, breadcrumb-ready header slot, and footer. Content pages import
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
          <Link href="/" style={{ display: "inline-flex" }}>
            <LogoMark size={28} />
          </Link>
          <Link href="/" className="brand">
            anotifier
          </Link>
          <div className="links">
            <Link href="/docs/">Docs</Link>
            <Link href="/guides/">Guides</Link>
            <Link href="/compare/">Compare</Link>
            <a href={GITHUB_URL}>GitHub</a>
          </div>
        </div>
      </nav>

      <div className="wrap">
        <div className="crumb" style={{ paddingTop: "40px" }}>
          <Link href="/">anotifier</Link> / <span>{crumb}</span>
        </div>
        {children}
      </div>

      <footer>
        <div className="wrap">
          <div>
            <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
              <LogoMark size={24} />
            </span>{" "}
            © 2026{" "}
            <a href="https://github.com/DevinoSolutions">DevinoSolutions</a> ·
            AGPL-3.0
          </div>
          <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
            <Link href="/docs/">docs</Link>
            <Link href="/guides/">guides</Link>
            <Link href="/compare/">compare</Link>
            <a href={GITHUB_URL}>github</a>
            <a href={NPM_URL}>npm</a>
            <a href={SUPPORT_URL}>♥ support</a>
          </div>
        </div>
      </footer>
    </>
  );
}
