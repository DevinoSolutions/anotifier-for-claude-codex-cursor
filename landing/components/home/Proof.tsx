import type { ReactNode } from "react";

const rows: ReactNode[] = [
  "Real ntfy.sh round-trip — push sent, then read back off the server",
  "Linux — dunst history read-back, plus OCR of the banner's actual on-screen pixels",
  "macOS — delivery read back out of Notification Center's own SQLite database",
  "Windows — the fired toast read back out of the OS notification store (wpndatabase.db), test nonce matched in title and body",
  <>
    Real Claude, Codex &amp; Gemini CLIs installed from npm and driven end to
    end
  </>,
  "Codex approval loop proven in a live tmux TUI session — modal up, alert fired, approved, ran",
];

export default function Proof() {
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
        [07] proof
      </div>
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: "clamp(26px,3.4vw,38px)",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "#f4f4f6",
        }}
      >
        Tested against the real thing.
      </h2>
      <p
        style={{
          margin: "0 0 32px",
          fontSize: "16px",
          lineHeight: 1.6,
          color: "#9c9c9d",
          maxWidth: "64ch",
        }}
      >
        No mocks, no stubs. CI drives the real agent CLIs and reads
        notifications back out of the OS&apos;s own notification store — a
        silently-dropped toast turns CI red, not green.
      </p>
      <div
        style={{
          border: "1px solid #242728",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        {rows.map((text, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: "14px",
              alignItems: "baseline",
              padding: "14px 20px",
              borderBottom:
                i < rows.length - 1 ? "1px solid #17181b" : undefined,
              fontFamily: "var(--font-mono-stack)",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "#59d499", flex: "none" }}>[✓]</span>
            <span style={{ color: "#cdcdcd", lineHeight: 1.6 }}>{text}</span>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: "16px",
          fontFamily: "var(--font-mono-stack)",
          fontSize: "12px",
          color: "#838a92",
        }}
      >
        every job is required and hard-fails ·{" "}
        <a
          href="https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor/actions"
          style={{ color: "#9c9c9d", textDecoration: "underline" }}
        >
          live status on main →
        </a>
      </div>
    </section>
  );
}
