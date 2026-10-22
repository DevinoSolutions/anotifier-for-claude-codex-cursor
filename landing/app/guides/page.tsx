import type { Metadata } from "next";
import Link from "next/link";
import DocShell from "@/components/docs/DocShell";
import { GUIDES, GUIDES_DESCRIPTION, GUIDES_TITLE } from "@/lib/guides";
import { CHANNELS } from "@/lib/channels";
import { SITE_URL } from "@/lib/site";
import "../[slug]/agent-page.css";
import "../docs/docs.css";

const URL = `${SITE_URL}/guides/`;
const TITLE = GUIDES_TITLE;
const DESCRIPTION = GUIDES_DESCRIPTION;

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
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

type Part = string | { href: string; text: string };

const AGENT_GROUPS = [
  {
    name: "Claude Code",
    slugs: [
      "claude-code-notifications",
      "claude-code-permission-notifications",
      "claude-code-usage-limit-notifications",
      "claude-code-auto-compact-warning",
      "ccnotify",
    ],
  },
  { name: "Codex CLI", slugs: ["codex-cli-notifications"] },
  { name: "Cursor", slugs: ["cursor-agent-notifications"] },
  { name: "Gemini CLI", slugs: ["gemini-cli-notifications"] },
  { name: "Antigravity CLI", slugs: ["antigravity-cli-notifications"] },
];
const SOUND_SLUGS = [
  "claude-code-notification-sound",
  "codex-notification-sound",
];
const PHONE_SLUGS = ["ntfy-phone-notifications"];
const PLATFORM_SLUGS = [
  "windows-wsl-notifications",
  "wsl-notify-send",
  "macos-linux-notifications",
];
const HOOKS_SLUGS = ["agent-hooks-explained", "claude-code-hooks-security"];
const TROUBLE_SLUGS = ["notifications-not-working"];

const GROUPED = new Set([
  ...AGENT_GROUPS.flatMap((g) => g.slugs),
  ...SOUND_SLUGS,
  ...PHONE_SLUGS,
  ...PLATFORM_SLUGS,
  ...HOOKS_SLUGS,
  ...TROUBLE_SLUGS,
]);

const FAQ: { q: string; a: Part[] }[] = [
  {
    q: "My agent finishes while I am in another window. Where do I start?",
    a: [
      "Open the guide for your agent, such as ",
      { href: "/guides/claude-code-notifications/", text: "Claude Code" },
      ", ",
      { href: "/guides/codex-cli-notifications/", text: "Codex CLI" },
      " or ",
      { href: "/guides/gemini-cli-notifications/", text: "Gemini CLI" },
      ". Each one lists the built-in option first, then the hook route.",
    ],
  },
  {
    q: "I want a ping on my phone when I am away from my desk.",
    a: [
      "Follow the ",
      {
        href: "/guides/ntfy-phone-notifications/",
        text: "ntfy phone push guide",
      },
      ". To post into a team chat instead, set up a ",
      { href: "/discord/", text: "Discord webhook" },
      ".",
    ],
  },
  {
    q: "I use Windows with WSL and no toast appears.",
    a: [
      "Read ",
      {
        href: "/guides/windows-wsl-notifications/",
        text: "Windows and WSL notifications",
      },
      ", then ",
      { href: "/guides/wsl-notify-send/", text: "the WSL toast guide" },
      ", which covers several options, and one of them calls powershell.exe with nothing extra to install.",
    ],
  },
  {
    q: "I only want a sound, not a banner.",
    a: [
      "Use the ",
      {
        href: "/guides/claude-code-notification-sound/",
        text: "Claude Code sound guide",
      },
      " or the guide to ",
      { href: "/guides/codex-notification-sound/", text: "making Codex ding" },
      ".",
    ],
  },
  {
    q: "Everything is set up but nothing arrives.",
    a: [
      "Run anotifier doctor, then work through the ",
      {
        href: "/guides/notifications-not-working/",
        text: "troubleshooting guide",
      },
      " in order.",
    ],
  },
];

function GuideList({ slugs }: { slugs: string[] }) {
  const guides = slugs
    .map((s) => GUIDES.find((g) => g.slug === s))
    .filter((g): g is (typeof GUIDES)[number] => Boolean(g));
  return (
    <ul>
      {guides.map((g) => (
        <li key={g.slug}>
          <Link href={`/guides/${g.slug}/`}>{g.h1}</Link>
          {": "}
          {g.description}
        </li>
      ))}
    </ul>
  );
}

