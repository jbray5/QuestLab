import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * How much the player's phone explains (Plan 122):
 * `teach` — plain words, ideas for your turn; `remind` — short labels, tips on tap;
 * `numbers` — dense and quick. Per character, on this device.
 */
export type HelpLevel = "teach" | "remind" | "numbers";

interface PcPrefs {
  help: HelpLevel;
  /** First-open screen done (who are you, how much help). */
  onboarded: boolean;
  /** The "fewer hints?" nudge was answered at this level; don't ask again there. */
  nudged?: HelpLevel;
  /** Keep the screen awake during a session. */
  awake: boolean;
}

const DEFAULTS: PcPrefs = { help: "teach", onboarded: false, awake: false };

interface PlayerPrefsState {
  byPc: Record<string, PcPrefs>;
  set: (pcId: string, patch: Partial<PcPrefs>) => void;
}

export const usePlayerPrefsStore = create<PlayerPrefsState>()(
  persist(
    (set) => ({
      byPc: {},
      set: (pcId, patch) =>
        set((s) => ({ byPc: { ...s.byPc, [pcId]: { ...DEFAULTS, ...s.byPc[pcId], ...patch } } })),
    }),
    { name: "ql-player-prefs" },
  ),
);

/** This character's phone preferences, and a setter for them. */
export function usePlayerPrefs(pcId: string): [PcPrefs, (patch: Partial<PcPrefs>) => void] {
  const prefs = usePlayerPrefsStore((s) => s.byPc[pcId]) ?? DEFAULTS;
  const set = usePlayerPrefsStore((s) => s.set);
  return [prefs, (patch) => set(pcId, patch)];
}
