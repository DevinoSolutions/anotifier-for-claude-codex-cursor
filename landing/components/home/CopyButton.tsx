"use client";

import { useRef, useState } from "react";
import { track } from "@/lib/track";

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

type CopyState = "idle" | "copied" | "failed";

const STATUS: Record<CopyState, string> = {
  idle: "",
  copied: "Copied to clipboard",
  failed: "Copy failed, select the text instead",
};

/** Copies `text` to the clipboard and reports the real outcome for ~1.6s: a ✓
    only once the write has resolved, a ✕ when the clipboard is unavailable
    (insecure origin, denied permission). `block` is the variant pinned to the
    corner of a docs/guides code block, which says the result in the button.
    Every click sends a copy_command analytics event with the outcome. */
export default function CopyButton({
  text,
  placement = "home",
  block = false,
}: {
  text: string;
  /** Where the button sits, sent with the copy_command analytics event. */
  placement?: string;
  block?: boolean;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onClick = async () => {
    let result: CopyState = "copied";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      result = "failed";
    }
    setState(result);
    track("copy_command", {
      placement,
      result,
      // GA4 drops event parameter values past 100 characters
      command: text.slice(0, 100),
    });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  };

  const status = (
    // <output> is an implicit role="status" live region
    <output className="srOnly">{STATUS[state]}</output>
  );

  if (block) {
    return (
      <>
        <button
          type="button"
          onClick={onClick}
          className={`codeCopy${state === "idle" ? "" : ` ${state}`}`}
        >
          {state === "idle" ? "copy" : state}
        </button>
        {status}
      </>
    );
  }

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
      {state !== "idle" && (
        <span
          aria-hidden="true"
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: state === "copied" ? "#59d499" : "#ff6157",
          }}
        >
          {state === "copied" ? "✓" : "✕"}
        </span>
      )}
      {status}
    </>
  );
}
