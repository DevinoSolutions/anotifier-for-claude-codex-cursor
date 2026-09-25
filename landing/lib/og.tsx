import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import LogoMark from "@/components/LogoMark";

/**
 * Per-page share images, rendered once at build time by the opengraph-image.tsx
 * files (static export: each becomes a PNG under out/). Same look as the home
 * page's public/og.png: logo, a mono kicker, the page's own headline and
 * description, the agent icons it is about, and its URL.
 *
 * Fonts are committed WOFF files (Inter, JetBrains Mono; both SIL OFL 1.1)
 * because next/og only bundles a regular-weight Noto Sans.
 */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const ROOT = process.cwd();
const ALL_AGENT_ICONS = ["claude", "codex", "cursor", "gemini"].map(
  (n) => `/assets/icons/${n}.png`,
);

async function dataUri(publicPath: string): Promise<string> {
  const buf = await readFile(join(ROOT, "public", ...publicPath.split("/")));
  return `data:image/png;base64,${buf.toString("base64")}`;
}

/** The description, cut to what fits in two lines at 27px (~130 chars): the
    first sentence when it fits, else a word-boundary cut with an ellipsis.
    The full text is on the page itself. */
function twoLines(text: string): string {
  const max = 130;
  if (text.length <= max) return text;
  const first = /^.+?[.!?](?=\s|$)/.exec(text)?.[0];
  if (first && first.length <= max) return first;
  return `${text
    .slice(0, max - 1)
    .replace(/\s+\S*$/, "")
    .replace(/[\s,;:.]+$/, "")}…`;
}

export interface OgCard {
  /** Mono kicker above the headline, e.g. "GUIDE · CLAUDE CODE". */
  kicker: string;
  title: string;
  description: string;
  /** Icon paths under public/ ("/assets/icons/claude.png"); all agents by default. */
  icons?: string[];
  /** Site path shown bottom right, e.g. "/guides/". */
  path: string;
}

export async function renderOg({
  kicker,
  title,
  description,
  icons = ALL_AGENT_ICONS,
  path,
}: OgCard): Promise<ImageResponse> {
  const [bold, regular, mono, iconSrcs] = await Promise.all([
    readFile(join(ROOT, "assets/og/inter-700.woff")),
    readFile(join(ROOT, "assets/og/inter-400.woff")),
    readFile(join(ROOT, "assets/og/jetbrains-mono-500.woff")),
    Promise.all(icons.map(dataUri)),
  ]);
  // the logo already says anotifier
  const headline = title.replace(/\s+—\s+anotifier$/, "");
  const titleSize = headline.length > 60 ? 54 : headline.length > 36 ? 62 : 72;
  const blurb = twoLines(description);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "72px 84px 64px",
        background:
          "radial-gradient(circle at 85% 0%, #10231a 0%, #0a0b0b 55%)",
        color: "#f4f4f6",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <LogoMark size={52} />
        <div
          style={{ fontFamily: "JetBrains Mono", fontSize: 26, marginTop: 2 }}
        >
          anotifier
        </div>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: 44,
          fontFamily: "JetBrains Mono",
          fontSize: 22,
          letterSpacing: "0.12em",
          color: "#59d499",
        }}
      >
        {`[ ${kicker} ]`}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 18,
          fontSize: titleSize,
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
        }}
      >
        {headline}
      </div>
      <div
        style={{
          display: "flex",
          marginTop: 22,
          fontSize: 27,
          lineHeight: 1.45,
          color: "#9c9c9d",
          maxWidth: 1000,
        }}
      >
        {blurb}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          marginTop: "auto",
          gap: "16px",
        }}
      >
        {iconSrcs.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src.slice(-24)}
            src={src}
            alt=""
            width={52}
            height={52}
            style={{ borderRadius: 12 }}
          />
        ))}
        <div
          style={{
            display: "flex",
            marginLeft: "auto",
            fontFamily: "JetBrains Mono",
            fontSize: 24,
            color: "#59d499",
          }}
        >
          {`anotifier.io${path === "/" ? "" : path}`}
        </div>
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: [
        { name: "Inter", data: bold, weight: 700, style: "normal" },
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "JetBrains Mono", data: mono, weight: 500, style: "normal" },
      ],
    },
  );
}
