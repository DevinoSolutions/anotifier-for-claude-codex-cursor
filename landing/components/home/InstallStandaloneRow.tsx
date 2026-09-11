"use client";

import { useEffect, useState } from "react";
import CopyButton from "./CopyButton";

const codeStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: "13px",
  color: "#f4f4f6",
  flex: 1,
  minWidth: "200px",
  overflowX: "auto",
  whiteSpace: "nowrap",
};

const CURL =
  "curl -fsSL https://raw.githubusercontent.com/DevinoSolutions/anotifier-for-claude-codex-cursor/main/setup/install.sh | bash";
const IRM =
  "irm https://raw.githubusercontent.com/DevinoSolutions/anotifier-for-claude-codex-cursor/main/setup/install.ps1 | iex";

function detectPlat(): string {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return "macos";
}

/** Standalone install row: platform dropdown swaps between the curl (unix) and
    irm (windows) one-liners. Defaults to "macos" on first render so the SSR and
    hydrated markup agree, then auto-detects the real platform after mount. */
export default function InstallStandaloneRow() {
  const [platform, setPlatform] = useState<string>("macos");

  useEffect(() => {
    setPlatform(detectPlat());
  }, []);

  const isWin = platform === "windows";

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "12px",
        background: "#0d0d0d",
        border: "1px solid #242728",
        borderRadius: "10px",
        padding: "14px 18px",
      }}
    >
      <select
        onChange={(e) => setPlatform(e.target.value)}
        value={platform}
        aria-label="Standalone install platform"
        style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: "11px",
          color: "#cdcdcd",
          background: "#101111",
          border: "1px solid #242728",
          borderRadius: "6px",
          padding: "6px 6px",
          width: "110px",
          flex: "none",
          cursor: "pointer",
        }}
      >
        <option value="macos">macos ▾</option>
        <option value="linux">linux ▾</option>
        <option value="windows">windows ▾</option>
      </select>
      {isWin ? (
        <>
          <code style={codeStyle}>{IRM}</code>
          <CopyButton text={IRM} />
        </>
      ) : (
        <>
          <code style={codeStyle}>{CURL}</code>
          <CopyButton text={CURL} />
        </>
      )}
    </div>
  );
}
