/**
 * Restwater fight content (Plan 59, Session 6) — transcribed VERBATIM from
 * the 2026-08-22 handoff. Nothing invented, nothing embellished. DM-only.
 *
 * Base creature: Green Hag (2024 MM). Justin verifies her printed attack
 * line against the book before Saturday — numbers below are the run-state
 * he wants encoded.
 */

export const DM_WARNING = "DM ONLY — NEVER ON THE PROJECTOR";

export const SORREL = {
  /** Display name on the DM side only; the board token gets no label. */
  name: "AUNTIE SORREL",
  base: "Green Hag (2024 MM) — verify her printed attack line against the book",
  ac: 17,
  maxHp: 82,
  speed: 30,
  init: "+1",
  regen: "+10 HP at the start of her turns while the pools hold water",
  hardFlag:
    "She cannot drop below 1 HP while POOLS FULL. Damage that would kill her leaves her at 1.",
  attack: "Claw +6 to hit, 13 (2d8+4) slashing",
  traits: [
    "Illusory Appearance",
    "Invisible Passage (turns invisible, repositions; attacks against her at disadvantage while unseen)",
    "Mimicry",
  ],
};

/** Phases by TOTAL DAMAGE DEALT to her — cumulative damage, not HP. */
export const PHASES = [
  { at: 0, label: "P1 — one Claw per turn, host mask on" },
  { at: 30, label: "P2 — Multiattack (two Claws), Invisible Passage between steam banks" },
  {
    at: 60,
    label: "P3 — house action every round",
    note: "P3 also starts the moment the pools drain",
    endstate: true,
  },
];

/** The house: lair actions, initiative 20, one per round, P3 only unless toggled on earlier. */
export const HOUSE_ACTIONS = [
  {
    id: "vent",
    name: "Scalding vent",
    detail: "10-ft burst, DEX save DC 12, 2d6 fire. Never targets a PC at 0 HP.",
  },
  {
    id: "towels",
    name: "The towels",
    detail:
      "One creature Restrained; escape STR (Athletics) DC 12 as an action, or any ally's action frees them.",
  },
  {
    id: "door",
    name: "A door re-binds",
    detail: "One doorway sealed until the end of the round.",
  },
  {
    id: "staff",
    name: "The staff plead",
    detail:
      "Three noncombatant staff move to block lines; shoving past costs movement only.",
  },
];

export const SPRING_GATE = {
  title: "THE SPRING-GATE (below the main pool)",
  methodA:
    "Two creatures at the gate use their actions in the same round, each makes STR DC 12; " +
    "both succeed and it grinds open. Other creatures can grant advantage by bracing.",
  methodB: "One action with the cold iron knife, no roll, automatic.",
  variant: "Variant flag Justin may call at the table: DC 10 instead of 12 (loose-gate story condition).",
  onOpen:
    "POOLS FULL → POOLS DRAINED. Her regeneration ends, the can't-die flag clears, P3 starts immediately.",
};

export const MIRA = {
  name: "MIRA",
  line: "AC 15 · HP 20 · Init +2 · Cutlass +5, 1d8+3 · Second Wind 1/day (1d10+2)",
  maxHp: 20,
  compromised:
    "COMPROMISED: she does not fight the hag; she blocks, pleads, and stalls the party. " +
    "Flag clears when pools drain.",
};

export const EDRIK = {
  name: "EDRIK",
  line: "Noncombatant, bedridden in a guest room. HP 15 if it ever matters. Never targeted.",
  maxHp: 15,
};

export const WELCOME = {
  name: "THE WELCOME",
  line: "AC 13 · HP 12 · noncombatant. Cannot be charmed. Never targeted by Sorrel or the house.",
  maxHp: 12,
  recite: "Recite, once: gives one PC advantage on one ability check inside the house.",
};

export const STAFF = {
  name: "THE STAFF",
  count: 3,
  line: "AC 11 · HP 9 each · never attack, never targeted by the party if Justin can help it.",
  maxHp: 9,
  freed: "Freed when she dies or pools drain.",
};

/** Comfort tally: 4 PCs named; the 3 NPC rows are blank + DM-editable (no names invented). */
export const TALLY_PCS = ["Creed", "Nya", "Thane", "Willa"];
export const TALLY_NPC_SLOTS = 3;
export const TALLY_MAX = 3;

/** Board note: doorway blocking uses an existing feature, not a new one. */
export const DOORWAY_NOTE =
  "Sealing a doorway on the board: drop a custom colored token (size 1, no label) across it; " +
  "remove it when the round ends.";
