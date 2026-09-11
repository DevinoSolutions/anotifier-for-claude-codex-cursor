import type { Metadata } from "next";
import Link from "next/link";
import DocShell from "@/components/docs/DocShell";
import Inline from "@/components/docs/Inline";
import {
  ALTERNATIVES,
  COMPARE_COLUMNS,
  COMPARE_INTRO,
} from "@/lib/alternatives";
import { CONTENT_UPDATED, GITHUB_URL, INSTALL_CMD, SITE_URL } from "@/lib/site";
import "../[slug]/agent-page.css";
import "../docs/docs.css";

const URL = `${SITE_URL}/compare/`;
const TITLE =
  "anotifier vs code-notify, agent-notify, Pushary & DIY hooks — AI agent notification tools compared";
const DESCRIPTION =
  "anotifier, code-notify, agent-notify, claude-ntfy-hook, Pushary, AI Done Now and DIY hooks compared: agents, channels, platforms, remote approval, price.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: "article",
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

export default function ComparePage() {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: "AI coding agent notification tools compared",
      description: DESCRIPTION,
      url: URL,
      dateModified: CONTENT_UPDATED,
      inLanguage: "en",
      author: {
        "@type": "Organization",
        name: "DevinoSolutions",
        url: "https://github.com/DevinoSolutions",
      },
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: ALTERNATIVES.map((a, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: a.name,
        url: a.url.startsWith("/") ? `${SITE_URL}${a.url}` : a.url,
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
        { "@type": "ListItem", position: 2, name: "Compare", item: URL },
      ],
    },
  ];

  return (
    <DocShell crumb="compare">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header style={{ paddingTop: "28px" }}>
        <div className="kicker">[ COMPARE ]</div>
        <h1>
          anotifier vs the <em>alternatives</em>.
        </h1>
        <p className="sub">{COMPARE_INTRO}</p>
        <p className="docMeta">
          Facts taken from each project&apos;s own README or site on{" "}
          {CONTENT_UPDATED}. Spotted something out of date?{" "}
          <a href={`${GITHUB_URL}/issues`}>Open an issue</a> and we will fix it.
        </p>
      </header>

      <div className="docBody">
        <section>
          <h2>At a glance</h2>
          <div className="tableWrap cmpTable">
            <table>
              <thead>
                <tr>
                  {COMPARE_COLUMNS.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ALTERNATIVES.map((a) => (
                  <tr key={a.name}>
                    {a.row.map((cell, i) => (
                      <td
                        key={i}
                        style={
                          i === 0
                            ? {
                                color: "var(--ink)",
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                              }
                            : undefined
                        }
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="docMeta">
            &quot;Not listed&quot; means the project&apos;s README or site does
            not mention the capability; it may still exist.
          </p>
        </section>

        <section>
          <h2>Each tool in its own words</h2>
          <div className="cmpGrid">
            {ALTERNATIVES.map((a) => (
              <article key={a.name} className="cmpCard">
                <h3>
                  {a.url.startsWith("/") ? (
                    <Link href={a.url}>{a.name}</Link>
                  ) : (
                    <a href={a.url}>{a.name}</a>
                  )}
                </h3>
                <div className="meta">{a.kind}</div>
                <ul>
                  {a.facts.map((f, i) => (
                    <li key={i}>
                      <Inline text={f} />
                    </li>
                  ))}
                </ul>
                <p className="verdict">
                  <strong>Fit:</strong> {a.verdict}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section>
          <h2>Where anotifier falls short</h2>
          <p className="lead">
            Two things other tools do that anotifier does not, so you can decide
            with open eyes.
          </p>
          <ul>
            <li>
              <strong>Remote Allow/Deny.</strong> Pushary and claude-ntfy-hook
              let you approve a tool call from the phone. anotifier tells you
              instantly and gets you back to the window; the decision stays at
              the keyboard until a security design for remote approval lands.
            </li>
            <li>
              <strong>Voice announcements and quota alerts.</strong> code-notify
              and agent-notify read completions aloud, and code-notify warns
              about usage limits. anotifier does neither.
            </li>
          </ul>
        </section>

        <section>
          <h2>Try anotifier</h2>
          <pre data-lang="bash">
            <code>{INSTALL_CMD}</code>
          </pre>
          <div className="docCtaRow">
            <Link href="/docs/" className="primary">
              Read the docs
            </Link>
            <Link href="/guides/" className="secondary">
              Setup guides
            </Link>
            <a href={GITHUB_URL} className="secondary">
              GitHub
            </a>
          </div>
        </section>
      </div>
    </DocShell>
  );
}
