import type { CSSProperties } from "react";
import { NOTICES, depthOf, titleOf, CLEAR_AT, type Notice } from "./timeline";

// Both stacks work the same way: every notification is always in the DOM and
// only its `data-pos` changes (waiting, 0 = newest, 1, 2, gone, away), so the
// browser animates each arrival and each shove on the compositor. The desktop
// stack shows at most three; older ones are dropped like the OS does.

const ICON = {
  claude: { src: "/assets/icons/claude.png", size: 26 },
  codex: { src: "/assets/icons/codex.png", size: 22 },
} as const;

function posOf(depth: number | null, now: number): string {
  if (depth === null) return now >= CLEAR_AT ? "away" : "wait";
  return depth > 2 ? "gone" : String(depth);
}

function Icon({ agent }: { agent: Notice["agent"] }) {
  const { src, size } = ICON[agent];
  return (
    <span className="ico">
      <img src={src} alt="" width={size} height={size} />
    </span>
  );
}

export function DesktopToasts({ now }: { now: number }) {
  return (
    <div className="hdToasts">
      {NOTICES.map((n) => {
        const depth = depthOf((x) => x.toastAt, n.id, now);
        return (
          <div
            key={n.id}
            className="hdToast"
            data-pos={posOf(depth, now)}
            style={{ "--z": NOTICES.indexOf(n) + 1 } as CSSProperties}
          >
            <Icon agent={n.agent} />
            <div className="tx">
              <div className="hd">
                <b>{titleOf(n.agent)}</b>
                <span>now</span>
              </div>
              <div className="bd">{n.toastBody}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ntfy puts the event's tags in front of the title as emoji:
// task_complete -> white_check_mark, needs_input -> bell, warning.
const TAGS = { done: "✅", ask: "🔔⚠️" } as const;

export function PhoneNotices({ now }: { now: number }) {
  return (
    <div className="hdPush">
      {NOTICES.map((n) => {
        const depth = depthOf((x) => x.phoneAt, n.id, now);
        return (
          <div
            key={n.id}
            className="hdPushCard"
            data-pos={posOf(depth, now)}
            style={{ "--depth": depth ?? 0 } as CSSProperties}
          >
            <Icon agent={n.agent} />
            <div className="tx">
              <div className="hd">
                <span className="app">ntfy</span>
                {n.urgent && <em>urgent</em>}
                <span className="when">now</span>
              </div>
              <div className="ti">
                {n.urgent ? TAGS.ask : TAGS.done} {titleOf(n.agent)}
              </div>
              <div className="bd">{n.phoneBody}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
