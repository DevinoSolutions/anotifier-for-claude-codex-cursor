import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://anotifier.io"),
  title: "anotifier — never miss when your AI finishes",
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
    title: "anotifier — never miss when your AI finishes",
    description:
      "Desktop toasts, phone push, and webhooks for Claude Code, Codex, Cursor, and Gemini CLI. One tool, one config — stop staring at your terminal.",
    images: [{ url: "/og.png?v=3", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "anotifier — never miss when your AI finishes",
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
      <body>
        {children}
        <GoogleAnalytics />
      </body>
    </html>
  );
}
