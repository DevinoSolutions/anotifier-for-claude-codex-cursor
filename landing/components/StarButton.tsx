"use client";

import { useEffect, useState } from "react";
import { GITHUB_REPO, GITHUB_URL } from "@/lib/site";

/* Live stargazer count, cached per tab for an hour so a visitor clicking
   around the site costs one GitHub API call (the unauthenticated limit is
   60/hour per IP). Until the count arrives, or if the call fails, the button
   still reads "Star": it never shows a made-up number. */
const CACHE_KEY = "anotifier:stars";
const CACHE_MS = 60 * 60 * 1000;

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "")}k`;
}

function useStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    try {
      const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
      if (cached && Date.now() - cached.at < CACHE_MS) {
        setStars(cached.n);
        return;
      }
    } catch {
      // unreadable cache: fall through and fetch
    }
    let alive = true;
    fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
      headers: { accept: "application/vnd.github+json" },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const n = data?.stargazers_count;
        if (!alive || typeof n !== "number") return;
        setStars(n);
        try {
          sessionStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ n, at: Date.now() }),
          );
        } catch {
          // storage blocked: the count still shows on this page
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return stars;
}

const StarIcon = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="#f5c451"
    aria-hidden="true"
    style={{ flex: "none" }}
  >
    <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
  </svg>
);

/**
 * "Star on GitHub" call to action with the live star count.
 * - `nav`: compact pill for the sticky header (the word hides on small phones).
 * - `large`: hero and final-CTA size.
 */
export default function StarButton({
  variant = "large",
  label = "Star on GitHub",
}: {
  variant?: "nav" | "large";
  label?: string;
}) {
  const stars = useStars();
  const nav = variant === "nav";
  const title =
    stars === null
      ? "Star anotifier on GitHub"
      : `Star anotifier on GitHub (${stars} stars)`;
  return (
    <a
      href={GITHUB_URL}
      className={nav ? "hovBorder starBtn navStar" : "hovBorder starBtn"}
      title={title}
      aria-label={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: nav ? "6px" : "8px",
        background: "#101111",
        border: "1px solid #2e3033",
        borderRadius: "8px",
        color: "#f4f4f6",
        fontSize: nav ? "13px" : "14px",
        fontWeight: 500,
        padding: nav ? "6px 10px" : "10px 18px",
        whiteSpace: "nowrap",
        flex: "none",
        textDecoration: "none",
      }}
    >
      <StarIcon size={nav ? 13 : 15} />
      <span className="starLabel">{nav ? "Star" : label}</span>
      {stars !== null && (
        <span
          className="starCount"
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: nav ? "12px" : "13px",
            color: "#c9cacc",
            borderLeft: "1px solid #2e3033",
            paddingLeft: nav ? "7px" : "9px",
          }}
        >
          {formatCount(stars)}
        </span>
      )}
    </a>
  );
}
