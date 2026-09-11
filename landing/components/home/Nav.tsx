import Link from "next/link";
import LogoMark from "../LogoMark";
import { GITHUB_URL, SUPPORT_URL } from "@/lib/site";

const linkStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 500,
  color: "#9c9c9d",
};

export default function Nav() {
  return (
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        background: "rgba(7,8,10,0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderBottom: "1px solid #17181b",
      }}
    >
      <div
        className="navBar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: "1160px",
          margin: "0 auto",
        }}
      >
        <a
          href="#top"
          style={{ display: "flex", alignItems: "center", gap: "10px" }}
        >
          <LogoMark size={32} />
          <span
            style={{
              fontFamily: "var(--font-mono-stack)",
              fontSize: "14px",
              fontWeight: 500,
              color: "#f4f4f6",
            }}
          >
            anotifier
          </span>
        </a>
        <div
          className="navLinks"
          style={{ display: "flex", alignItems: "center" }}
        >
          <Link href="/docs/" style={linkStyle}>
            Docs
          </Link>
          <a href={GITHUB_URL} style={linkStyle}>
            GitHub
          </a>
          <a
            href={SUPPORT_URL}
            className="navSupport"
            style={{ ...linkStyle, color: "#f4a6bd", whiteSpace: "nowrap" }}
            title="Support anotifier's development"
          >
            ♥ Support
          </a>
          <a
            href="#install"
            className="hovWhite navCta"
            style={{
              background: "#ffffff",
              color: "#000000",
              fontSize: "14px",
              fontWeight: 500,
              borderRadius: "8px",
              whiteSpace: "nowrap",
              flex: "none",
            }}
          >
            Get started
          </a>
        </div>
      </div>
    </nav>
  );
}
