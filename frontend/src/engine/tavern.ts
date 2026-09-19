import type { MapDef, Piece, Seg } from "./maps";

/**
 * The Haunted Dockside Tavern (Margarita-shire), a Czepeku interior, traced by
 * hand for the spike (Plan 108). 4620×6440 at a 140px grid: 33 by 46 cells.
 */

/** Three seats round a table, in map units (0.6 of a cell out). */
const seats = (u: number, v: number): Piece[] => [
  { model: "wooden_stool_01", u: u - 0.018, v, rot: Math.PI / 2 },
  { model: "wooden_stool_01", u: u + 0.018, v, rot: -Math.PI / 2 },
  { model: "wooden_stool_01", u, v: v + 0.013, rot: Math.PI },
];

const ROUND_TABLES: [number, number][] = [
  [0.335, 0.301],
  [0.45, 0.306],
  [0.359, 0.386],
  [0.6, 0.384],
];

// Taproom — the big hall with the hearth. Doorways: one to the dock at the
// top, the arch into the central hall at the bottom, a door into the wing.
const TAPROOM: Seg[] = [
  [0.105, 0.24, 0.46, 0.24],
  [0.52, 0.24, 0.69, 0.24],
  [0.105, 0.24, 0.105, 0.415],
  [0.105, 0.415, 0.44, 0.415],
  [0.53, 0.415, 0.69, 0.415],
  [0.69, 0.24, 0.69, 0.3],
  [0.69, 0.34, 0.69, 0.415],
];
// The right wing — the lounge with the round rug and the red sofas.
const WING: Seg[] = [
  [0.69, 0.075, 0.88, 0.075],
  [0.88, 0.075, 0.88, 0.415],
  [0.69, 0.075, 0.69, 0.24],
  [0.69, 0.415, 0.88, 0.415],
];
// The lower block — kitchen, the central hall with the barrels, the rooms.
const LOWER: Seg[] = [
  [0.105, 0.415, 0.105, 0.81],
  [0.105, 0.81, 0.88, 0.81],
  [0.88, 0.415, 0.88, 0.81],
  [0.355, 0.415, 0.355, 0.75],
  [0.585, 0.415, 0.585, 0.75],
];

export const TAVERN: MapDef = {
  id: "tavern",
  name: "Margarita-shire — the tavern",
  // The Margarita-shire battle maps render as the beach bar now (beach.ts); this room is the spike's.
  battleMapIds: [],
  // A 2K derivative; the full picture is 30 MP.
  url: "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/14fad705-0fd7-43b6-876b-31783625163e-QDH6Xt3CJQti4xWEMUfjffNbdKAeLE.jpg",
  w: 33,
  h: 46,
  walls: [...TAPROOM, ...WING, ...LOWER],
  torches: [
    [0.125, 0.33, true],
    [0.4, 0.258, true],
    [0.535, 0.252, false],
    [0.615, 0.252, false],
    [0.665, 0.395, false],
    [0.86, 0.15, false],
    [0.86, 0.35, false],
    [0.13, 0.6, false],
    [0.375, 0.6, true],
    [0.565, 0.6, false],
    [0.86, 0.6, false],
  ],
  props: [
    ...ROUND_TABLES.map(([u, v]) => ({ model: "round_wooden_table_01", u, v })),
    ...ROUND_TABLES.flatMap(([u, v]) => seats(u, v)),
    // Long tables with stools along them, down the left side and on the right.
    { model: "wooden_table_02", u: 0.185, v: 0.286, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.206, v: 0.28, rot: -Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.206, v: 0.293, rot: -Math.PI / 2 },
    { model: "wooden_table_02", u: 0.185, v: 0.372, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.206, v: 0.366, rot: -Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.206, v: 0.379, rot: -Math.PI / 2 },
    { model: "wooden_table_02", u: 0.607, v: 0.281, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.586, v: 0.275, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.586, v: 0.288, rot: Math.PI / 2 },
    // Barrels and crates: the cluster bottom-left, a loose one, two by the hearth.
    { model: "wine_barrel_01", u: 0.27, v: 0.395, rot: 0.4 },
    { model: "wooden_crate_02", u: 0.292, v: 0.402, rot: 1.1 },
    { model: "wine_barrel_01", u: 0.312, v: 0.39, rot: 2.3 },
    { model: "wine_barrel_01", u: 0.338, v: 0.372, rot: 1.7 },
    { model: "wooden_crate_02", u: 0.29, v: 0.291, rot: 0.2 },
    { model: "wine_barrel_01", u: 0.495, v: 0.294, rot: 2.9 },
    // The bar: a cabinet against the wall, barrels beside it, stools in front.
    { model: "GothicCabinet_01", u: 0.575, v: 0.2455, rot: 0 },
    { model: "wine_barrel_01", u: 0.518, v: 0.247, rot: 0.9 },
    { model: "wine_barrel_01", u: 0.632, v: 0.247, rot: 2.2 },
    { model: "wooden_stool_01", u: 0.55, v: 0.266, rot: 0 },
    { model: "wooden_stool_01", u: 0.575, v: 0.266, rot: 0 },
    { model: "wooden_stool_01", u: 0.6, v: 0.266, rot: 0 },
    { model: "jug_01", u: 0.562, v: 0.257, y: 0.7 },
    { model: "wooden_bowl_01", u: 0.59, v: 0.257, y: 0.7 },
  ],
  planks: [
    [0.105, 0.24, 0.69, 0.415],
    [0.69, 0.075, 0.88, 0.415],
  ],
  hearth: [0.389, 0.253],
  bar: [0.575, 0.257],
  look: [0.4, 0.33],
  eye: [0.9, 5.8, 5.0],
  looks: { bar: { at: [0.575, 0.268], eye: [0.6, 2.4, 4.6] } },
  start: [0.4, 0.33],
};
