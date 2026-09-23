import type { MapDef, Piece } from "./maps";

/**
 * Candlestair Shrine (Session 8, Plan 113): the approach to Titania's court.
 * A mountain terrace, 33 by 50 cells: a hall between two towers at the top,
 * a colonnaded stair falling to two fountains, the shrine platform with its
 * domed rotunda, a further stair to a lower terrace with a long pool, and
 * forest closing in on every side. Czepeku's painting is the ground — the
 * stairs, the mosaics and the lions are its own — and what stands is built:
 * the towers and the hall, the balustrades, the fountains and the pool with
 * water in them, the rotunda, the trees, and candles up every stair.
 */
const stairCandles = (): [number, number, boolean, "candle", string][] => {
  const out: [number, number, boolean, "candle", string][] = [];
  for (let i = 0; i < 6; i++) {
    const v = 0.21 + i * 0.046;
    out.push([0.435, v, false, "candle", "#ffd48a"], [0.565, v, false, "candle", "#ffd48a"]);
  }
  return out;
};
const stairSticks = (): Piece[] => {
  const out: Piece[] = [];
  for (let i = 0; i < 6; i++) {
    const v = 0.21 + i * 0.046;
    out.push({ model: "wooden_candlestick", u: 0.435, v }, { model: "wooden_candlestick", u: 0.565, v });
  }
  return out;
};

