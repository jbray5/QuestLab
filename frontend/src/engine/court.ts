import type { MapDef, Piece } from "./maps";

/**
 * The Palace Inner Court (Session 8, Plan 113): Titania's house. A block of
 * halls round a walled garden, 40 by 58 cells: the servants' rooms and a red
 * gallery along the top, the banquet hall and the queen's stage on the west,
 * the statue gallery and the study on the east, the entrance halls and stair
 * towers along the bottom, and the grounds, the path and the bridge below.
 * Czepeku's painting is the floor — the tables, the carpets, the garden beds
 * are its own — and what stands is built: walls, the colonnade round the
 * garden, banners in the gallery, torches, hedges, and the trees outside.
 */
const CRIMSON = "#7a1a2a";

const arcade = (): Piece[] => {
  const out: Piece[] = [];
  for (let i = 0; i < 6; i++) {
    const v = 0.26 + i * 0.068;
    out.push({ model: "built:column", u: 0.348, v, h: 2.8 }, { model: "built:column", u: 0.645, v, h: 2.8 });
  }
  for (let i = 1; i < 4; i++) {
    const u = 0.348 + i * 0.074;
    out.push({ model: "built:column", u, v: 0.26, h: 2.8 }, { model: "built:column", u, v: 0.6, h: 2.8 });
  }
  return out;
};

