import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Blocks from "@/components/docs/Blocks";
import DocShell from "@/components/docs/DocShell";
import Inline from "@/components/docs/Inline";
import { GUIDES, getGuide } from "@/lib/guides";
import {
  CONTENT_UPDATED,
  GITHUB_URL,
  INSTALL_CMD,
  SITE_URL,
  SUPPORT_URL,
} from "@/lib/site";
import "../../[slug]/agent-page.css";
import "../../docs/docs.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const url = `${SITE_URL}/guides/${guide.slug}/`;
  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "anotifier",
      url,
      title: guide.title,
      description: guide.description,
      images: [{ url: "/og.png?v=3", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: ["/og.png?v=3"],
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const url = `${SITE_URL}/guides/${guide.slug}/`;
  const others = GUIDES.filter((g) => g.slug !== guide.slug);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: guide.h1,
      description: guide.description,
      url,
      dateModified: CONTENT_UPDATED,
      inLanguage: "en",
      isAccessibleForFree: true,
      author: {
        "@type": "Organization",
        name: "DevinoSolutions",
        url: "https://github.com/DevinoSolutions",
      },
      publisher: { "@id": `${SITE_URL}/#org` },
      about: { "@type": "SoftwareApplication", name: guide.agentName },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: guide.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
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
        {
          "@type": "ListItem",
          position: 2,
          name: "Guides",
          item: `${SITE_URL}/guides/`,
        },
        { "@type": "ListItem", position: 3, name: guide.agentName, item: url },
      ],
    },
  ];

  return (
    <DocShell crumb={`guides / ${guide.slug}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header style={{ paddingTop: "28px" }}>
        <div className="kicker">
          [ GUIDE · {guide.agentName.toUpperCase()} ]
        </div>
        <div className="hero-row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={guide.icon}
            alt={`${guide.agentName} logo`}
            width={56}
            height={56}
          />
          <h1>{guide.h1}</h1>
        </div>
        <p className="sub">
          <Inline text={guide.intro} />
        </p>
        <p className="docMeta">
          Updated {CONTENT_UPDATED} · also see the{" "}
          <Link href={`/${guide.agentSlug}/`}>{guide.agentName} overview</Link>{" "}
          and the <Link href="/docs/">full docs</Link>
        </p>
      </header>

      <div className="docLayout">
        <aside className="docToc" aria-label="On this page">
          <div className="kicker">[ ON THIS PAGE ]</div>
          <ol>
            {guide.sections.map((s) => (
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
          {guide.sections.map((s) => (
            <section key={s.id} id={s.id}>
              <h2>{s.title}</h2>
              <Blocks blocks={s.blocks} />
            </section>
          ))}

          <section id="faq" className="faq">
            <h2>{guide.agentName} notification questions</h2>
            {guide.faqs.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div className="a">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </section>

          <section id="next">
            <h2>Try it</h2>
            <p className="lead">
              One command wires {guide.agentName} and every other agent you have
              installed.
            </p>
            <pre data-lang="bash">
              <code>{INSTALL_CMD}</code>
            </pre>
            <div className="docCtaRow">
              <Link href="/docs/" className="primary">
                Read the docs
              </Link>
              <a href={GITHUB_URL} className="secondary">
                GitHub
              </a>
              <a href={SUPPORT_URL} className="support">
                ♥ Support the project
              </a>
            </div>
            <h3>Other guides</h3>
            <div className="others">
              {others.map((o) => (
                <Link href={`/guides/${o.slug}/`} key={o.slug}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={o.icon} alt="" width={20} height={20} />
                  {o.agentName}
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </DocShell>
  );
}
