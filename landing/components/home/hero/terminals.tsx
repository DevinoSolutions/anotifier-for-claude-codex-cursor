import type { CSSProperties, ReactNode } from "react";
import { T } from "./timeline";

// The two terminals the demo cycles between, drawn from the real tools' UIs:
// Claude Code's bordered prompt box, "✻" working line, "⏺" tool bullets and
// "⎿" result connector; Codex's header box, "›" composer, "•" bullets and
// "Would you like to run ...?" modal.
//
// A terminal is a stack of one-row lines, so it can be laid out ahead of time:
// every line has a fixed row (15px), the scrolling is a transform on one
// wrapper, and nothing in the layout moves when a cue fires. Transcript items
// keep their row for good. The footer (working line, prompt, hint, or Codex's
// approval modal) is rebuilt per phase just below the last transcript row.

const ROW = 15;

type Line = { rows: number; cls?: string; node: ReactNode };
type Item = { id: string; at: number; blank?: boolean; lines: Line[] };
type Phase = { from: number; lines: Line[] };

const L = (node: ReactNode, cls = "", rows = 1): Line => ({ rows, cls, node });
const blank = (): Line => L(null);
const rowsOf = (lines: Line[]) => lines.reduce((n, l) => n + l.rows, 0);
const itemRows = (it: Item) => rowsOf(it.lines) + (it.blank ? 1 : 0);

// Claude Code's own glyphs. The site's mono font has none of them, so each sits
// in a one-column box (.hdG) and the grid holds whatever font the OS falls
// back to. U+FE0E keeps the record button from turning into an emoji.
const Dot = ({ tone = "" }: { tone?: string }) => (
  <span className={`hdG ${tone}`}>{"⏺︎"}</span>
);
const Elbow = () => <span className="hdG">{"⎿"}</span>;

const diff = (n: string, kind: "add" | "del", text: string): Line =>
  L(
    <>
      <span className="n">{n}</span>
      {kind === "add" ? "+" : "-"} {text}
    </>,
    `hdDiff ${kind}`,
  );

