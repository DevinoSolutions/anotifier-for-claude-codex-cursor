const traceLine: React.CSSProperties = { whiteSpace: "nowrap" };

const channels = [
  { title: "desktop toast", sub: "Win · mac · Linux · WSL", delay: undefined },
  { title: "ntfy push", sub: "Android · iOS", delay: "0.2s" },
  { title: "webhook", sub: "Slack · Discord · TG", delay: "0.4s" },
  { title: "terminal bell", sub: "SSH · tmux · screen", delay: "0.6s" },
];

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  background: "#101111",
  border: "1px solid #242728",
  borderRadius: "6px",
  padding: "6px 12px",
  fontFamily: "var(--font-mono-stack)",
  fontSize: "11px",
  color: "#9c9c9d",
};

export default function HowItWorks() {
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
        [04] how it works
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
        A hook fires. You find out.
      </h2>
      <div
        style={{
          background: "#0d0d0d",
          border: "1px solid #242728",
          borderRadius: "16px",
          padding: "clamp(22px,4vw,40px)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "clamp(11px,1.5vw,13px)",
            lineHeight: 2.2,
            overflowX: "auto",
          }}
        >
          <div
            style={{
              ...traceLine,
              color: "#f4f4f6",
              animation: "tr1 10s infinite",
            }}
          >
            <span style={{ color: "#59d499" }}>$</span> agent finished →{" "}
            <span style={{ color: "#57c1ff" }}>Stop</span> hook fires{" "}
            <span style={{ color: "#7d838a" }}>
              (stdin JSON · --source claude)
            </span>
          </div>
          <div
            style={{
              ...traceLine,
              color: "#9c9c9d",
              animation: "tr2 10s infinite",
            }}
          >
            &nbsp;&nbsp;→ parse-input &nbsp;
            <span style={{ color: "#7d838a" }}>ok</span>
            &nbsp; normalized:{" "}
            <span style={{ color: "#59d499" }}>task_complete</span>
          </div>
          <div
            style={{
              ...traceLine,
              color: "#9c9c9d",
              animation: "tr3 10s infinite",
            }}
          >
            &nbsp;&nbsp;→ router &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
            <span style={{ color: "#7d838a" }}>ok</span>&nbsp; channels: toast ·
            ntfy · webhook · bell
          </div>
          <div
            style={{
              ...traceLine,
              color: "#9c9c9d",
              animation: "tr4 10s infinite",
            }}
          >
            &nbsp;&nbsp;→ transcript &nbsp;&nbsp;
            <span style={{ color: "#7d838a" }}>ok</span>&nbsp;{" "}
            <span style={{ color: "#cdcdcd" }}>
              &quot;refactored auth module — 14 tests passing&quot;
            </span>
          </div>
          <div
            style={{
              ...traceLine,
              color: "#59d499",
              animation: "tr5 10s infinite",
            }}
          >
            &nbsp;&nbsp;✓ delivered &nbsp;&nbsp;&nbsp;
            <span style={{ color: "#7d838a" }}>
              toast 34ms · ntfy 210ms · webhook 180ms · bell 2ms
            </span>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            margin: "18px 0 14px",
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#7d838a",
          }}
        >
          <span style={{ flex: "none" }}>fan-out ⇒</span>
          <span style={{ flex: 1, height: "1px", background: "#1a1b1e" }} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
            gap: "12px",
          }}
        >
          {channels.map((c) => (
            <div
              key={c.title}
              style={{
                border: "1px solid #242728",
                background: "#0d0d0d",
                borderRadius: "8px",
                padding: "12px 14px",
                fontFamily: "var(--font-mono-stack)",
                fontSize: "12px",
                color: "#838a92",
                animation: "chanGlow 10s infinite",
                animationDelay: c.delay,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "3px" }}>
                {c.title}
              </div>
              <div style={{ fontSize: "11px", color: "#9aa0a7" }}>{c.sub}</div>
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "10px",
            marginTop: "20px",
            paddingTop: "18px",
            borderTop: "1px solid #17181b",
          }}
        >
          <span style={chipStyle}>
            <span style={{ color: "#59d499" }}>task_complete</span> sound: IM ·
            priority: default
          </span>
          <span style={chipStyle}>
            <span style={{ color: "#ffc533" }}>needs_input</span> sound:
            Reminder · priority: urgent
          </span>
          <span style={chipStyle}>
            <span style={{ color: "#57c1ff" }}>session_start</span> priority:
            low · off by default
          </span>
        </div>
        <div
          style={{
            marginTop: "14px",
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#7d838a",
            lineHeight: 1.6,
          }}
        >
          # atomic dedup — Cursor&apos;s duplicate hook fires once, you get
          pinged once
        </div>
      </div>
    </section>
  );
}
