/**
 * The Temple Companion — room + boss content (Plan 58).
 *
 * Every string here is transcribed VERBATIM from the DM's handoff and the
 * static blueprint (`campaigns/session-05-temple-blueprint.html`). Nothing
 * is invented and nothing is embellished — if a beat isn't in those two
 * documents, it isn't here. Pin coordinates and colours are the
 * blueprint's own, so the cockpit and the printed page agree.
 *
 * DM-only content. This page is never player-visible.
 */

/** The published player explorable; hashes open a specific panel. */
export const EXPLORABLE = "https://claude.ai/code/artifact/51e93716-00cd-418e-8770-c526d816f4dd";

export type RoomKind = "puzzle" | "lore" | "trap" | "choice" | "soul" | "boss";

export interface Beat {
  /** Rendered label. */
  text: string;
  /** Present when the beat carries a persistent checkbox. */
  check?: string;
  /** Emphasis: "dm" = prominent DM note, "roll" = mechanic/DC line. */
  tone?: "dm" | "roll";
}

export interface StatCard {
  name: string;
  line: string;
  hp?: number;
  count?: number;
}

export interface Room {
  id: string;
  numeral: string;
  title: string;
  kind: RoomKind;
  color: string;
  /** Blueprint pin coordinates, in the 1600×1000 viewBox. */
  x: number;
  y: number;
  /** Keyboard shortcut. */
  key: string;
  readAloud: string;
  beats: Beat[];
  links?: { label: string; href: string }[];
  stats?: StatCard[];
}

export const ROOMS: Room[] = [
  {
    id: "tide-gate",
    numeral: "①",
    title: "Tide Gate",
    kind: "puzzle",
    color: "#c9a25a",
    x: 560,
    y: 447,
    key: "1",
    readAloud:
      "A door of standing water under an arch carved HOLD. Fish hang frozen inside it, mid-turn. Beside the door: loose glyph tiles, and a small tide pool alive with silverfish.",
    beats: [
      {
        text: "Press tiles ⬟ ● ▲ ✦ (H-O-M-E) in order → the door parts.",
        tone: "roll",
      },
      {
        text: "Wrong order: the water SLAPS — DC 12 DEX or 1d4 cold + pushed back.",
        tone: "roll",
      },
      {
        text: "HINT: watched long enough, the silverfish school into the sequence.",
        check: "hint-fired",
      },
    ],
  },
  {
    id: "nave",
    numeral: "②",
    title: "Drowned Nave",
    kind: "lore",
    color: "#5b7d84",
    x: 770,
    y: 460,
    key: "2",
    readAloud: "A pillared hall. At its center, a great tablet furred with growth.",
    beats: [
      { text: "ASHMANTLE legible; Creed engages or doesn't.", tone: "dm" },
      { text: "Stone read.", check: "stone-read" },
    ],
    links: [{ label: "open explorable → Covenant Stone", href: `${EXPLORABLE}#covenant` }],
  },
  {
    id: "gallery",
    numeral: "Ⓣ",
    title: "The Gallery",
    kind: "trap",
    color: "#b0563f",
    x: 955,
    y: 520,
    key: "t",
    readAloud:
      "A sloping corridor. A winding path of soft gold light — colonies of lamp-limpets — threading through dark stone. The walls are written floor to ceiling.",
    beats: [
      { text: "Step the glow = safe.", tone: "roll" },
      {
        text: "A dark step: cold hands from below — DC 12 DEX or 1d4 cold + grappled one round.",
        tone: "roll",
      },
      { text: "Trap sprung.", check: "trap-sprung" },
      { text: "Wall read.", check: "wall-read" },
    ],
    links: [{ label: "open explorable → Glyph Wall", href: `${EXPLORABLE}#glyphs` }],
  },
  {
    id: "bell-well",
    numeral: "③",
    title: "Bell Well",
    kind: "choice",
    color: "#7a5a8c",
    x: 1085,
    y: 500,
    key: "3",
    readAloud:
      "A flooded shaft. A great sunken bell, humming the refrain — and three shapes clinging to it, dormant.",
    beats: [
      {
        text: "THE CHOICE — RING IT: the deep door opens instantly + 3 Drowned Reachers wake.",
        tone: "dm",
      },
      { text: "Rang it.", check: "rang-it" },
      {
        text: "OR THE LONG CLIMB: group Stealth DC 12, then Athletics DC 12s.",
        tone: "roll",
      },
      { text: "Climbed.", check: "climbed" },
    ],
    stats: [
      {
        name: "Drowned Reacher",
        line: "AC 12 · +4 claw 1d6+2 · pull toward the water, escape DC 12",
        hp: 16,
        count: 3,
      },
    ],
  },
  {
    id: "keepers-cell",
    numeral: "④",
    title: "Keeper's Cell",
    kind: "soul",
    color: "#4a6e9c",
    x: 935,
    y: 712,
    key: "4",
    readAloud:
      "Her sanctum. A kelp-woven cot. Tally marks past counting, on every wall. And a small side alcove, prepared long ago: infant things, and a half-finished carving of a boat.",
    beats: [
      { text: "Let them stand in it. NEVER CUT THIS ROOM.", tone: "dm" },
      { text: "They stood in it.", check: "stood-in-it" },
    ],
  },
  {
    id: "the-heart",
    numeral: "⑤",
    title: "The Heart",
    kind: "boss",
    color: "#6e4550",
    x: 1120,
    y: 800,
    key: "5",
    readAloud:
      "The sealed lantern — wickless, dark, wrapped in chains of black that doesn't move like water. Beside it, held like a coat on a hook: Edrik. And between you and both of them, something wearing a woman, beautifully.",
    beats: [
      { text: "Then BOSS MODE — press B.", tone: "dm" },
      {
        text: "Post-fight: run the scene script (content arrives separately).",
        tone: "dm",
      },
    ],
    links: [
      { label: "open explorable → Sealed Lantern", href: `${EXPLORABLE}#lantern` },
      { label: "open explorable → The Kept", href: `${EXPLORABLE}#kept` },
    ],
  },
];

