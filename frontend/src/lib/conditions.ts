/**
 * Condition display vocabulary (Plan 65) — shared by the 2D projector and
 * the 3D board so a "poisoned" mark looks the same everywhere.
 *
 * Backend stores lowercase 5e condition strings on SessionCombatant.
 *
 * Plan 131 — what each condition does, per edition: the DM's short rules line
 * (the HUD tooltips) for the 2024 and the 2014 rules, and the 2014 exhaustion
 * table (six levels whose effects add up, with no number taken off rolls).
 * The phone's plain sentences live in pages/player/rules.ts.
 */
import type { Ruleset } from "./ruleset";

export interface ConditionLook {
  /** 3-letter pip label shown under the token. */
  abbr: string;
  /** Accent color for pips, rings, and glows. */
  color: string;
}

export const CONDITION_LOOKS: Record<string, ConditionLook> = {
  blinded: { abbr: "BLD", color: "#9aa0b4" },
  charmed: { abbr: "CHM", color: "#d873a8" },
  deafened: { abbr: "DEF", color: "#8f8a7c" },
  frightened: { abbr: "FRT", color: "#a06bd8" },
  grappled: { abbr: "GRP", color: "#c9873a" },
  incapacitated: { abbr: "INC", color: "#b8b03e" },
  invisible: { abbr: "INV", color: "#7fc6c9" },
  paralyzed: { abbr: "PAR", color: "#e0b13e" },
  petrified: { abbr: "PET", color: "#9a9a9a" },
  poisoned: { abbr: "PSN", color: "#5fae4c" },
  prone: { abbr: "PRN", color: "#c9a15a" },
  restrained: { abbr: "RST", color: "#b0b0bc" },
  stunned: { abbr: "STN", color: "#e8d24a" },
  unconscious: { abbr: "UNC", color: "#d05050" },
  exhaustion: { abbr: "EXH", color: "#c97b4a" },
};

/** Look up a condition's display treatment (tolerant of unknown strings). */
export function conditionLook(name: string): ConditionLook {
  return (
    CONDITION_LOOKS[name.toLowerCase()] ?? {
      abbr: name.slice(0, 3).toUpperCase(),
      color: "#b3a789",
    }
  );
}

/** Violet used for the concentration shimmer everywhere. */
export const CONCENTRATION_COLOR = "#8d7bd8";

// ── What each condition does (Plan 131: per edition) ─────────────────────────

/**
 * The DM's one-line rule per condition, 2024 rules (the HUD tooltips). Keys are
 * lowercase; "concentrating" is a QuestLab extra kept for both editions.
 */
export const CONDITION_RULES_2024: Record<string, string> = {
  blinded: "Can't see. Auto-fail checks needing sight. Attack rolls against you have advantage; your attacks have disadvantage.",
  charmed: "Can't attack charmer. Charmer has advantage on social checks vs you.",
  concentrating: "Casting a concentration spell. Taking damage requires CON save (DC 10 or half damage, whichever is higher) or lose the spell.",
  deafened: "Can't hear. Auto-fail checks needing hearing.",
  exhaustion: "Each level: −2 to every d20 test (attacks, checks, saves) and −5 ft speed. Level 6 is death. A long rest removes a level.",
  frightened: "Disadvantage on ability checks and attacks while the source is in sight. Can't willingly move closer to source.",
  grappled: "Speed = 0. Ends if grappler is incapacitated or target is moved out of reach.",
  incapacitated: "Can't take actions or reactions.",
  invisible: "Impossible to see without magic. Attacks against you have disadvantage; your attacks have advantage.",
  paralyzed: "Incapacitated + can't move/speak. Auto-fail STR/DEX saves. Attacks against you have advantage. Hits within 5 ft are crits.",
  petrified: "Transformed to stone. Incapacitated, speed 0. Resistance to all damage. Immune to poison/disease.",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "Melee attacks against you have advantage; ranged have disadvantage. Your attacks have disadvantage. Getting up costs half movement.",
  restrained: "Speed = 0. Attacks against you have advantage; your attacks have disadvantage. Disadvantage on DEX saves.",
  stunned: "Incapacitated + can't move + can only speak falteringly. Auto-fail STR/DEX saves. Attacks against you have advantage.",
  unconscious: "Incapacitated + can't move/speak + unaware of surroundings. Drop held items, fall prone. Auto-fail STR/DEX saves. Attacks have advantage; hits within 5 ft are crits.",
};

