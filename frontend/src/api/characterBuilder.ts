import { api } from "./client";

/**
 * The character creator's API (Plan 74, Plan 126).
 *
 * One wizard, two doors: a player builds from the join link (`/play/join/...`, gated by the
 * campaign's join code and its "players can create characters" switch); the campaign's DM
 * builds from the Characters page (`/campaigns/.../character-builder`, owner only). The
 * server applies the same rules either way.
 */

export type Ability = "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
export type WizardMode = "player" | "dm";

export interface BuilderSpellPick {
  count: number;
  level: number;
  schools?: string[];
  list_from_choice?: boolean;
}

/** One row of the level-up feat catalog (integrations/dnd_rules/levelup_2024.py). */
export interface BuilderFeat {
  name: string;
  category: "general" | "fighting_style" | "origin";
  blurb: string;
  prereq: {
    any_ability?: Record<string, number>;
    spellcasting?: boolean;
    armor?: string;
    fighting_style?: boolean;
  };
  /** Abilities the feat's +1 may go to; "any" = all six; null = no increase. */
  asi_options: string[] | "any" | null;
  save_prof: boolean;
  fixed_spells: string[];
  spell_picks: BuilderSpellPick[];
  skill_pick: { count: number; from: string[] | null; upgrade: boolean } | null;
  expertise_pick: number;
  choice: { label: string; options: string[] } | null;
  hp_per_level: number;
  ac_bonus_in_armor: number;
  repeatable: boolean;
  srd: boolean;
}

export interface BuilderClass {
  hit_die: number;
  primary: Ability[];
  saves: Ability[];
  skills: { choose: number; from: string[] };
  armor: string[];
  subclass_level: number;
  srd_subclasses: string[];
  spellcasting: { ability: Ability; cantrips_base: number; prepared: number[] } | null;
  kits: { name: string; items: string[]; armor: string | null; shield: boolean }[];
}

export interface BuilderOptions {
  campaign_name: string;
  species: {
    name: string;
    size: string;
    speed: number;
    traits: string[];
    bonus_skill_choices?: number;
    bonus_skill_from?: string[];
    bonus_origin_feat?: boolean;
    hp_per_level_bonus?: number;
  }[];
  backgrounds: { name: string; abilities: Ability[]; feat: string; skills: string[]; tool: string; blurb: string }[];
  origin_feats: { name: string; blurb: string }[];
  classes: Record<string, BuilderClass>;
  skills: Record<string, Ability>;
  standard_array: number[];
  point_buy_cost: Record<string, number>;
  point_buy_budget: number;
  armor: Record<string, { base: number; dex_cap: number | null; category: string; str_min?: number }>;
  spells: { name: string; level: number; classes: string[]; school: string }[];
  weapons: { name: string; damage_die: string; damage_type: string; category: string }[];
  // Plan 126 — the improvement step and the explanations.
  feats: BuilderFeat[];
  asi_levels: Record<string, number[]>;
  popular_feats: Record<string, string[]>;
  class_features: Record<string, Record<string, string[]>>;
  subclass_features: Record<string, Record<string, string[]>>;
  feature_notes: Record<string, string>;
  fighting_style_level: Record<string, number>;
  caster_subclasses: string[];
  hp_per_level_species: Record<string, number>;
  hp_per_level_subclass: Record<string, number>;
  unarmored_ac_subclass: Record<string, string>;
  spell_slots: Record<string, Record<string, number>[]>;
}

/** One Ability Score Improvement level's pick (the level-up guide's FeatChoice + its level). */
export interface BuildAsiPick {
  level: number;
  name: string;
  from_book?: boolean;
  asi: Record<string, number>;
  choice?: string | null;
  spells: string[];
  skills: string[];
  expertise: string[];
}

export interface CharacterBuildBody {
  character_name: string;
  player_name: string;
  species: string;
  character_class: string;
  subclass: string | null;
  background: string;
  level: number;
  scores: Record<string, number>;
  score_method: "standard" | "pointbuy" | "manual";
  background_bonus: Record<string, number>;
  skills: string[];
  origin_feat: string | null;
  cantrips: string[];
  spells: string[];
  kit: string | null;
  asi: BuildAsiPick[];
  appearance: string | null;
}

export interface BuildResult {
  pc_id: string;
  /** SEC-002 — the new sheet's player-link secret (/play/{play_key}). */
  play_key?: string;
  character_name: string;
  hp_max: number;
  ac: number;
  features_granted: string[];
  warnings: string[];
}

// Plan 83 — the join page stored the campaign's code; carry it into the player's calls.
function joinCodeQuery(cid: string): string {
  try {
    const code = sessionStorage.getItem(`qj-code-${cid}`);
    return code ? `?code=${encodeURIComponent(code)}` : "";
  } catch {
    return "";
  }
}

export const builderApi = {
  options: (mode: WizardMode, cid: string) =>
    mode === "dm"
      ? api.get<BuilderOptions>(`/campaigns/${cid}/character-builder/options`, { quiet: true })
      : api.get<BuilderOptions>(`/play/join/${cid}/options${joinCodeQuery(cid)}`, { quiet: true }),
  create: (mode: WizardMode, cid: string, body: CharacterBuildBody) =>
    mode === "dm"
      ? api.post<BuildResult>(`/campaigns/${cid}/character-builder`, body, { quiet: true })
      : api.post<BuildResult>(`/play/join/${cid}/characters${joinCodeQuery(cid)}`, body, { quiet: true }),
};
