import type { Metadata } from "next";
import localFont from "next/font/local";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PostHog from "@/components/PostHog";
import "./globals.css";

const inter = localFont({
  src: "./fonts/Inter-latin-variable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: "./fonts/JetBrainsMono-latin-variable.woff2",
  weight: "100 800",
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://anotifier.io"),
  title: "anotifier: Claude Code, Codex, Cursor & Gemini Notifications",
  description:
    "Desktop toasts, phone push, and Slack, Discord or Telegram alerts when Claude Code, Codex CLI, Cursor, or Gemini CLI finishes or needs input. Free, one command.",
  keywords: [
    "Claude Code notifications",
    "Claude Code notification when done",
    "Codex CLI notifications",
    "Cursor agent notifications",
    "Gemini CLI notifications",
    "AI coding agent notifications",
    "Claude Code hooks",
    "ntfy Claude Code",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg?v=2", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "32x32", type: "image/x-icon" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  alternates: { canonical: "./" },
  openGraph: {
    type: "website",
    siteName: "anotifier",
    url: "https://anotifier.io/",
    title: "anotifier: Claude Code, Codex, Cursor & Gemini Notifications",
    description:
      "Desktop toasts, phone push, and webhooks for Claude Code, Codex, Cursor, and Gemini CLI. One tool, one config — stop staring at your terminal.",
    images: [{ url: "/og.png?v=3", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "anotifier: Claude Code, Codex, Cursor & Gemini Notifications",
    description:
      "Get pinged the moment your AI coding agent finishes or needs you — Claude Code, Codex, Cursor, Gemini CLI.",
    images: ["/og.png?v=3"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* The star button fetches its count right after hydration. */}
        <link
          rel="preconnect"
          href="https://api.github.com"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {children}
        <GoogleAnalytics />
        <PostHog />
      </body>
    </html>
  );
}
