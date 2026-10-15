import { ClaudeTerminal, CodexTerminal } from "./terminals";
import { T } from "./timeline";
import { DesktopToasts } from "./notifications";

// A VS Code window (Dark Modern) with the integrated terminal open on two
// agent terminals. The editor and explorer are scenery; the terminal is the
// scripted part.

const icon = {
  width: 12,
  height: 12,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function ActivityBar() {
  return (
    <div className="hdActivity">
      <svg {...icon} className="on">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
        <path d="M14 3v5h5" />
      </svg>
      <svg {...icon}>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="m15 15 6 6" />
      </svg>
      <svg {...icon}>
        <circle cx="6" cy="5.5" r="2.2" />
        <circle cx="6" cy="18.5" r="2.2" />
        <circle cx="18" cy="9" r="2.2" />
        <path d="M6 7.7v8.6M18 11.2c0 4-6 3-12 6" />
      </svg>
      <svg {...icon}>
        <path d="m7 4 13 8-13 8z" />
      </svg>
      <svg {...icon}>
        <rect x="3" y="12" width="7" height="7" />
        <rect x="12" y="12" width="7" height="7" />
        <rect x="3" y="3" width="7" height="7" />
        <path d="M15.5 2.5 21 8l-5.5 5.5L10 8z" />
      </svg>
    </div>
  );
}

function Editor({ edited }: { edited: boolean }) {
  return (
    <div className="hdEditor">
      <div className="hdTabs">
        <span className="tab on">
          <i className="ts">TS</i> session.ts
          <b className={edited ? "dot" : "x"}>{edited ? "●" : "×"}</b>
        </span>
        <span className="tab">
          <i className="ts">TS</i> tokens.ts
        </span>
      </div>
      <pre className="hdCode">
        <span className="ln">1</span>
        <span className="k">import</span> {"{ "}
        <span className="v">sign</span>
        {" }"} <span className="k">from</span>{" "}
        <span className="s">{'"./tokens"'}</span>
        {"\n"}
        <span className="ln">2</span>
        {"\n"}
        <span className="ln">3</span>
        <span className="k">export async function</span>{" "}
        <span className="f">refresh</span>
        {"("}
        <span className="v">session</span>
        {": "}
        <span className="t">Session</span>
        {") {"}
        {"\n"}
        <span className="ln">4</span>
        {"  "}
        <span className="k">const</span> <span className="v">store</span> ={" "}
        {edited ? (
          <span className="f">createStore</span>
        ) : (
          <>
            <span className="k">new</span> <span className="t">Map</span>
          </>
        )}
        {"()"}
        {"\n"}
        <span className="ln">5</span>
        {"  "}
        <span className="k">return</span> <span className="f">sign</span>
        {"(session.user)"}
        {"\n"}
        <span className="ln">6</span>
        {"}"}
      </pre>
    </div>
  );
}

export function Screen({ now }: { now: number }) {
  const onCodex = now >= T.codexTab;
  const edited = now >= T.claudeEdit;

  return (
    <div className="hdScreen">
      <div className="hdTitle">
        <span className="lights">
          <i style={{ background: "#ff5f57" }} />
          <i style={{ background: "#febc2e" }} />
          <i style={{ background: "#28c840" }} />
        </span>
        <span className="name">session.ts — my-app</span>
      </div>
      <div className="hdBody">
        <ActivityBar />
        <div className="hdMain">
          <Editor edited={edited} />
          <div className="hdPanel">
            <div className="hdPanelTabs">
              <span>PROBLEMS</span>
              <span>OUTPUT</span>
              <span className="on">TERMINAL</span>
            </div>
            <div className="hdPanelBody">
              <div className="hdTermList">
                <div className={`inst${onCodex ? "" : " on"}`}>
                  <img
                    src="/assets/icons/claude.png"
                    alt=""
                    width="9"
                    height="9"
                  />
                  claude
                </div>
                <div className={`inst${onCodex ? " on" : ""}`}>
                  <img
                    src="/assets/icons/codex.png"
                    alt=""
                    width="9"
                    height="9"
                  />
                  codex
                </div>
              </div>
              <div className="hdTermView">
                {onCodex ? (
                  <CodexTerminal now={now} />
                ) : (
                  <ClaudeTerminal now={now} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="hdStatus">
        <span>⎇ main</span>
        <span>⊗ 0 ⚠ 0</span>
        <span className="r">Ln 4, Col 3</span>
        <span>TypeScript</span>
      </div>
      <DesktopToasts now={now} />
    </div>
  );
}
