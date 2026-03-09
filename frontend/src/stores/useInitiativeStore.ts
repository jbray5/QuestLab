import { create } from "zustand";
import type { Combatant } from "../api/types";

interface InitiativeState {
  combatants: Combatant[];
  currentIndex: number;
  round: number;
  setCombatants: (c: Combatant[]) => void;
  nextTurn: () => void;
  toggleDefeated: (name: string) => void;
  setHp: (name: string, hp: number) => void;
  reset: () => void;
}

export const useInitiativeStore = create<InitiativeState>((set, get) => ({
  combatants: [],
  currentIndex: 0,
  round: 1,

  setCombatants: (c) => set({ combatants: c, currentIndex: 0, round: 1 }),

  nextTurn: () => {
    const { combatants, currentIndex, round } = get();
    const active = combatants.filter((c) => !c.defeated);
    if (active.length === 0) return;
    const nextIdx = (currentIndex + 1) % combatants.length;
    const newRound = nextIdx < currentIndex ? round + 1 : round;
    const updated = combatants.map((c, i) => ({ ...c, active: i === nextIdx }));
    set({ combatants: updated, currentIndex: nextIdx, round: newRound });
  },

  toggleDefeated: (name) =>
    set((s) => ({
      combatants: s.combatants.map((c) =>
        c.name === name ? { ...c, defeated: !c.defeated, active: false } : c,
      ),
    })),

  setHp: (name, hp) =>
    set((s) => ({
      combatants: s.combatants.map((c) => (c.name === name ? { ...c, hp } : c)),
    })),

  reset: () => set({ combatants: [], currentIndex: 0, round: 1 }),
}));
