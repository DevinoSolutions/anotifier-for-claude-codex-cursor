import Link from "next/link";
import LogoMark from "../LogoMark";
import { DEMO_VIDEO_URL, GITHUB_URL, NPM_URL, SUPPORT_URL } from "@/lib/site";

const primaryLinks = [
  { href: "/docs/", label: "docs", internal: true },
  { href: "/guides/", label: "guides", internal: true },
  { href: "/compare/", label: "compare", internal: true },
  { href: GITHUB_URL, label: "github" },
  { href: NPM_URL, label: "npm" },
  { href: DEMO_VIDEO_URL, label: "demo video" },
  { href: SUPPORT_URL, label: "♥ support", accent: true },
];

const seoLinks = [
  {
    href: "/guides/claude-code-notifications/",
    label: "How to get Claude Code notifications",
  },
  {
    href: "/guides/codex-cli-notifications/",
    label: "Codex CLI notifications guide",
  },
  {
    href: "/guides/cursor-agent-notifications/",
    label: "Cursor agent notifications guide",
  },
  {
    href: "/guides/gemini-cli-notifications/",
    label: "Gemini CLI notifications guide",
  },
  { href: "/claude-code/", label: "Claude Code notifications" },
  { href: "/codex/", label: "Codex CLI notifications" },
  { href: "/cursor/", label: "Cursor notifications" },
  { href: "/gemini-cli/", label: "Gemini CLI notifications" },
  { href: "/vscode/", label: "VS Code agent alerts" },
  { href: "/slack/", label: "Slack notifications" },
  { href: "/discord/", label: "Discord notifications" },
  { href: "/telegram/", label: "Telegram alerts" },
  { href: "/phone/", label: "phone push (ntfy)" },
];

export default function Footer() {
  return (
    <footer style={{ borderTop: "1px solid #17181b" }}>
      <div
        style={{
          maxWidth: "1160px",
          margin: "0 auto",
          padding: "32px 24px",
          display: "flex",
          flexWrap: "wrap",
          gap: "16px",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#838a92",
          }}
        >
          <LogoMark size={24} />© 2026{" "}
          <a
            href="https://github.com/DevinoSolutions"
            style={{ color: "#9c9c9d" }}
          >
            DevinoSolutions
          </a>{" "}
          · AGPL-3.0
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px 20px",
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
          }}
        >
          {primaryLinks.map((l) =>
            l.internal ? (
              <Link key={l.href} href={l.href} style={{ color: "#9c9c9d" }}>
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                style={{ color: l.accent ? "#f4a6bd" : "#9c9c9d" }}
              >
                {l.label}
              </a>
            ),
          )}
        </div>
        <div
          style={{
            width: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: "8px 22px",
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            paddingTop: "14px",
            marginTop: "2px",
            borderTop: "1px solid #121316",
          }}
        >
          {seoLinks.map((l) => (
            <Link key={l.href} href={l.href} style={{ color: "#838a92" }}>
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
