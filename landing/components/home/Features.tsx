import type { ReactNode } from "react";

const iconBase = {
  xmlns: "http://www.w3.org/2000/svg",
  width: "16",
  height: "16",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "#59d499",
  strokeWidth: "1.6",
  style: { marginLeft: "auto", opacity: 0.9 } as React.CSSProperties,
} as const;

const features: { title: string; icon: ReactNode; body: ReactNode }[] = [
  {
    title: "[+] desktop toasts",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
        <path d="M10.3 21a2 2 0 0 0 3.4 0" />
      </svg>
    ),
    body: "BurntToast on Windows, Notification Center on macOS, libnotify on Linux. WSL routes to real Windows toasts — no Linux daemon needed.",
  },
  {
    title: "[+] phone push ",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <rect x="7" y="2" width="10" height="20" rx="2.5" />
        <path d="M11 18.5h2" />
      </svg>
    ),
    body: (
      <>
        Android &amp; iOS via ntfy — free, no account. All your agents&apos;
        notifications in one stream, wherever you wandered off to.
      </>
    ),
  },
  {
    title: "[+] webhooks ",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="2.5" />
        <circle cx="6" cy="12" r="2.5" />
        <circle cx="18" cy="19" r="2.5" />
        <path d="M8.2 10.9l7.6-4.4M8.2 13.1l7.6 4.4" />
      </svg>
    ),
    body: "Slack, Discord, Telegram, or any HTTP endpoint — with an optional auth header. Payload shaped per format.",
  },
  {
    title: "[+] rich content ",
    icon: (
      <svg {...iconBase} strokeLinecap="round">
        <path d="M4 6h16M4 10h16M4 14h10M4 18h7" />
      </svg>
    ),
    body: (
      <>
        Toasts show what Claude actually said or asked — read from the
        transcript — not a generic &quot;task complete&quot; line.
      </>
    ),
  },
  {
    title: "[+] approval alerts ",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l8 3.5V12c0 4.8-3.4 8.3-8 10-4.6-1.7-8-5.2-8-10V5.5z" />
        <path d="M12 8v4.5" />
        <path d="M12 15.5v.01" />
      </svg>
    ),
    body: "Get pinged the instant Codex asks permission to run a command — not twenty minutes later when you check back.",
  },
  {
    title: "[+] terminal bell ",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l11-2v13" />
        <circle cx="6.5" cy="18" r="2.5" />
        <circle cx="17.5" cy="16" r="2.5" />
      </svg>
    ),
    body: "An audible ding in the terminal that launched the agent. Works over SSH, in tmux, and in GNU screen.",
  },
  {
    title: "[+] click-to-focus ",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 3l7.5 18 2.2-7.8L21.5 11z" />
      </svg>
    ),
    body: "Click the toast to jump straight back to the terminal or VS Code window that fired it (Windows).",
  },
  {
    title: "[+] zero dependencies ",
    icon: (
      <svg {...iconBase} strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8l-9-5-9 5v8l9 5 9-5z" />
        <path d="M3 8l9 5 9-5M12 13v9" />
      </svg>
    ),
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
          gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))",
          gap: "16px",
        }}
      >
        {features.map((f) => (
          <div
            key={f.title}
            className="hovCard"
            style={{
              background: "#0d0d0d",
              border: "1px solid #242728",
              borderRadius: "10px",
              padding: "22px",
              transition: "border-color 0.2s, transform 0.2s",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-mono-stack)",
                fontSize: "13px",
                color: "#59d499",
                marginBottom: "10px",
              }}
            >
              {f.title}
              {f.icon}
            </div>
            <div
              style={{ fontSize: "14px", lineHeight: 1.6, color: "#9c9c9d" }}
            >
              {f.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
