import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENTS, getAgent } from "@/lib/agents";
import { GUIDES } from "@/lib/guides";
import LogoMark from "@/components/LogoMark";
import "./agent-page.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return AGENTS.map((agent) => ({ slug: agent.slug }));
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

const chLink: React.CSSProperties = {
  color: "var(--green)",
  textDecoration: "underline",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) return {};

  const url = `https://anotifier.io/${agent.slug}/`;
  return {
    title: agent.title,
    description: agent.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "anotifier",
      url,
      title: agent.title,
      description: agent.description,
      images: [{ url: "/og.png?v=3", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: agent.title,
      description: agent.description,
      images: ["/og.png?v=3"],
    },
  };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const agent = getAgent(slug);
  if (!agent) notFound();

  const url = `https://anotifier.io/${agent.slug}/`;
  const others = AGENTS.filter((a) => a.slug !== agent.slug);
  const guide = GUIDES.find((g) => g.agentSlug === agent.slug);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "anotifier",
      operatingSystem: "macOS, Windows, Linux",
      applicationCategory: "DeveloperApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://anotifier.io/",
      sameAs: [
        "https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor",
        "https://www.npmjs.com/package/anotifier",
      ],
      description: agent.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: agent.faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: stripTags(f.aHtml) },
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
          item: "https://anotifier.io/",
        },
        { "@type": "ListItem", position: 2, name: agent.name, item: url },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <nav>
        <div className="wrap">
          <Link href="/" style={{ display: "inline-flex" }}>
            <LogoMark size={28} />
          </Link>
          <Link href="/" className="brand">
            anotifier
          </Link>
          <div className="links">
            <Link href="/">Home</Link>
            <a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/anotifier">npm</a>
          </div>
        </div>
      </nav>

      <div className="wrap">
        <header>
          <div className="crumb">
            <Link href="/">anotifier</Link> / <span>{agent.slug}</span>
          </div>
          <div className="hero-row">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={agent.icon}
              alt={`${agent.name} logo`}
              width={56}
              height={56}
            />
            <h1>
              {agent.h1.pre}
              <em>{agent.h1.em}</em>
              {agent.h1.post}
            </h1>
          </div>
          <p className="sub">{agent.sub}</p>
          <div className="install">
            <span className="d">$</span> npx anotifier@latest setup
          </div>
          {agent.extraInstall && (
            <p
              className="alt-install"
              dangerouslySetInnerHTML={{ __html: agent.extraInstall }}
            />
          )}
        </header>

        <section>
          <div className="kicker">[ HOW IT HOOKS IN ]</div>
          <h2>Wired into {agent.name} itself.</h2>
          <p className="lede">{agent.hooksIntro}</p>
          {agent.hooks.map((hook, i) => (
            <div className="hook" key={i}>
              <code className="ev">{hook.event}</code>
              <span className="what">{hook.what}</span>
              <span className="how">{hook.how}</span>
            </div>
          ))}
        </section>

        <section>
          <div className="kicker">[ CHANNELS ]</div>
          <h2>Every channel you&apos;d actually use.</h2>
          <div className="channels">
            <div className="ch">
              <span className="tag">[+]</span> <b>Desktop toasts</b> macOS,
              Windows, Linux + WSL routing.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Phone push</b> Android &amp;
              iOS via{" "}
              <Link href="/phone/" style={chLink}>
                ntfy
              </Link>{" "}
              — no account.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Webhooks</b>{" "}
              <Link href="/slack/" style={chLink}>
                Slack
              </Link>
              ,{" "}
              <Link href="/discord/" style={chLink}>
                Discord
              </Link>
              ,{" "}
              <Link href="/telegram/" style={chLink}>
                Telegram
              </Link>
              , any HTTP endpoint.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Terminal bell</b> An audible
              ding in the source terminal.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Click-to-focus</b> Jump
              straight back to the right window.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Zero dependencies</b> Pure
              Node.js, one shared config.
            </div>
          </div>
        </section>

        <section>
          <div className="kicker">[ FAQ ]</div>
          <h2>{agent.name} questions, answered.</h2>
          {agent.faqs.map((faq, i) => (
            <details key={i}>
              <summary>{faq.q}</summary>
              <div
                className="a"
                dangerouslySetInnerHTML={{ __html: faq.aHtml }}
              />
            </details>
          ))}
        </section>

        <section>
          <div className="kicker">[ ALSO WORKS WITH ]</div>
          <h2>One config, every agent.</h2>
          <div className="others">
            {others.map((other) => (
              <Link href={`/${other.slug}/`} key={other.slug}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={other.icon} alt="" width={20} height={20} />
                {other.name}
              </Link>
            ))}
          </div>
          {guide && (
            <p className="cta">
              Step by step, every method compared:{" "}
              <Link
                href={`/guides/${guide.slug}/`}
                style={{ color: "var(--green)", textDecoration: "underline" }}
              >
                {guide.h1}
              </Link>
              . Every command and config key is in the{" "}
              <Link
                href="/docs/"
                style={{ color: "var(--green)", textDecoration: "underline" }}
              >
                docs
              </Link>
              .
            </p>
          )}
          <p className="cta">
            Full feature tour, demo video, and install options on the{" "}
            <Link
              href="/"
              style={{ color: "var(--green)", textDecoration: "underline" }}
            >
              anotifier home page
            </Link>
            .
          </p>
        </section>
      </div>

      <footer>
        <div className="wrap">
          <div>
            <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
              <LogoMark size={24} />
            </span>
            {" "} © 2026{" "}
            <a href="https://github.com/DevinoSolutions">DevinoSolutions</a> ·
            AGPL-3.0
          </div>
          <div style={{ display: "flex", gap: "18px" }}>
            <a href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor">
              github
            </a>
            <a href="https://www.npmjs.com/package/anotifier">npm</a>
            <a href="https://ntfy.sh">ntfy</a>
          </div>
        </div>
      </footer>
    </>
  );
}
