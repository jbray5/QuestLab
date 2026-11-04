import { api } from "./client";
import type { Ruleset } from "../lib/ruleset";

// Plan 133 — a DM's homebrew races and subclasses (api/routers/homebrew.py). Only the DM who
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
};

/** "2014 rules", "2024 rules" or "Both rules" for a homebrew row's `ruleset`. */
export function homebrewRulesLabel(r: Ruleset | null): string {
  return r ? `${r} rules` : "Both rules";
}
