"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SoundContextValue = {
  soundOn: boolean;
  toggleSound: () => void;
  playDing: (kind?: string | null) => void;
};

const SoundContext = createContext<SoundContextValue | null>(null);

export function useSound(): SoundContextValue {
  const ctx = useContext(SoundContext);
  if (!ctx) {
    throw new Error("useSound must be used within a SoundProvider");
  }
  return ctx;
}

export default function SoundProvider({ children }: { children: ReactNode }) {
  const [soundOn, setSoundOn] = useState(false);
  const acRef = useRef<AudioContext | null>(null);
  const sndTimer = useRef<ReturnType<typeof setInterval> | undefined>(
    undefined,
  );

  const ensureAudio = (): AudioContext | null => {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    if (!acRef.current) acRef.current = new AC();
    if (acRef.current.state === "suspended") acRef.current.resume();
    return acRef.current;
  };

  const playDing = (kind?: string | null) => {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.9;
    master.connect(ac.destination);
    const notes = kind === "urgent" ? [784, 1047, 1319] : [880, 1319];
    notes.forEach((f, i) => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = f;
      o.connect(g);
      g.connect(master);
      const t = now + i * 0.1;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.start(t);
      o.stop(t + 0.44);
    });
  };

  const toggleSound = () => {
    const on = !soundOn;
    setSoundOn(on);
    clearInterval(sndTimer.current);
    if (on) {
      playDing();
      sndTimer.current = setInterval(() => {
        if (!document.hidden) playDing();
      }, 8000);
    }
  };

  useEffect(() => {
    return () => {
      clearInterval(sndTimer.current);
      if (acRef.current) {
        try {
          acRef.current.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  return (
    <SoundContext.Provider value={{ soundOn, toggleSound, playDing }}>
      {children}
    </SoundContext.Provider>
  );
}
