import type { ReactNode } from "react";
import BrandIcon, { type IconName } from "./BrandIcon";

type Feature = { title: string; icon: IconName; body: ReactNode };

// The four ways an alert reaches you get the large cards; what rides along
// with them is a plainer row underneath, so the section has two levels.
const channels: Feature[] = [
  {
    title: "desktop toasts",
    icon: "desktop",
    body: "BurntToast on Windows, Notification Center on macOS, libnotify on Linux. WSL routes to real Windows toasts — no Linux daemon needed.",
  },
  {
    title: "phone push",
    icon: "phone",
    body: (
      <>
        Android &amp; iOS via ntfy — free, no account. All your agents&apos;
        notifications in one stream, wherever you wandered off to.
      </>
    ),
  },
  {
    title: "webhooks",
    icon: "link",
    body: "Slack, Discord, Telegram, or any HTTP endpoint — with an optional auth header. Payload shaped per format.",
  },
  {
    title: "terminal bell",
    icon: "terminal",
    body: "An audible ding in the terminal that launched the agent. Works over SSH, in tmux, and in GNU screen.",
  },
];

const extras: Feature[] = [
  {
    title: "rich content",
    icon: "lines",
    body: (
      <>
        Toasts show what Claude actually said or asked — read from the
        transcript — not a generic &quot;task complete&quot; line.
      </>
    ),
  },
  {
    title: "approval alerts",
    icon: "approval",
    body: "Get pinged the instant Codex asks permission to run a command — not twenty minutes later when you check back.",
  },
  {
    title: "click-to-focus",
    icon: "focus",
    body: "Click the toast to jump straight back to the terminal or VS Code window that fired it (Windows).",
  },
  {
    title: "zero dependencies",
    icon: "cube",
    body: (
      <>
        Pure Node.js built-ins, no npm production packages. One shared config at{" "}
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#cdcdcd",
          }}
        >
          ~/.anotifier/config.json
        </span>
        .
      </>
    ),
  },
];

const titleStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: "13px",
  color: "#f4f4f6",
};

const bodyStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: 1.6,
  color: "#9c9c9d",
};

export default function Features() {
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
        [03] features
      </div>
      <h2
        style={{
          margin: "0 0 32px",
          fontSize: "clamp(26px,3.4vw,38px)",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "#f4f4f6",
        }}
      >
        Every channel you&apos;d actually use.
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "16px",
        }}
      >
        {channels.map((f) => (
          <div
            key={f.title}
            className="hovBorder"
            style={{
              background: "#0d0d0d",
              border: "1px solid #242728",
              borderRadius: "12px",
              padding: "24px",
              transition: "border-color 0.2s",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "44px",
                height: "44px",
                marginBottom: "20px",
                color: "#59d499",
                background: "#101111",
                border: "1px solid #242728",
                borderRadius: "10px",
              }}
            >
              <BrandIcon name={f.icon} size={24} />
            </span>
            <div style={{ ...titleStyle, marginBottom: "8px" }}>{f.title}</div>
            <div style={bodyStyle}>{f.body}</div>
          </div>
        ))}
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))",
          gap: "28px 32px",
          marginTop: "40px",
          paddingTop: "32px",
          borderTop: "1px solid #17181b",
        }}
      >
        {extras.map((f) => (
          <div key={f.title}>
            <div
              style={{
                ...titleStyle,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                marginBottom: "8px",
              }}
            >
              <span style={{ color: "#59d499", display: "flex" }}>
                <BrandIcon name={f.icon} size={18} />
              </span>
              {f.title}
            </div>
            <div style={bodyStyle}>{f.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
