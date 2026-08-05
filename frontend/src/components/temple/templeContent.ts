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

/**
 * The Held Door (Amendment 1) — the last door before the Heart. Its own
 * page. Carries the temple's first hidden hotspot: a player must SPOT the
 * struck crown in the art and ask to click it. Do not point at it.
 */
export const HELD_DOOR = "https://claude.ai/code/artifact/9d66e351-fead-479a-8fb5-0901634d6ff9";

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
  /** What the PLAYERS should be looking at while the party is here. */
  player?: string[];
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
    player: [
      "ONE STATIC IMAGE — the door. Solved out loud, not by clicking.",
      "Scene: '1 Tide Gate'. Do NOT run the puzzle board; it's a backup only.",
    ],
    readAloud:
      "A door of standing water. A long inscription in letters they mostly don't have — and one word repeating that they CAN read. Four empty sockets, four loose tiles.",
    beats: [
      { text: "DO: press tiles into sockets.", tone: "roll" },
      { text: "SOLVE: ⬟ ● ◼ ✱ — H-O-L-D. The oath completed, the water parts.", tone: "roll" },
      {
        text: "COST: wrong press, the water slaps — DC 12 DEX or 1d4 cold, pushed back.",
        tone: "roll",
      },
      { text: "Hint 1 — the repeating word is readable.", check: "hint-1" },
      { text: "Hint 2 — four sockets, four tiles.", check: "hint-2" },
      { text: "Hint 3 — Willa's glow near the right first tile.", check: "hint-3" },
      {
        text: "After this room the alphabet is SPENT. No more letter puzzles tonight.",
        tone: "dm",
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
    player: [
      "Scene: '2 Nave' (board preset)",
      "Explorable: Covenant Stone when they approach the tablet.",
    ],
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
    player: [
      "Scene: 'T Gallery' — the glowing limpet path is ON the map; they pick their steps by it.",
      "Explorable: Glyph Wall as they walk.",
    ],
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
    player: [
      "BOARD — only if they ring. Nothing to inspect, everything to decide.",
      "Scene: '3 Bell Well'. If they climb, stay off the screen entirely.",
    ],
    readAloud:
      "A flooded shaft. A great sunken bell, humming the refrain — and three shapes clinging to it, dormant.",
    beats: [
      {
        text:
          "RING IT: the deep door opens instantly, they wake — fight on the spiral, " +
          "Claw mode.",
        tone: "dm",
      },
      { text: "Rang it.", check: "rang-it" },
      {
        text: "OR THE LONG CLIMB: group Stealth DC 12, then climb DC 12s.",
        tone: "roll",
      },
      { text: "Climbed.", check: "climbed" },
      {
        text:
          "Both answers right. Say nothing about what else the bell can do. Clear " +
          "the sleepers here and her bell lair action is spent — they'll never know.",
        tone: "dm",
      },
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
    player: ["NOTHING. Dim the screen. Tech would wound this room."],
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
    player: [
      "FIRST — the Held Door: the way in. Four stations, and the word over the arch.",
      "Scene: 'The Drowned Temple' (battle map, 5-ft grid, four hazard zones ready to reveal).",
      "Explorable: Sealed Lantern. Edrik is NOT a pin — he is behind the joint in the masonry.",
    ],
    readAloud:
      "The sealed lantern — wickless, dark, wrapped in chains of black that doesn't move like water. Beside it, held like a coat on a hook: Edrik. And between you and both of them, something wearing a woman, beautifully.",
    beats: [
      {
        text:
          "THE HELD DOOR COMES FIRST. Over the arch, bigger than any word in the " +
          "temple: HELD. Let them do the one-letter diff themselves.",
        tone: "dm",
      },
      {
        text:
          "DO: touch stations, crowns light. Weight does nothing — the door knows " +
          "held from weighted. Let them work it; let the who-goes argument start.",
        tone: "dm",
      },
      {
        text:
          "The gouges are SPOTTED, never pointed at. Click only when a player " +
          "points. If nobody looks, nobody looks.",
        tone: "dm",
      },
      { text: "Struck crown found.", check: "struck-crown" },
      {
        text:
          "THEN — she opens it herself. All four crowns die at once, the water " +
          "parts, and she is standing in it. The security of the whole temple, " +
          "waived. Go to the greeting.",
        tone: "dm",
      },
      { text: "She opened it.", check: "she-opened-it" },
      {
        text:
          "No Edrik visible. The seam is in the wall right of the chained mass — " +
          "Perception DC 13, or stand quiet near it and hear breathing, no roll. " +
          "Click it on discovery; they spot it, you confirm it.",
        tone: "roll",
      },
      { text: "Edrik found.", check: "edrik-found" },
      { text: "THE PITCH: she asks Willa, gently, only true things.", tone: "dm" },
      {
        text:
          "THE SPRING — first trigger wins: they find him or demand him · they " +
          "refuse or stall · Willa's hands touch the lantern and his pounding " +
          "interrupts, no roll. The bait won't stay quiet.",
        tone: "dm",
      },
      { text: "Sprung.", check: "sprung" },
      {
        text: "Then: his warning · the vanished way in · the sealed mouth · her line · initiative.",
        tone: "dm",
      },
      {
        text: "SWITCH TO THE BOARD the moment dice come out, and don't go back. Press B.",
        tone: "dm",
      },
      {
        text: "Post-fight: run the scene script (content arrives separately).",
        tone: "dm",
      },
    ],
    links: [
      { label: "open → The Held Door", href: HELD_DOOR },
      { label: "→ the four stations", href: `${HELD_DOOR}#stations` },
      { label: "open explorable → Sealed Lantern", href: `${EXPLORABLE}#lantern` },
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

/** The one rule of the place. Say none of it; let the walls do it. */
export const ONE_RULE =
  "It's a keeper's house. Everything in it holds, or asks them to. The building " +
  "teaches one word all the way down, and the last door changes one letter of it. " +
  "Say none of this. Let the walls do it.";

/** Screen order, start to finish. */
export const SCREEN_ORDER = [
  "DECK board → dawn preset, let it sit",
  "Gate image",
  "Nave explorable",
  "Gallery explorable, board behind",
  "Bell Well board — only if rung",
  "Cell — dim everything",
  "Door explorable",
  "Heart explorable",
  "HEART BOARD at initiative",
  "ALL SCREENS DARK at 0 HP — paper from there to the end",
];

/** What the building says, in order. Never explain it. */
export const WHAT_IT_SAYS =
  "HOLD, spelled by their own hands. Whose oath it was. HOLD carved hundreds of " +
  "times, some hurried. What holding cost her, in tally marks. HELD, over the last " +
  "door. And then the thing that did the holding, wearing her voice. Never explain " +
  "this. It lands on the drive home.";
