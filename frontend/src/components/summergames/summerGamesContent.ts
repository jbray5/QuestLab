/**
 * The Summer Games (Plan 114, Session 8) — the five contests, as data.
 *
 * Revised 2026-09-26: everyone competes at once and every event plays
 * differently, so each one is its own little mode rather than a column of
 * scores. Everything here is from Justin's handoff verbatim — the DCs, the
 * rivals, their flat bonuses and their habits, and the prizes.
 *
 * Nothing in this file is player-facing. The tracker is a DM screen, so a
 * rival's habit (Wenna always bids two) can sit here in the open.
 */

export type EventKey = "apple" | "ring" | "maze" | "moths" | "caber";

export interface Rival {
  name: string;
  /** Added to the rival's d20 automatically. */
  bonus: number;
  /** How they play, for the DM running them. DM-only. */
  habit?: string;
}

export interface Contest {
  key: EventKey;
  name: string;
  /** The shape of the game, in one line. */
  shape: string;
  /** What an entrant rolls. */
  check: string;
  /** How somebody wins it. */
  win: string;
  rival: Rival;
  prize: string;
}

export const CONTESTS: Contest[] = [
  {
    key: "apple",
    name: "The Golden Apple",
    shape: "Keep-away, on the board, in initiative order. Four rounds.",
    check:
      "Holder: DEX (Acrobatics) or STR (Athletics) vs DC 12 to keep it. " +
      "Anyone in reach may contest with Athletics or Sleight of Hand.",
    win: "Hold it at the bonfire at the end of your turn, or hold it when round 4 ends.",
    rival: { name: "Pip", bonus: 5, habit: "Jumps 30 ft. Cheats cheerfully." },
    prize: "The Golden Apple",
  },
  {
    key: "ring",
    name: "King of the Ring",
    shape: "Free-for-all in the chalk circle. Three touches and you are out.",
    check: "Attack roll vs the opponent's AC. No damage.",
    win: "Last one still in the circle.",
    rival: { name: "Ser Oakhallow", bonus: 5, habit: "AC 18. Athletics +4." },
    prize: "A Knight's Favor + Heroic Inspiration",
  },
  {
    key: "maze",
    name: "The Green Maze",
    shape: "Push your luck. Four steps to the centre, and the hedges move every round.",
    check:
      "WIS (Survival) or INT (Investigation) vs DC 13, " +
      "or STR (Athletics) vs DC 15 to go through a hedge. A failure sticks you for a round.",
    win: "First to four steps.",
    rival: { name: "Old Burdock", bonus: 6, habit: "Always Careful. Nine-time champion." },
    prize: "Hedge-Seed",
  },
  {
    key: "moths",
    name: "The Moth Lantern",
    shape: "Secret bid. Six oil to spend across three rounds.",
    check:
      "WIS (Nature or Survival) or DEX (Sleight of Hand) vs DC 12. " +
      "Grant a success for clever use of light.",
    win: "Most moths after three rounds.",
    rival: { name: "Wenna Reedfoot", bonus: 5, habit: "Bids 2, 2, 2. About twelve, extremely serious." },
    prize: "Moth Lantern",
  },
  {
    key: "caber",
    name: "The Caber Toss",
    shape: "Three throws, and every one is a gamble.",
    check: "STR (Athletics) vs DC 14. A miss is a backfire and scores nothing.",
    win: "Best single throw.",
    rival: { name: "Hale Brambleback", bonus: 7, habit: "Always Steady." },
    prize: "Cask of Summer Honey Wine (or Heroic Inspiration if a PC beats Mira)",
  },
];

/** Starting oil for the Moth Lantern, per entrant. */
export const MOTH_OIL = 6;
/** Steps to the centre of the maze. */
export const MAZE_GOAL = 4;
/** Touches that put you out of the ring. */
export const RING_OUT = 3;
/** Rounds in the apple chase. */
export const APPLE_ROUNDS = 4;

/** What the purse pays, revised 2026-09-26. */
export const PAYOUTS = {
  consolation: 10,
  champion: 200,
  championPrize: "the Champion's Garland",
};
