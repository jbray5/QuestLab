/**
 * The Summer Games (Plan 114, Session 8) — the five contests, as data.
 *
 * Everything here is from Justin's handoff verbatim. Nothing is invented: the
 * DCs, the rivals and their flat bonuses, and the prizes are his. Where he
 * left a choice open it is left open here too.
 */

export interface Contest {
  key: string;
  name: string;
  /** What each entrant rolls, in the DM's own words. */
  check: string;
  /** The NPC who is already good at this. */
  rival: string;
  /** Added to the rival's d20 automatically, every round. */
  bonus: number;
  prize: string;
  /** Anything the DM has to remember while running it. */
  note?: string;
}

export const ROUNDS = 3;

export const CONTESTS: Contest[] = [
  {
    key: "apple",
    name: "The Golden Apple",
    check:
      "Holder: DEX (Acrobatics) or STR (Athletics) vs DC 12 to keep it. " +
      "Anyone in reach may contest with Athletics or Sleight of Hand.",
    rival: "Pip",
    bonus: 5,
    prize: "The Golden Apple",
    note: "A chase — run it on the board with movement. Pip jumps 30 ft.",
  },
  {
    key: "bout",
    name: "The Knight's Bout",
    check: "Attack roll vs the opponent's AC. Ser Oakhallow is AC 18.",
    rival: "Ser Oakhallow",
    bonus: 5,
    prize: "A Knight's Favor + Heroic Inspiration",
    note: "First to three touches. Real attack rolls, no damage.",
  },
  {
    key: "maze",
    name: "The Green Maze",
    check:
      "WIS (Survival) or INT (Investigation) vs DC 13, " +
      "or STR (Athletics) vs DC 15 to go through a hedge.",
    rival: "Old Burdock",
    bonus: 6,
    prize: "Hedge-Seed",
    note: "Three successes reaches the center. Nine-time champion.",
  },
  {
    key: "moths",
    name: "The Moth Lantern",
    check:
      "WIS (Nature or Survival) or DEX (Sleight of Hand) vs DC 12. " +
      "Grant a success for clever use of light.",
    rival: "Wenna Reedfoot",
    bonus: 5,
    prize: "Moth Lantern",
    note: "Most moths after 3 rounds. Wenna is about twelve and extremely serious.",
  },
  {
    key: "caber",
    name: "The Caber Toss",
    check: "STR (Athletics) vs DC 14.",
    rival: "Hale Brambleback",
    bonus: 7,
    prize: "Cask of Summer Honey Wine",
    note: "Farthest total. Heroic Inspiration instead if a PC beats Mira.",
  },
];

/** What the handoff pays out when the dust settles. */
export const PAYOUTS = {
  runnerUp: "10 gp to every PC who entered and did not win",
  champion: "100 gp + the Champion's Garland to the most event wins (ties: roll-off)",
};
