import Link from "next/link";
import DiscordIcon from "@/components/DiscordIcon";
import Blocks from "@/components/docs/Blocks";
import DocShell from "@/components/docs/DocShell";
import Inline from "@/components/docs/Inline";
import JsonLd from "@/components/JsonLd";
import CopyButton from "@/components/home/CopyButton";
import { DOCS, DOCS_DESCRIPTION, DOCS_FAQ, DOCS_TITLE } from "@/lib/docs";
import { breadcrumbListLd, faqPageLd, techArticleLd } from "@/lib/jsonld";
import {
  COMMUNITY_URL,
  GITHUB_URL,
  INSTALL_CMD,
  NPM_URL,
  PAGE_UPDATED,
  SITE_URL,
  SUPPORT_URL,
  VERSION,
} from "@/lib/site";
import { pageMetadata } from "@/lib/page-metadata";
import "../[slug]/agent-page.css";
import "./docs.css";

const URL = `${SITE_URL}/docs/`;

export const metadata = pageMetadata({
  url: URL,
  title: `${DOCS_TITLE} — install, commands, config`,
  shareTitle: DOCS_TITLE,
  description: DOCS_DESCRIPTION,
  ogType: "article",
});

export default function DocsPage() {
  const jsonLd = [
    techArticleLd({
      headline: DOCS_TITLE,
      description: DOCS_DESCRIPTION,
      url: URL,
      dateModified: PAGE_UPDATED.docs,
      free: true,
      about: {
        "@type": "SoftwareApplication",
        name: "anotifier",
        softwareVersion: VERSION,
        applicationCategory: "DeveloperApplication",
        operatingSystem: "macOS, Windows, Linux",
        url: `${SITE_URL}/`,
        downloadUrl: NPM_URL,
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      },
    }),
    faqPageLd(DOCS_FAQ),
    breadcrumbListLd([
      { name: "anotifier", url: `${SITE_URL}/` },
      { name: "Docs", url: URL },
    ]),
  ];

  return (
    <DocShell crumb="docs">
      <JsonLd data={jsonLd} />
      <header style={{ paddingTop: "28px" }}>
        <div className="kicker">[ REFERENCE · v{VERSION} ]</div>
        <h1>
          anotifier <em>documentation</em>.
        </h1>
        <p className="sub">
          Everything the package does, in one page: install, the setup wizard,
          every command, every config key, the agents and events it hooks, the
          channels it delivers to, and what happens when something fails.
        </p>
        <div className="install">
          <span className="d">$</span> {INSTALL_CMD}
          <CopyButton text={INSTALL_CMD} placement="docs_hero" />
        </div>
        <p className="docMeta">
          Updated {PAGE_UPDATED.docs} for v{VERSION} ·{" "}
          <a href={`${SITE_URL}/llms-full.txt`}>plain-text version for LLMs</a>{" "}
          · <a href={`${GITHUB_URL}#readme`}>README on GitHub</a>
        </p>
      </header>

      <div className="docLayout">
        <aside className="docToc" aria-label="On this page">
          <div className="kicker">[ ON THIS PAGE ]</div>
          <ol>
            {DOCS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`}>{s.title}</a>
              </li>
            ))}
            <li>
              <a href="#faq">FAQ</a>
            </li>
          </ol>
        </aside>

        <div className="docBody">
          {DOCS.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              <p className="lead">
                <Inline text={s.lead} />
              </p>
              <Blocks blocks={s.blocks} />
              {s.children?.map((c) => (
                <div key={c.id} id={c.id}>
                  <h3>{c.title}</h3>
                  <Blocks blocks={c.blocks} />
                </div>
              ))}
            </section>
          ))}

          <section id="faq" className="faq">
            <h2>Frequently asked questions</h2>
            {DOCS_FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div className="a">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </section>

          <section id="next">
            <h2>Where next?</h2>
            <p className="lead">
              Per-agent setup guides, a comparison with the alternatives, and
              the source.
            </p>
            <div className="docCtaRow">
              <Link href="/guides/" className="primary">
                Setup guides
              </Link>
              <Link href="/compare/" className="secondary">
                Compare alternatives
              </Link>
              <a href={GITHUB_URL} className="secondary">
                GitHub
              </a>
              <a
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="secondary community"
              >
                <DiscordIcon size={16} />
                Join our Discord
              </a>
              <a href={SUPPORT_URL} className="support">
                ♥ Support the project
              </a>
            </div>
          </section>
        </div>
      </div>
    </DocShell>
  );
}
