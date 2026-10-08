import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENTS, getAgent } from "@/lib/agents";
import { GUIDES } from "@/lib/guides";
import Blocks from "@/components/docs/Blocks";
import CodeBlock from "@/components/docs/CodeBlock";
import Inline from "@/components/docs/Inline";
import LogoMark from "@/components/LogoMark";
import SiteFooter from "@/components/SiteFooter";
import StarButton from "@/components/StarButton";
import DiscordIcon from "@/components/DiscordIcon";
import CopyButton from "@/components/home/CopyButton";
import { COMMUNITY_URL, INSTALL_CMD } from "@/lib/site";
import { stripTags } from "@/lib/strip-tags";
import "./agent-page.css";
import "../docs/docs.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return AGENTS.map((agent) => ({ slug: agent.slug }));
}

/** Every agent page ends with the same way to prove it works and to back out. */
const CHECK_CMDS = [
  "npx anotifier@latest test       # fire a test alert on every channel",
  "npx anotifier@latest status     # show which agents and channels are set up",
  "npx anotifier@latest doctor     # diagnose a channel that stays quiet",
  "npx anotifier@latest uninstall  # remove the hooks setup added",
].join("\n");

/** Topic guides that apply to every agent, listed after the agent's own guides. */
const SHARED_GUIDES = [
  "agent-hooks-explained",
  "notifications-not-working",
  "ntfy-phone-notifications",
];

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
    },
    twitter: {
      card: "summary_large_image",
      title: agent.title,
      description: agent.description,
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
  const agentGuides = GUIDES.filter((g) => g.agentSlug === agent.slug);
  const guide = agentGuides[0];
  const readMore = [
    ...agentGuides,
    ...SHARED_GUIDES.map((s) => GUIDES.find((g) => g.slug === s)).filter(
      (g) => g !== undefined,
    ),
  ];

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
            <Link href="/">Home</Link>
            <a href="https://www.npmjs.com/package/anotifier">npm</a>
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
            <span className="d">$</span> {INSTALL_CMD}
            <CopyButton text={INSTALL_CMD} placement="agent_hero" />
          </div>
          {agent.extraInstall && (
            <p
              className="alt-install"
              dangerouslySetInnerHTML={{ __html: agent.extraInstall }}
            />
          )}
          {agent.notice && (
            <p className="notice">
              <Inline text={agent.notice} />
            </p>
          )}
          {guide && (
            <p className="guide-link">
              Comparing options first?{" "}
              <Link href={`/guides/${guide.slug}/`}>{guide.h1}</Link> covers
              every method, built-in and DIY.
            </p>
          )}
        </header>

        <section>
          <div className="kicker">[ HOW IT HOOKS IN ]</div>
          <h2>Wired into {agent.name} itself.</h2>
          <p className="lede">
            <Inline text={agent.hooksIntro} />
          </p>
          {agent.hooks.map((hook, i) => (
            <div className="hook" key={i}>
              <code className="ev">{hook.event}</code>
              <span className="what">{hook.what}</span>
              <span className="how">
                <Inline text={hook.how} />
              </span>
            </div>
          ))}
        </section>

        {agent.sections.map((s) => (
          <section key={s.id} id={s.id}>
            <div className="kicker">{s.kicker}</div>
            <h2>{s.title}</h2>
            <div className="docBody">
              <Blocks blocks={s.blocks} placement="agent" />
            </div>
          </section>
        ))}

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
              <span className="tag">[+]</span> <b>Terminal bell</b> A ding in
              the terminal the agent runs in.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Click-to-focus</b> On Windows,
              a click on the toast brings the project&apos;s window forward.
            </div>
            <div className="ch">
              <span className="tag">[+]</span> <b>Zero npm dependencies</b>{" "}
              Plain Node.js 18+, one shared config.
            </div>
          </div>
        </section>

        <section id="check">
          <div className="kicker">[ CHECK IT, UNDO IT ]</div>
          <h2>Test it, then keep it or remove it.</h2>
          <div className="docBody">
            <CodeBlock code={CHECK_CMDS} lang="bash" placement="agent" />
            <p>
              <code>test</code> sends straight to your channels without going
              through {agent.name}, so it proves the channels work.{" "}
              <code>uninstall</code> removes only the entries anotifier added,
              and setup keeps a copy of every file it changes in{" "}
              <code>~/.anotifier/backups/</code>.
            </p>
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

        {readMore.length > 0 && (
          <section id="guides">
            <div className="kicker">[ GUIDES ]</div>
            <h2>Every option, explained.</h2>
            <ul className="guideList">
              {readMore.map((g) => (
                <li key={g.slug}>
                  <Link href={`/guides/${g.slug}/`}>{g.h1}</Link>
                  <span>{g.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

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
          <p className="cta">
            Every command and config key is in the{" "}
            <Link
              href="/docs/"
              style={{ color: "var(--green)", textDecoration: "underline" }}
            >
              docs
            </Link>
            .
          </p>
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

      <SiteFooter />
    </>
  );
}
