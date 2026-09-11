import CopyButton from "./CopyButton";
import InstallStandaloneRow from "./InstallStandaloneRow";

const rowStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: "12px",
  background: "#0d0d0d",
  border: "1px solid #242728",
  borderRadius: "10px",
  padding: "14px 18px",
};

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: "13px",
  color: "#f4f4f6",
  flex: 1,
  minWidth: "200px",
  overflowX: "auto",
  whiteSpace: "nowrap",
};

const labelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  width: "110px",
  flex: "none",
};

const NPX = "npx anotifier@latest setup";
const PLUGIN_MARKETPLACE =
  "/plugin marketplace add DevinoSolutions/anotifier-for-claude-codex-cursor";
const PLUGIN_INSTALL = "/plugin install anotifier@anotifier";

export default function Install() {
  return (
    <section
      id="install"
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
        [05] install
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
        Thirty seconds, any platform.
      </h2>
      <p
        style={{
          margin: "0 0 32px",
          fontSize: "16px",
          lineHeight: 1.6,
          color: "#9c9c9d",
          maxWidth: "62ch",
        }}
      >
        Run it, restart your AI tools, done. Uninstall removes only the hooks
        anotifier manages and leaves your own hooks untouched.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={rowStyle}>
          <span style={labelStyle}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "24px",
                height: "24px",
                background: "#cb3837",
                borderRadius: "5px",
                fontFamily: "var(--font-mono-stack)",
                fontSize: "7.5px",
                fontWeight: 700,
                color: "#ffffff",
              }}
            >
              npm
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono-stack)",
                fontSize: "11px",
                color: "#838a92",
              }}
            >
              npm
            </span>
          </span>
          <code style={codeStyle}>{NPX}</code>
          <CopyButton text={NPX} />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            <img
              src="/assets/icons/claude.png"
              alt=""
              width="24"
              height="24"
              style={{ borderRadius: "5px" }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono-stack)",
                fontSize: "11px",
                color: "#838a92",
              }}
            >
              plugin 1/2
            </span>
          </span>
          <code style={codeStyle}>{PLUGIN_MARKETPLACE}</code>
          <CopyButton text={PLUGIN_MARKETPLACE} />
        </div>
        <div style={rowStyle}>
          <span style={labelStyle}>
            <img
              src="/assets/icons/claude.png"
              alt=""
              width="24"
              height="24"
              style={{ borderRadius: "5px" }}
            />
            <span
              style={{
                fontFamily: "var(--font-mono-stack)",
                fontSize: "11px",
                color: "#838a92",
              }}
            >
              plugin 2/2
            </span>
          </span>
          <code style={codeStyle}>{PLUGIN_INSTALL}</code>
          <CopyButton text={PLUGIN_INSTALL} />
        </div>
        <InstallStandaloneRow />
        <div
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "11px",
            color: "#7d838a",
          }}
        >
          standalone install — platform auto-detected, switch via the dropdown
        </div>
      </div>
    </section>
  );
}
