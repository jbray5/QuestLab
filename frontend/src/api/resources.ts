import { api } from "./client";
import type { DieSize } from "./homebrew";

// Plan 135 — a character's counters (api/routers/resources.py): a homebrew subclass's
// (Superiority Dice; size and die computed at the character's level, read-only here) and
// hand-made ones (any name, any character). Both refill on rests.

export type ResourceRecovery = "short" | "long" | "none";

/** One counter as the sheet shows it: "Superiority Dice · 4 of 5 · d10". */
export interface CharacterResource {
  id: string;
  character_id: string;
  /** "subclass": from the character's homebrew subclass; change it there. */
  source: "custom" | "subclass";
  name: string;
  max_uses: number;
  die: DieSize | null;
  recovery: ResourceRecovery;
  uses_spent: number;
  /** A hand-made counter's notes, or the subclass's text for its counter. */
  notes: string | null;
  /** A subclass counter: the level it arrives at. */
  level: number | null;
}

/** "Add a counter": 1–100 uses, d4–d12 or no die. */
export interface CharacterResourceInput {
  name: string;
  max_uses: number;
  die: DieSize | null;
  recovery: ResourceRecovery;
  notes: string | null;
}

export const MAX_RESOURCE_USES = 100;

// Saves are quiet: the form shows the error next to its button.
export const resourcesApi = {
  list: (characterId: string) => api.get<CharacterResource[]>(`/characters/${characterId}/resources`),
  create: (characterId: string, body: CharacterResourceInput) =>
    api.post<CharacterResource>(`/characters/${characterId}/resources`, body, { quiet: true }),
  update: (characterId: string, resourceId: string, body: Partial<CharacterResourceInput>) =>
    api.patch<CharacterResource>(`/characters/${characterId}/resources/${resourceId}`, body, { quiet: true }),
  remove: (characterId: string, resourceId: string) =>
    api.delete(`/characters/${characterId}/resources/${resourceId}`, { quiet: true }),
  spend: (characterId: string, resourceId: string, amount = 1) =>
    api.post<CharacterResource>(`/characters/${characterId}/resources/${resourceId}/spend?amount=${amount}`),
  restore: (characterId: string, resourceId: string, amount = 1) =>
    api.post<CharacterResource>(`/characters/${characterId}/resources/${resourceId}/restore?amount=${amount}`),
};
