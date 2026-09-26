/** Sends a GA4 event through the gtag() that components/GoogleAnalytics.tsx
    defines. Builds without NEXT_PUBLIC_GOOGLE_ANALYTICS_ID define no gtag, so
    this is a no-op locally and in CI. Before gtag.js has loaded (it loads
    lazyOnload) the call queues on dataLayer and is sent once it arrives. */
type Gtag = (
  command: "event",
  name: string,
  params?: Record<string, string>,
) => void;

export function track(name: string, params?: Record<string, string>): void {
  if (typeof window === "undefined") return;
  const gtag = (window as { gtag?: Gtag }).gtag;
  if (typeof gtag === "function") gtag("event", name, params);
}
