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
    title: "Flood Gate",
    kind: "puzzle",
    color: "#c9a25a",
    x: 560,
    y: 447,
    key: "1",
    player: [
      "BOARD + NARRATION (REV 3) — scene 'FLOOD GATE'. No explorable, no puzzle screen.",
    ],
    readAloud: "A door of standing water. Fish hang frozen inside it, mid-turn.",
    beats: [
      {
        text:
          "REV 3: zero language/symbol puzzles — the letter mechanic is deleted " +
          "(the seeded puzzle board is gone too). Run the room from the table doc; " +
          "wall script is texture only.",
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
      {
        text:
          "REV 3: the panel shows house SIGILS (all dark) + the oath — no names " +
          "anywhere. Creed recognizing his own mark is a TABLE beat, yours to give.",
        tone: "dm",
      },
      {
        text: "The 'bloodied thumb' press wakes silver in one sigil. One room, one beat, move.",
        tone: "dm",
      },
      { text: "Stone touched.", check: "stone-read" },
    ],
    links: [{ label: "open explorable → Covenant Stone", href: `${EXPLORABLE}#covenant` }],
  },
  {
    id: "gallery",
    numeral: "Ⓣ",
    title: "Corridor",
    kind: "trap",
    color: "#b0563f",
    x: 955,
    y: 520,
    key: "t",
    player: [
      "BOARD + NARRATION (REV 3) — scene 'CORRIDOR'. The glowing limpet path is ON " +
        "the map; they pick their steps by it. No explorable for this room.",
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
      {
        text: "The wall script is TEXTURE (REV 3) — nothing to read, nothing to click.",
        tone: "dm",
      },
    ],
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
      "The sealed lantern — wickless, dark, wrapped in ribbons of liquid black that hover just off it, coiling without touching. Beside it, held like a coat on a hook: Edrik. And between you and both of them, something wearing a woman, beautifully.",
    beats: [
      {
        text:
          "THE HELD DOOR COMES FIRST. REV 3: the arch is BARE dressed stone — " +
          "the only uncarved surface in the temple. No word, no glyphs.",
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
          "No Edrik visible. The seam is in the wall right of the lantern dais — " +
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
  maxHp: 114,
  line:
    "AC 14 · Slam +7, 2d8+4, Med or smaller prone · Whelm (rech 4–6) DC 15 STR, " +
    "4d8+4, Grappled esc 14 + Restrained, 2d8/turn · Resist Acid (NOT Fire) · " +
    "Freeze: cold slows 20 ft · full card: Monsters → Nerea",
};

/** Banners light automatically once cumulative damage dealt crosses `at`.
 * Work order 8/5: P2 at 40 dealt, P3 at 75 dealt. She cannot drop below
 * 1 HP until P3 has taken a turn (the tracker enforces the floor). */
export const PHASES = [
  { at: 40, label: "P2 — THE PRETENSE DROPS: Multiattack" },
  { at: 75, label: "P3 — +WHELM. After her next turn, she can fall", endstate: true },
];

/** The 1-HP floor: holds until the DM marks P3's turn taken. */
export const P3_FLOOR_NOTE = "P3 has taken a turn (unlocks 0 HP)";
export const NEVER_WHELM = "Never damage-Whelm Willa.";

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
  allyLine: "AC 14 · cutlass +4, 1d8+2",
  maxHp: 15,
};

export const MIRA = {
  label: "Mira boarded",
  maxHp: 20,
  line: "AC 15 · cutlass +5, 1d8+3 · Second Wind 1/day (1d10+2) · adv. shove/trip/intimidate",
};

export const BOSS_FLAVOR =
  "as damage mounts, snatches of the SONG escape between its sentences — her, leaking through the cracks.";

/** From the blueprint's own footer. */
export const CUT_ORDER =
  "long climb collapses (ring or nothing) → Nave+Cell merge → Gate opens at a touch. Cell never dies.";

export const DM_WARNING = "DM EYES ONLY — NEVER ON THE PROJECTOR";

/** The one rule of the place (REV 3 final — the word program is gone). */
export const ONE_RULE =
  "It's a keeper's house. Everything in it holds, or asks them to. " +
  "Say none of this. Let the walls do it.";

/** Screen order, start to finish (REV 3 names; The Stair kept for dawn). */
export const SCREEN_ORDER = [
  "DECK board → dawn, let it sit",
  "THE STAIR board — the descent",
  "FLOOD GATE board + narration",
  "Nave explorable",
  "CORRIDOR board + narration",
  "Bell Well board — only if rung",
  "Cell — dim everything",
  "Door explorable",
  "Heart explorable",
  "HEART BOARD at initiative",
  "ALL SCREENS DARK at 0 HP — paper from there to the end",
];

/** What the building says, in order (REV 3 final). Never explain it. */
export const WHAT_IT_SAYS =
  "Whose oath it was. What holding cost her, in tally marks. The bare arch, " +
  "the only uncarved stone. And then the thing that did the holding, wearing " +
  "her voice. Never explain this. It lands on the drive home.";
