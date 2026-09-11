import type { Metadata } from "next";
import Link from "next/link";
import DocShell from "@/components/docs/DocShell";
import { GUIDES } from "@/lib/guides";
import { CHANNELS } from "@/lib/channels";
import { SITE_URL } from "@/lib/site";
import "../[slug]/agent-page.css";
import "../docs/docs.css";

const URL = `${SITE_URL}/guides/`;
const TITLE =
  "AI Coding Agent Notification Guides — Claude Code, Codex, Cursor, Gemini CLI";
const DESCRIPTION =
  "Step-by-step guides to getting notified when Claude Code, Codex CLI, Cursor, or Gemini CLI finishes or needs input, plus channel setup for Slack, Discord, Telegram, and phone push.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: "website",
    siteName: "anotifier",
    url: URL,
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/og.png?v=3", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/og.png?v=3"],
  },
};

export default function GuidesIndex() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: TITLE,
      description: DESCRIPTION,
      url: URL,
      hasPart: GUIDES.map((g) => ({
        "@type": "TechArticle",
        headline: g.h1,
        url: `${SITE_URL}/guides/${g.slug}/`,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "anotifier",
          item: `${SITE_URL}/`,
        },
        { "@type": "ListItem", position: 2, name: "Guides", item: URL },
      ],
    },
  ];

  return (
    <DocShell crumb="guides">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header style={{ paddingTop: "28px" }}>
        <div className="kicker">[ GUIDES ]</div>
        <h1>
          Get notified when your <em>agent</em> finishes.
        </h1>
        <p className="sub">
          Every way to do it, per agent: the built-in option, a hook you write
          yourself, a phone push over ntfy, and the one-command setup. Honest
          about what each gives you.
        </p>
      </header>

      <div className="docBody">
        <section>
          <h2>By agent</h2>
          <div className="cmpGrid">
            {GUIDES.map((g) => (
              <Link
                key={g.slug}
                href={`/guides/${g.slug}/`}
                className="cmpCard"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    marginBottom: "8px",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={g.icon}
                    alt=""
                    width={28}
                    height={28}
                    style={{ borderRadius: "7px" }}
                  />
                  <h3 style={{ margin: 0 }}>{g.agentName}</h3>
                </div>
                <p style={{ margin: 0, color: "var(--dim)" }}>{g.h1}</p>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2>By channel</h2>
          <p className="lead">Wiring a destination once covers every agent.</p>
          <div className="others">
            {CHANNELS.map((c) => (
              <Link key={c.slug} href={`/${c.slug}/`}>
                {c.name}
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2>Reference</h2>
          <div className="docCtaRow">
            <Link href="/docs/" className="primary">
              Full documentation
            </Link>
            <Link href="/compare/" className="secondary">
              Compare alternatives
            </Link>
          </div>
        </section>
      </div>
    </DocShell>
  );
}
