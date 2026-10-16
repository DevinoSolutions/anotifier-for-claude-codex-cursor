"use client";

import { useState } from "react";
import { track } from "@/lib/track";

/** The demo video loads only when the visitor presses play: until then the page
    makes no request to YouTube and shows a self-hosted placeholder of the same
    16:9 size, so nothing moves when the player appears. Playing starts the
    video muted (the copy below says so). The click is also the demo_video_click
    analytics event. */
export default function DemoVideo() {
  const [showVideo, setShowVideo] = useState(false);

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
        [01] demo
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
        Watch it work. Sound on.
      </h2>
      <p
        style={{
          margin: "0 0 28px",
          fontSize: "16px",
          lineHeight: 1.6,
          color: "#9c9c9d",
          maxWidth: "62ch",
        }}
      >
        The full flow on a real machine — agent runs, toast fires, phone buzzes.
        Playing muted; unmute for the terminal bell.
      </p>
      <div
        style={{
          position: "relative",
          border: "1px solid #242728",
          borderRadius: "12px",
          overflow: "hidden",
          background: "#0d0d0d",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "11px 16px",
            borderBottom: "1px solid #1a1b1e",
          }}
        >
          <span
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "9999px",
              background: "#ff6157",
            }}
          />
          <span
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "9999px",
              background: "#febc2e",
            }}
          />
          <span
            style={{
              width: "11px",
              height: "11px",
              borderRadius: "9999px",
              background: "#28c840",
            }}
          />
          <span
            style={{
              marginLeft: "10px",
              fontFamily: "var(--font-mono-stack)",
              fontSize: "12px",
              color: "#838a92",
            }}
          >
            demo.mp4 — anotifier
          </span>
          <span
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontFamily: "var(--font-mono-stack)",
              fontSize: "11px",
              color: "#59d499",
            }}
          >
            <span
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "9999px",
                background: "#59d499",
              }}
            />{" "}
            live
          </span>
        </div>
        {showVideo ? (
          <iframe
            src="https://www.youtube-nocookie.com/embed/QVVOIIud4-I?autoplay=1&mute=1&loop=1&playlist=QVVOIIud4-I&controls=1&modestbranding=1&rel=0&playsinline=1"
            title="anotifier demo"
            style={{
              display: "block",
              width: "100%",
              aspectRatio: "16/9",
              border: "none",
            }}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          />
        ) : (
          <button
            type="button"
            className="demoPlay"
            onClick={() => {
              track("demo_video_click");
              setShowVideo(true);
            }}
          >
            <span className="demoPlayIcon" aria-hidden="true">
              ▶
            </span>
            <span>Play the demo video</span>
            <span className="demoPlayNote">
              Loads from youtube-nocookie.com when you press play
            </span>
          </button>
        )}
      </div>
    </section>
  );
}
