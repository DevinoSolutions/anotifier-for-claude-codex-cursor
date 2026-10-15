"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  readConsent,
  subscribeConsent,
  subscribeReopen,
  writeConsent,
  type Consent,
} from "@/lib/consent";

const noopSubscribe = () => () => {};

/** The analytics consent prompt: a small fixed bar at the bottom of the page.

    It renders nothing on the server and on the first client render, so it is
    never part of the static HTML (a crawler never reads it, and it can't become
    the page's LCP element or shift the layout; it is position: fixed anyway).
    It is a labelled region, not a modal: nothing is blocked while it is open,
    and it does not take focus when it first appears.

    Shown while the visitor has made no choice, and again when the "Privacy
    choices" footer link asks for it (lib/consent.ts reopenConsentPrompt). In that
    reopened case focus moves to the bar, Escape closes it with the old choice
    kept, and focus returns to the link. Accepting and declining have the same
    weight on purpose. */
export default function ConsentPrompt() {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const consent = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    () => null,
  );
  const [reopened, setReopened] = useState(false);
  const bar = useRef<HTMLElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(
    () =>
      subscribeReopen(() => {
        opener.current = document.activeElement;
        setReopened(true);
      }),
    [],
  );

  const close = useCallback(() => {
    setReopened(false);
    if (opener.current instanceof HTMLElement) opener.current.focus();
    opener.current = null;
  }, []);

  // Reopened by the footer link: move focus into the bar, and let Escape close
  // it with the earlier choice kept.
  useEffect(() => {
    if (!reopened) return undefined;
    bar.current?.querySelector("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [reopened, close]);

  const choose = (choice: Consent) => {
    writeConsent(choice);
    if (reopened) close();
  };

  if (!mounted || (consent !== null && !reopened)) return null;

  return (
    <section ref={bar} className="consentBar" aria-label="Analytics choice">
      <p aria-live="polite">
        PostHog, Google Analytics and Sentry (errors and session replay) are not
        loaded unless you accept.
        {consent && ` Your current choice: ${consent}.`}{" "}
        <Link href="/privacy/">What they collect</Link>
      </p>
      <div className="consentActions">
        <button type="button" onClick={() => choose("declined")}>
          Decline
        </button>
        <button type="button" onClick={() => choose("accepted")}>
          Accept
        </button>
      </div>
    </section>
  );
}
