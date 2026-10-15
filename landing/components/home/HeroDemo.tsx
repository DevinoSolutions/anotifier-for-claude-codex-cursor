"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import "./hero/hero.css";
import { Phone } from "./hero/Phone";
import { Screen } from "./hero/vscode";
import { useSound } from "./SoundProvider";
import { LOOP_MS, NOTICES, STATIC_AT, cues } from "./hero/timeline";

// The hero scene: a VS Code window running Claude Code and Codex in its
// terminal, next to the phone that gets the same news. The loop clock lives
// here; each cue is a single state change and the CSS animates it, so the
// demo costs a handful of renders per loop. It runs only while on screen, and
// the toast sounds fire from the same cues that show the toasts.
const REDUCED = "(prefers-reduced-motion: reduce)";
const subscribeReduced = (onChange: () => void) => {
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const reducedNow = () => window.matchMedia(REDUCED).matches;

export default function HeroDemo() {
  // Server and first hydration render the animated start; a visitor who asks
  // for reduced motion gets the still frame, and a change of the setting
  // while the page is open is followed.
  const reduced = useSyncExternalStore(
    subscribeReduced,
    reducedNow,
    () => false,
  );
  const { soundOn, playDing } = useSound();
  const sound = useRef({ soundOn, playDing });
  sound.current = { soundOn, playDing };

  const root = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (reduced) return;

    let timers: ReturnType<typeof setTimeout>[] = [];
    let running = false;
    let onScreen = false;

    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      running = false;
    };
    const play = () => {
      stop();
      running = true;
      setNow(0);
      for (const cue of cues()) {
        timers.push(
          setTimeout(() => {
            setNow(cue);
            const notice = NOTICES.find((n) => n.toastAt === cue);
            if (notice && sound.current.soundOn) {
              sound.current.playDing(notice.urgent ? "urgent" : null);
            }
          }, cue),
        );
      }
      timers.push(setTimeout(play, LOOP_MS));
    };
    const sync = () => {
      if (onScreen && !document.hidden) {
        if (!running) play();
      } else stop();
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    document.addEventListener("visibilitychange", sync);
    return () => {
      stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
    };
  }, [reduced]);

  return (
    <div ref={root} className="hdStage" aria-hidden="true">
      <div className="hdCanvas">
        <div className="hdLaptop">
          <div className="hdLid">
            <span className="cam" />
            <Screen now={reduced ? STATIC_AT : now} />
          </div>
          <div className="hdBase" />
        </div>
        <Phone now={reduced ? STATIC_AT : now} />
      </div>
    </div>
  );
}
