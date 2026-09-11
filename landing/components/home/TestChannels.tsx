"use client";

import { useEffect, useRef, useState } from "react";
import { useSound } from "./SoundProvider";

type Channel = "toast" | "ntfy" | "webhook" | "bell";
const ORDER: Channel[] = ["toast", "ntfy", "webhook", "bell"];

const cardStyle: React.CSSProperties = {
  border: "1px solid #242728",
  background: "#0d0d0d",
  borderRadius: "10px",
  padding: "14px",
  cursor: "pointer",
  minHeight: "118px",
};

const cardHeadStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  fontFamily: "var(--font-mono-stack)",
  fontSize: "12px",
  color: "#9c9c9d",
  marginBottom: "10px",
};

const pendStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono-stack)",
  fontSize: "11px",
  color: "#7d838a",
  padding: "6px 0",
};

const deliverBox: React.CSSProperties = {
  background: "#101111",
  border: "1px solid #242728",
  borderRadius: "10px",
  padding: "9px 11px",
  animation: "deliverPop 0.4s ease-out both",
};

function Check() {
  return (
    <span
      style={{
        color: "#59d499",
        display: "inline-block",
        animation: "checkPop 0.3s ease-out both",
      }}
    >
      ✓
    </span>
  );
}

export default function TestChannels() {
  const { soundOn, playDing } = useSound();
  const [enabled, setEnabled] = useState<Record<Channel, boolean>>({
    toast: true,
    ntfy: true,
    webhook: true,
    bell: true,
  });
  const [delivered, setDelivered] = useState<Record<Channel, boolean>>({
    toast: false,
    ntfy: false,
    webhook: false,
    bell: false,
  });
  const [running, setRunning] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const runningRef = useRef(false);
  const soundRef = useRef(soundOn);
  soundRef.current = soundOn;

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
    };
  }, []);

  const toggleChan = (ch: Channel) => {
    if (runningRef.current) return;
    setEnabled((s) => ({ ...s, [ch]: !s[ch] }));
  };

  // Accessible toggle-card props: acts as a button with keyboard support.
  const cardInteractive = (ch: Channel) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-pressed": enabled[ch],
    onClick: () => toggleChan(ch),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleChan(ch);
      }
    },
  });

  const fireTest = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setDelivered({ toast: false, ntfy: false, webhook: false, bell: false });
    setRunning(true);
    runningRef.current = true;
    const order = ORDER.filter((ch) => enabled[ch]);
    let step = 0;
    order.forEach((ch) => {
      step += 1;
      timers.current.push(
        setTimeout(
          () => {
            if (soundRef.current) playDing(ch === "ntfy" ? "urgent" : null);
            setDelivered((s) => ({ ...s, [ch]: true }));
          },
          300 + step * 360,
        ),
      );
    });
    timers.current.push(
      setTimeout(
        () => {
          setRunning(false);
          runningRef.current = false;
        },
        300 + (step + 1) * 360,
      ),
    );
  };

  const cb = (ch: Channel) => (enabled[ch] ? "[x]" : "[ ]");
  const pend = (ch: Channel) => enabled[ch] && !delivered[ch];

  const testSummary = (() => {
    if (running) return "";
    const d = Object.values(delivered).filter(Boolean).length;
    const e = Object.values(enabled).filter(Boolean).length;
    return d > 0 ? "✓ " + d + "/" + e + " delivered" : "";
  })();

  return (
    <section
      style={{ maxWidth: "1160px", margin: "0 auto", padding: "0 24px 96px" }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono-stack)",
          fontSize: "13px",
          color: "#838a92",
          marginBottom: "10px",
        }}
      >
        [06] try it
      </div>
      <h2
        style={{
          margin: "0 0 8px",
          fontSize: "clamp(26px,3.4vw,38px)",
          fontWeight: 600,
          letterSpacing: "-0.3px",
          color: "#f4f4f6",
        }}
      >
        Fire a test through every channel.
      </h2>
      <p
        style={{
          margin: "0 0 28px",
          fontSize: "16px",
          lineHeight: 1.6,
          color: "#9c9c9d",
          maxWidth: "64ch",
        }}
      >
        This is{" "}
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "14px",
            color: "#cdcdcd",
          }}
        >
          anotifier test
        </span>{" "}
        — the exact command that proves your setup works. Toggle the channels
        you&apos;ve enabled in{" "}
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "13px",
            color: "#9c9c9d",
          }}
        >
          config.json
        </span>
        , then run it.
      </p>
      <div
        style={{
          background: "#0d0d0d",
          border: "1px solid #242728",
          borderRadius: "16px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "14px",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid #1a1b1e",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontFamily: "var(--font-mono-stack)",
              fontSize: "14px",
            }}
          >
            <span style={{ color: "#59d499" }}>$</span>
            <span style={{ color: "#f4f4f6" }}>anotifier test</span>
            <span style={{ color: "#59d499", fontSize: "12px" }}>
              {testSummary}
            </span>
          </div>
          <button
            type="button"
            onClick={fireTest}
            className="hovFire"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              background: "#ffffff",
              color: "#000000",
              border: "none",
              borderRadius: "8px",
              fontFamily: "var(--font-body)",
              fontSize: "14px",
              fontWeight: 500,
              padding: "9px 18px",
              cursor: "pointer",
            }}
          >
            {running ? "firing…" : "run test →"}
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
            gap: "14px",
            padding: "20px",
          }}
        >
          {/* desktop toast */}
          <div
            {...cardInteractive("toast")}
            className="hovBorder"
            style={cardStyle}
          >
            <div style={cardHeadStyle}>
              <span style={{ color: "#59d499" }}>{cb("toast")}</span> desktop
              toast
            </div>
            {delivered.toast && (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  background: "rgba(30,31,34,0.9)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  borderRadius: "10px",
                  padding: "9px 11px",
                  animation: "deliverPop 0.4s ease-out both",
                }}
              >
                <img
                  src="/assets/icons/claude.png"
                  width="26"
                  height="26"
                  alt=""
                  style={{ borderRadius: "6px", flex: "none" }}
                />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#f4f4f6",
                    }}
                  >
                    Claude Code <Check />
                  </div>
                  <div style={{ fontSize: "11px", color: "#cdcdcd" }}>
                    Task complete · 14 tests passing
                  </div>
                </div>
              </div>
            )}
            {pend("toast") && (
              <div style={pendStyle}>Notification Center · sound: IM</div>
            )}
          </div>

          {/* ntfy push */}
          <div
            {...cardInteractive("ntfy")}
            className="hovBorder"
            style={cardStyle}
          >
            <div style={cardHeadStyle}>
              <span style={{ color: "#59d499" }}>{cb("ntfy")}</span> ntfy push
            </div>
            {delivered.ntfy && (
              <div style={deliverBox}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    fontFamily: "var(--font-mono-stack)",
                    fontSize: "10px",
                    color: "#838a92",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "9999px",
                      background: "#59d499",
                    }}
                  />
                  ntfy.sh · your phone
                  <span
                    style={{
                      marginLeft: "auto",
                      background: "rgba(89,212,153,0.15)",
                      color: "#59d499",
                      padding: "1px 6px",
                      borderRadius: "4px",
                    }}
                  >
                    ✅ default
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#f4f4f6",
                  }}
                >
                  Claude Code <Check />
                </div>
                <div style={{ fontSize: "11px", color: "#9c9c9d" }}>
                  Task complete
                </div>
              </div>
            )}
            {pend("ntfy") && (
              <div style={pendStyle}>Android · iOS · tag: white_check_mark</div>
            )}
          </div>

          {/* webhook */}
          <div
            {...cardInteractive("webhook")}
            className="hovBorder"
            style={cardStyle}
          >
            <div style={cardHeadStyle}>
              <span style={{ color: "#59d499" }}>{cb("webhook")}</span> webhook
            </div>
            {delivered.webhook && (
              <div style={deliverBox}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      width: "16px",
                      height: "16px",
                      borderRadius: "4px",
                      background: "#4a154b",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono-stack)",
                      fontSize: "9px",
                      fontWeight: 700,
                      color: "#fff",
                    }}
                  >
                    #
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "#f4f4f6",
                      whiteSpace: "nowrap",
                    }}
                  >
                    #dev-notifs
                  </span>
                  <Check />
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "#9c9c9d",
                    lineHeight: 1.4,
                  }}
                >
                  Claude Code — task complete
                </div>
              </div>
            )}
            {pend("webhook") && (
              <div style={pendStyle}>POST · Slack / Discord / Telegram</div>
            )}
          </div>

          {/* terminal bell */}
          <div
            {...cardInteractive("bell")}
            className="hovBorder"
            style={cardStyle}
          >
            <div style={cardHeadStyle}>
              <span style={{ color: "#59d499" }}>{cb("bell")}</span> terminal
              bell
            </div>
            {delivered.bell && (
              <div
                style={{
                  position: "relative",
                  background: "#101111",
                  border: "1px solid #242728",
                  borderRadius: "10px",
                  padding: "11px",
                  fontFamily: "var(--font-mono-stack)",
                  fontSize: "12px",
                  color: "#cdcdcd",
                  animation: "deliverPop 0.4s ease-out both",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "11px",
                    left: "12px",
                    width: "16px",
                    height: "16px",
                    border: "1px solid #ffc533",
                    borderRadius: "9999px",
                    animation: "ripplePing 0.7s ease-out",
                  }}
                />
                <span style={{ color: "#ffc533" }}>♪</span> BEL → controlling
                tty <Check />
              </div>
            )}
            {pend("bell") && (
              <div style={pendStyle}>SSH · tmux · GNU screen</div>
            )}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: "14px",
          fontFamily: "var(--font-mono-stack)",
          fontSize: "12px",
          color: "#838a92",
        }}
      >
        tap a channel to toggle it · atomic dedup means one event = one ping,
        even when a tool double-fires
      </div>
      <div
        style={{
          marginTop: "10px",
          fontSize: "13px",
          lineHeight: 1.6,
          color: "#9c9c9d",
          maxWidth: "72ch",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono-stack)",
            fontSize: "12px",
            color: "#cdcdcd",
          }}
        >
          anotifier doctor --deep
        </span>{" "}
        goes further — it fires a real notification and reads it back out of the
        OS: Notification Center&apos;s database on macOS, the dunst
        daemon&apos;s history on Linux. On Windows it probes the toast backend
        (PowerShell + BurntToast) instead; there is no delivery read-back there.
      </div>
    </section>
  );
}
