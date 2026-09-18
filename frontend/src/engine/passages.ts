/**
 * The ways between built maps, as the HUD needs them (Plan 112): which battle
 * map has a hidden way out, what to call it, where it leads, and where the
 * party lands. Kept free of three.js so the HUD can import it.
 */
export interface MapExit {
  /** The battle map the exit is on. */
  from: string;
  /** The exit's key — what the table reveals ("exit:<key>") and the engine matches. */
  key: string;
  label: string;
  /** The battle map it leads to. */
  to: string;
  /** Where the party arrives on the far map, in that map's picture pixels. */
  landing: [number, number];
  /** What the far map's arrival is called, for the button. */
  arrive: string;
}

export const EXITS: MapExit[] = [
  {
    from: "6284f67e-99ff-4dc2-b98e-de8898d8fb4e", // Restwater
    key: "abode",
    label: "the hatch to Sorrel's abode",
    to: "67c3e633-9cd2-463e-91d7-b3388df6e6b5", // Sorrel's abode
    landing: [336, 365], // the foot of the ladder up
    arrive: "Sorrel's abode",
  },
];
