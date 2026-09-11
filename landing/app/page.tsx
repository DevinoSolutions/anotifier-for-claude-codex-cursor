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
import SoundProvider from "@/components/home/SoundProvider";
import { VERSION } from "@/lib/site";

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://anotifier.io/#org",
      name: "DevinoSolutions",
      url: "https://github.com/DevinoSolutions",
      logo: {
        "@type": "ImageObject",
        url: "https://anotifier.io/logo.png",
        width: 512,
        height: 512,
      },
    },
    {
      "@type": "WebSite",
      "@id": "https://anotifier.io/#website",
      name: "anotifier",
      url: "https://anotifier.io/",
      publisher: { "@id": "https://anotifier.io/#org" },
    },
    {
      "@type": "SoftwareApplication",
      name: "anotifier",
      softwareVersion: VERSION,
      operatingSystem: "macOS, Windows, Linux",
      applicationCategory: "DeveloperApplication",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      license: "https://www.gnu.org/licenses/agpl-3.0.html",
      downloadUrl: "https://www.npmjs.com/package/anotifier",
      installUrl: "https://anotifier.io/docs/#install",
      softwareHelp: {
        "@type": "CreativeWork",
        url: "https://anotifier.io/docs/",
      },
      url: "https://anotifier.io/",
      image: "https://anotifier.io/logo.png",
      author: { "@id": "https://anotifier.io/#org" },
      sameAs: [
        "https://github.com/DevinoSolutions/anotifier-for-claude-codex-cursor",
        "https://www.npmjs.com/package/anotifier",
      ],
      description:
        "Notifications for AI coding agents: desktop toasts, phone push, and webhooks for Claude Code, Codex CLI, Cursor, and Gemini CLI.",
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is my code or conversation sent anywhere?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. Everything runs locally with zero external packages. Push notifications go through ntfy with rich content off by default — on the public ntfy.sh server your phone only ever sees “task complete”, never what the agent said. Enable rich push only if you run a private ntfy server.",
          },
        },
        {
          "@type": "Question",
          name: "What does setup actually touch?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "It wires hooks into each tool's own config — Claude Code, Codex, Cursor, Gemini CLI — and keeps one shared config at ~/.anotifier/config.json. Every original config is backed up before it's touched.",
          },
        },
        {
          "@type": "Question",
          name: "Can a broken notification break my agent?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No — hook errors never interrupt the agent. Failures land in errors.log and show up in anotifier status, so a misconfigured channel is a logged error, not a hung session.",
          },
        },
        {
          "@type": "Question",
          name: "How do I get rid of it?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "anotifier uninstall removes only the hooks anotifier manages and leaves your own hooks untouched. It copies each config to ~/.anotifier/backups before editing it; those backups stay there for you to keep or delete.",
          },
        },
        {
          "@type": "Question",
          name: "Where is the full documentation?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Every command, config key, event, and channel is documented at https://anotifier.io/docs/, with per-agent setup guides at https://anotifier.io/guides/ and a comparison with alternatives at https://anotifier.io/compare/. A plain-text mirror for LLMs lives at https://anotifier.io/llms-full.txt.",
          },
        },
      ],
    },
  ],
};

export default function Home() {
  return (
    <SoundProvider>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
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
