import type { Metadata } from "next";
import Link from "next/link";
import DocShell from "@/components/docs/DocShell";
import { GITHUB_URL, PAGE_UPDATED, SITE_URL } from "@/lib/site";
import "../[slug]/agent-page.css";
import "../docs/docs.css";
import { PRIVACY_DESCRIPTION, PRIVACY_TITLE } from "./copy";

const URL = `${SITE_URL}/privacy/`;

export const metadata: Metadata = {
  title: PRIVACY_TITLE,
  description: PRIVACY_DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    type: "article",
    siteName: "anotifier",
    url: URL,
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: PRIVACY_TITLE,
    description: PRIVACY_DESCRIPTION,
  },
};

/* A plain description of what the site does, written from the code. Each
   sentence matches a component or a config: app/layout.tsx, components/PostHog.tsx,
   GoogleAnalytics.tsx, SentryReplay.tsx, lib/track.ts, StarButton.tsx,
   home/DemoVideo.tsx, nginx.conf.
   Change one of those and this page together. It is not legal text. */
export default function PrivacyPage() {
  return (
    <DocShell crumb="privacy">
      <header style={{ paddingTop: "28px" }}>
        <div className="kicker">[ PRIVACY ]</div>
        <h1>
          What <em>anotifier.io</em> collects.
        </h1>
        <p className="sub">
          This page describes what the anotifier.io website does. It is a plain
          description, not a legal contract.
        </p>
        <p className="docMeta">Updated {PAGE_UPDATED.privacy}</p>
      </header>

      <div className="docBody">
        <section>
          <h2>Who runs this site</h2>
          <p>
            anotifier.io is run by DevinoSolutions (Devino). Questions about
            this page: <a href="mailto:hello@devino.ca">hello@devino.ca</a>, or{" "}
            <a href={`${GITHUB_URL}/issues`}>open an issue on GitHub</a>.
          </p>
          <p>
            The site has no accounts, no sign-in and no forms. Its pages are
            served through Cloudflare, which passes your request on to the
            server that hosts the site.
          </p>
          <p>
            The anotifier command-line tool is a separate program. Its optional
            usage stats are described in the{" "}
            <Link href="/docs/#usage-stats">documentation</Link>.
          </p>
        </section>

        <section id="loaded">
          <h2>What loads on every visit</h2>
          <p>
            The site loads PostHog (analytics and session replay), Google
            Analytics and Sentry (session replay and error monitoring) for every
            visitor. It does not ask first, and it has no setting to turn them
            off. The sections below describe what each one does.
          </p>
        </section>

        <section id="analytics">
          <h2>Analytics</h2>
          <h3>PostHog</h3>
          <ul>
            <li>PostHog is hosted by Devino itself, at posthog.devino.ca.</li>
            <li>
              Your browser talks to anotifier.io/_t/n4q, and the site&apos;s
              server forwards those requests to PostHog without your cookies.
            </li>
            <li>
              It records a page view each time you open a page, including when
              you move between pages without a full reload.
            </li>
            <li>
              It records three events of the site&apos;s own:{" "}
              <code>copy_command</code> when you press a copy button (where the
              button sits, whether the copy worked, and the first 100 characters
              of the copied text), <code>star_click</code> when you press a Star
              on GitHub button (where the button sits), and{" "}
              <code>demo_video_click</code> when you press the play button on
              the home page&apos;s demo video.
            </li>
            <li>
              Every PostHog event also records the page address, your referrer,
              your browser and operating system, device type, language, time
              zone and screen size. Page views also record the page title.
            </li>
            <li>
              Pressing a copy button also creates an anonymous PostHog profile
              for you. It keeps where you first arrived from: the referrer, the
              first page address, any UTM tags and any advertising click ids.
            </li>
            <li>
              The site&apos;s code does not identify anyone or link a profile to
              a name, an email or an account.
            </li>
            <li>
              PostHog is set to discard visitor IP addresses. That is a setting
              in the PostHog project, not in the site&apos;s code.
            </li>
            <li>
              The website&apos;s events and the anotifier command-line
              tool&apos;s opt-in usage stats go to the same PostHog project. The
              command-line stats are described in the{" "}
              <Link href="/docs/#usage-stats">documentation</Link>.
            </li>
            <li>
              Autocapture, heatmaps, dead-click capture, exception capture,
              performance capture, page-leave events and surveys are switched
              off.
            </li>
            <li>
              PostHog keeps an anonymous browser id in a cookie or in local
              storage on your device.
            </li>
          </ul>

          <h3>Google Analytics</h3>
          <ul>
            <li>
              Google Analytics 4 loads from anotifier.io/gx4t/, which the
              site&apos;s own server fetches from Google, instead of from a
              Google address.
            </li>
            <li>
              It records page views and the same three events, with the same
              details as above except your time zone.
            </li>
            <li>
              It also records the automatic events switched on in the Google
              Analytics property, a setting of the property and not of the
              site&apos;s code. Today these are scrolls, outbound link clicks,
              file downloads, form interactions, site searches (read from the
              page address), video engagement and page changes within the site.
            </li>
            <li>
              Its measurements go to anotifier.io/gx4t/g/collect. The
              site&apos;s server passes them on to Google without your cookies
              and without any request header that carries your IP address, so
              the connection Google sees comes from the server. The page
              address, your browser details and the identifier below are part of
              each measurement.
            </li>
            <li>
              Google signals and ad personalisation are switched off in the
              site&apos;s code.
            </li>
            <li>
              Google Analytics keeps an identifier in a cookie on your device.
            </li>
          </ul>
        </section>

        <section id="replay">
          <h2>Session replay</h2>
          <ul>
            <li>
              PostHog records a sample of visits as session recordings. The
              sampling rate, 10%, is a setting in the PostHog project, not in
              the site&apos;s code.
            </li>
            <li>
              Sentry records 10% of visits as session replays, and also records
              every visit in which an error happens.
            </li>
            <li>
              A recording lets Devino replay the page as it looked during your
              visit.
            </li>
            <li>
              The site has no text fields or forms. The only form control is a
              platform picker on the home page, and inputs are masked anyway.
            </li>
            <li>
              Text inside an element with the class <code>ph-sensitive</code> is
              masked, and an element with the class <code>ph-no-capture</code>{" "}
              is left out of the recording. No element on the site uses either
              class today.
            </li>
            <li>
              The rest of the page text is not masked. The site&apos;s pages are
              public marketing and documentation text.
            </li>
          </ul>
        </section>

        <section id="errors">
          <h2>Error monitoring</h2>
          <ul>
            <li>
              Sentry is hosted by Devino itself, at sentry.devino.ca. Your
              browser talks to anotifier.io/_t/s7e, and the site&apos;s server
              forwards it to the Sentry project for this site without your
              cookies.
            </li>
            <li>
              Besides replays, Sentry reports errors that occur on a page. An
              error report includes the page address, your language and time
              zone, and the last few things the page did, including the
              addresses of requests it made.
            </li>
            <li>
              The site tells Sentry not to collect user info, cookies, HTTP
              headers or HTTP bodies. Performance tracing is off.
            </li>
          </ul>
        </section>

        <section id="other">
          <h2>Other requests</h2>
          <ul>
            <li>
              Each page tells your browser to open a connection to
              api.github.com early, and the Star on GitHub buttons ask it for
              the repository&apos;s star count shortly after the page loads.
              GitHub sees your IP address and browser details, as with any
              request. The count is kept in your tab&apos;s session storage for
              an hour.
            </li>
            <li>
              The home page&apos;s demo video loads from youtube-nocookie.com,
              YouTube&apos;s privacy-enhanced mode, only after you click play.
              YouTube then sees your IP address and browser details, as with any
              request.
            </li>
            <li>
              The site sends your browser a content security policy in
              report-only mode. If a page breaks that policy, your browser can
              send a short violation report, with the page address and your
              browser details, directly to Devino&apos;s Sentry at
              sentry.devino.ca.
            </li>
          </ul>
        </section>
      </div>
    </DocShell>
  );
}
