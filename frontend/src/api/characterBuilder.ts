import { api } from "./client";
import type { Ruleset } from "../lib/ruleset";

/**
 * The character creator's API (Plan 74, Plan 126).
 *
 * One wizard, two doors: a player builds from the join link (`/play/join/...`, gated by the
 * campaign's join code and its "players can create characters" switch); the campaign's DM
 * builds from the Characters page (`/campaigns/.../character-builder`, owner only). The
 * server applies the same rules either way.
 *
 * Plan 131: the options say which rules the campaign plays by (`ruleset`). A 2014 campaign's
 * tables carry the 2014 keys (races with ability bonuses and subraces, known/prepared casters, the
 * spellbook), and its builds send the 2014 picks (subrace, the Half-Elf's +1s, a book background's
 * skills, the Dragonborn's ancestry, a Wizard's prepared spells).
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
  /** Plan 131 — a 2014 fighting style: the classes whose Fighting Style offers it. */
  classes?: string[];
}

/** One spell in the picker (Plan 128: with enough to choose by, and its full text). */
export interface BuilderSpell {
  name: string;
  level: number;
  classes: string[];
  school: string;
  casting_time?: string;
  range?: string;
  duration?: string;
  components?: string;
  concentration?: boolean;
  ritual?: boolean;
  /** Deals damage / hits with an attack roll (an invocation may need such a cantrip). */
  damage?: boolean;
  attack?: boolean;
  /** Optional short summary; the picker otherwise shows the text's opening lines. */
  summary?: string;
  /** The full text, with what a higher-level slot adds. */
  text?: string;
}

/** One option of a class choice (Plan 128): a Divine Order, an invocation, a land... */
export interface ChoiceOption {
  name: string;
  blurb: string;
  /** Extra cantrips it brings, from which class list (Thaumaturge, Blessed Warrior). */
  cantrips?: { count: number; list: string };
  armor?: string[];
  /**
   * An invocation's Warlock level, what it needs (another invocation, or in 2014 a Pact Boon),
   * and the cantrip it needs: a damaging one ("damage"/"attack"), or in 2014 by name
   * ("Eldritch Blast").
   */
  level?: number;
  requires?: string;
  cantrip?: string;
  repeatable?: boolean;
  srd?: boolean;
}

/** Plan 131 — a 2014 "spell" choice's rule (Mystic Arcanum, Magical Secrets). */
export interface ChoiceSpellRule {
  /** Class lists it picks from; null = any class. */
  lists: string[] | null;
  /** The spell levels, one pick each in order (Mystic Arcanum 6, 7, 8, 9); null = any you cast. */
  levels: number[] | null;
  cantrips?: boolean;
  /** The picks count as spells known (Magical Secrets). */
  known: boolean;
}

/** A kind of class choice: how it is picked, what it says, where it is recorded. */
export interface ChoiceKind {
  label: string;
  kind: "feat" | "option" | "weapon" | "expertise" | "skill" | "spell";
  note: string;
  book?: boolean;
  record?: string;
  /** Skills it may pick from; "class" = the class's skill list. */
  pool?: string[] | "class";
  options?: ChoiceOption[];
  spell?: ChoiceSpellRule;
}

export interface MasteryWeapon {
  name: string;
  category: string;
  properties: string[];
  mastery: string;
}

/**
 * A class's spellcasting. 2024: `prepared` is the 20-level table. Plan 131, 2014: no `prepared`
 * table; `kind` says how it gets spells: `known` (a 20-level table) or prepared each day by
 * `prepared_formula` (ability modifier + level, or + half level), from `first_level`; the
 * Wizard keeps a `spellbook`.
 */
export interface BuilderSpellcasting {
  ability: Ability;
  cantrips_base: number;
  prepared?: number[];
  kind?: "known" | "prepared";
  known?: number[] | null;
  prepared_formula?: "level" | "half_level" | null;
  first_level?: number;
  spellbook?: boolean;
}

export interface BuilderClass {
  hit_die: number;
  primary: Ability[];
  saves: Ability[];
  skills: { choose: number; from: string[] };
  armor: string[];
  subclass_level: number;
  srd_subclasses: string[];
  spellcasting: BuilderSpellcasting | null;
  kits: { name: string; items: string[]; armor: string | null; shield: boolean }[];
}

/** Plan 131 — a 2014 subrace: its bonuses and traits (Hill Dwarf, High Elf...). */
export interface BuilderSubrace {
  name: string;
  ability_bonuses: Record<string, number>;
  traits: string[];
  hp_per_level?: number;
  /** The High Elf's cantrip: one Wizard cantrip, cast with Intelligence. */
  cantrip_choice?: { count: number; list: string; ability: string };
}

