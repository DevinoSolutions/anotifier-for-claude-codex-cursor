import Script from "next/script";

/** Google Analytics 4 (gtag.js).

    Env-gated on NEXT_PUBLIC_GOOGLE_ANALYTICS_ID: with the variable unset or
    empty this renders nothing, so local and CI builds ship no gtag.js and send
    no hit. The measurement id is public, but it is inlined at build time —
    setting it on a running container does nothing, the image has to be rebuilt.

    The bootstrap must keep the canonical
    `function gtag(){dataLayer.push(arguments);}` form. gtag.js reads a command
    off the raw `arguments` object; a rest-params/array rewrite is silently
    ignored and no page_view is ever sent. */
export default function GoogleAnalytics() {
  const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
  if (!gaId) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaId}');`}
      </Script>
    </>
  );
}
