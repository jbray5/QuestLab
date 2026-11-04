import { api } from "./client";
import type { NaturalAttack } from "./types";

// Plan 135 — a PC's natural attacks (claws, a bite) from its DM's homebrew race, for the DM's
// sheet (api/routers/items.py). The phone gets the same attacks in its turn kit.

export const attacksApi = {
  /** Empty for a PC whose race has no natural weapons (every SRD race). */
  natural: (characterId: string) =>
    api.get<NaturalAttack[]>(`/characters/${characterId}/natural-attacks`, { quiet: true }),
};
