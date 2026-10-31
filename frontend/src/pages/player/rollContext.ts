/** The roll sheet's spec and the hook to open it from anywhere on the phone (Plan 122). */
import { createContext, useContext } from "react";

import type { RollResult } from "../../api/play";

export type Die = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export interface RollSpec {
  /** What it is, in words: "Shortbow attack", "Stealth check". */
  title: string;
  kind: "attack" | "check" | "save" | "damage" | "heal" | "initiative" | "hitdie" | "death" | "free";
  die: Die;
  count?: number;
  modifier: number;
  /** Why the modifier is what it is (shown at Teach / Remind). */
  why?: string;
  /** For attacks: the damage roll to offer after rolling to hit. */
  damage?: { dice: string; type?: string; sneakDice?: number };
  /** Crit on the attack that led here: damage dice are doubled. */
  crit?: boolean;
  /** Called with the result (e.g. resolve a death save, heal from a hit die). */
  onResult?: (r: RollResult) => Promise<string | void> | string | void;
  /** For a healing roll (Plan 128): put the total on your own hit points; returns what to say. */
  healSelf?: (amount: number) => Promise<string>;
}

interface Ctx {
  open: (spec: RollSpec) => void;
}

export const RollCtx = createContext<Ctx>({ open: () => undefined });

/** Open the roll sheet from anywhere on the phone. */
export function useRoll() {
  return useContext(RollCtx).open;
}