function Terminal({
  now,
  items,
  phases,
  base,
}: {
  now: number;
  items: Item[];
  phases: Phase[];
  base: number;
}) {
  // Transcript rows come from the list order. Both lists are in time order.
  const tops: number[] = [];
  let acc = 0;
  for (const it of items) {
    tops.push(acc);
    acc += itemRows(it);
  }
  const rowsBy = (t: number) =>
    items.reduce((n, it) => (it.at <= t ? n + itemRows(it) : n), 0);
  const phaseAt = (t: number) => {
    let at = 0;
    phases.forEach((p, i) => {
      if (p.from <= t) at = i;
    });
    return at;
  };
  // Tallest the terminal ever gets, over every instant something changes.
  const cuts = [...items.map((i) => i.at), ...phases.map((p) => p.from)];
  const total = Math.max(
    ...cuts.map((t) => rowsBy(t) + rowsOf(phases[phaseAt(t)].lines)),
  );

  const pi = phaseAt(now);
  const used = rowsBy(now);
  const visible = used + rowsOf(phases[pi].lines);

  return (
    <div
      className="hdScroll"
      style={{
        height: total * ROW,
        transform: `translateY(${(total - visible) * ROW}px)`,
      }}
    >
      {items.map((it, i) =>
        it.at <= now ? (
          <div
            key={it.id}
            className="hdItem"
            style={{ top: tops[i] * ROW, paddingTop: it.blank ? ROW : 0 }}
          >
            {it.lines.map((l, j) => (
              <div
                key={j}
                className={`hdLn ${l.cls}`}
                style={{ height: l.rows * ROW }}
              >
                {l.node}
              </div>
            ))}
          </div>
        ) : null,
      )}
      <div key={pi + base} className="hdItem" style={{ top: used * ROW }}>
        {phases[pi].lines.map((l, j) => (
          <div
            key={j}
            className={`hdLn ${l.cls}`}
            style={{ height: l.rows * ROW }}
          >
            {l.node}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- Claude Code -----------------------------------------------------------

const typed = (text: string) => (
  <span className="hdTypeWrap" style={{ "--n": text.length } as CSSProperties}>
    <span className="hdTyped">{text}</span>
    <span className="hdCaret" />
  </span>
);

const claudeWork = (label: string, detail: string): Line[] => [
  L(
    <>
      <span className="claudeStar spin hdG">✻</span>
      {label}…
    </>,
    "hdWork",
  ),
  L(<span className="dim">&nbsp;&nbsp;({detail} · esc to interrupt)</span>),
];
const claudePrompt = (text?: string): Line[] => [
  L(
    <>
      <span className="dim">&gt;</span>{" "}
      {text ? typed(text) : <span className="hdCaret" />}
    </>,
    "hdPrompt",
    2,
  ),
  L("? for shortcuts", "hdHint dim"),
];

const CLAUDE_PROMPT = "Move session storage behind a store";

const CLAUDE_ITEMS = (now: number): Item[] => [
  {
    id: "user",
    at: T.claudeSend,
    lines: [
      L(
        <>
          <span className="dim">&gt;</span> {CLAUDE_PROMPT}
        </>,
        "hdUser",
      ),
    ],
  },
  {
    id: "intro",
    at: T.claudeIntro,
    blank: true,
    lines: [
      L(
        <>
          <Dot />
          I&apos;ll start with the auth module.
        </>,
      ),
    ],
  },
  {
    id: "read",
    at: T.claudeRead,
    blank: true,
    lines: [
      L(
        <>
          <Dot tone="ok" />
          <b>Read</b>
          <span className="dim">(src/auth/session.ts)</span>
        </>,
      ),
      L(
        <>
          &nbsp;
          <Elbow />
          Read 142 lines
        </>,
        "dim",
      ),
    ],
  },
  {
    id: "update",
    at: T.claudeEdit,
    blank: true,
    lines: [
      L(
        <>
          <Dot tone="ok" />
          <b>Update</b>
          <span className="dim">(src/auth/session.ts)</span>
        </>,
      ),
      L(
        <>
          &nbsp;
          <Elbow />
          Updated with 1 addition and 1 removal
        </>,
        "dim",
      ),
      diff("12", "del", "const store = new Map()"),
      diff("12", "add", "const store = createStore()"),
    ],
  },
  {
    id: "bash",
    at: T.claudeTests,
    blank: true,
    lines: [
      L(
        <>
          <Dot tone="ok" />
          <b>Bash</b>
          <span className="dim">(npm test)</span>
        </>,
      ),
      L(
        <>
          &nbsp;
          <Elbow />
          {now >= T.claudeTestsPass ? "Tests: 14 passed, 14 total" : "Running…"}
        </>,
        "dim",
      ),
    ],
  },
  {
    id: "done",
    at: T.claudeDone,
    blank: true,
    lines: [
      L(
        <>
          <Dot />
          Done. Sessions now live in a store
        </>,
      ),
      L("  and all 14 tests pass."),
    ],
  },
];

const CLAUDE_PHASES: Phase[] = [
  { from: 0, lines: [blank(), ...claudePrompt()] },
  { from: T.claudeType, lines: [blank(), ...claudePrompt(CLAUDE_PROMPT)] },
  {
    from: T.claudeSend,
    lines: [
      blank(),
      ...claudeWork("Thinking", "2s · ↑ 0.3k tokens"),
      ...claudePrompt(),
    ],
  },
  {
    from: T.claudeIntro,
    lines: [
      blank(),
      ...claudeWork("Refactoring", "6s · ↑ 0.9k tokens"),
      ...claudePrompt(),
    ],
  },
  {
    from: T.claudeTests,
    lines: [
      blank(),
      ...claudeWork("Running tests", "9s · ↑ 1.2k tokens"),
      ...claudePrompt(),
    ],
  },
  { from: T.claudeDone, lines: [blank(), ...claudePrompt()] },
];

export function ClaudeTerminal({ now }: { now: number }) {
  return (
    <Terminal
      now={now}
      items={CLAUDE_ITEMS(now)}
      phases={CLAUDE_PHASES}
      base={0}
    />
  );
}

// ---- Codex CLI ---------------------------------------------------------------

const CODEX_PROMPT = "Add retry to the API client";

const codexPrompt = (text?: string): Line[] => [
  L(
    <>
      <b>›</b>{" "}
      {text ? (
        typed(text)
      ) : (
        <>
          <span className="dim">Ask Codex to do anything</span>
          <span className="hdCaret" />
        </>
      )}
    </>,
    "hdPrompt codex",
    2,
  ),
  L(
    <>
      ? for shortcuts <span className="r">100% context left</span>
    </>,
    "hdHint dim",
  ),
];
const codexWork = (secs: number): Line =>
  L(
    <>
      <span className="shimmer">• Working</span>{" "}
      <span className="dim">({secs}s • esc to interrupt)</span>
    </>,
    "hdWork codex",
  );

const CODEX_ITEMS: Item[] = [
  {
    id: "box",
    at: 0,
    lines: [
      L(
        <>
          <div>
            <b>&gt;_ OpenAI Codex</b>
          </div>
          <div>&nbsp;</div>
          <div>
            <span className="dim">model:</span>&nbsp;&nbsp;&nbsp;&nbsp;gpt-5{" "}
            <span className="dim">/model to change</span>
          </div>
          <div>
            <span className="dim">directory:</span> ~/code/my-app
          </div>
        </>,
        "hdBox codex",
        5,
      ),
    ],
  },
  {
    id: "user",
    at: T.codexSend,
    blank: true,
    lines: [
      L(
        <>
          <b>›</b> {CODEX_PROMPT}
        </>,
        "hdUser codex",
      ),
    ],
  },
  {
    id: "explored",
    at: T.codexExplore,
    blank: true,
    lines: [
      L(
        <>
          <span className="dim">•</span> <b>Explored</b>
        </>,
      ),
      L("  └ Read src/api/client.ts", "dim"),
    ],
  },
  {
    id: "edited",
    at: T.codexEdit,
    blank: true,
    lines: [
      L(
        <>
          <span className="dim">•</span> <b>Edited</b> src/api/client.ts{" "}
          <span className="add">(+1</span> <span className="del">-1)</span>
        </>,
      ),
      diff("31", "del", "return fetch(url)"),
      diff("31", "add", "return retry(() => fetch(url))"),
    ],
  },
  {
    id: "ran",
    at: T.codexApprove,
    blank: true,
    lines: [
      L(
        <>
          <span className="add hdG">✔</span>You approved codex to run npm test
        </>,
      ),
      L(
        <>
          <span className="dim">•</span> <b>Ran</b> npm test
        </>,
      ),
      L("  └ Tests: 9 passed", "dim"),
    ],
  },
  {
    id: "done",
    at: T.codexDone,
    blank: true,
    lines: [
      L(
        <>
          <span className="dim">•</span> Added retry with backoff to client.ts.
        </>,
      ),
      L("  All 9 tests pass."),
    ],
  },
];

const CODEX_PHASES: Phase[] = [
  { from: 0, lines: [blank(), ...codexPrompt()] },
  { from: T.codexType, lines: [blank(), ...codexPrompt(CODEX_PROMPT)] },
  {
    from: T.codexSend,
    lines: [blank(), codexWork(2), ...codexPrompt()],
  },
  {
    from: T.codexAsk,
    lines: [
      blank(),
      L("Would you like to run this command?", "hdAsk q"),
      L(
        <>
          <span className="dim">$</span> npm test
        </>,
        "hdAsk cmd",
      ),
      L(
        <>
          <b>›</b> 1. Yes, proceed <span className="dim">(y)</span>
        </>,
        "hdAsk opt sel",
      ),
      L(
        <>
          &nbsp;&nbsp;2. Yes, don&apos;t ask again for npm test{" "}
          <span className="dim">(p)</span>
        </>,
        "hdAsk opt",
      ),
      L(
        <>
          &nbsp;&nbsp;3. No, tell Codex what to do{" "}
          <span className="dim">(esc)</span>
        </>,
        "hdAsk opt",
      ),
      L("Press enter to confirm or esc to cancel", "hdAsk foot dim"),
    ],
  },
  { from: T.codexApprove, lines: [blank(), codexWork(6), ...codexPrompt()] },
  { from: T.codexDone, lines: [blank(), ...codexPrompt()] },
];

export function CodexTerminal({ now }: { now: number }) {
  return (
    <Terminal now={now} items={CODEX_ITEMS} phases={CODEX_PHASES} base={100} />
  );
}
