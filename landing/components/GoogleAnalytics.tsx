import Script from "next/script";
import { AUTOMATED_SRC } from "@/lib/track";

/** Google Analytics 4 (gtag.js).

    Env-gated on NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: with the variable unset or
    empty this renders nothing, so local and CI builds ship no gtag.js and send
    no hit. The measurement id is public, but it is inlined at build time —
    setting it on a running container does nothing, the image has to be rebuilt.

    The bootstrap must keep the canonical
    `function gtag(){dataLayer.push(arguments);}` form. gtag.js reads a command
    off the raw `arguments` object; a rest-params/array rewrite is silently
    ignored and no page_view is ever sent.

    gtag.js loads lazyOnload, not afterInteractive: afterInteractive emits a
    high-priority preload that pulled its ~170 KB in alongside the fonts and
    CSS and pushed out mobile LCP. The bootstrap stays afterInteractive so the
    queued config is sent the moment gtag.js arrives.

    gtag.js loads from /gx4t/ on anotifier.io, not googletagmanager.com, and
    transport_url sends its hits to /gx4t/g/collect. nginx (nginx.conf) relays
    both to Google without the visitor's IP address or cookies, so Google sees
    the server, not the visitor. Google signals and ad personalisation are off.
    Automated browsers (AUTOMATED_SRC in lib/track.ts) set GA's own
    ga-disable-<id> flag first, so gtag sends nothing for them.

    Cloudflare's Google Tag Gateway did this before, but it also injected the
    tag into every page's HTML itself, so it is switched off. */
export default function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
  if (!gaId) {
    return null;
  }

  return (
    <>
      <Script src={`/gx4t/?id=${gaId}`} strategy="lazyOnload" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`if((${AUTOMATED_SRC})){window['ga-disable-${gaId}']=true;}
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}', { transport_url: location.origin + '/gx4t', allow_google_signals: false, allow_ad_personalization_signals: false });`}
      </Script>
    </>
  );
}
