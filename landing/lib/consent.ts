/** The visitor's analytics choice, kept in this browser only.

    PostHog, Google Analytics and Sentry load only while the choice is
    "accepted" (components/ConsentedAnalytics.tsx). Until the visitor chooses,
    and after "declined", none of them is loaded and track() sends nothing.

    The choice lives in localStorage under a versioned key: change the wording of
    what is collected in a way that needs a fresh answer and bump the version, so
    everyone is asked again. localStorage is a first-party store the browser never
    sends anywhere, so no cookie is needed. When storage is blocked, the choice is
    held in memory for the life of the page. */
export type Consent = "accepted" | "declined";

const CONSENT_KEY = "anotifier:consent:v1";

const CHANGED = "anotifier:consent";
const REOPEN = "anotifier:consent-reopen";

let memory: Consent | null = null;

const isConsent = (v: unknown): v is Consent =>
  v === "accepted" || v === "declined";

export function readConsent(): Consent | null {
  try {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (isConsent(stored)) return stored;
  } catch {
    // blocked storage: fall through to the in-memory choice
  }
  return memory;
}

export function writeConsent(choice: Consent): void {
  memory = choice;
  try {
    localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // blocked storage: the in-memory choice still applies to this page
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** Calls `onChange` when the choice changes in this tab or in another one. */
export function subscribeConsent(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === CONSENT_KEY || e.key === null) onChange();
  };
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** Asks the consent prompt to open again (the "Privacy choices" footer link). */
export function reopenConsentPrompt(): void {
  window.dispatchEvent(new Event(REOPEN));
}

export function subscribeReopen(onReopen: () => void): () => void {
  window.addEventListener(REOPEN, onReopen);
  return () => window.removeEventListener(REOPEN, onReopen);
}

/** Browser storage the three tools leave behind, by name prefix: PostHog's
    ph_* (and its __ph_opt_in_out_* flag), Google Analytics' _ga* and _gcl_*, and Sentry
    replay's sentryReplay* session. */
const COOKIE_PREFIXES = ["ph_", "__ph_", "_ga", "_gcl_"];
const STORAGE_PREFIXES = ["ph_", "__ph_", "sentryReplay"];

/** Removes those cookies and storage entries. Run when the visitor has
    declined, which includes a withdrawal: the page reloads without loading the
    tools, and this runs on that reload, so nothing is still capturing. */
export function clearAnalyticsTraces(): void {
  // Each access sits inside its own try: with storage or cookies blocked the
  // property read itself throws a SecurityError, and an uncaught throw in the
  // effect that calls this would unmount the whole React tree.
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const store = window[name];
      for (const key of Object.keys(store)) {
        if (STORAGE_PREFIXES.some((p) => key.startsWith(p))) {
          store.removeItem(key);
        }
      }
    } catch {
      // blocked storage: nothing to clear
    }
  }
  try {
    // A cookie is only removed by naming the domain it was set on, and
    // PostHog and gtag.js choose between the host and its parent domain
    // themselves.
    const labels = location.hostname.split(".");
    const domains = [undefined, location.hostname];
    for (let i = 0; i < labels.length - 1; i++) {
      domains.push(`.${labels.slice(i).join(".")}`);
    }
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0].trim();
      if (!COOKIE_PREFIXES.some((p) => name.startsWith(p))) continue;
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ""}`;
      }
    }
  } catch {
    // blocked cookies: nothing to clear
  }
}
