/**
 * Plan 135 — plain words for a DM's homebrew feat, shared by the Feats tab and its form, the
 * character builder's improvement step and the level-up guide.
 */
import type { FeatCategory, PowerAttack } from "../api/homebrew";

export const ABILITY_WORDS: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

/** Feat kinds as a DM reads them, in the form's order. */
export const FEAT_KINDS: readonly (readonly [FeatCategory, string])[] = [
  ["general", "General"],
  ["origin", "Origin (2024)"],
  ["fighting_style", "Fighting style"],
  ["epic_boon", "Epic boon"],
];

/** The level an epic boon arrives at (the server's `feat_rules.EPIC_BOON_LEVEL`). */
export const EPIC_BOON_LEVEL = 19;

/** A short kind label for a list row or a pill: "Fighting style", "Epic boon". */
export function featKindLabel(category: string): string {
  if (category === "origin") return "Origin feat";
  return FEAT_KINDS.find(([k]) => k === category)?.[1] ?? "General";
}

/** Which weapons a power attack fits, in words. */
export const POWER_WEAPONS: readonly (readonly [PowerAttack["weapons"], string])[] = [
  ["ranged", "Ranged weapons"],
  ["heavy", "Heavy melee weapons"],
  ["melee", "Any melee weapon"],
  ["any", "Any weapon"],
];

function minus(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** "−5 to hit, +10 damage with ranged weapons". */
export function powerAttackLine(pa: Pick<PowerAttack, "to_hit" | "damage" | "weapons">): string {
  const words: Record<PowerAttack["weapons"], string> = {
    ranged: "with ranged weapons",
    heavy: "with heavy melee weapons",
    melee: "with melee weapons",
    any: "with any weapon",
  };
  return `${minus(pa.to_hit)} to hit, ${minus(pa.damage)} damage ${words[pa.weapons]}`;
}

/** "−5 / +10", for a list row. */
export function powerAttackShort(pa: Pick<PowerAttack, "to_hit" | "damage">): string {
  return `${minus(pa.to_hit)} / ${minus(pa.damage)}`;
}

/** "+1 to Dexterity", "+1 to Strength or Dexterity", "+1 to any ability", or null. */
export function plusOneLine(options: "any" | string[] | null | undefined): string | null {
  if (!options || (Array.isArray(options) && options.length === 0)) return null;
  if (options === "any" || options.length === 6) return "+1 to any ability";
  return `+1 to ${options.map((a) => ABILITY_WORDS[a] ?? a).join(" or ")}`;
}
