// Plan 131 — which edition a campaign plays by. Every character in a campaign follows its
// rules: the builder, the level-up guide, spells, trackers, conditions and the DM screen.

export type Ruleset = "2024" | "2014";

export const RULESETS: Ruleset[] = ["2024", "2014"];

/** A missing value (an older API, a cached campaign) means the 2024 rules. */
export function rulesetOf(value: string | null | undefined): Ruleset {
  return value === "2014" ? "2014" : "2024";
}

export function rulesetLabel(r: Ruleset): string {
  return r === "2014" ? "2014 rules" : "2024 rules";
}

/** One plain line about each edition, for the picker. */
export function rulesetBlurb(r: Ruleset): string {
  return r === "2014"
    ? "The original 5th edition (2014 Player's Handbook). Races give ability bonuses."
    : "The current rules (2024 Player's Handbook). Backgrounds give ability bonuses.";
}
