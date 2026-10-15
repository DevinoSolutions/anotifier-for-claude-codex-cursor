// The hero demo is one scripted loop. Every moment is a millisecond offset
// from the start of the loop, and the whole picture (terminal, toast stack,
// phone) is a pure function of the loop clock, so a notification can never
// drift away from the terminal moment it reports.
//
// What anotifier really does at each moment (src/router.mjs, README):
//  - Claude Code finishes: the Stop hook routes to task_complete. The toast
//    quotes the last assistant message (rich content is on for toasts); the
//    phone push (ntfy, rich off by default) is the generic "<project>: Task
//    complete".
//  - Codex asks to run a command: the PermissionRequest hook fires the moment
//    the approval modal opens and routes to needs_input ("Needs your input",
//    urgent). Codex finishing routes to task_complete. Rich content is
//    Claude-only, so both Codex notices are generic.
//  (Claude Code's own permission notification is deliberately not shown: it
//  fires about six seconds after the dialog appears, so it would look late.)
// Titles are "<project> · <label>". The terminal bell rings with each toast.

export type Agent = "claude" | "codex";

export const LOOP_MS = 19600;
// The stacks leave together, then the loop restarts.
export const CLEAR_AT = 18200;

// Gap between a terminal moment and the toast that reports it: the hook has
// to spawn, route and hand the toast to the OS.
const TOAST_LAG = 250;
// The ntfy round trip to the phone.
const PHONE_LAG = 350;

export const T = {
  // Claude Code session
  claudeType: 600,
  claudeSend: 1800,
  claudeIntro: 2400,
  claudeRead: 3000,
  claudeEdit: 3600,
  claudeTests: 4600,
  claudeTestsPass: 5400,
  claudeDone: 6200,
  // switch to the Codex terminal tab
  codexTab: 8300,
  codexType: 8700,
  codexSend: 9900,
  codexExplore: 10400,
  codexEdit: 11000,
  codexAsk: 11800,
  codexApprove: 13700,
  codexDone: 14700,
} as const;

export type Notice = {
  id: string;
  agent: Agent;
  urgent: boolean;
  // Terminal moment this notification reports.
  reports: number;
  toastAt: number;
  toastBody: string;
  phoneAt: number;
  phoneBody: string;
};

const PROJECT = "my-app";
export const titleOf = (agent: Agent) =>
  `${PROJECT} · ${agent === "claude" ? "Claude Code" : "Codex"}`;

const notice = (
  id: string,
  agent: Agent,
  urgent: boolean,
  reports: number,
  toastBody: string,
  phoneBody: string,
): Notice => ({
  id,
  agent,
  urgent,
  reports,
  toastAt: reports + TOAST_LAG,
  toastBody,
  phoneAt: reports + TOAST_LAG + PHONE_LAG,
  phoneBody: `${PROJECT}: ${phoneBody}`,
});

export const NOTICES: Notice[] = [
  notice(
    "claude-done",
    "claude",
    false,
    T.claudeDone,
    "Done. Session storage now lives in createSessionStore() and all 14 tests pass.",
    "Task complete",
  ),
  notice(
    "codex-ask",
    "codex",
    true,
    T.codexAsk,
    `${PROJECT}: Needs your input`,
    "Needs your input",
  ),
  notice(
    "codex-done",
    "codex",
    false,
    T.codexDone,
    `${PROJECT}: Task complete`,
    "Task complete",
  ),
];

// A frame that is still correct on its own: Claude has just finished and its
// toast and push are up. Used when the visitor asks for reduced motion.
export const STATIC_AT = NOTICES[0].phoneAt + 100;

// Every instant at which the picture changes.
export function cues(): number[] {
  const set = new Set<number>([0, CLEAR_AT]);
  for (const v of Object.values(T)) set.add(v);
  for (const n of NOTICES) {
    set.add(n.toastAt);
    set.add(n.phoneAt);
  }
  return [...set].sort((a, b) => a - b);
}

// How deep a notification sits in its stack at loop time `now`: 0 is the
// newest. null while it has not arrived yet or once the stack has left.
export function depthOf(
  at: (n: Notice) => number,
  id: string,
  now: number,
): number | null {
  if (now >= CLEAR_AT) return null;
  const self = NOTICES.find((n) => n.id === id);
  if (!self || at(self) > now) return null;
  return NOTICES.filter((n) => at(n) > at(self) && at(n) <= now).length;
}
