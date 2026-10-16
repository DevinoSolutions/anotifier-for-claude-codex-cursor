/** Sends an event to GA4 through the gtag() that components/GoogleAnalytics.tsx
    defines, and to PostHog through the window.posthog stub that
    components/PostHog.tsx defines. Builds without the matching
    NEXT_PUBLIC_* variable define neither, so this is a no-op locally and in
    CI.
    Before gtag.js has loaded (it loads lazyOnload) the call queues on
    dataLayer and is sent once it arrives. PostHog's stub only exists after the
    page's load event, so an event fired before then reaches GA4 alone.

    copy_command is the site's conversion (anotifier has no sign-up), so it
    also creates a PostHog person profile for that visitor. Visitors stay
    anonymous (`identified_only`, nobody is ever identified), but a profile
    stores the first-touch $initial_utm_*, $initial_referrer and
    $initial_current_url, so conversions can be broken down by source on the
    person as well as on the event. Every other visitor stays personless.

    GA4 events go out with transport_type "beacon": star_click navigates away
    in the same tab, and a normal gtag request is cancelled by the unload (GA4
    recorded 2 of the 4 star clicks PostHog did). */
type Gtag = (
  command: "event",
  name: string,
  params?: Record<string, string>,
) => void;

type PostHogClient = {
  capture: (name: string, params?: Record<string, string>) => void;
  createPersonProfile?: () => void;
};

const CONVERSIONS = new Set(["copy_command"]);

/** True for traffic that is not a visitor: a WebDriver browser, a headless UA,
    the site tests' UA, or an 800x600 screen with a wider viewport (our own stealth-browser
    checks spoof the screen; a real 800x600 window stays counted). PostHog, GA4 and Sentry replay skip
    init when it is true.

    AUTOMATED_SRC is the same check as a plain JS expression for the inline
    bootstrap scripts in PostHog.tsx and GoogleAnalytics.tsx. It is a string,
    not isAutomated.toString(): the bundler compiles the function for the
    server, folds its typeof window test to a constant and inlines "return
    false". tests/tracking.test.mjs runs both against the same cases. */
export const AUTOMATED_SRC = `(function(){
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (window.anotifierTestTrackers) return false;
  return navigator.webdriver === true ||
    /HeadlessChrome|anotifier-site-tests/.test(navigator.userAgent) ||
    (screen.width === 800 && screen.height === 600 && window.innerWidth > 800);
})()`;

export function isAutomated(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  // Test-only opt-out: tests/browser.test.mjs runs a headless browser with every
  // tracker request blocked and needs the trackers to load.
  if ((window as { anotifierTestTrackers?: boolean }).anotifierTestTrackers) {
    return false;
  }
  return (
    navigator.webdriver === true ||
    /HeadlessChrome|anotifier-site-tests/.test(navigator.userAgent) ||
    (screen.width === 800 && screen.height === 600 && window.innerWidth > 800)
  );
}

export function track(name: string, params?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const w = window as { gtag?: Gtag; posthog?: PostHogClient };
  if (typeof w.gtag === "function")
    w.gtag("event", name, { ...params, transport_type: "beacon" });
  if (typeof w.posthog?.capture === "function") {
    if (CONVERSIONS.has(name)) w.posthog.createPersonProfile?.();
    w.posthog.capture(name, params);
  }
}
