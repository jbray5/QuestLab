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
  combatState: string;
  loading: boolean;
  saving: boolean;
  error: string | null;

  /** Load persisted combat state from the backend. Call on session open. */
  hydrate: (sessionId: string) => Promise<void>;

  /**
   * Persist a full roster snapshot, replacing any prior roster. Used for the
   * idle prep seed (combatState "idle" — no turn pings) and rolling initiative
   * (combatState "running" — pings the active PC). Defaults to "running".
   */
  replaceFromRoll: (
    sessionId: string,
    rolled: Combatant[],
    combatState?: "idle" | "running" | "ended",
  ) => Promise<void>;

  /** Add one combatant mid-fight (preserves round/turn/conditions/beats). */
  addCombatant: (combatant: Combatant) => Promise<void>;

  /** Remove one combatant mid-fight (advances the turn if it was active). */
  removeCombatant: (combatantId: string) => Promise<void>;

  /** Persist an initiative edit immediately; server reseats the turn order. */
  setInitiative: (combatantId: string, value: number) => Promise<void>;

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

// ─── Per-combatant debounced sync ───────────────────────────────────────────
// Rapid HP clicks (e.g. − three times in a quarter second) used to fire three
// sequential PATCHes; responses arriving in order overwrote the optimistic
// state with stale-looking data, producing visible rubber-banding.
//
// New behavior: every patch immediately mutates local state, and a single
// PATCH is scheduled 220 ms after the last call per-combatant. The PATCH
// sends the LATEST local state, not the original diff. Server response does
// NOT overwrite local state on success — only errors are surfaced.

const SYNC_DELAY_MS = 220;
const pendingSyncTimers: Record<string, number> = {};

function scheduleSync(
  combatantId: string,
  get: () => InitiativeState,
  set: (partial: Partial<InitiativeState>) => void,
): void {
  if (pendingSyncTimers[combatantId] !== undefined) {
    window.clearTimeout(pendingSyncTimers[combatantId]);
  }
  pendingSyncTimers[combatantId] = window.setTimeout(async () => {
    delete pendingSyncTimers[combatantId];
    const state = get();
    if (!state.sessionId) return;
    const current = state.combatants.find((c) => c.id === combatantId);
    if (!current) return;
    // Send the latest authoritative local snapshot.
    const payload: SessionCombatantUpdate = {
      hp_current: current.hp_current,
      hp_max: current.hp_max,
      defeated: current.defeated,
      conditions: current.conditions ?? [],
    };
    try {
      await sessionsApi.patchCombatant(state.sessionId, combatantId, payload);
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to sync combatant",
      });
    }
  }, SYNC_DELAY_MS);
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
    ac: c.ac ?? null,
    monster_id: c.monster_id ?? null,
    character_id: c.character_id ?? null,
    conditions: c.conditions ?? [],
  };
}

export const useInitiativeStore = create<InitiativeState>((set, get) => ({
  sessionId: null,
  combatants: [],
  round: 1,
  activeCombatantId: null,
  combatState: "idle",
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
        combatState: state.combat_state,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load combat state",
      });
    }
  },

  replaceFromRoll: async (sessionId, rolled, combatState = "running") => {
    set({ sessionId, saving: true, error: null });
    try {
      const payload = {
        round: 1,
        combat_state: combatState,
        active_combatant_id: null,
        combatants: rolled.map((c, i) => toCreatePayload(c, i)),
      };
      const state = await sessionsApi.saveCombatState(sessionId, payload);
      set({
        combatants: state.combatants,
        round: state.round,
        activeCombatantId: state.active_combatant_id,
        combatState: state.combat_state,
        saving: false,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to save combat state",
      });
    }
  },

  addCombatant: async (combatant) => {
    const { sessionId } = get();
    if (!sessionId) return;
    set({ saving: true, error: null });
    try {
      const state = await sessionsApi.addCombatant(sessionId, toCreatePayload(combatant, 0));
      set({
        combatants: state.combatants,
        round: state.round,
        activeCombatantId: state.active_combatant_id,
        combatState: state.combat_state,
        saving: false,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to add combatant",
      });
    }
  },

  removeCombatant: async (combatantId) => {
    const { sessionId } = get();
    if (!sessionId) return;
    set({ saving: true, error: null });
    try {
      const state = await sessionsApi.removeCombatant(sessionId, combatantId);
      set({
        combatants: state.combatants,
        round: state.round,
        activeCombatantId: state.active_combatant_id,
        combatState: state.combat_state,
        saving: false,
      });
    } catch (err) {
      set({
        saving: false,
        error: err instanceof Error ? err.message : "Failed to remove combatant",
      });
    }
  },

  setInitiative: async (combatantId, value) => {
    const { sessionId } = get();
    if (!sessionId) return;
    // Optimistic — the HUD re-sorts by initiative immediately; the server
    // reseats sort_index so the turn walk matches the displayed order.
    set((s) => ({
      combatants: s.combatants.map((c) =>
        c.id === combatantId ? { ...c, initiative_roll: value } : c,
      ),
      error: null,
    }));
    try {
      await sessionsApi.patchCombatant(sessionId, combatantId, {
        initiative_roll: value,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to set initiative",
      });
    }
  },

  patchCombatant: async (combatantId, patch) => {
    const { sessionId } = get();
    if (!sessionId) return;

    // Auto-defeat at 0 HP. Only auto-flip TO defeated; revive must be explicit
    // (a DM healing a downed PC mid-death-save might not want to auto-revive).
    const effectivePatch: SessionCombatantUpdate = { ...patch };
    if (effectivePatch.hp_current !== undefined && effectivePatch.hp_current <= 0) {
      if (effectivePatch.defeated === undefined) effectivePatch.defeated = true;
    }

    // Optimistic update — apply locally IMMEDIATELY. The local state is the
    // source of truth for what the DM sees; the server is a durable mirror.
    set((s) => ({
      combatants: s.combatants.map((c) =>
        c.id === combatantId ? { ...c, ...effectivePatch } : c,
      ),
      error: null,
    }));

    // Debounce server sync per-combatant so rapid clicks (e.g. −, −, −) collapse
    // into a single PATCH with the latest values. Without this, sequential
    // responses arriving out-of-order overwrite the optimistic UI state and
    // produce a "rubber-band" snap-back effect.
    scheduleSync(combatantId, get, set);
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
      // Don't overwrite local combatants — advance_combat_turn only mutates
      // round + active_combatant_id server-side, and clobbering combatants
      // would lose any HP/condition changes still in the debounced sync queue.
      set({
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
        combatState: "ended",
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
