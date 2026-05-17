import { useEffect, useState } from "react";

// Persisted dice-tray preferences (Plan 00030). Localstorage-backed so
// the user's "sound on" choice survives reloads, but they start opted-
// OUT so first-load doesn't surprise the table with audio.

const KEY = "ql-dice-prefs";

export interface DicePrefs {
  soundEnabled: boolean;
}

const DEFAULTS: DicePrefs = {
  soundEnabled: false,
};

function read(): DicePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function write(prefs: DicePrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* quota / disabled — ignore */
  }
}

/** Hook to read + update persisted dice prefs across the app. */
export function useDicePrefs(): [DicePrefs, (next: Partial<DicePrefs>) => void] {
  const [prefs, setPrefs] = useState<DicePrefs>(() => read());

  // Cross-tab sync.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== KEY) return;
      setPrefs(read());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = (next: Partial<DicePrefs>) => {
    setPrefs((curr) => {
      const merged = { ...curr, ...next };
      write(merged);
      return merged;
    });
  };

  return [prefs, update];
}

/**
 * Convenience: returns a function that runs the given sound effect IFF
 * the user has sound enabled. Used by RollHelper to fire crit/fumble
 * audio without re-checking the pref every time.
 */
export function useGatedSfx(): (fn: () => void) => void {
  const [{ soundEnabled }] = useDicePrefs();
  return (fn: () => void) => {
    if (soundEnabled) {
      try {
        fn();
      } catch {
        /* AudioContext blocked; ignore */
      }
    }
  };
}
