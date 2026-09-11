"use client";

import { useRef, useState } from "react";

const buttonStyle: React.CSSProperties = {
  background: "#101111",
  border: "1px solid #242728",
  borderRadius: "6px",
  color: "#9c9c9d",
  fontFamily: "var(--font-mono-stack)",
  fontSize: "12px",
  padding: "4px 10px",
  cursor: "pointer",
};

/** Copies `text` to the clipboard and shows a ✓ for ~1.6s, mirroring the
    original component's copy(key, text) behaviour. */
export default function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onClick = () => {
    try {
      navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable — ignore */
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        className="hovCopy"
        style={buttonStyle}
      >
        copy
      </button>
      {copied && (
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#59d499",
          }}
        >
          ✓
        </span>
      )}
    </>
  );
}
