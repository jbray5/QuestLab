import { create } from "zustand";

import { sessionsApi } from "../api/sessions";
import type {
  Combatant,
  SessionCombatant,
  SessionCombatantCreate,
  SessionCombatantUpdate,
} from "../api/types";

/**
 * Persistent initiative store (Plan 00015).
 *
 * Hydrates from `GET /sessions/:id/combat` on session open and persists every
 * mutation back through the API so a browser refresh during play preserves
 * combatants, HP, conditions, defeated flag, round, and active turn.
 *
 * Combatants are keyed by their backend-issued UUID. Pre-persistence rolls
 * (where the server returns the legacy Combatant shape with `roll`/`initiative`
 * fields but no id) flow through `replaceFromRoll`, which then persists them.
 */

interface InitiativeState {
  sessionId: string | null;
  combatants: SessionCombatant[];
  round: number;
  activeCombatantId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /** Load persisted combat state from the backend. Call on session open. */
  hydrate: (sessionId: string) => Promise<void>;

  /** Persist a freshly-rolled combatant list, replacing any prior roster. */
  replaceFromRoll: (
    sessionId: string,
    rolled: Combatant[],
  ) => Promise<void>;

  /** Patch a single combatant (HP, defeated, conditions, ...). Optimistic. */
  patchCombatant: (
    combatantId: string,
    patch: SessionCombatantUpdate,
  ) => Promise<void>;

  /** Toggle defeated flag for a combatant. */
  toggleDefeated: (combatantId: string) => Promise<void>;

  /** Advance the turn pointer (skips defeated, increments round on wrap). */
  nextTurn: () => Promise<void>;

  /** Clear all combatants and reset round/turn state. */
  reset: () => Promise<void>;
}

function toCreatePayload(c: Combatant, sortIndex: number): SessionCombatantCreate {
  const type: "pc" | "monster" | "npc" =
    c.type === "pc" || c.type === "monster" || c.type === "npc" ? c.type : "monster";
  return {
    sort_index: sortIndex,
    name: c.name,
    dex_score: c.dex_score,
    initiative_roll: c.initiative ?? 0,
    hp_current: Math.max(0, c.hp),
    hp_max: Math.max(1, c.max_hp),
    type,
    defeated: c.defeated ?? false,
    monster_id: c.monster_id ?? null,
    character_id: c.character_id ?? null,
    conditions: [],
  };
}

export const useInitiativeStore = create<InitiativeState>((set, get) => ({
  sessionId: null,
  combatants: [],
  round: 1,
  activeCombatantId: null,
  loading: false,
  saving: false,
  error: null,

  hydrate: async (sessionId) => {
    set({ sessionId, loading: true, error: null });
    try {
      const state = await sessionsApi.getCombatState(sessionId);
      set({
        combatants: state.combatants,
        round: state.round,
        activeCombatantId: state.active_combatant_id,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load combat state",
      });
    }
  },

  replaceFromRoll: async (sessionId, rolled) => {
    set({ sessionId, saving: true, error: null });
    try {
      const payload = {
        round: 1,
        active_combatant_id: null,
        combatants: rolled.map((c, i) => toCreatePayload(c, i)),
      };
      const state = await sessionsApi.saveCombatState(sessionId, payload);
      set({
        combatants: state.combatants,
        round: state.round,
        activeCombatantId: state.active_combatant_id,
        saving: false,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to save combat state",
      });
    }
  },

  patchCombatant: async (combatantId, patch) => {
    const { sessionId, combatants } = get();
    if (!sessionId) return;

    // Auto-defeat at 0 HP. Only auto-flip TO defeated; revive must be explicit
    // (a DM healing a downed PC mid-death-save might not want to auto-revive).
    const effectivePatch: SessionCombatantUpdate = { ...patch };
    if (effectivePatch.hp_current !== undefined && effectivePatch.hp_current <= 0) {
      if (effectivePatch.defeated === undefined) effectivePatch.defeated = true;
    }

    // Optimistic update — apply locally, then persist. On error revert.
    const previous = combatants;
    const optimistic = combatants.map((c) =>
      c.id === combatantId ? { ...c, ...effectivePatch } : c,
    );
    set({ combatants: optimistic, saving: true, error: null });

    try {
      const updated = await sessionsApi.patchCombatant(
        sessionId,
        combatantId,
        effectivePatch,
      );
      set((s) => ({
        combatants: s.combatants.map((c) => (c.id === combatantId ? updated : c)),
        saving: false,
      }));
    } catch (err) {
      set({
        combatants: previous,
        saving: false,
        error: err instanceof Error ? err.message : "Failed to update combatant",
      });
    }
  },

  toggleDefeated: async (combatantId) => {
    const target = get().combatants.find((c) => c.id === combatantId);
    if (!target) return;
    const willBeDefeated = !target.defeated;
    const patch: SessionCombatantUpdate = { defeated: willBeDefeated };
    // Reviving from 0 HP: restore to 1 so the combatant can act this round.
    if (!willBeDefeated && target.hp_current <= 0) patch.hp_current = 1;
    await get().patchCombatant(combatantId, patch);
  },

  nextTurn: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    set({ saving: true, error: null });
    try {
      const state = await sessionsApi.advanceCombatTurn(sessionId);
      set({
        combatants: state.combatants,
        round: state.round,
        activeCombatantId: state.active_combatant_id,
        saving: false,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to advance turn",
      });
    }
  },

  reset: async () => {
    const { sessionId } = get();
    if (!sessionId) return;
    set({ saving: true, error: null });
    try {
      await sessionsApi.clearCombatState(sessionId);
      set({
        combatants: [],
        round: 1,
        activeCombatantId: null,
        saving: false,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to clear combat",
      });
    }
  },
}));
