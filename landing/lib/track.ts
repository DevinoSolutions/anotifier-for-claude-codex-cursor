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
    the site tests' UA, or the 800x600 screen our own stealth-browser checks
    report (no real display is 800x600). PostHog, GA4 and Sentry replay skip
    init when it is true. Self-contained on purpose: PostHog.tsx and
    GoogleAnalytics.tsx inline its source into their bootstrap scripts. */
export function isAutomated(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    navigator.webdriver === true ||
    /HeadlessChrome|anotifier-site-tests/.test(navigator.userAgent) ||
    (screen.width === 800 && screen.height === 600)
  );
}

export function track(name: string, params?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const w = window as { gtag?: Gtag; posthog?: PostHogClient };
  if (typeof w.gtag === "function") w.gtag("event", name, { ...params, transport_type: "beacon" });
  if (typeof w.posthog?.capture === "function") {
    if (CONVERSIONS.has(name)) w.posthog.createPersonProfile?.();
    w.posthog.capture(name, params);
  }
}
