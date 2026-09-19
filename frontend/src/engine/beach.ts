import type { MapDef, Piece } from "./maps";
import { PATRONS } from "./patrons";

/**
 * Margarita-shire — the beach bar (Plan 113). A tiki bar on a Feywild coast:
 * bamboo counter on a plank deck, four lantern posts in fey colours, a cove
 * of glowing water along the top of the map, island trees and a jacaranda,
 * iceplant that glows pink, a fire pit, driftwood and shells on the strand.
 * Built, no picture. 24 by 16 cells; +v runs down the picture, the sea is up.
 */
const T = "#3ff2d0"; // teal fey lantern
const V = "#a06cff"; // violet fey lantern
const P = "#ff6ad5"; // pink glow in the iceplant

/** Three round-back bar chairs at a table. */
const chairs = (u: number, v: number): Piece[] => [
  { model: "bar_chair_round_01", u: u - 0.032, v, rot: Math.PI / 2 },
  { model: "bar_chair_round_01", u: u + 0.032, v, rot: -Math.PI / 2 },
  { model: "bar_chair_round_01", u, v: v + 0.048, rot: Math.PI },
];

export const BEACH: MapDef = {
  id: "beach",
  name: "Margarita-shire — the beach bar",
  // Its own battle map in the catalog (the picture is the top-down look below), not the tavern's.
  battleMapIds: ["75926bea-743f-4b70-a6e1-740fa5f48293"],
  w: 24,
  h: 16,
  ground: "sand",
  wall: { material: "bamboo", height: 0.72, tint: "#c9a86a" },
  sky: "#0d0818",
  moon: "#6a4fa8",
  fog: 0.014,
  weather: "fireflies",
  // the bar counter: a U open to the back, bar height
  walls: [
    [0.40, 0.50, 0.60, 0.50],
    [0.40, 0.50, 0.40, 0.59],
    [0.60, 0.50, 0.60, 0.59],
  ],
  planks: [[0.36, 0.46, 0.64, 0.64]],
  pools: [
    // the cove: the sea comes in along the top of the map, no rim, no steam, lit from within
    { u: 0.5, v: -0.06, rx: 0.78, ry: 0.28, rim: false, steam: false, color: "#1aa9a4", glow: "#4ff0d8" },
  ],
  fires: [[0.66, 0.79]],
  torches: [
    // the four posts of the bar, fey-lit
    [0.375, 0.475, false, "post", T],
    [0.625, 0.475, false, "post", V],
    [0.375, 0.615, false, "post", V],
    [0.625, 0.615, false, "post", T],
    // lanterns on the tables
    [0.20, 0.56, false, "candle", "#ffb66a"],
    [0.80, 0.53, false, "candle", "#ffb66a"],
    [0.74, 0.82, false, "candle", "#ffb66a"],
    // the iceplant glows pink, the tide glows teal
    [0.10, 0.72, false, "candle", P],
    [0.90, 0.68, false, "candle", P],
    [0.32, 0.86, false, "candle", P],
    [0.25, 0.27, false, "candle", T],
    [0.72, 0.25, false, "candle", T],
    // a lamp on the path in
    [0.5, 0.93, false, "post", "#ffb66a"],
  ],
  props: [
    // behind the bar
    { model: "wooden_barrels_01", u: 0.50, v: 0.615, rot: 0.2 },
    { model: "wooden_crate_01", u: 0.43, v: 0.61, rot: 0.6 },
    { model: "wooden_bucket_01", u: 0.575, v: 0.60, rot: 1.1 },
    // on the counter
    { model: "wine_bottles_01", u: 0.46, v: 0.50, y: 0.72 },
    { model: "jug_01", u: 0.53, v: 0.50, y: 0.72 },
    { model: "wooden_bowl_02", u: 0.57, v: 0.50, y: 0.72 },
    { model: "wooden_cutting_board", u: 0.415, v: 0.55, y: 0.72 },
    { model: "brass_pot_02", u: 0.60, v: 0.555, y: 0.72 },
    // tables and chairs
    { model: "round_wooden_table_01", u: 0.20, v: 0.56 },
    ...chairs(0.20, 0.56),
    { model: "wooden_lantern_01", u: 0.20, v: 0.56, y: 0.48 },
    { model: "round_wooden_table_02", u: 0.80, v: 0.53 },
    ...chairs(0.80, 0.53),
    { model: "wooden_lantern_01", u: 0.80, v: 0.53, y: 0.48 },
    { model: "wooden_picnic_table", u: 0.74, v: 0.82, rot: 0.35 },
    { model: "Lantern_01", u: 0.74, v: 0.82, y: 0.5 },
    { model: "sungka_board", u: 0.77, v: 0.83, y: 0.5 },
    { model: "painted_wooden_bench", u: 0.30, v: 0.30, rot: 0.15 },
    { model: "painted_wooden_bench", u: 0.55, v: 0.86, rot: -0.4 },
    // the fire pit
    { model: "stone_fire_pit", u: 0.66, v: 0.79 },
    { model: "tree_stump_01", u: 0.62, v: 0.74, rot: 0.8 },
    { model: "tree_stump_01", u: 0.70, v: 0.74, rot: 2.1 },
    // trees
    { model: "island_tree_01", u: 0.06, v: 0.50, scale: 1.8 },
    { model: "island_tree_02", u: 0.94, v: 0.40, rot: 1.2, scale: 1.7 },
    { model: "island_tree_03", u: 0.12, v: 0.92, rot: 2.4, scale: 1.8 },
    { model: "island_tree_01", u: 0.90, v: 0.94, rot: 0.6, scale: 1.6 },
    // the jacaranda is a 17-unit giant at full size: a third of it is a fine fey tree
    { model: "jacaranda_tree", u: 0.30, v: 0.96, rot: 1.9, scale: 0.34 },
    { model: "quiver_tree_01", u: 0.96, v: 0.72, rot: 0.3 },
    { model: "tree_small_02", u: 0.03, v: 0.30, rot: 1.0 },
    // plants, some of them glowing
    { model: "crystalline_iceplant", u: 0.10, v: 0.72 },
    { model: "crystalline_iceplant", u: 0.12, v: 0.75, rot: 1.3 },
    { model: "crystalline_iceplant", u: 0.90, v: 0.68 },
    { model: "crystalline_iceplant", u: 0.32, v: 0.86, rot: 2.2 },
    { model: "fern_02", u: 0.09, v: 0.60, rot: 0.4 },
    { model: "fern_02", u: 0.92, v: 0.47, rot: 1.6 },
    { model: "fern_02", u: 0.85, v: 0.88, rot: 0.9 },
    { model: "wild_rooibos_bush", u: 0.15, v: 0.66, rot: 0.2 },
    { model: "periwinkle_plant", u: 0.28, v: 0.80, rot: 0.5 },
    { model: "flower_gazania", u: 0.24, v: 0.66 },
    { model: "flower_heliophila", u: 0.78, v: 0.64 },
    { model: "grass_medium_01", u: 0.18, v: 0.42, rot: 0.7 },
    { model: "grass_medium_01", u: 0.82, v: 0.36, rot: 2.0 },
    { model: "grass_medium_01", u: 0.45, v: 0.95, rot: 1.1 },
    { model: "potted_plant_01", u: 0.37, v: 0.64 },
    { model: "potted_plant_04", u: 0.63, v: 0.64 },
    { model: "planter_pot_clay", u: 0.36, v: 0.47 },
    { model: "ceramic_vase_03", u: 0.64, v: 0.47 },
    // the strand: driftwood and shells (Poly Haven's coast rocks are 45-unit scans — bigger than the map)
    { model: "dead_tree_trunk", u: 0.55, v: 0.28, rot: 0.25 },
    { model: "lambis_shell", u: 0.40, v: 0.30, rot: 0.9 },
    { model: "lambis_shell", u: 0.62, v: 0.33, rot: 2.8 },
    { model: "lambis_shell", u: 0.17, v: 0.36, rot: 1.4 },
    { model: "wooden_bucket_01", u: 0.47, v: 0.31, rot: 0.5 },
    { model: "wicker_basket_01", u: 0.33, v: 0.60, rot: 0.7 },
  ],
  people: [
    // the bartender, behind the counter, facing the front
    { model: PATRONS.bartender, u: 0.50, v: 0.555, rot: Math.PI, heightFt: 5.9, phase: 0.4 },
    // three at the bar
    { model: PATRONS.steven, u: 0.44, v: 0.465, rot: 0, heightFt: 5.8, phase: 1.1 },
    { model: PATRONS.fey, u: 0.51, v: 0.465, rot: 0, heightFt: 5.5, phase: 2.0 },
    { model: PATRONS.seaelf, u: 0.57, v: 0.465, rot: 0.2, heightFt: 5.9, phase: 0.7 },
    // the left table
    { model: PATRONS.sarranthia, u: 0.165, v: 0.56, rot: Math.PI / 2, heightFt: 5.5, phase: 1.6 },
    { model: PATRONS.edrik, u: 0.235, v: 0.56, rot: -Math.PI / 2, heightFt: 5.9, phase: 0.2 },
    // the right table
    { model: PATRONS.dryad, u: 0.80, v: 0.585, rot: Math.PI, heightFt: 5.6, phase: 2.4 },
    { model: PATRONS.stevenTeal, u: 0.765, v: 0.53, rot: Math.PI / 2, heightFt: 5.8, phase: 1.3 },
    // by the fire, and one at the water's edge
    { model: PATRONS.sarranthia, u: 0.60, v: 0.83, rot: -0.9, heightFt: 5.5, phase: 0.9 },
    { model: PATRONS.stevenTeal, u: 0.42, v: 0.26, rot: Math.PI, heightFt: 5.8, phase: 2.8 },
  ],
  look: [0.5, 0.54],
  eye: [1.2, 8.2, 6.2],
  looks: {
    bar: { at: [0.5, 0.53], eye: [0.5, 3.4, 4.2] },
    shore: { at: [0.5, 0.22], eye: [0.4, 4.4, 6.0] },
    fire: { at: [0.66, 0.79], eye: [0.9, 3.0, 3.6] },
    // straight down, the whole map in frame at 3:2 — the catalog picture is taken from here
    top: { at: [0.5, 0.5], eye: [0, 21, 0.01] },
  },
  start: [0.5, 0.72],
};

/**
 * The same bar by day: a fey turquoise sky and haze, the sun's rig, the lanterns
 * still lit. Its own battle map, so the HUD offers day and night as two maps.
 */
export const BEACH_DAY: MapDef = {
  ...BEACH,
  id: "beach_day",
  name: "Margarita-shire — the beach bar (Day)",
  battleMapIds: ["a8195caf-54d5-4b3f-b3dc-e8d83c25f7c4"],
  light: "day",
  sky: "#9fd9ea",
  fog: 0.005,
  weather: "dust",
};
