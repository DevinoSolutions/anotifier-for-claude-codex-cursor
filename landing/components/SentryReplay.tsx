"use client";

import { useEffect } from "react";

/** Sentry session replay (the self-hosted instance, project 67).

    Env-gated on NEXT_PUBLIC_SENTRY_DSN: with the variable unset or empty this
    renders nothing and the SDK is not even bundled (the whole loader sits
    inside a build-time-constant branch), so local and CI builds ship no
    Sentry. The DSN is public, but like every NEXT_PUBLIC_* value it is inlined
    at build time — the image has to be rebuilt to change it.

    @sentry/browser (~100 KB with replay) is pulled in by a dynamic import()
    only after the window load event, and then only when the browser is idle
    (requestIdleCallback, a short timer where that is missing), so it never
    competes with the fonts, CSS and hero image: the same reasoning as the
    lazyOnload PostHog loader, and why the LCP tuning is untouched.

    Events leave through `tunnel: "/_t/s7e"`, a first-party nginx location that
    relays to the project's envelope endpoint only (nginx.conf), so blocklists
    that match Sentry hostnames drop nothing and the browser never talks to
    sentry.devino.ca. No tracing, and `dataCollection` turns off user info, cookies,
    headers and bodies.

    Replay records 10% of sessions and every session that hits an error, the
    same 10% PostHog samples. Inputs are always masked, .ph-sensitive content is masked and .ph-no-capture
    is blocked (the same two classes PostHog honours). maskAllText is off on
    purpose: the site is public marketing copy with no user data, and masking
    every word would make the recordings useless. */
export default function SentryReplay() {
  useEffect(() => {
    // Everything lives inside this branch: with no DSN the build drops it,
    // dynamic import() included, so no Sentry chunk is emitted at all.
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      let cancelled = false;
      let idle: number | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const load = () => {
        void import("@sentry/browser").then(
          ({ getClient, init, replayIntegration }) => {
            if (cancelled || getClient()) {
              return;
            }
            init({
              dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
              tunnel: "/_t/s7e",
              environment: "production",
              // SDK 11's dataCollection collects user info, cookies and
              // headers by default; none of it is wanted here.
              dataCollection: {
                userInfo: false,
                cookies: false,
                httpHeaders: false,
                httpBodies: [],
              },
              tracesSampleRate: 0,
              replaysSessionSampleRate: 0.1,
              replaysOnErrorSampleRate: 1.0,
              integrations: [
                replayIntegration({
                  maskAllText: false,
                  maskAllInputs: true,
                  blockAllMedia: false,
                  mask: [".ph-sensitive"],
                  block: [".ph-no-capture"],
                }),
              ],
            });
          },
        );
      };

      const schedule = () => {
        if ("requestIdleCallback" in window) {
          idle = window.requestIdleCallback(load, { timeout: 5000 });
        } else {
          timer = setTimeout(load, 2000);
        }
      };

      if (document.readyState === "complete") {
        schedule();
      } else {
        window.addEventListener("load", schedule, { once: true });
      }

      return () => {
        cancelled = true;
        window.removeEventListener("load", schedule);
        if (idle !== undefined) {
          window.cancelIdleCallback(idle);
        }
        clearTimeout(timer);
      };
    }
    return undefined;
  }, []);

  return null;
}
