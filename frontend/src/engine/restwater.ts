import type { MapDef, Seg } from "./maps";

/**
 * Restwater — the bathhouse cottage and its hot springs (Plan 108, third pass).
 * Justin: "Let me see you do this with Restwater." 1536×1024 at a 64px grid:
 * 24 by 16 cells. Not a Czepeku base; the walls are traced from the picture.
 *
 * The cottage: five small rooms across the top (a store, a room with a chest,
 * two bedrooms, a room with a bench), a hall with a fountain in the middle and
 * a bedroom alcove on the right, then a kitchen, the front corridor and two
 * rooms along the bottom. The front door opens onto a stone step. East of the
 * house, three steaming pools with lanterns beside them, and a well.
 */

// The walls are written on the cell grid — a column is 1/24 of the width, a
// row 1/16 of the height — so every door is exactly one cell and every jamb
// meets a divider. This is what the sanity check asked for: the picture's
// building was never aligned to its own grid, and in the built route the
// picture is only a blueprint.
const C = (n: number) => n / 24;
const R = (n: number) => n / 16;

// Justin: "fewer rooms in the bathhouse." So: a store open to the hall and
// two bedrooms across the top; the hall with its fountain; a kitchen, the
// front corridor and one back room along the bottom — and in the back room's
// far corner, the way down.
//
// Outer walls: columns 1–12, rows 1–12, the front door at column 7.
const OUTER: Seg[] = [
  [C(1), R(1), C(12), R(1)],
  [C(1), R(1), C(1), R(12)],
  [C(12), R(1), C(12), R(12)],
  [C(1), R(12), C(7), R(12)],
  [C(8), R(12), C(12), R(12)],
];
// The top row (rows 1–4): the store, then two bedrooms with one-cell doors.
const TOP_ROOMS: Seg[] = [
  [C(4), R(1), C(4), R(4)],
  [C(8), R(1), C(8), R(4)],
  [C(4), R(4), C(6), R(4)], // first bedroom: door at column 6
  [C(7), R(4), C(8), R(4)],
  [C(8), R(4), C(10), R(4)], // second bedroom: door at column 10
  [C(11), R(4), C(12), R(4)],
];
const ALCOVE: Seg[] = [];
// The bottom row (rows 9–12): the kitchen with its door at column 4, the
// open corridor mouth (columns 6–8), and the back room with its door at
// column 9.
const BOTTOM_ROOMS: Seg[] = [
  [C(1), R(9), C(4), R(9)],
  [C(5), R(9), C(6), R(9)],
  [C(10), R(9), C(12), R(9)],
  [C(6), R(9), C(6), R(12)],
  [C(8), R(9), C(8), R(12)],
];

