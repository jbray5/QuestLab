/**
 * Rules words and dice helpers for the companion phone (Plan 122): plain-language
 * text for abilities, skills and conditions, and the small math every tab shares.
 */
import type { CSSProperties } from "react";

import type { Ruleset } from "../../lib/ruleset";

export const mod = (score: number) => Math.floor((score - 10) / 2);
export const fmt = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);
export const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
export const profBonus = (level: number) => Math.floor((level - 1) / 4) + 2;

export type AbilityKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

export const ABILITIES: Array<{ key: AbilityKey; abbr: string; name: string; teach: string }> = [
  { key: "str", abbr: "STR", name: "Strength", teach: "Raw power: lifting, shoving, climbing, hitting hard." },
  { key: "dex", abbr: "DEX", name: "Dexterity", teach: "Quick hands and feet: sneaking, shooting, dodging." },
  { key: "con", abbr: "CON", name: "Constitution", teach: "Toughness: holding on when you're hurt, poisoned or tired." },
  { key: "int", abbr: "INT", name: "Intelligence", teach: "Book smarts: memory, reasoning, magic theory." },
  { key: "wis", abbr: "WIS", name: "Wisdom", teach: "Awareness: noticing things, reading people, instinct." },
  { key: "cha", abbr: "CHA", name: "Charisma", teach: "Presence: persuading, lying, performing, leading." },
];

/** 2024 skills: the ability each uses, and what it's for in one line. */
export const SKILLS: Record<string, { ability: AbilityKey; teach: string }> = {
  Acrobatics: { ability: "dex", teach: "Keeping your balance, tumbling, landing well." },
  "Animal Handling": { ability: "wis", teach: "Calming, riding or reading an animal." },
  Arcana: { ability: "int", teach: "Knowing about magic, spells and planes." },
  Athletics: { ability: "str", teach: "Climbing, swimming, jumping, grappling." },
  Deception: { ability: "cha", teach: "Lying convincingly." },
  History: { ability: "int", teach: "Remembering past events, people and places." },
  Insight: { ability: "wis", teach: "Telling whether someone means what they say." },
  Intimidation: { ability: "cha", teach: "Getting your way with threats." },
  Investigation: { ability: "int", teach: "Searching carefully and working out clues." },
  Medicine: { ability: "wis", teach: "Steadying the dying, judging an injury." },
  Nature: { ability: "int", teach: "Knowing plants, beasts, weather and terrain." },
  Perception: { ability: "wis", teach: "Spotting, hearing or sensing what's around you." },
  Performance: { ability: "cha", teach: "Music, acting, storytelling." },
  Persuasion: { ability: "cha", teach: "Convincing someone honestly." },
  Religion: { ability: "int", teach: "Knowing gods, rites and holy symbols." },
  "Sleight of Hand": { ability: "dex", teach: "Picking pockets, palming, quick fingers." },
  Stealth: { ability: "dex", teach: "Moving unseen and unheard." },
  Survival: { ability: "wis", teach: "Tracking, foraging, finding your way." },
};

/** What each condition does to you, in a sentence (2024 rules). */
export const CONDITION_TEXT: Record<string, string> = {
  blinded: "You can't see. Your attacks have disadvantage; attacks against you have advantage.",
  charmed: "You can't attack the charmer, and they have advantage when talking you round.",
  deafened: "You can't hear.",
  exhaustion: "Every d20 roll you make is lower; a long rest removes a level.",
  frightened: "Disadvantage on checks and attacks while you can see what scares you; you can't move closer to it.",
  grappled: "Your speed is 0 until you break free.",
  incapacitated: "You can't take actions, bonus actions or reactions.",
  invisible: "You can't be seen. Your attacks have advantage; attacks against you have disadvantage.",
  paralyzed: "You can't move or act. Attacks against you have advantage; hits from close by are critical.",
  petrified: "You're turned to stone and can't act.",
  poisoned: "Disadvantage on attacks and checks.",
  prone: "You're on the ground. Standing up costs half your movement; close attacks against you have advantage.",
  restrained: "Your speed is 0. Your attacks and Dexterity saves have disadvantage; attacks against you have advantage.",
  stunned: "You can't move or act, and fail Strength and Dexterity saves.",
  unconscious: "You're out cold: you drop what you hold and fall prone.",
};

