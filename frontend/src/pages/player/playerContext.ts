/** What the companion phone knows about its character, shared by every tab (Plan 122). */
import { createContext, useContext } from "react";

import type { CombatState, PlaySpell, TurnKit, TurnState } from "../../api/play";
import type { CharacterFeature, PlayerCharacter, SpellcastingStats, SpellSlotStateRead } from "../../api/types";
import type { HelpLevel } from "../../stores/usePlayerPrefs";

export type Tab = "now" | "character" | "spells" | "bag" | "journal";

/** A table roll seen on the phone: anyone's, with who rolled it. */
export interface FeedRoll {
  id: number;
  label: string;
  detail: string;
  total: number;
  crit: boolean;
  fumble: boolean;
  roller: string;
}

export interface PlayerData {
  pcId: string;
  pc: PlayerCharacter;
  help: HelpLevel;
  setHelp: (h: HelpLevel) => void;
  stats: SpellcastingStats | undefined;
  slots: SpellSlotStateRead | undefined;
  spells: PlaySpell[];
  features: CharacterFeature[];
  skills: Record<string, number>;
  saves: Record<string, number>;
  turn: TurnState | undefined;
  combat: CombatState | undefined;
  kit: TurnKit | undefined;
  feed: FeedRoll[];
  liveSessionId: string | null;
  isCaster: boolean;
  go: (tab: Tab) => void;
  refresh: () => void;
  notify: (text: string) => void;
}

export const Ctx = createContext<PlayerData | null>(null);

/** Everything the phone knows about this character, live. */
export function usePlayer(): PlayerData {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer outside PlayerApp");
  return v;
}
