"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";

const questionBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: "14px",
  width: "100%",
  background: "none",
  border: "none",
  padding: "16px 0",
  cursor: "pointer",
  textAlign: "left",
};

const gutterStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: "13px",
  color: "#59d499",
  flex: "none",
};

const questionStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "16px",
  fontWeight: 500,
  color: "#f4f4f6",
};

const answerStyle: React.CSSProperties = {
  padding: "0 0 18px 33px",
  fontSize: "14px",
  lineHeight: 1.7,
  color: "#9c9c9d",
  maxWidth: "60ch",
  animation: "deliverPop 0.25s ease-out both",
};

const items: { q: string; a: ReactNode }[] = [
  {
    q: "Is my code or conversation sent anywhere?",
    a: (
      <>
        No. Everything runs locally with zero external packages. Push
        notifications go through ntfy with rich content{" "}
        <em style={{ fontStyle: "normal", color: "#cdcdcd" }}>
          off by default
        </em>{" "}
        — on the public ntfy.sh server your phone only ever sees &quot;task
        complete&quot;, never what the agent said. Enable rich push only if you
        run a private ntfy server.
      </>
    ),
  },
  {
    q: "What does setup actually touch?",
    a: (
      <>
        It wires hooks into each tool&apos;s own config — Claude Code, Codex,
        Cursor, Gemini CLI — and keeps one shared config at{" "}
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#cdcdcd",
          }}
        >
          ~/.anotifier/config.json
        </span>
        . Every original config is backed up before it&apos;s touched.
      </>
    ),
  },
  {
    q: "Can a broken notification break my agent?",
    a: (
      <>
        No — hook errors never interrupt the agent. Failures land in{" "}
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#cdcdcd",
          }}
        >
          errors.log
        </span>{" "}
        and show up in{" "}
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#cdcdcd",
          }}
        >
          anotifier status
        </span>
        , so a misconfigured channel is a logged error, not a hung session.
      </>
    ),
  },
  {
    q: "How do I get rid of it?",
    a: (
      <>
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#cdcdcd",
          }}
        >
          anotifier uninstall
        </span>{" "}
        removes only the hooks anotifier manages and leaves your own hooks
        untouched. It copies each config to ~/.anotifier/backups before editing
        it; those backups stay there for you to keep or delete.
      </>
    ),
  },
  {
    q: "Where is the full documentation?",
    a: (
      <>
        Every command, config key, event, and channel is on the{" "}
        <Link
          href="/docs/"
          style={{ color: "#59d499", textDecoration: "underline" }}
        >
          docs page
        </Link>
        , with per-agent setup{" "}
        <Link
          href="/guides/"
          style={{ color: "#59d499", textDecoration: "underline" }}
        >
          guides
        </Link>{" "}
        and a{" "}
        <Link
          href="/compare/"
          style={{ color: "#59d499", textDecoration: "underline" }}
        >
          comparison with the alternatives
        </Link>
        . A plain-text mirror for LLMs lives at /llms-full.txt.
      </>
    ),
  },
];

export default function Faq() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section
      style={{ maxWidth: "1160px", margin: "0 auto", padding: "0 24px 96px" }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: "13px",
          color: "#838a92",
          marginBottom: "10px",
        }}
      >
        [08] faq
      </div>
      <h2
        style={{
          margin: "0 0 24px",
          fontSize: "clamp(26px,3.4vw,38px)",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "#f4f4f6",
        }}
      >
        The questions you&apos;d ask.
      </h2>
      <div style={{ maxWidth: "760px", borderTop: "1px solid #242728" }}>
        {items.map((item, i) => (
          <div key={i} style={{ borderBottom: "1px solid #17181b" }}>
            <button
              type="button"
              onClick={() => setOpen((s) => (s === i ? null : i))}
              style={questionBtn}
            >
              <span style={gutterStyle}>{open === i ? "[−]" : "[+]"}</span>
              <span style={questionStyle}>{item.q}</span>
            </button>
            {open === i && <div style={answerStyle}>{item.a}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}
