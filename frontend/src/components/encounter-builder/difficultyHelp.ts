/**
 * Plain-language difficulty (usability pass, Plan 121): what each 2024 band
 * means at the table, and the Lamplit pill for it. Low reads teal, Moderate
 * neutral, High amber, Deadly red — they differ in lightness too.
 */
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
