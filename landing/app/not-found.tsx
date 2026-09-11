import type { Metadata } from "next";
import Link from "next/link";
import LogoMark from "@/components/LogoMark";

export const metadata: Metadata = {
  title: "Not found — anotifier",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "22px",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <LogoMark size={56} />
      <div
        style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: "13px",
          color: "#59d499",
          letterSpacing: "0.14em",
        }}
      >
        [ 404 · NO SIGNAL ]
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(28px,4vw,44px)",
          fontWeight: 600,
          letterSpacing: "-0.5px",
          color: "#f4f4f6",
        }}
      >
        This page never fired.
      </h1>
      <p
        style={{
          margin: 0,
          color: "#9c9c9d",
          maxWidth: "44ch",
          lineHeight: 1.6,
        }}
      >
        The URL you followed doesn&apos;t exist. Your agents, however, are still
        being watched.
      </p>
      <Link
        href="/"
        style={{
          background: "#ffffff",
          color: "#000000",
          fontSize: "14px",
          fontWeight: 500,
          padding: "10px 20px",
          borderRadius: "8px",
        }}
      >
        Back to anotifier
      </Link>
    </main>
  );
}