export const COURT: MapDef = {
  id: "court",
  name: "Palace Inner Court",
  battleMapIds: ["422f241c-b41c-4948-89f5-f6d7d41f7049"],
  url: "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/3f8280f8-d942-45e1-834c-548943e03226-wsbENpuZettHvsFEtJNE9NvEhwvWiP.jpg",
  painted: true,
  light: "day",
  sky: "#bfe0f5",
  moon: "#dcecff",
  fog: 0.004,
  w: 40,
  h: 58,
  wall: { material: "sandstone", height: 3.0, tint: "#f0e8d8" },
  walls: [
    // the outer block
    [0.072, 0.052, 0.935, 0.052],
    [0.072, 0.052, 0.072, 0.38],
    [0.072, 0.48, 0.072, 0.8],
    [0.935, 0.052, 0.935, 0.38],
    [0.935, 0.48, 0.935, 0.8],
    [0.072, 0.8, 0.435, 0.8],
    [0.565, 0.8, 0.935, 0.8],
    // the porch
    [0.435, 0.8, 0.435, 0.72],
    [0.565, 0.8, 0.565, 0.72],
    // the servants' rooms along the top, and the red gallery under them
    [0.072, 0.165, 0.14, 0.165],
    [0.2, 0.165, 0.36, 0.165],
    [0.5, 0.165, 0.75, 0.165],
    [0.81, 0.165, 0.935, 0.165],
    [0.297, 0.052, 0.297, 0.165],
    [0.44, 0.052, 0.44, 0.165],
    [0.82, 0.052, 0.82, 0.165],
    [0.072, 0.215, 0.45, 0.215],
    [0.55, 0.215, 0.935, 0.215],
    // the wings, either side of the garden court, each with a door to it
    [0.29, 0.215, 0.29, 0.4],
    [0.29, 0.46, 0.29, 0.635],
    [0.718, 0.215, 0.718, 0.4],
    [0.718, 0.46, 0.718, 0.635],
    // the queen's stage (west) and the study (east)
    [0.03, 0.33, 0.072, 0.33],
    [0.03, 0.33, 0.03, 0.53],
    [0.03, 0.53, 0.072, 0.53],
    [0.935, 0.33, 0.975, 0.33],
    [0.975, 0.33, 0.975, 0.53],
    [0.935, 0.53, 0.975, 0.53],
    // the bottom halls
    [0.072, 0.635, 0.16, 0.635],
    [0.22, 0.635, 0.45, 0.635],
    [0.55, 0.635, 0.78, 0.635],
    [0.84, 0.635, 0.935, 0.635],
    [0.297, 0.635, 0.297, 0.8],
    [0.718, 0.635, 0.718, 0.8],
    [0.297, 0.72, 0.435, 0.72],
    [0.565, 0.72, 0.718, 0.72],
  ],
  torches: [
    // the red gallery
    [0.25, 0.19, false, "sconce"],
    [0.5, 0.19, false, "sconce"],
    [0.75, 0.19, false, "sconce"],
    // the banquet hall and the stage
    [0.1, 0.3, false, "sconce"],
    [0.1, 0.55, false, "sconce"],
    [0.05, 0.43, false, "candle", "#ffd48a"],
    // the statue gallery and the study
    [0.9, 0.3, false, "sconce"],
    [0.9, 0.55, false, "sconce"],
    [0.955, 0.43, false, "candle", "#ffd48a"],
    // the entrance halls
    [0.18, 0.72, false, "sconce"],
    [0.5, 0.66, false, "sconce"],
    [0.82, 0.72, false, "sconce"],
    // lanterns on the path
    [0.42, 0.84, false, "post"],
    [0.58, 0.84, false, "post"],
  ],
  props: [
    ...arcade(),
    // the stair towers
    { model: "built:column", u: 0.355, v: 0.735, h: 3.4, scale: 3.6, tint: "#d9cdb4" },
    { model: "built:column", u: 0.645, v: 0.735, h: 3.4, scale: 3.6, tint: "#d9cdb4" },
    // banners in the red gallery
    { model: "built:banner", u: 0.3, v: 0.186, rot: 0, tint: CRIMSON, h: 2.7 },
    { model: "built:banner", u: 0.45, v: 0.186, rot: 0, tint: CRIMSON, h: 2.7 },
    { model: "built:banner", u: 0.55, v: 0.186, rot: 0, tint: CRIMSON, h: 2.7 },
    { model: "built:banner", u: 0.7, v: 0.186, rot: 0, tint: CRIMSON, h: 2.7 },
    // the queen's stage
    // at the head of the painted table on the stage, facing down it
    { model: "built:throne", u: 0.055, v: 0.352, rot: 0, scale: 0.9, tint: "#5a2a7a" },
    // hedges in the garden's four beds
    { model: "wild_rooibos_bush", u: 0.4, v: 0.31, rot: 0.3 },
    { model: "wild_rooibos_bush", u: 0.6, v: 0.31, rot: 1.9 },
    { model: "wild_rooibos_bush", u: 0.4, v: 0.55, rot: 0.9 },
    { model: "wild_rooibos_bush", u: 0.6, v: 0.55, rot: 2.6 },
    { model: "fern_02", u: 0.43, v: 0.35, rot: 0.4 },
    { model: "fern_02", u: 0.57, v: 0.5, rot: 1.6 },
    { model: "potted_plant_01", u: 0.352, v: 0.235 },
    { model: "potted_plant_01", u: 0.64, v: 0.235 },
    { model: "potted_plant_04", u: 0.352, v: 0.62 },
    { model: "potted_plant_04", u: 0.64, v: 0.62 },
    // the grounds: trees on the lawns, either side of the path and the bridge
    { model: "island_tree_02", u: 0.2, v: 0.86, rot: 0.6, scale: 1.6 },
    { model: "island_tree_01", u: 0.8, v: 0.86, rot: 1.8, scale: 1.6 },
    { model: "jacaranda_tree", u: 0.12, v: 0.93, rot: 0.2, scale: 0.34 },
    { model: "jacaranda_tree", u: 0.88, v: 0.93, rot: 2.4, scale: 0.34 },
    { model: "tree_small_02", u: 0.03, v: 0.62, rot: 1.0 },
    { model: "tree_small_02", u: 0.97, v: 0.62, rot: 0.5 },
    { model: "tree_small_02", u: 0.03, v: 0.2, rot: 2.2 },
    { model: "tree_small_02", u: 0.97, v: 0.2, rot: 1.4 },
    { model: "wild_rooibos_bush", u: 0.3, v: 0.9, rot: 0.7 },
    { model: "wild_rooibos_bush", u: 0.7, v: 0.9, rot: 2.1 },
  ],
  look: [0.5, 0.45],
  eye: [1.0, 12, 9],
  looks: {
    garden: { at: [0.5, 0.42], eye: [0.5, 6.5, 6] },
    hall: { at: [0.19, 0.43], eye: [1.2, 4.2, 4.6] },
    stage: { at: [0.055, 0.4], eye: [2.2, 3.4, 3.0] },
    gallery: { at: [0.5, 0.19], eye: [0, 3.4, 4.2] },
    gate: { at: [0.5, 0.76], eye: [0, 5.5, 5.5] },
    top: { at: [0.5, 0.5], eye: [0, 40, 0.01] },
  },
  start: [0.5, 0.86],
};