export interface BuilderSpecies {
  name: string;
  size: string;
  speed: number;
  traits: string[];
  bonus_skill_choices?: number;
  bonus_skill_from?: string[];
  bonus_origin_feat?: boolean;
  hp_per_level_bonus?: number;
  // Plan 131 — 2014 races.
  ability_bonuses?: Record<string, number>;
  /** The Half-Elf's two +1s: how many, how much, which abilities can't take one. */
  ability_choice?: { choose: number; amount: number; exclude: string[] } | null;
  /** Skills the race always gives (Elf Perception, Half-Orc Intimidation). */
  skills?: string[];
  skill_choice?: number;
  subraces?: BuilderSubrace[];
  /** Race choices: a key into `choice_kinds` → how many picks (Dragonborn ancestry: 1). */
  choices?: Record<string, number>;
}

export interface BuilderBackground {
  name: string;
  abilities: Ability[];
  /** 2024: its Origin feat; 2014: null (2014 backgrounds give no feat). */
  feat: string | null;
  skills: string[];
  tool: string | null;
  blurb: string;
  /** Plan 131 — 2014: languages of your choice, and the background's feature. */
  languages?: number;
  feature?: string;
}

export interface BuilderOptions {
  campaign_name: string;
  species: BuilderSpecies[];
  backgrounds: BuilderBackground[];
  origin_feats: { name: string; blurb: string }[];
  classes: Record<string, BuilderClass>;
  skills: Record<string, Ability>;
  standard_array: number[];
  point_buy_cost: Record<string, number>;
  point_buy_budget: number;
  armor: Record<string, { base: number; dex_cap: number | null; category: string; str_min?: number }>;
  spells: BuilderSpell[];
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
  // Plan 128 — the class choices, always-prepared spells, mastery weapons and class numbers.
  choice_kinds: Record<string, ChoiceKind>;
  /** Per class (or subclass): choice key → [from level, how many] steps. */
  class_choices: Record<string, Record<string, [number, number][]>>;
  subclass_choices: Record<string, Record<string, [number, number][]>>;
  fighting_style_extras: Record<string, ChoiceOption[]>;
  mastery_weapons: MasteryWeapon[];
  weapon_mastery_filter: Record<string, string>;
  always_prepared_class: Record<string, Record<string, string[]>>;
  always_prepared_subclass: Record<string, Record<string, string[]>>;
  always_prepared_source: Record<string, string>;
  land_spells: Record<string, Record<string, string[]>>;
  extra_spell_lists: Record<string, Record<string, string[]>>;
  class_scales: Record<string, { label: string; table: [number, number | string][] }[]>;
  // Plan 131 — which rules, and the 2014-only tables (empty for a 2024 campaign).
  ruleset?: Ruleset;
  /** Spells in a spellbook by level 1-20 (the 2014 Wizard). */
  spellbook_size?: Record<string, number[]>;
  /** Unarmored AC base + DEX by subclass (Draconic Bloodline: 13). */
  unarmored_ac_base_subclass?: Record<string, number>;
  /** Armor a subclass trains (Life Domain: heavy). */
  subclass_armor?: Record<string, string[]>;
  /** Spells a subclass adds to its class's list, by class level (The Fiend). */
  expanded_spells?: Record<string, Record<string, string[]>>;
}

/** One class choice as the build sends it (Plan 128). */
export interface ClassChoicePick {
  key: string;
  picks: string[];
  book: string[];
}

/** An Origin feat's own picks: Magic Initiate's list and spells, Skilled's skills. */
export interface OriginFeatPicks {
  choice?: string | null;
  spells: string[];
  skills: string[];
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
  /** Plan 128 — always a list from the wizard, so the server checks every choice. */
  class_choices: ClassChoicePick[];
  background_feat_picks: OriginFeatPicks | null;
  origin_feat_picks: OriginFeatPicks | null;
  appearance: string | null;
  // Plan 131 — 2014 builds only (a 2024 build leaves them out).
  subrace?: string | null;
  /** The Half-Elf's two +1s, or a book race's bonuses. */
  ability_choice?: Record<string, number>;
  /** A book background's 2 skills. */
  background_skills?: string[];
  /** The race's own choices (Dragonborn ancestry), in the class-choice shape. */
  species_choices?: ClassChoicePick[];
  /** A Wizard's prepared spells, out of `spells` (its spellbook). */
  prepared_spells?: string[];
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