export const RESTWATER: MapDef = {
  id: "restwater",
  name: "Restwater",
  battleMapIds: ["6284f67e-99ff-4dc2-b98e-de8898d8fb4e"],
  url: "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/2abdfdd4-43c4-4928-8d6a-fa3919a13349-xwsFJmQw0QpVkOjDRoJLzdUKyUCX40.png",
  w: 24,
  h: 16,
  walls: [...OUTER, ...TOP_ROOMS, ...ALCOVE, ...BOTTOM_ROOMS],
  // A timber cottage, not a keep: plank walls, eight feet, warm.
  wall: { material: "planks", height: 1.7, tint: "#8a6f52" },
  torches: [
    // inside the cottage
    [0.05, 0.42, true],
    [0.505, 0.45, true],
    [0.29, 0.252, false],
    [0.2, 0.6, false],
    [0.12, 0.6, false],
    [0.44, 0.6, false],
    // the front step
    [0.296, 0.785, true],
    // the lanterns the painter set beside the pools — posts, not sconces
    [0.941, 0.303, false, "post"],
    [0.941, 0.561, false, "post"],
    // candles on the pool deck and in the hall — small warm pools of light
    [0.63, 0.22, false, "candle"],
    [0.63, 0.66, false, "candle"],
    [0.945, 0.43, false, "candle"],
    [0.36, 0.35, false, "candle"],
    [0.42, 0.72, false, "candle"],
    [0.908, 0.762, false, "post"],
  ],
  props: [
    // the store room's chest, a stool in the far bedroom
    { model: "treasure_chest", u: 0.215, v: 0.098, rot: 0.1 },
    { model: "wooden_stool_01", u: 0.41, v: 0.11 },
    // the hall: the long table on the left with two stools
    { model: "wooden_table_02", u: 0.172, v: 0.425, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.15, v: 0.412, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.15, v: 0.44, rot: Math.PI / 2 },
    { model: "wooden_crate_02", u: 0.478, v: 0.44, rot: 0.3 },
    // the kitchen
    { model: "wooden_table_02", u: 0.12, v: 0.665, rot: 0 },
    { model: "wooden_stool_01", u: 0.15, v: 0.705, rot: Math.PI },
    { model: "wooden_crate_02", u: 0.075, v: 0.69, rot: 0.6 },
    { model: "wine_barrel_01", u: 0.095, v: 0.715, rot: 1.2 },
    { model: "wooden_bowl_01", u: 0.12, v: 0.665, y: 0.5 },
    // the back room: a cabinet against its left wall, a stool, and the hatch
    { model: "GothicCabinet_01", u: 0.352, v: 0.7, rot: Math.PI / 2 },
    { model: "wooden_stool_01", u: 0.41, v: 0.64, rot: Math.PI },
    // by the front step, and beside the well
    { model: "wine_barrel_01", u: 0.25, v: 0.8, rot: 0.5 },
    { model: "wooden_crate_02", u: 0.335, v: 0.8, rot: 2.0 },
    { model: "wine_barrel_01", u: 0.655, v: 0.9, rot: 2.6 },
    // the pool deck: buckets and baskets left where bathers dropped them, a bench, a vase
    { model: "wooden_bucket_01", u: 0.60, v: 0.31, rot: 0.4 },
    { model: "wooden_bucket_02", u: 0.615, v: 0.53, rot: 2.1 },
    { model: "wicker_basket_01", u: 0.625, v: 0.62, rot: 0.8 },
    { model: "wicker_basket_02", u: 0.90, v: 0.70, rot: 1.9 },
    { model: "painted_wooden_bench", u: 0.885, v: 0.63, rot: Math.PI / 2 },
    { model: "ceramic_vase_02", u: 0.585, v: 0.10 },
    { model: "wooden_bucket_01", u: 0.96, v: 0.10, rot: 1.3 },
    // candlesticks under the candle lights (a small table under the ones on the floor)
    { model: "wooden_candlestick", u: 0.63, v: 0.22 },
    { model: "wooden_candlestick", u: 0.63, v: 0.66 },
    { model: "brass_candleholders", u: 0.86, v: 0.44 },
    { model: "small_wooden_table_01", u: 0.36, v: 0.35 },
    { model: "wooden_candlestick", u: 0.36, v: 0.35, y: 0.5 },
    { model: "side_table_01", u: 0.42, v: 0.72 },
    { model: "brass_candleholders", u: 0.42, v: 0.72, y: 0.5 },
    // the hall table: a jug and a bowl
    { model: "jug_01", u: 0.16, v: 0.415, y: 0.5 },
    { model: "wooden_bowl_02", u: 0.185, v: 0.44, y: 0.5 },
    // the kitchen: a pot on the table, barrels, a broom in the corner
    { model: "brass_pot_01", u: 0.105, v: 0.66, y: 0.5 },
    { model: "wooden_barrels_01", u: 0.055, v: 0.62, rot: 0.3 },
    { model: "wooden_broom", u: 0.2, v: 0.62, rot: 1.1 },
    // the bedroom and the back room
    { model: "old_bed_frame", u: 0.45, v: 0.075, rot: Math.PI / 2 },
    { model: "wooden_bookshelf_worn", u: 0.395, v: 0.77, rot: Math.PI },
  ],
  planks: [[0.036, 0.039, 0.518, 0.762]],
  pools: [
    { u: 0.736, v: 0.186, rx: 0.163, ry: 0.146 },
    { u: 0.749, v: 0.479, rx: 0.15, ry: 0.107 },
    { u: 0.736, v: 0.684, rx: 0.124, ry: 0.088 },
  ],
  // The way down to Sorrel's abode: the back room's far corner.
  // The pool deck is wet: it reflects the lanterns and the steam.
  wet: true,
  // Hidden under abjuration until found (S7 notes); the HUD reveals it.
  exits: [{ u: C(10.5), v: R(10.5), label: "Down the ladder — Sorrel's abode", to: "abode", kind: "down", hidden: true }],
  // the hall's fountain, and the well out by the pools
  basins: [
    { u: 0.293, v: 0.381, r: 0.55 },
    { u: 0.736, v: 0.905, r: 0.5 },
  ],
  look: [0.46, 0.42],
  eye: [1.4, 8.4, 6.4],
  looks: {
    hall: { at: [0.29, 0.4], eye: [0.9, 2.8, 5.4] },
    pools: { at: [0.74, 0.45], eye: [0.4, 3.6, 6.4] },
    hatch: { at: [C(10.5), R(10.6)], eye: [-1.8, 2.4, -2.6] },
  },
  start: [0.29, 0.46],
};
