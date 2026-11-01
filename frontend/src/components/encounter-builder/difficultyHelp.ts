/**
 * Plain-language difficulty (usability pass, Plan 121): what each 2024 band
 * means at the table, and the Lamplit pill for it. Low reads teal, Moderate
 * neutral, High amber, Deadly red — they differ in lightness too.
 *
 * Plan 131 — a 2014 campaign names the same bands Easy / Medium / Hard / Deadly
 * (`difficultyLabel`, `difficultyHelp`, `difficultyHow`).
 */
import type { Ruleset } from "../../lib/ruleset";

export const DIFFICULTY_HELP: Record<string, string> = {
  Low: "Low: a warm-up — the party should win without much risk.",
  Moderate: "Moderate: a real fight — expect spent spells and some damage.",
  High: "High: dangerous — a character could go down.",
  Deadly: "Deadly: could kill a character, or the whole party.",
};

/** How the difficulty is worked out, for tooltips and the meter's help. */
export const DIFFICULTY_HOW =
  "Worked out from the monsters' total XP against your party's XP thresholds (2024 rules); " +
  "it updates as you change the monsters or the party's levels.";

export const DIFFICULTY_PILL: Record<string, string> = {
  Low: "pill pill-teal",
  Moderate: "pill",
  High: "pill pill-amber",
  Deadly: "pill pill-danger",
};

/** Bar/marker colors per band (tokens only). */
export const DIFFICULTY_TONE: Record<string, { soft: string; strong: string; text: string }> = {
  Low: { soft: "var(--teal-soft)", strong: "var(--teal)", text: "var(--teal-text)" },
  Moderate: { soft: "var(--surface3)", strong: "var(--text2)", text: "var(--text)" },
  High: { soft: "var(--amber-soft)", strong: "var(--amber)", text: "var(--amber-text)" },
  Deadly: { soft: "var(--danger-soft)", strong: "var(--danger)", text: "var(--danger-text)" },
};

// ── Plan 131 — the 2014 rules' words ─────────────────────────────────────────
// A 2014 encounter is stored in the same four bands; only the words differ:
// Low = Easy, Moderate = Medium, High = Hard, Deadly = Deadly.

const LABEL_2014: Record<string, string> = { Low: "Easy", Moderate: "Medium", High: "Hard", Deadly: "Deadly" };

const HELP_2014: Record<string, string> = {
  Low: "Easy: the party should win without much risk.",
  Moderate: "Medium: a real fight — expect spent spells and some damage, but no one should die.",
  High: "Hard: dangerous — a character could go down.",
  Deadly: "Deadly: could kill a character, or the whole party.",
};

/** "Moderate" on the 2024 rules, "Medium" on the 2014 rules. */
export function difficultyLabel(band: string, ruleset: Ruleset): string {
  return ruleset === "2014" ? (LABEL_2014[band] ?? band) : band;
}

/** What a band means at the table, in the edition's words. */
export function difficultyHelp(band: string, ruleset: Ruleset): string | undefined {
  return ruleset === "2014" ? HELP_2014[band] : DIFFICULTY_HELP[band];
}

/** How the difficulty is worked out, per edition. */
export function difficultyHow(ruleset: Ruleset): string {
  return ruleset === "2014"
    ? "Worked out the 2014 way: the monsters' total XP is multiplied for how many there are " +
        "(×1.5 for 2, ×2 for 3–6, ×2.5 for 7–10, ×3 for 11–14, ×4 for 15 or more; a party of " +
        "fewer than 3 counts one step up, 6 or more one step down), then compared with your " +
        "party's Easy, Medium, Hard and Deadly thresholds. It updates as you change the monsters " +
        "or the party's levels."
    : DIFFICULTY_HOW;
}
