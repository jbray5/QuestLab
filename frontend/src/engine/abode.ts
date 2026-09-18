import type { MapDef, Seg } from "./maps";

/**
 * Auntie Sorrel's abode, under the bathhouse (Plan 108, third pass).
 *
 * From the Session 7 notes, and only from them: a hidden door in the
 * floorboards under abjuration, a descending ladder into her chambers, a
 * cache the party can roll on, and letters to and from Tavish the Revelmaster.
 * The notes say nothing about the shape of the place, so — Justin: "more cave
 * like, full of green hag trinkets and decor, more menacing" — it is a cavern:
 * rock at odd angles, roots through the roof, a fire in a stone pit, her pots
 * and jars and baskets, the letters on a table with a knife on them, the cache
 * in a nook at the back, the ladder up where the party comes down. Nothing
 * here names what any of it is for; that is Justin's to tell.
 *
 * No picture — this place exists only built. 16 by 12 cells.
 */
const C = (n: number) => n / 16;
const R = (n: number) => n / 12;

// The cavern outline, as a ring of rock at odd angles, with a nook at the
// east end for the cache.
const RING: [number, number][] = [
  [2, 3.2],
  [3.4, 1.6],
  [6.5, 2.2],
  [8.8, 1.2],
  [11.6, 2.0],
  [13.8, 3.6],
  [14.6, 6.2],
  [13.6, 8.0],
  [14.2, 9.8],
  [11.2, 10.6],
  [8.4, 9.6],
  [5.6, 10.6],
  [2.6, 8.6],
  [1.4, 5.6],
];
const WALLS: Seg[] = RING.map((p, i) => {
  const q = RING[(i + 1) % RING.length];
  return [C(p[0]), R(p[1]), C(q[0]), R(q[1])];
});
// A spur of rock that half-closes the nook.
WALLS.push([C(11.8), R(4.6), C(12.6), R(6.4)]);

export const ABODE: MapDef = {
  id: "abode",
  name: "Sorrel's abode",
  // The HUD's "Sorrel's abode" battle map (a plan drawn for the DM; the players see this room).
  battleMapIds: ["67c3e633-9cd2-463e-91d7-b3388df6e6b5"],
  w: 16,
  h: 12,
  walls: WALLS,
  solid: true,
  wall: { material: "rock", height: 2.3, tint: "#7a7c72" },
  ground: "dirt",
  fog: 0.075,
  // Her lamps burn green; the fire burns red. Nothing here is torchlight.
  torches: [
    [C(2.2), R(5.6), false, "post", "#7dff9c"],
    [C(13.2), R(3.9), false, "post", "#7dff9c"],
    [C(6.2), R(9.6), false, "post", "#7dff9c"],
  ],
  fires: [[C(8.6), R(6.2)]],
  props: [
    { model: "stone_fire_pit", u: C(8.6), v: R(6.2), rot: 0.4 },
    { model: "brass_pot_02", u: C(8.6), v: R(6.2), y: 0.25, scale: 1.3 },
    // the letters to and from Tavish, on a table, a knife left on them
    { model: "wooden_table_02", u: C(5.2), v: R(6.6), rot: 0.35 },
    { model: "papers", u: C(5.05), v: R(6.7), y: 0.535, rot: 0.6 },
    { model: "ornate_medieval_dagger", u: C(5.4), v: R(6.5), y: 0.5, rot: 1.9 },
    { model: "wooden_lantern_01", u: C(5.7), v: R(6.95), y: 0.49, scale: 0.8 },
    { model: "wooden_stool_01", u: C(5.0), v: R(7.6), rot: 2.9 },
    // her things, along the rock
    { model: "wicker_basket_01", u: C(3.2), v: R(3.4), rot: 0.3 },
    { model: "wicker_basket_02", u: C(3.9), v: R(3.1), rot: 1.4 },
    { model: "ceramic_vase_01", u: C(2.4), v: R(4.4), rot: 0.2 },
    { model: "antique_ceramic_vase_01", u: C(2.7), v: R(4.9), rot: 1.1 },
    { model: "brass_pan_01", u: C(7.4), v: R(2.6), rot: 0.9 },
    { model: "wooden_bucket_01", u: C(10.2), v: R(2.4), rot: 0.5 },
    { model: "wicker_basket_01", u: C(11.0), v: R(9.6), rot: 2.2 },
    { model: "ceramic_vase_01", u: C(12.9), v: R(9.2), rot: 2.6 },
    // rock, moss, roots and dead wood
    { model: "boulder_01", u: C(4.2), v: R(9.4), rot: 0.7, scale: 0.7 },
    { model: "rock_moss_set_01", u: C(12.6), v: R(2.6), rot: 1.2, scale: 0.8 },
    { model: "rock_moss_set_02", u: C(2.6), v: R(7.6), rot: 2.4, scale: 0.8 },
    { model: "tree_stump_01", u: C(10.4), v: R(8.2), rot: 0.4, scale: 0.9 },
    { model: "dry_branches_medium_01", u: C(6.8), v: R(3.0), rot: 1.7 },
    { model: "dry_branches_medium_01", u: C(12.0), v: R(7.4), rot: 0.2 },
    { model: "root_cluster_01", u: C(7.2), v: R(4.4), y: 2.3, flip: true, rot: 0.8 },
    { model: "root_cluster_01", u: C(10.6), v: R(6.6), y: 2.3, flip: true, rot: 2.7 },
    { model: "root_cluster_01", u: C(4.4), v: R(4.8), y: 2.3, flip: true, rot: 1.3, scale: 0.8 },
    // the cache, in the nook at the back
    { model: "treasure_chest", u: C(13.3), v: R(5.6), rot: -1.1 },
    { model: "wine_barrel_01", u: C(13.0), v: R(7.2), rot: 0.8 },
  ],
  exits: [{ u: C(3.5), v: R(3.8), label: "Up the ladder — the bathhouse", to: "restwater", kind: "up" }],
  look: [C(8), R(6)],
  eye: [1.1, 5.6, 4.2],
  looks: {
    letters: { at: [C(5.2), R(6.6)], eye: [0.9, 1.8, 2.6] },
    fire: { at: [C(8.6), R(6.2)], eye: [-1.2, 2.0, 3.4] },
    cache: { at: [C(13.2), R(5.8)], eye: [-2.2, 1.9, 2.2] },
  },
  start: [C(4.5), R(5.0)],
};
