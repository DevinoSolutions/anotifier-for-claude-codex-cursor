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
    person as well as on the event. Every other visitor stays personless. */
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

export function track(name: string, params?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const w = window as { gtag?: Gtag; posthog?: PostHogClient };
  if (typeof w.gtag === "function") w.gtag("event", name, params);
  if (typeof w.posthog?.capture === "function") {
    if (CONVERSIONS.has(name)) w.posthog.createPersonProfile?.();
    w.posthog.capture(name, params);
  }
}
