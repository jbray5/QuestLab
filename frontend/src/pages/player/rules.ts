/**
 * Rules words and dice helpers for the companion phone (Plan 122): plain-language
 * text for abilities, skills and conditions, and the small math every tab shares.
 */
import type { CSSProperties } from "react";

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

export const RECOVERY_TEXT: Record<string, string> = {
  short: "back after a short or long rest",
  short_one: "one back after a short rest, all after a long rest",
  long: "back after a long rest",
  none: "doesn't come back",
  per_turn: "every turn",
};

export const CASTER_CLASSES = new Set(["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard", "Artificer"]);
export const DAILY_PREPARERS = new Set(["Cleric", "Druid", "Paladin", "Ranger", "Wizard"]);

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
