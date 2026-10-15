"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import GoogleAnalytics from "@/components/GoogleAnalytics";
import PostHog from "@/components/PostHog";
import SentryReplay from "@/components/SentryReplay";
import {
  clearAnalyticsTraces,
  readConsent,
  subscribeConsent,
} from "@/lib/consent";

/** The one place PostHog, Google Analytics and Sentry are mounted: only while
    the visitor's choice is "accepted" (lib/consent.ts). The server render and
    the first client render both see "no choice", so the static HTML carries none
    of the three and hydration matches.

    Accepting mounts them and they load exactly as before (each still lazy, and
    each still env-gated, so local and CI builds load none). Withdrawing is not
    undone in place: the three tools cannot be unloaded from a running page, so
    capture is stopped (PostHog opt-out, Google's ga-disable flag, Sentry client
    closed by SentryReplay's cleanup) and the page reloads. The reloaded page
    mounts nothing and clears what the tools stored (clearAnalyticsTraces). */
export default function ConsentedAnalytics() {
  const consent = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    () => null,
  );
  const wasAccepted = useRef(false);

  useEffect(() => {
    if (consent === "accepted") {
      wasAccepted.current = true;
      return;
    }
    if (wasAccepted.current) {
      try {
        const w = window as unknown as Record<string, unknown> & {
          posthog?: { opt_out_capturing?: () => void };
        };
        w.posthog?.opt_out_capturing?.();
        const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
        if (gaId) w[`ga-disable-${gaId}`] = true;
      } catch {
        // A tool that misbehaves must not keep the page from reloading.
      }
      // The reloaded page loads none of them.
      location.reload();
    } else if (consent === "declined") {
      clearAnalyticsTraces();
    }
  }, [consent]);

  if (consent !== "accepted") return null;
  return (
    <>
      <GoogleAnalytics />
      <PostHog />
      <SentryReplay />
    </>
  );
}
