"use client";

import { useLayoutEffect, useState } from "react";
import { GITHUB_REPO, GITHUB_URL } from "@/lib/site";
import { track } from "@/lib/track";

/* Live stargazer count, cached per tab for an hour. Every StarButton on the
   page shares one in-flight request (the home page renders three), so a
   visitor clicking around costs one GitHub API call per hour; the
   unauthenticated limit is 60/hour per IP. Until the count arrives, or if the
   call fails, the button still reads "Star": it never shows a made-up number. */
const CACHE_KEY = "anotifier:stars";
const CACHE_MS = 60 * 60 * 1000;

const compact = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function formatCount(n: number): string {
  return compact.format(n).toLowerCase();
}

function readCache(): number | null {
  try {
    const cached = JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? "null");
    if (typeof cached?.n !== "number" || typeof cached.at !== "number") {
      return null;
    }
    const age = Date.now() - cached.at;
    return age >= 0 && age < CACHE_MS ? cached.n : null;
  } catch {
    return null; // unreadable or blocked storage: fetch instead
  }
}

// One request per page load, shared by every button. A failure (rate limit,
// offline) resolves to null and is not retried until the next full load.
let starsRequest: Promise<number | null> | null = null;

function loadStars(): Promise<number | null> {
  starsRequest ??= fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
    headers: { accept: "application/vnd.github+json" },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      const n = data?.stargazers_count;
      if (typeof n !== "number") return null;
      try {
        sessionStorage.setItem(
          CACHE_KEY,
          JSON.stringify({ n, at: Date.now() }),
        );
      } catch {
        // storage blocked: the count still shows on this page
      }
      return n;
    })
    .catch(() => null);
  return starsRequest;
}

function useStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  // Layout effect so a cached count is in place before the first paint and
  // the button does not visibly grow on every page load.
  useLayoutEffect(() => {
    const cached = readCache();
    if (cached !== null) {
      setStars(cached);
      return;
    }
    let alive = true;
    void loadStars().then((n) => {
      if (alive && n !== null) setStars(n);
    });
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
  placement = variant,
}: {
  variant?: "nav" | "large";
  label?: string;
  /** Where the button sits, sent with the star_click analytics event. */
  placement?: string;
}) {
  const stars = useStars();
  const nav = variant === "nav";
  const count =
    stars === null ? "" : `${stars} ${stars === 1 ? "star" : "stars"}`;
  // No aria-label: the accessible name is the visible text plus a visually
  // hidden tail, so it always contains what is on screen (voice control can
  // say "click Star 28") and still says what the button does.
  const unit = stars === null ? "" : ` ${stars === 1 ? "star" : "stars"}`;
  const tail = nav ? `${unit}, anotifier on GitHub` : unit;
  return (
    <a
      href={GITHUB_URL}
      className={nav ? "starBtn navStar" : "starBtn"}
      title={
        count
          ? `Star anotifier on GitHub (${count})`
          : "Star anotifier on GitHub"
      }
      onClick={() => track("star_click", { placement })}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: nav ? "6px" : "8px",
        background: "#101111",
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
      {tail && <span className="srOnly">{tail}</span>}
    </a>
  );
}