/** The same sentences for the 2014 rules (Plan 131), from the SRD 5.1 conditions. */
export const CONDITION_TEXT_2014: Record<string, string> = {
  blinded: "You can't see. Your attacks have disadvantage; attacks against you have advantage.",
  charmed: "You can't attack the charmer, and they have advantage when talking you round.",
  deafened: "You can't hear.",
  exhaustion: "Each level adds an effect: first disadvantage on checks, then half speed, and worse. A long rest removes a level.",
  frightened: "Disadvantage on checks and attacks while you can see what scares you; you can't move closer to it.",
  grappled: "Your speed is 0 until you get free.",
  incapacitated: "You can't take actions or reactions.",
  invisible: "No one can see you without magic, but noise and tracks give you away. Your attacks have advantage; attacks against you have disadvantage.",
  paralyzed: "You can't move or act. Attacks against you have advantage; hits from close by are critical.",
  petrified: "You're turned to stone: you can't move or act, but you resist all damage.",
  poisoned: "Disadvantage on attacks and checks.",
  prone: "You're on the ground: you crawl until you stand (half your movement). Your attacks have disadvantage; close attacks against you have advantage.",
  restrained: "Your speed is 0. Your attacks and Dexterity saves have disadvantage; attacks against you have advantage.",
  stunned: "You can't move or act, can barely speak, and fail Strength and Dexterity saves.",
  unconscious: "You're out cold: you drop what you hold and fall prone.",
};

/** What a condition does to you in a sentence, under your campaign's rules (Plan 131). */
export function conditionText(name: string, ruleset: Ruleset): string | undefined {
  return (ruleset === "2014" ? CONDITION_TEXT_2014 : CONDITION_TEXT)[name.toLowerCase()];
}

export const RECOVERY_TEXT: Record<string, string> = {
  short: "back after a short or long rest",
  short_one: "one back after a short rest, all after a long rest",
  long: "back after a long rest",
  none: "doesn't come back",
  per_turn: "every turn",
};

export const CASTER_CLASSES = new Set(["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard", "Artificer"]);
export const DAILY_PREPARERS = new Set(["Cleric", "Druid", "Paladin", "Ranger", "Wizard"]);
/** Plan 131 — the 2014 rules: a Ranger learns its spells (and swaps on level-up), like a Bard. */
export const DAILY_PREPARERS_2014 = new Set(["Cleric", "Druid", "Paladin", "Wizard"]);

/** Whether a class changes its prepared spells after a Long Rest, under the PC's rules. */
export function isDailyPreparer(characterClass: string, ruleset: Ruleset): boolean {
  return (ruleset === "2014" ? DAILY_PREPARERS_2014 : DAILY_PREPARERS).has(characterClass);
}

export const HIT_DIE_BY_CLASS: Record<string, number> = {
  Sorcerer: 6, Wizard: 6, Artificer: 8, Bard: 8, Cleric: 8, Druid: 8, Monk: 8, Rogue: 8, Warlock: 8,
  Fighter: 10, Paladin: 10, Ranger: 10, Barbarian: 12,
};

/** "1d6+4" → { count: 1, sides: 6, plus: 4 }; null for anything that isn't dice. */
export function parseDice(s: string): { count: number; sides: number; plus: number } | null {
  const m = /(\d+)\s*d\s*(\d+)\s*([+-]\s*\d+)?/i.exec(s || "");
  if (!m) return null;
  return { count: Number(m[1]), sides: Number(m[2]), plus: m[3] ? Number(m[3].replace(/\s/g, "")) : 0 };
}

export const hpColor = (cur: number, max: number) =>
  cur <= max / 4 ? "var(--danger)" : cur <= max / 2 ? "var(--amber)" : "var(--teal)";

export const btnRow: CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap" };
export const big: CSSProperties = { minHeight: 44 };
export const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

/** Read by screen readers, invisible on screen (the live turn announcer, headings a sighted player doesn't need). */
export const srOnly: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * The player's own name, or null when nobody has named themselves yet: blank,
 * or the DM wizard's "Not assigned yet" placeholder (Plan 128).
 */
export function realPlayerName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  return n && n.toLowerCase() !== "not assigned yet" ? n : null;
}

/**
 * A healing spell's dice, read from its text (Plan 128): "regains a number of
 * Hit Points equal to 2d8 plus your spellcasting ability modifier", "regain
 * 2d8 Hit Points", "regains 4d8 + 15 Hit Points", and "The healing increases
 * by 2d8 for each spell slot level above 1". Plan 131: the 2014 wording, "1d8 +
 * your spellcasting ability modifier", adds the modifier too. Null for anything
 * that doesn't heal.
 */
export function healingOf(
  description: string | null | undefined,
  higherLevels: string | null | undefined,
): { count: number; sides: number; plus: number; addMod: boolean; perSlot: { count: number; sides: number } | null } | null {
  const m = /regains?\s+(?:a number of\s+)?(?:hit points equal to\s+)?(\d+)d(\d+)(?:\s*(?:\+\s*(\d+)|(plus your spellcasting ability modifier|\+\s*your spellcasting ability modifier)))?/i.exec(description ?? "");
  if (!m) return null;
  const up = /healing increases by (\d+)d(\d+) for each (?:spell )?slot level above/i.exec(higherLevels ?? "");
  return {
    count: Number(m[1]),
    sides: Number(m[2]),
    plus: m[3] ? Number(m[3]) : 0,
    addMod: !!m[4],
    perSlot: up ? { count: Number(up[1]), sides: Number(up[2]) } : null,
  };
}
