import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AGENTS } from "@/lib/agents";
import { CHANNELS, getChannel } from "@/lib/channels";
import LogoMark from "@/components/LogoMark";

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

export function buildChannelMetadata(slug: string): Metadata {
  const channel = getChannel(slug);
  if (!channel) return {};

  const url = `https://anotifier.io/${channel.slug}/`;
  return {
    title: channel.title,
    description: channel.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      siteName: "anotifier",
      url,
      title: channel.title,
      description: channel.description,
      images: [{ url: "/og.png?v=3", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: channel.title,
      description: channel.description,
      images: ["/og.png?v=3"],
    },
  };
}

export default function ChannelPage({ slug }: { slug: string }) {
  const channel = getChannel(slug);
  if (!channel) notFound();

  const url = `https://anotifier.io/${channel.slug}/`;
  const others = CHANNELS.filter((c) => c.slug !== channel.slug);

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
      description: channel.description,
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: channel.faqs.map((f) => ({
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
        { "@type": "ListItem", position: 2, name: channel.name, item: url },
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
            <Link href="/">anotifier</Link> / <span>{channel.slug}</span>
          </div>
          <div className="hero-row">
            <h1>
              {channel.h1.pre}
              <em>{channel.h1.em}</em>
              {channel.h1.post}
            </h1>
          </div>
          <p className="sub">{channel.sub}</p>
          <div className="install">
            <span className="d">$</span> npx anotifier@latest setup
          </div>
        </header>

        <section>
          <div className="kicker">[ SET UP {channel.name.toUpperCase()} ]</div>
          <h2>Wired up in a minute.</h2>
          <p
            className="lede"
            dangerouslySetInnerHTML={{ __html: channel.setupIntro }}
          />
          {channel.steps.map((step, i) => (
            <div className="hook" key={i}>
              <code className="ev">{step.label}</code>
              <span
                className="how"
                dangerouslySetInnerHTML={{ __html: step.text }}
              />
            </div>
          ))}
        </section>

        <section>
          <div className="kicker">[ CONFIG ]</div>
          <h2>One block in your config.</h2>
          <p className="lede">
            anotifier reads a single JSON file at{" "}
            <code
              style={{
                fontFamily: "var(--font-mono-stack)",
                color: "var(--green)",
              }}
            >
              ~/.anotifier/config.json
            </code>
            . Drop this in and every supported agent uses it.
          </p>
          <pre
            style={{
              background: "#0d0d0d",
              border: "1px solid #242728",
              borderRadius: "10px",
              padding: "16px 18px",
              fontFamily: "var(--font-mono-stack)",
              fontSize: "13px",
              lineHeight: 1.7,
              color: "var(--ink)",
              overflowX: "auto",
              margin: "18px 0 0",
            }}
          >
            <code>{channel.config}</code>
          </pre>
          {channel.kind === "webhook" && (
            <p className="alt-install">
              Need auth? Add{" "}
              <code>
                &quot;authorization&quot;: &quot;Bearer &lt;token&gt;&quot;
              </code>{" "}
              to the webhook block and anotifier sends it as the{" "}
              <code>Authorization</code> header.
            </p>
          )}
        </section>

        {channel.kind === "webhook" ? (
          <section>
            <div className="kicker">[ SAFE BY DEFAULT ]</div>
            <h2>Your webhook is a secret, and stays one.</h2>
            <div className="channels">
              <div className="ch">
                <span className="tag">[+]</span> <b>Secrets stay secret</b>{" "}
                Webhook URLs and bot tokens are never logged in full — only the
                URL&apos;s origin is recorded on failure.
              </div>
              <div className="ch">
                <span className="tag">[+]</span> <b>Never in the way</b>{" "}
                Delivery errors go to <code>~/.anotifier/errors.log</code> and
                never interrupt or slow the agent.
              </div>
              <div className="ch">
                <span className="tag">[+]</span> <b>Per-event off switch</b>{" "}
                Silence a single event with{" "}
                <code>events.task_complete.webhookEnabled: false</code>.
              </div>
              <div className="ch">
                <span className="tag">[+]</span> <b>Rich Claude Code content</b>{" "}
                Webhooks can carry what Claude actually said; other agents get
                generic text.
              </div>
            </div>
          </section>
        ) : (
          <section>
            <div className="kicker">[ PRIVATE BY DEFAULT ]</div>
            <h2>Your phone buzzes, your content stays put.</h2>
            <div className="channels">
              <div className="ch">
                <span className="tag">[+]</span> <b>Generic text by default</b>{" "}
                <code>ntfy.richContent</code> is off, so on the public ntfy.sh
                server your phone only sees text like &quot;task complete&quot;.
              </div>
              <div className="ch">
                <span className="tag">[+]</span> <b>Rich push, your server</b>{" "}
                Turn on rich content only on a private ntfy server you control.
              </div>
              <div className="ch">
                <span className="tag">[+]</span> <b>Urgent when it matters</b>{" "}
                Per-event priority drives push priority; &quot;needs input&quot;
                defaults to urgent.
              </div>
              <div className="ch">
                <span className="tag">[+]</span> <b>One stream, every tool</b>{" "}
                All your agents&apos; alerts land in a single subscribed topic.
              </div>
            </div>
          </section>
        )}

        <section>
          <div className="kicker">[ FAQ ]</div>
          <h2>{channel.name} questions, answered.</h2>
          {channel.faqs.map((faq, i) => (
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
          <div className="kicker">[ WORKS WITH EVERY AGENT ]</div>
          <h2>One config, every agent.</h2>
          <p className="lede">
            anotifier routes the same {channel.name} notification from every
            agent it supports:
          </p>
          <div className="others">
            {AGENTS.map((agent) => (
              <Link href={`/${agent.slug}/`} key={agent.slug}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={agent.icon} alt="" width={20} height={20} />
                {agent.name} notifications
              </Link>
            ))}
          </div>
        </section>

        <section>
          <div className="kicker">[ ALSO SEND TO ]</div>
          <h2>Prefer a different destination?</h2>
          <p className="lede">
            anotifier can post the same alerts to{" "}
            {others.map((other, i) => (
              <span key={other.slug}>
                {i > 0 && (i === others.length - 1 ? ", or " : ", ")}
                <Link
                  href={`/${other.slug}/`}
                  style={{ color: "var(--green)", textDecoration: "underline" }}
                >
                  {other.name.toLowerCase()}
                </Link>
              </span>
            ))}
            .
          </p>
          <p className="cta">
            Every config key for this channel is in the{" "}
            <Link
              href={`/docs/#channel-${channel.kind === "ntfy" ? "ntfy" : "webhook"}`}
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
