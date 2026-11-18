import "./home.css";
import Background from "@/components/home/Background";
import Nav from "@/components/home/Nav";
import Hero from "@/components/home/Hero";
import DemoVideo from "@/components/home/DemoVideo";
import SupportedTools from "@/components/home/SupportedTools";
import Features from "@/components/home/Features";
import HowItWorks from "@/components/home/HowItWorks";
import Install from "@/components/home/Install";
import TestChannels from "@/components/home/TestChannels";
import Proof from "@/components/home/Proof";
import Faq from "@/components/home/Faq";
import FinalCta from "@/components/home/FinalCta";
import Footer from "@/components/home/Footer";
import JsonLd from "@/components/JsonLd";
import SoundProvider from "@/components/home/SoundProvider";
import { faqPageNode } from "@/lib/jsonld";
import {
  COMMUNITY_URL,
  GITHUB_URL,
  NPM_URL,
  SITE_URL,
  VERSION,
} from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#org`,
      name: "DevinoSolutions",
      url: "https://github.com/DevinoSolutions",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo.png`,
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "anotifier",
      url: `${SITE_URL}/`,
      publisher: { "@id": `${SITE_URL}/#org` },
    },
    {
      "@type": "SoftwareApplication",
      name: "anotifier",
      softwareVersion: VERSION,
      operatingSystem: "macOS, Windows, Linux",
      applicationCategory: "DeveloperApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      downloadUrl: NPM_URL,
      installUrl: `${SITE_URL}/docs/#install`,
      softwareHelp: {
        "@type": "CreativeWork",
        url: `${SITE_URL}/docs/`,
      },
      url: `${SITE_URL}/`,
      image: `${SITE_URL}/logo.png`,
      author: { "@id": `${SITE_URL}/#org` },
      sameAs: [GITHUB_URL, NPM_URL, COMMUNITY_URL],
      description:
        "Notifications for AI coding agents: desktop toasts, phone push, and webhooks for Claude Code, Codex CLI, Cursor, and Gemini CLI.",
    },
    faqPageNode([
      {
        q: "Is my code or conversation sent anywhere?",
        a: "No. Everything runs locally with zero external packages. Push notifications go through ntfy with rich content off by default — on the public ntfy.sh server your phone only ever sees “task complete”, never what the agent said. Enable rich push only if you run a private ntfy server. Version 1.3.0 and later can also send opt-in anonymous usage stats (never message text, paths or topics), off unless you say yes.",
      },
      {
        q: "What does setup actually touch?",
        a: "It wires hooks into each tool's own config — Claude Code, Codex, Cursor, Gemini CLI — and keeps one shared config at ~/.anotifier/config.json. Every original config is backed up before it's touched.",
      },
      {
        q: "Can a broken notification break my agent?",
        a: "No — hook errors never interrupt the agent. Failures land in errors.log and show up in anotifier status, so a misconfigured channel is a logged error, not a hung session.",
      },
      {
        q: "How do I get rid of it?",
        a: "anotifier uninstall removes only the hooks anotifier manages, restores your statusline (1.5.0 and later), and leaves your own hooks untouched. It copies each config to ~/.anotifier/backups before editing it; those backups stay there for you to keep or delete.",
      },
      {
        q: "Where is the full documentation?",
        a: "Every command, config key, event, and channel is documented at https://anotifier.io/docs/, with per-agent setup guides at https://anotifier.io/guides/ and a comparison with alternatives at https://anotifier.io/compare/. A plain-text mirror for LLMs lives at https://anotifier.io/llms-full.txt.",
      },
    ]),
  ],
};

export default function Home() {
  return (
    <SoundProvider>
      <JsonLd data={jsonLd} />
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          background: "#07080a",
          overflowX: "clip",
        }}
      >
        <Background />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Nav />
          <main>
            <Hero />
            <DemoVideo />
            <SupportedTools />
            <Features />
            <HowItWorks />
            <Install />
            <TestChannels />
            <Proof />
            <Faq />
            <FinalCta />
          </main>
          <Footer />
        </div>
      </div>
    </SoundProvider>
  );
}
