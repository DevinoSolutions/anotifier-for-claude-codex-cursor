import Script from "next/script";

/** Google Analytics 4 (gtag.js).

    Mounted only after the visitor accepts analytics
    (components/ConsentedAnalytics.tsx): before that there is no /gx4t request,
    no dataLayer and no gtag.

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

    gtag.js loads from /gx4t/ on anotifier.io, not googletagmanager.com:
    Cloudflare's Google Tag Gateway (zone setting, endpoint /gx4t, original IP
    hidden from Google) serves the tag at the edge and relays its hits, so
    blocklists that match Google's hostnames miss them. The path only exists
    behind Cloudflare; local and CI builds have no measurement id and load
    nothing. */
export default function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
  if (!gaId) {
    return null;
  }

  return (
    <>
      <Script src={`/gx4t/?id=${gaId}`} strategy="lazyOnload" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