/** The same lines for the 2014 rules, condensed from the SRD 5.1 conditions. */
export const CONDITION_RULES_2014: Record<string, string> = {
  blinded: "Can't see. Auto-fail checks needing sight. Attack rolls against you have advantage; your attacks have disadvantage.",
  charmed: "Can't attack the charmer or target them with harmful abilities or magic. Charmer has advantage on social checks vs you.",
  concentrating: "Casting a concentration spell. Taking damage requires CON save (DC 10 or half damage, whichever is higher) or lose the spell.",
  deafened: "Can't hear. Auto-fail checks needing hearing.",
  exhaustion: "Six levels; the effects add up. 1 disadvantage on ability checks · 2 speed halved · 3 disadvantage on attacks and saves · 4 HP max halved · 5 speed 0 · 6 death. A long rest with food and drink removes a level.",
  frightened: "Disadvantage on ability checks and attacks while the source is in sight. Can't willingly move closer to it.",
  grappled: "Speed 0, no bonus to speed. Ends if the grappler is incapacitated or you're moved out of its reach.",
  incapacitated: "Can't take actions or reactions.",
  invisible: "Can't be seen without magic or a special sense; counts as heavily obscured for hiding. Noise and tracks still give it away. Attacks against you have disadvantage; your attacks have advantage.",
  paralyzed: "Incapacitated, can't move or speak. Auto-fail STR/DEX saves. Attacks against you have advantage; hits from within 5 ft are crits.",
  petrified: "Turned to stone (weight ×10, stops aging). Incapacitated, can't move or speak, unaware. Attacks against you have advantage. Auto-fail STR/DEX saves. Resistance to all damage. Immune to poison and disease (any already in you is paused).",
  poisoned: "Disadvantage on attack rolls and ability checks.",
  prone: "Can only crawl until you stand (costs half your speed). Your attacks have disadvantage. Attacks from within 5 ft have advantage; from farther, disadvantage.",
  restrained: "Speed 0, no bonus to speed. Attacks against you have advantage; your attacks have disadvantage. Disadvantage on DEX saves.",
  stunned: "Incapacitated, can't move, speaks only falteringly. Auto-fail STR/DEX saves. Attacks against you have advantage.",
  unconscious: "Incapacitated, can't move or speak, unaware. Drops what it holds and falls prone. Auto-fail STR/DEX saves. Attacks against you have advantage; hits from within 5 ft are crits.",
};

/** The HUD says "Exhausted"; the sheet and the board say "exhaustion". */
function conditionKey(name: string): string {
  const k = name.trim().toLowerCase();
  return k === "exhausted" ? "exhaustion" : k;
}

/** The DM's one-line rule for a condition under these rules (undefined if unknown). */
export function conditionRule(name: string, ruleset: Ruleset): string | undefined {
  const table = ruleset === "2014" ? CONDITION_RULES_2014 : CONDITION_RULES_2024;
  return table[conditionKey(name)];
}

// ── Exhaustion, 2014 rules ───────────────────────────────────────────────────

/** The 2014 exhaustion table (SRD 5.1): level N has every effect up to N. */
export const EXHAUSTION_2014: readonly string[] = [
  "Disadvantage on ability checks",
  "Speed halved",
  "Disadvantage on attack rolls and saving throws",
  "Hit point maximum halved",
  "Speed reduced to 0",
  "Death",
];

/**
 * The 2014 effects a creature at this exhaustion level has, in order, lowercase for
 * a sentence ("disadvantage on ability checks", "speed halved"...). At level 5 the
 * speed is 0, so "speed halved" drops out; level 6 is just "death".
 */
export function exhaustion2014Effects(level: number): string[] {
  const n = Math.max(0, Math.min(6, Math.floor(level)));
  if (n >= 6) return ["death"];
  return EXHAUSTION_2014.slice(0, n)
    .filter((_, i) => !(n >= 5 && i === 1))
    .map((e) => e.charAt(0).toLowerCase() + e.slice(1));
}

/** "Disadvantage on ability checks, speed halved": the 2014 effects in one line ("" at 0). */
export function exhaustion2014Summary(level: number): string {
  const line = exhaustion2014Effects(level).join(", ");
  return line ? line.charAt(0).toUpperCase() + line.slice(1) : "";
}

/**
 * What exhaustion does to one roll under the 2014 rules: ability checks (and
 * initiative, a Dexterity check) have disadvantage from level 1; attack rolls and
 * saving throws from level 3. Null when it doesn't touch this roll, and always null
 * for the 2024 rules (their −2 per level is shown on the sheet, not here).
 *
 * @param kind - The roll: "check", "initiative", "attack", "save" (others: null).
 */
export function exhaustionRollNote(
  level: number | null | undefined,
  ruleset: Ruleset,
  kind: string,
): { disadvantage: true; text: string } | null {
  const n = Math.max(0, Math.min(6, Math.floor(level ?? 0)));
  if (ruleset !== "2014" || n === 0 || n >= 6) return null;
  if (kind === "check" || kind === "initiative") {
    return { disadvantage: true, text: `Exhausted ${n}: disadvantage on ability checks.` };
  }
  if (n >= 3 && kind === "attack") {
    return { disadvantage: true, text: `Exhausted ${n}: disadvantage on attack rolls.` };
  }
  if (n >= 3 && kind === "save") {
    return { disadvantage: true, text: `Exhausted ${n}: disadvantage on saving throws.` };
  }
  return null;
}

/** The DM sheet's exhaustion help, per edition (newlines are paragraph breaks). */
export function exhaustionHelp(ruleset: Ruleset): string {
  const when =
    "When to apply: forced march without rest, going hungry/thirsty for too long, failing " +
    "a CON save vs a harmful effect (e.g. extreme cold), certain spells and monster attacks.";
  if (ruleset === "2014") {
    return (
      "Six levels, and the effects add up:\n" +
      EXHAUSTION_2014.map((e, i) => `${i + 1}. ${e}`).join("\n") +
      `\n\nNo number comes off rolls; it's disadvantage instead.\n\n${when}\n\n` +
      "A long rest removes one level, if the character has had food and drink. Click a dot to set the level."
    );
  }
  return (
    "0–6 scale. Each level applies a cumulative −2 penalty to all D20 Tests (attack rolls, " +
    "ability checks, saving throws). Level 6 = death.\n\n" +
    "When to apply: forced march without rest, going hungry/thirsty for too long, failing a " +
    "CON save vs a harmful effect (e.g. extreme cold), the Ray of Sickness spell, certain " +
    "monster attacks.\n\nLong rest reduces by 1. Click a dot to set the level."
  );
}
