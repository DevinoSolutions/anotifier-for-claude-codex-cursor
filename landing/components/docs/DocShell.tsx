import type { ReactNode } from "react";
import Link from "next/link";
import PageNav from "@/components/PageNav";
import SiteFooter from "@/components/SiteFooter";

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
      <PageNav variant="docs" />

      <main className="wrap">
        <div className="crumb" style={{ paddingTop: "40px" }}>
          <Link href="/">anotifier</Link> / <span>{crumb}</span>
        </div>
        {children}
      </main>

      <SiteFooter />
    </>
  );
}
