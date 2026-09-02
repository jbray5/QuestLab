/**
 * Condition display vocabulary (Plan 65) — shared by the 2D projector and
 * the 3D board so a "poisoned" mark looks the same everywhere.
 *
 * Backend stores lowercase 5e condition strings on SessionCombatant.
 */

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
