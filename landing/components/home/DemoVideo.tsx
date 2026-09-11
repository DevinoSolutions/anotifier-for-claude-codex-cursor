"use client";

import { useEffect, useRef, useState } from "react";

/** The YouTube embed is heavy (~1MB of scripts), so it only mounts once the
    section actually scrolls near the viewport — keeps it out of the critical
    load path while preserving the muted-autoplay behaviour on scroll. */
export default function DemoVideo() {
  const frameRef = useRef<HTMLDivElement>(null);
  const [showVideo, setShowVideo] = useState(false);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setShowVideo(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShowVideo(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

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
        ref={frameRef}
        style={{
          position: "relative",
          border: "1px solid #242728",
          borderRadius: "16px",
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
          <div
            style={{ width: "100%", aspectRatio: "16/9" }}
            aria-hidden="true"
          />
        )}
      </div>
    </section>
  );
}