export const CANDLESTAIR: MapDef = {
  id: "candlestair",
  name: "Candlestair Shrine",
  battleMapIds: ["1542ff3d-e13b-49cb-9907-658946249da1"],
  url: "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/034f7158-c6a0-4035-b048-5cda8e6f1fb0-0q3uIR5e5gSz2cGSIjFygYkLLfRVo3.jpg",
  painted: true,
  light: "day",
  sky: "#ffd9a8",
  moon: "#ffe9c4",
  fog: 0.006,
  weather: "dust",
  w: 33,
  h: 50,
  wall: { material: "sandstone", height: 1.0, tint: "#f2eadb" },
  walls: [
    // the towers and the hall front at the top (low walls stand in for the towers' feet)
    [0.02, 0.02, 0.186, 0.02],
    [0.186, 0.02, 0.186, 0.195],
    [0.02, 0.195, 0.186, 0.195],
    [0.02, 0.02, 0.02, 0.195],
    [0.814, 0.02, 0.98, 0.02],
    [0.814, 0.02, 0.814, 0.195],
    [0.814, 0.195, 0.98, 0.195],
    [0.98, 0.02, 0.98, 0.195],
    [0.186, 0.03, 0.814, 0.03],
    // the shrine platform's balustrade, with the stairs through it top and bottom
    [0.08, 0.44, 0.42, 0.44],
    [0.58, 0.44, 0.92, 0.44],
    [0.08, 0.44, 0.08, 0.625],
    [0.92, 0.44, 0.92, 0.625],
    [0.08, 0.625, 0.42, 0.625],
    [0.58, 0.625, 0.92, 0.625],
    // the lower terrace's balustrade
    [0.163, 0.71, 0.42, 0.71],
    [0.58, 0.71, 0.837, 0.71],
    [0.163, 0.71, 0.163, 0.87],
    [0.837, 0.71, 0.837, 0.87],
    [0.163, 0.87, 0.44, 0.87],
    [0.56, 0.87, 0.837, 0.87],
  ],
  // the long pool on the lower terrace is Czepeku's own painted water — the fountain at its middle is the only thing built
  basins: [
    { u: 0.277, v: 0.365, r: 1.7 },
    { u: 0.72, v: 0.365, r: 1.7 },
    { u: 0.5, v: 0.795, r: 0.9 },
  ],
  torches: [
    ...stairCandles(),
    // the towers' doors, and the rotunda
    [0.19, 0.11, false, "sconce"],
    [0.81, 0.11, false, "sconce"],
    [0.5, 0.51, false, "candle", "#ffe2a8"],
    // lanterns on the lower stair and the path down
    [0.42, 0.68, false, "post"],
    [0.58, 0.68, false, "post"],
    [0.5, 0.93, false, "post"],
  ],
  props: [
    ...stairSticks(),
    // the rotunda on the platform, and planters at its corners
    { model: "built:dome", u: 0.5, v: 0.51, h: 2.4, scale: 0.78 },
    { model: "planter_pot_clay", u: 0.1, v: 0.455 },
    { model: "planter_pot_clay", u: 0.9, v: 0.455 },
    { model: "planter_pot_clay", u: 0.1, v: 0.61 },
    { model: "planter_pot_clay", u: 0.9, v: 0.61 },
    { model: "wild_rooibos_bush", u: 0.27, v: 0.53, rot: 0.4 },
    { model: "wild_rooibos_bush", u: 0.73, v: 0.53, rot: 2.0 },
    { model: "flower_gazania", u: 0.3, v: 0.5 },
    { model: "flower_heliophila", u: 0.7, v: 0.56 },
    // columns along the top hall
    { model: "built:column", u: 0.28, v: 0.05, h: 2.6 },
    { model: "built:column", u: 0.39, v: 0.05, h: 2.6 },
    { model: "built:column", u: 0.61, v: 0.05, h: 2.6 },
    { model: "built:column", u: 0.72, v: 0.05, h: 2.6 },
    // the lower terrace: urns at the pool's ends
    { model: "brass_vase_03", u: 0.31, v: 0.79 },
    { model: "brass_vase_03", u: 0.69, v: 0.79 },
    // the forest, closing in
    { model: "island_tree_01", u: 0.1, v: 0.27, rot: 0.3, scale: 1.7 },
    { model: "island_tree_02", u: 0.9, v: 0.27, rot: 1.4, scale: 1.7 },
    { model: "island_tree_03", u: 0.04, v: 0.5, rot: 2.2, scale: 1.8 },
    { model: "island_tree_01", u: 0.96, v: 0.5, rot: 0.8, scale: 1.8 },
    { model: "island_tree_02", u: 0.06, v: 0.7, rot: 2.6, scale: 1.7 },
    { model: "island_tree_03", u: 0.94, v: 0.7, rot: 0.5, scale: 1.7 },
    { model: "island_tree_01", u: 0.12, v: 0.93, rot: 1.1, scale: 1.7 },
    { model: "island_tree_02", u: 0.88, v: 0.93, rot: 2.9, scale: 1.7 },
    { model: "jacaranda_tree", u: 0.72, v: 0.22, rot: 0.6, scale: 0.34 },
    { model: "jacaranda_tree", u: 0.3, v: 0.66, rot: 1.9, scale: 0.34 },
    { model: "jacaranda_tree", u: 0.74, v: 0.95, rot: 2.4, scale: 0.34 },
    { model: "tree_small_02", u: 0.34, v: 0.24, rot: 0.4 },
    { model: "tree_small_02", u: 0.66, v: 0.665, rot: 1.6 },
    { model: "tree_small_02", u: 0.22, v: 0.9, rot: 2.8 },
    { model: "fern_02", u: 0.2, v: 0.4, rot: 0.9 },
    { model: "fern_02", u: 0.8, v: 0.42, rot: 2.1 },
    { model: "fern_02", u: 0.4, v: 0.97, rot: 1.3 },
    { model: "grass_medium_01", u: 0.25, v: 0.6, rot: 0.2 },
    { model: "grass_medium_01", u: 0.75, v: 0.6, rot: 1.9 },
  ],
  look: [0.5, 0.5],
  eye: [1.2, 12, 9],
  looks: {
    shrine: { at: [0.5, 0.51], eye: [0.6, 5.2, 6] },
    fountains: { at: [0.5, 0.36], eye: [0, 6.5, 6.5] },
    hall: { at: [0.5, 0.12], eye: [0.5, 5, 6.5] },
    pool: { at: [0.5, 0.79], eye: [0, 4.8, 5.5] },
    top: { at: [0.5, 0.5], eye: [0, 34, 0.01] },
  },
  start: [0.5, 0.95],
};