// ── Boss mode ────────────────────────────────────────────────────────────────

export const NEREA = {
  name: "NEREA / the thing",
  maxHp: 75,
  line: "AC 14 · +6 attack, 2d6+3 cold, reach 10 ft · saves +3",
};

/** Banners light automatically once cumulative damage dealt crosses `at`. */
export const PHASES = [
  { at: 25, label: "THE COMPOSURE CRACKS — voice doubles" },
  { at: 50, label: "THE PRETENSE DROPS — two attacks/turn, faster" },
  { at: 75, label: "IT CANNOT HOLD HER", endstate: true },
];

export interface LairAction {
  id: string;
  name: string;
  detail: string;
  /** Removed from the list once Edrik is freed. */
  requiresEdrikHeld?: boolean;
}

/** Initiative 20 — pick one. Tap to mark used; resets on round advance. */
export const LAIR_ACTIONS: LairAction[] = [
  { id: "cold-surge", name: "Cold Surge", detail: "activate a hazard zone" },
  { id: "deep-leans", name: "The Deep Leans", detail: "STR DC 12 or pushed 10 ft" },
  {
    id: "song-inverted",
    name: "Song Inverted",
    detail: "WIS DC 12 or disadvantage vs. her next round",
  },
  {
    id: "chains-tighten",
    name: "Chains Tighten",
    detail: "Edrik cries out — tempo, no roll",
    requiresEdrikHeld: true,
  },
];

export const EDRIK = {
  freeing: "freed (action + DC 12 STR)",
  allyLine: "+4 cutlass, 1d8+2",
};

export const MIRA = {
  label: "Mira boarded",
  maxHp: 20,
  line: "AC 15 · +5 cutlass 1d8+3 · Second Wind 1/day (1d10+2)",
};

export const BOSS_FLAVOR =
  "as damage mounts, snatches of the SONG escape between its sentences — her, leaking through the cracks.";

/** From the blueprint's own footer. */
export const CUT_ORDER =
  "long climb collapses (ring or nothing) → Nave+Cell merge → Gate opens at a touch. Cell never dies.";

export const DM_WARNING = "DM EYES ONLY — NEVER ON THE PROJECTOR";
