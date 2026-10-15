import type { CSSProperties, ReactNode } from "react";
import { T } from "./timeline";

// The two terminals the demo cycles between. Both are drawn from the real
// tools' UIs (Claude Code's bordered prompt box, "✻" working line, "⏺" tool
// bullets and numbered permission dialog; Codex's header box, "›" composer,
// "•" bullets and "Would you like to run the following command?" modal) and
// are a pure function of `now`.

function Ln({ children, cls = "" }: { children?: ReactNode; cls?: string }) {
  return <div className={`hdLn ${cls}`}>{children || " "}</div>;
}

// Claude Code's own glyphs. The site's mono font has none of them, so each sits
// in a one-column box (.hdG) and the line grid holds whatever font the OS
// falls back to. U+FE0E keeps the record button from turning into an emoji.
const Dot = ({ tone = "" }: { tone?: string }) => (
  <span className={`hdG ${tone}`}>{"⏺︎"}</span>
);
const Elbow = () => <span className="hdG">{"⎿"}</span>;

function Diff({ rows }: { rows: [string, "add" | "del", string][] }) {
  return (
    <>
      {rows.map(([n, kind, text]) => (
        <div key={n + text} className={`hdLn hdDiff ${kind}`}>
          <span className="n">{n}</span>
          {kind === "add" ? "+" : "-"} {text}
        </div>
      ))}
    </>
  );
}

// ---- Claude Code -----------------------------------------------------------

export function ClaudeTerminal({ now }: { now: number }) {
  const typing = now >= T.claudeType && now < T.claudeSend;
  const sent = now >= T.claudeSend;
  const done = now >= T.claudeDone;
  const working = sent && !done;
  const status =
    now < T.claudeIntro
      ? "Thinking"
      : now < T.claudeTests
        ? "Refactoring"
        : "Running tests";

  return (
    <>
      <div className="hdLn hdBox">
        <div>
          <span className="claudeStar hdG">✻</span> Welcome to Claude Code!
        </div>
        <div className="dim">&nbsp; /help for help, /status for your setup</div>
        <div className="dim">&nbsp; cwd: ~/code/my-app</div>
      </div>
      <Ln />
      {sent && (
        <Ln cls="hdUser">
          <span className="dim">&gt;</span> Move session storage behind a store
        </Ln>
      )}
      {now >= T.claudeIntro && (
        <>
          <Ln>
            <Dot /> I&apos;ll start with the auth module.
          </Ln>
        </>
      )}
      {now >= T.claudeRead && (
        <>
          <Ln>
            <Dot tone="ok" /> <b>Read</b>
            <span className="dim">(src/auth/session.ts)</span>
          </Ln>
          <Ln cls="dim">
            &nbsp; <Elbow /> Read 142 lines
          </Ln>
        </>
      )}
      {now >= T.claudeEdit && (
        <>
          <Ln>
            <Dot tone="ok" /> <b>Update</b>
            <span className="dim">(src/auth/session.ts)</span>
          </Ln>
          <Ln cls="dim">
            &nbsp; <Elbow /> Updated with 18 additions and 9 removals
          </Ln>
          <Diff
            rows={[
              ["12", "del", "const store = new Map()"],
              ["12", "add", "const store = createStore()"],
            ]}
          />
        </>
      )}
      {now >= T.claudeTests && (
        <>
          <Ln>
            <Dot tone="ok" /> <b>Bash</b>
            <span className="dim">(npm test)</span>
          </Ln>
          <Ln cls="dim">
            &nbsp; <Elbow />{" "}
            {now >= T.claudeTestsPass
              ? "Tests: 14 passed, 14 total"
              : "Running…"}
          </Ln>
        </>
      )}
      {done && (
        <>
          <Ln />
          <Ln>
            <Dot /> Done. Sessions now live in a store and all 14 tests pass.
          </Ln>
        </>
      )}
      <Ln />
      {working && (
        <Ln cls="hdWork">
          <span className="claudeStar spin hdG">✻</span> {status}…{" "}
          <span className="dim">(esc to interrupt)</span>
        </Ln>
      )}
      <div className="hdLn hdPrompt">
        <span className="dim">&gt;</span>{" "}
        {typing ? (
          <span
            key="typing"
            className="hdTyped"
            style={{ "--n": 35 } as CSSProperties}
          >
            Move session storage behind a store
          </span>
        ) : null}
        <span className="hdCaret" />
      </div>
      <div className="hdLn hdHint dim">? for shortcuts</div>
    </>
  );
}

