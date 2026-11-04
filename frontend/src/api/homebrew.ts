import { api } from "./client";
import type { Ruleset } from "../lib/ruleset";

// Plan 133 — a DM's homebrew races and subclasses (api/routers/homebrew.py); Plan 135 feats. Only the DM who
// made one sees it; every character built in that DM's campaigns can pick it. `ruleset`
// null means both editions.

export type AbilityCode = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";

/** "Plus N +1s of the player's choice", not on the excluded abilities. */
export interface AbilityChoice {
  choose: number;
  amount: 1;
  exclude: AbilityCode[];
}

export interface RaceTrait {
  name: string;
  text: string;
}

// Plan 135 — speeds besides walking, natural weapons, subclass counters, feats.
export type SpeedKind = "fly" | "swim" | "climb" | "burrow";
export const SPEED_KINDS: SpeedKind[] = ["fly", "swim", "climb", "burrow"];
/** { fly: 30, swim: 30 }: 5–120 ft in steps of 5. */
export type Speeds = Partial<Record<SpeedKind, number>>;

export const DAMAGE_TYPES = [
  "acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic",
  "piercing", "poison", "psychic", "radiant", "slashing", "thunder",
] as const;

/** A race's built-in attack. `damage` is "1d6" or a flat number ("1"). */
export interface NaturalWeapon {
  name: string;
  damage: string;
  damage_type: string;
  /** "best" = the higher of STR and DEX, like a finesse weapon. */
  ability: "STR" | "DEX" | "best";
  note: string;
}

export type DieSize = "d4" | "d6" | "d8" | "d10" | "d12";
export type UsesFormula = "prof_bonus" | "prof_x2" | "level" | "half_level" | AbilityCode;

/**
 * A subclass counter (Superiority Dice). It arrives at `level`. Uses come from `uses` (by
 * level; needs an entry at `level`) or `uses_formula`, exactly one. A table entry holds from
 * its level until the next.
 */
export interface SubclassResource {
  name: string;
  level: number;
  recovery: "short" | "long";
  uses: Record<string, number> | null;
  uses_formula: UsesFormula | null;
  die: Record<string, DieSize> | null;
  text: string;
}

/** A feat's "−5 to hit, +10 damage" trade, a toggle on qualifying attacks. */
export interface PowerAttack {
  to_hit: number;
  damage: number;
  weapons: "ranged" | "heavy" | "melee" | "any";
}

export type FeatCategory = "general" | "origin" | "fighting_style" | "epic_boon";

export interface HomebrewFeatInput {
  name: string;
  ruleset: Ruleset | null;
  category: FeatCategory;
  blurb: string;
  description: string;
  /** Shown to the player; not enforced. */
  prerequisite: string;
  /** Where the +1 may go: null (none), "any", or ability codes. */
  asi_options: "any" | AbilityCode[] | null;
  repeatable: boolean;
  power_attack: PowerAttack | null;
}

export interface HomebrewFeat extends HomebrewFeatInput {
  id: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

export interface HomebrewRaceInput {
  name: string;
  ruleset: Ruleset | null;
  size: "Small" | "Medium";
  speed: number;
  /** 2014 only: the 2024 rules give ability bonuses through the background. */
  ability_bonuses: Partial<Record<AbilityCode, number>>;
  ability_choice: AbilityChoice | null;
  skills: string[];
  skill_choice: number;
  traits: RaceTrait[];
  languages: string;
  hp_per_level: number;
  /** Feet (30, 60 or 120), or null for none. */
  darkvision: number | null;
  /** Plan 135. Left out = unchanged on a save. */
  speeds?: Speeds | null;
  natural_weapons?: NaturalWeapon[];
}

export interface HomebrewRace extends HomebrewRaceInput {
  id: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

/** An SRD race laid out as a homebrew race, to start a new one from. Not checked. */
export interface RaceTemplate extends Omit<HomebrewRaceInput, "ruleset" | "size"> {
  ruleset: Ruleset;
  size: string;
}

export interface SubclassFeature {
  level: number;
  name: string;
  text: string;
}

export interface HomebrewSubclassInput {
  name: string;
  /** The class name, e.g. "Paladin". */
  character_class: string;
  ruleset: Ruleset | null;
  features: SubclassFeature[];
  /** Spells always prepared, by level: { "3": ["Bless"] }. */
  always_prepared: Record<string, string[]> | null;
  blurb: string;
  /** Plan 135. Left out = unchanged on a save. */
  resources?: SubclassResource[];
}

export interface HomebrewSubclass extends HomebrewSubclassInput {
  id: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
}

// Saves and deletes are quiet: the forms and the page show the error next to the button.
export const homebrewApi = {
  races: () => api.get<HomebrewRace[]>("/homebrew/races"),
  raceTemplates: () => api.get<RaceTemplate[]>("/homebrew/race-templates"),
  createRace: (body: HomebrewRaceInput) => api.post<HomebrewRace>("/homebrew/races", body, { quiet: true }),
  updateRace: (id: string, body: Partial<HomebrewRaceInput>) =>
    api.patch<HomebrewRace>(`/homebrew/races/${id}`, body, { quiet: true }),
  /** Refused (409) with a plain message while a character uses the race. */
  removeRace: (id: string) => api.delete(`/homebrew/races/${id}`, { quiet: true }),

  subclasses: (characterClass?: string) =>
    api.get<HomebrewSubclass[]>(
      `/homebrew/subclasses${characterClass ? `?character_class=${encodeURIComponent(characterClass)}` : ""}`,
    ),
  createSubclass: (body: HomebrewSubclassInput) =>
    api.post<HomebrewSubclass>("/homebrew/subclasses", body, { quiet: true }),
  updateSubclass: (id: string, body: Partial<HomebrewSubclassInput>) =>
    api.patch<HomebrewSubclass>(`/homebrew/subclasses/${id}`, body, { quiet: true }),
  /** Refused (409) with a plain message while a character has the subclass. */
  removeSubclass: (id: string) => api.delete(`/homebrew/subclasses/${id}`, { quiet: true }),

  feats: () => api.get<HomebrewFeat[]>("/homebrew/feats"),
  createFeat: (body: HomebrewFeatInput) => api.post<HomebrewFeat>("/homebrew/feats", body, { quiet: true }),
  updateFeat: (id: string, body: Partial<HomebrewFeatInput>) =>
    api.patch<HomebrewFeat>(`/homebrew/feats/${id}`, body, { quiet: true }),
  /** Refused (409) with a plain message while a character has the feat. */
  removeFeat: (id: string) => api.delete(`/homebrew/feats/${id}`, { quiet: true }),
};

/** "2014 rules", "2024 rules" or "Both rules" for a homebrew row's `ruleset`. */
export function homebrewRulesLabel(r: Ruleset | null): string {
  return r ? `${r} rules` : "Both rules";
}
