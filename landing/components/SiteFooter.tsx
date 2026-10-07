import Link from "next/link";
import LogoMark from "@/components/LogoMark";
import { AGENTS } from "@/lib/agents";
import { CHANNELS } from "@/lib/channels";
import { GITHUB_URL, NPM_URL, SUPPORT_URL } from "@/lib/site";

/**
 * Footer for every page except home. The second row links each agent and
 * channel page, so they are reachable from the docs and guides Google already
 * crawls rather than from the home page alone.
 */
export default function SiteFooter() {
  return (
    <footer>
      <div className="wrap">
        <div>
          <span style={{ display: "inline-flex", verticalAlign: "middle" }}>
            <LogoMark size={24} />
          </span>{" "}
          © 2026{" "}
          <a href="https://github.com/DevinoSolutions">DevinoSolutions</a> ·
          AGPL-3.0
        </div>
        <div style={{ display: "flex", gap: "18px", flexWrap: "wrap" }}>
          <Link href="/docs/">docs</Link>
          <Link href="/guides/">guides</Link>
          <Link href="/compare/">compare</Link>
          <a href={GITHUB_URL}>github</a>
          <a href={NPM_URL}>npm</a>
          <a href={SUPPORT_URL}>♥ support</a>
        </div>
        <div className="siteDir">
          <span>agents:</span>
          {AGENTS.map((a) => (
            <Link href={`/${a.slug}/`} key={a.slug}>
              {a.name}
            </Link>
          ))}
          <span>channels:</span>
          {CHANNELS.map((c) => (
            <Link href={`/${c.slug}/`} key={c.slug}>
              {c.name}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