// ---- Codex CLI ---------------------------------------------------------------

function CodexApproval() {
  return (
    <div className="hdLn hdAsk hdCodexAsk">
      <div className="q">Would you like to run the following command?</div>
      <div className="cmd">
        <span className="dim">$</span> npm test
      </div>
      <div className="opt sel">
        <b>›</b> 1. Yes, proceed <span className="dim">(y)</span>
      </div>
      <div className="opt">
        2. Yes, and don&apos;t ask again for commands that start with `npm test`{" "}
        <span className="dim">(p)</span>
      </div>
      <div className="opt">
        3. No, and tell Codex what to do differently{" "}
        <span className="dim">(esc)</span>
      </div>
      <div className="dim foot">Press enter to confirm or esc to cancel</div>
    </div>
  );
}

export function CodexTerminal({ now }: { now: number }) {
  const typing = now >= T.codexType && now < T.codexSend;
  const sent = now >= T.codexSend;
  const asking = now >= T.codexAsk && now < T.codexApprove;
  const done = now >= T.codexDone;
  const working = sent && !asking && !done;

  return (
    <>
      <div className="hdLn hdBox codex">
        <div>
          <b>&gt;_ OpenAI Codex</b>
        </div>
        <div>&nbsp;</div>
        <div className="pre">
          <span className="dim">model: </span> gpt-5-codex{" "}
          <span className="dim">/model to change</span>
        </div>
        <div className="pre">
          <span className="dim">directory:</span> ~/code/my-app
        </div>
      </div>
      <Ln />
      {sent && (
        <Ln cls="hdUser codex">
          <b>›</b> Add retry to the API client
        </Ln>
      )}
      {now >= T.codexExplore && (
        <>
          <Ln />
          <Ln>
            <span className="dim">•</span> <b>Explored</b>
          </Ln>
          <Ln cls="dim">&nbsp; └ Read src/api/client.ts</Ln>
        </>
      )}
      {now >= T.codexEdit && (
        <>
          <Ln />
          <Ln>
            <span className="dim">•</span> <b>Edited</b> src/api/client.ts{" "}
            <span className="add">(+22</span> <span className="del">-4)</span>
          </Ln>
          <Diff
            rows={[
              ["31", "del", "return fetch(url)"],
              ["31", "add", "return retry(() => fetch(url))"],
            ]}
          />
        </>
      )}
      {now >= T.codexApprove && (
        <>
          <Ln />
          <Ln>
            <span className="add hdG">✔</span> You approved codex to run npm
            test this time
          </Ln>
          <Ln>
            <span className="dim">•</span> <b>Ran</b> npm test
          </Ln>
          <Ln cls="dim">&nbsp; └ Tests: 9 passed</Ln>
        </>
      )}
      {done && (
        <>
          <Ln />
          <Ln>
            <span className="dim">•</span> Added retry with exponential backoff
            to client.ts. All 9 tests pass.
          </Ln>
        </>
      )}
      <Ln />
      {working && (
        <Ln cls="hdWork codex">
          <span className="shimmer">• Working</span>{" "}
          <span className="dim">(esc to interrupt)</span>
        </Ln>
      )}
      {asking ? (
        <CodexApproval />
      ) : (
        <>
          <div className="hdLn hdPrompt codex">
            <b>›</b>{" "}
            {typing ? (
              <span
                key="typing"
                className="hdTyped"
                style={{ "--n": 27 } as CSSProperties}
              >
                Add retry to the API client
              </span>
            ) : (
              <span className="dim">Ask Codex to do anything</span>
            )}
            <span className="hdCaret" />
          </div>
          <div className="hdLn hdHint dim">
            ? for shortcuts <span className="r">100% context left</span>
          </div>
        </>
      )}
    </>
  );
}
