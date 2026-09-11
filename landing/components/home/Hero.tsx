import CopyButton from "./CopyButton";
import HeroDemo from "./HeroDemo";
import SoundToggle from "./SoundToggle";
import { VERSION } from "@/lib/site";

const wireIcon: React.CSSProperties = {
  display: "inline-flex",
  width: "30px",
  height: "30px",
  alignItems: "center",
  justifyContent: "center",
  background: "#f4f4f6",
  border: "1px solid #2a2d30",
  borderRadius: "7px",
};

const chipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "7px",
  background: "#0d0d0d",
  border: "1px solid #242728",
  borderRadius: "8px",
  padding: "7px 12px",
  fontFamily: "var(--font-mono-stack)",
  fontSize: "11px",
  color: "#9c9c9d",
};

const AppleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 384 512"
    fill="#f4f4f6"
  >
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
  </svg>
);

export default function Hero() {
  return (
    <header
      className="hero"
      style={{
        maxWidth: "1160px",
        margin: "0 auto",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <div style={{ flex: "1 1 380px", minWidth: "300px" }}>
        <div
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "13px",
            color: "#9c9c9d",
            marginBottom: "20px",
          }}
        >
          <span style={{ color: "#59d499" }}>[</span> notifications for AI
          coding agents <span style={{ color: "#59d499" }}>]</span>
        </div>
        <h1
          style={{
            margin: "0 0 20px",
            fontSize: "clamp(36px,5.4vw,60px)",
            fontWeight: 600,
            lineHeight: 1.08,
            letterSpacing: "-0.5px",
            color: "#f4f4f6",
            textWrap: "pretty",
          }}
        >
          Know the moment your{" "}
          <span className="agentRoll">
            <ul>
              <li>
                <img
                  src="/assets/icons/claude.png"
                  alt="Claude Code"
                  loading="eager"
                />
                Claude
              </li>
              <li>
                <img src="/assets/icons/codex.png" alt="Codex CLI" />
                Codex
              </li>
              <li>
                <img src="/assets/icons/cursor.png" alt="Cursor" />
                Cursor
              </li>
              <li>
                <img src="/assets/icons/gemini.png" alt="Gemini CLI" />
                Gemini
              </li>
              <li aria-hidden="true">
                <img src="/assets/icons/claude.png" alt="" />
                Claude
              </li>
            </ul>
          </span>{" "}
          agent needs you.
        </h1>
        <p
          style={{
            margin: "0 0 32px",
            fontSize: "18px",
            lineHeight: 1.6,
            color: "#9c9c9d",
            maxWidth: "46ch",
            textWrap: "pretty",
          }}
        >
          Desktop toasts, phone push, and webhooks for Claude Code, Codex,
          Cursor, and Gemini CLI. One tool, one config — stop staring at your
          terminal.
        </p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flexWrap: "wrap",
          }}
        >
          <div
            className="heroInstall"
            style={{
              display: "flex",
              alignItems: "center",
              background: "#0d0d0d",
              border: "1px solid #242728",
              borderRadius: "10px",
              fontFamily: "var(--font-mono-stack)",
            }}
          >
            <span style={{ color: "#59d499" }}>$</span>
            <span style={{ color: "#f4f4f6", whiteSpace: "nowrap" }}>
              npx anotifier@latest setup
            </span>
            <CopyButton text="npx anotifier@latest setup" />
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            marginTop: "28px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono-stack)",
              fontSize: "11px",
              color: "#838a92",
              whiteSpace: "nowrap",
            }}
          >
            wires itself into
          </span>
          <span title="Claude Code" style={wireIcon}>
            <img
              src="/assets/icons/claude.png"
              alt="Claude Code"
              width="18"
              height="18"
            />
          </span>
          <span title="Codex CLI" style={wireIcon}>
            <img
              src="/assets/icons/codex.png"
              alt="Codex CLI"
              width="18"
              height="18"
            />
          </span>
          <span title="Cursor" style={wireIcon}>
            <img
              src="/assets/icons/cursor.png"
              alt="Cursor"
              width="18"
              height="18"
            />
          </span>
          <span title="Gemini CLI" style={wireIcon}>
            <img
              src="/assets/icons/gemini.png"
              alt="Gemini CLI"
              width="18"
              height="18"
            />
          </span>
          <span title="VS Code" style={wireIcon}>
            <img
              src="/assets/icons/vscode.png"
              alt="VS Code"
              width="18"
              height="18"
            />
          </span>
        </div>
        <div
          style={{
            marginTop: "16px",
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#838a92",
          }}
        >
          v{VERSION} &nbsp;·&nbsp; zero dependencies &nbsp;·&nbsp; node ≥ 18
        </div>
      </div>

      <div
        className="heroMock"
        style={{ flex: "1 1 480px", minWidth: "300px" }}
      >
        <HeroDemo />
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "14px",
            marginTop: "22px",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono-stack)",
              fontSize: "11px",
              color: "#838a92",
            }}
          >
            agent finishes <span style={{ color: "#59d499" }}>→</span> desktop
            toast <span style={{ color: "#59d499" }}>→</span> phone push
          </span>
          <SoundToggle />
        </div>
        <div
          className="heroPlatforms"
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            marginTop: "16px",
            flexWrap: "wrap",
          }}
        >
          <span style={chipStyle}>
            <AppleIcon />
            macOS
          </span>
          <span style={chipStyle}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="13"
              height="13"
              viewBox="0 0 24 24"
            >
              <path fill="#f25022" d="M0 0h11v11H0z" />
              <path fill="#7fba00" d="M13 0h11v11H13z" />
              <path fill="#00a4ef" d="M0 13h11v11H0z" />
              <path fill="#ffb900" d="M13 13h11v11H13z" />
            </svg>
            Windows
          </span>
          <span style={chipStyle}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="13"
              viewBox="0 0 24 26"
            >
              <ellipse cx="12" cy="13" rx="8" ry="10" fill="#1b1b1b" />
              <ellipse cx="12" cy="16.5" rx="5" ry="6" fill="#f7f7f7" />
              <ellipse cx="9.4" cy="9" rx="1.9" ry="2.2" fill="#fff" />
              <ellipse cx="14.6" cy="9" rx="1.9" ry="2.2" fill="#fff" />
              <circle cx="9.6" cy="9.4" r="0.9" fill="#111" />
              <circle cx="14.4" cy="9.4" r="0.9" fill="#111" />
              <path d="M10.6 11.4h2.8l-1.4 2z" fill="#f5a623" />
              <ellipse cx="8.6" cy="23.6" rx="2.4" ry="1.3" fill="#f5a623" />
              <ellipse cx="15.4" cy="23.6" rx="2.4" ry="1.3" fill="#f5a623" />
            </svg>
            Linux · WSL
          </span>
          <span
            className="heroPlatformsRule"
            style={{ width: "1px", height: "20px", background: "#242728" }}
          />
          <span style={chipStyle}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="15"
              height="12"
              viewBox="0 0 30 24"
            >
              <path
                d="M8 3l1.7 3M22 3l-1.7 3"
                stroke="#3ddc84"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path fill="#3ddc84" d="M6.5 11a8.5 8.5 0 0 1 17 0v8.5h-17z" />
              <circle cx="11" cy="9.3" r="1.2" fill="#0d0d0d" />
              <circle cx="19" cy="9.3" r="1.2" fill="#0d0d0d" />
              <rect
                x="2"
                y="11"
                width="2.6"
                height="8"
                rx="1.3"
                fill="#3ddc84"
              />
              <rect
                x="25.4"
                y="11"
                width="2.6"
                height="8"
                rx="1.3"
                fill="#3ddc84"
              />
            </svg>
            Android
          </span>
          <span style={chipStyle}>
            <AppleIcon />
            iPhone
          </span>
        </div>
      </div>
    </header>
  );
}