function MoreGuides() {
  const rest = GUIDES.filter((g) => !GROUPED.has(g.slug)).map((g) => g.slug);
  if (rest.length === 0) return null;
  return (
    <section>
      <h2>More guides</h2>
      <GuideList slugs={rest} />
    </section>
  );
}
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
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.a.map((x) => (typeof x === "string" ? x : x.text)).join(""),
        },
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
          yourself, a phone push over ntfy, and the one-command setup. Plus
          per-platform setup, how the hooks work, and what to check when a
          notification doesn&apos;t arrive.
        </p>
      </header>

      <div className="docBody">
        <section>
          <h2>How the guides are organised</h2>
          <p>
            The guides are grouped by what you are trying to do. Start with the
            guide for your agent. If you already know the piece you need, such
            as a sound, a phone alert or a Windows fix, jump to that group.
            Running <code>npx anotifier@latest setup</code> once wires every
            agent it detects, each in its own hook file, and the guides explain
            what it wrote and how to change it.
          </p>
          <p>
            Agents that run inside an editor are covered too. Claude Code and
            Codex CLI both work from VS Code&apos;s integrated terminal, and
            Claude Code also runs as an extension, so see{" "}
            <Link href="/vscode/">anotifier in VS Code</Link> for what the hooks
            do there. Gemini CLI has its own page at{" "}
            <Link href="/gemini-cli/">Gemini CLI notifications</Link> with the
            hook events and config it uses.
          </p>
        </section>

        <section>
          <h2>By agent</h2>
          <p>
            One main guide per agent covers the built-in option, the hooks you
            can write yourself and the one-command setup. Claude Code has the
            most follow-up guides.
          </p>
          {AGENT_GROUPS.map((group) => (
            <div key={group.name}>
              <h3>{group.name}</h3>
              <GuideList slugs={group.slugs} />
            </div>
          ))}
        </section>

        <section>
          <h2>Sound</h2>
          <p>
            If you only want to hear when the agent is done, these two guides
            show the built-in bell and the hook that plays a sound, and how to
            turn each off.
          </p>
          <GuideList slugs={SOUND_SLUGS} />
        </section>

        <section>
          <h2>Phone and channels</h2>
          <p>
            For alerts away from your desk, a phone push over ntfy needs no
            account. To post into a team chat instead, wire a webhook once:{" "}
            <Link href="/discord/">Discord webhook alerts</Link> take one URL
            from a channel&apos;s settings, and the{" "}
            <Link href="/phone/">phone page</Link> covers the push route.
          </p>
          <GuideList slugs={PHONE_SLUGS} />
        </section>

        <section>
          <h2>Platform</h2>
          <p>
            Toasts depend on the operating system. On Windows and WSL the
            question is which PowerShell sends the toast; inside WSL,{" "}
            <Link href="/guides/wsl-notify-send/">
              showing a Windows toast from WSL with or without wsl-notify-send
            </Link>{" "}
            is the shortest path. On macOS and Linux it comes down to
            Notification Center permissions and <code>notify-send</code>.
          </p>
          <GuideList slugs={PLATFORM_SLUGS} />
        </section>

        <section>
          <h2>Hooks and security</h2>
          <p>
            Every alert is a hook, a command the agent runs on an event. Read
            how the events differ per agent, and audit what your hooks are
            allowed to do.
          </p>
          <GuideList slugs={HOOKS_SLUGS} />
        </section>

        <section>
          <h2>Troubleshooting</h2>
          <p>
            When nothing arrives, work through the checks in order, starting
            with <code>anotifier doctor</code>.
          </p>
          <GuideList slugs={TROUBLE_SLUGS} />
        </section>

        <section>
          <h2>Which guide do I need?</h2>
          {FAQ.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>
                {f.a.map((part, i) =>
                  typeof part === "string" ? (
                    part
                  ) : (
                    <Link key={i} href={part.href}>
                      {part.text}
                    </Link>
                  ),
                )}
              </p>
            </div>
          ))}
        </section>

        <MoreGuides />
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
