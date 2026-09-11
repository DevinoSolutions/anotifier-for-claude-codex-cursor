"use client";

import { useSound } from "./SoundProvider";

export default function SoundToggle() {
  const { soundOn, toggleSound } = useSound();

  return (
    <button
      type="button"
      onClick={toggleSound}
      className="hovSound"
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "9px",
        background: "#0d0d0d",
        border: "1px solid #242728",
        borderRadius: "9999px",
        padding: "7px 15px 7px 13px",
        cursor: "pointer",
        fontFamily: "var(--font-mono-stack)",
        fontSize: "11px",
        color: "#cdcdcd",
      }}
    >
      {soundOn && (
        <span
          style={{
            position: "absolute",
            left: "16px",
            top: "50%",
            width: "16px",
            height: "16px",
            margin: "-8px 0 0 -8px",
            border: "1px solid #59d499",
            borderRadius: "9999px",
            animation: "sndRing 1.6s ease-out infinite",
          }}
        />
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#59d499"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M11 5 6 9H2v6h4l5 4z" />
        {soundOn && (
          <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
        )}
      </svg>
      <span style={{ minWidth: "52px" }}>
        {soundOn ? "sound on" : "sound off"}
      </span>
    </button>
  );
}
