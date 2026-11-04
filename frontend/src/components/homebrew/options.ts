// Plan 133 — shared lists and styles for the race and subclass forms and the catalog page.
// The server checks the same things (domain/homebrew.py); these only let the form say so first.

import type { AbilityCode } from "../../api/homebrew";
import type { Ruleset } from "../../lib/ruleset";

/** Muted helper text. */
export const HINT: React.CSSProperties = { margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--muted)" };
/** A field's problem, in the danger colour. */
export const ERR: React.CSSProperties = { margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--danger-text)" };

export const ABILITY_LIST: readonly (readonly [AbilityCode, string])[] = [
  ["STR", "Strength"],
  ["DEX", "Dexterity"],
  ["CON", "Constitution"],
  ["INT", "Intelligence"],
  ["WIS", "Wisdom"],
  ["CHA", "Charisma"],
];

/** The 18 skills, as a character sheet spells them. */
export const SKILL_LIST = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
] as const;

/** The 12 classes a character can be built as. */
export const CLASS_LIST = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
] as const;

/** The level each class picks its subclass at, by rules edition (the SRD class tables). */
const SUBCLASS_LEVEL_2014: Record<string, number> = { Cleric: 1, Sorcerer: 1, Warlock: 1, Druid: 2, Wizard: 2 };

export function subclassLevel(cls: string, rules: Ruleset): number {
  return rules === "2014" ? (SUBCLASS_LEVEL_2014[cls] ?? 3) : 3;
}

/** "Paladins choose a subclass at level 3." in plain words, for the rules a subclass is for. */
export function subclassLevelHint(cls: string, rules: Ruleset | null): string {
  const plural = cls.endsWith("s") ? cls : `${cls}s`;
  const a = subclassLevel(cls, "2014");
  const b = subclassLevel(cls, "2024");
  if (rules) return `${plural} choose a subclass at level ${subclassLevel(cls, rules)}.`;
  if (a === b) return `${plural} choose a subclass at level ${a}.`;
  return `${plural} choose a subclass at level ${a} in the 2014 rules, level ${b} in the 2024 rules.`;
}

export const MAX_RACE_BONUS = 6; // a Human-style +1 to every ability fits
export const DARKVISION = [0, 30, 60, 120] as const;

/** Which rules a homebrew row is for: both editions (null on the server), or one. */
export type RulesPick = "both" | Ruleset;

export function rulesPickOf(r: Ruleset | null | undefined): RulesPick {
  return r === "2014" || r === "2024" ? r : "both";
}

export function rulesOfPick(p: RulesPick): Ruleset | null {
  return p === "both" ? null : p;
}

export const RULES_PICKS: readonly (readonly [RulesPick, string])[] = [
  ["both", "Both"],
  ["2014", "2014 only"],
  ["2024", "2024 only"],
];

/** "+2" / "-1" / "+0". */
export function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** "A", "A and B", "A, B and C". */
export function andList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
