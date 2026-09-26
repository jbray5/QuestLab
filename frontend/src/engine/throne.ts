import { COURT } from "./courtiers";
import type { MapDef, Piece } from "./maps";

/**
 * The Royal Throne Room (Session 8, Plan 113): a long hall, 17 by 48 cells,
 * from the doors at the bottom of the picture up the red carpet, past the
 * great mosaic between four mounted knights, to the dais and the throne under
 * its skylight. Czepeku's painting is the floor — the carpet, the mosaic and
 * the statues are its own — and everything that stands is built: the walls,
 * the colonnades, banners, braziers at the side doors, candles on the dais,
 * and the throne itself.
 */
const PURPLE = "#4a2a6a";

/** A colonnade down one side of the hall. */
const colonnade = (u: number): Piece[] => Array.from({ length: 13 }, (_, i) => ({ model: "built:column", u, v: 0.26 + i * 0.056, h: 3.2 }));
/** Banners hung on the outer wall between the columns. */
const banners = (u: number, rot: number): Piece[] => Array.from({ length: 6 }, (_, i) => ({ model: "built:banner", u, v: 0.31 + i * 0.112, rot, tint: PURPLE, h: 2.6 }));

/**
 * The feast (section 9f): a long table down the mosaic level with benches,
 * bowls and bottles, the queen's end nearest the dais. Scenery only, built
 * from the tables the CDN actually has so it reads as trestles end to end.
 */
const feastTable = (): Piece[] => {
  const out: Piece[] = [];
  // Trestles end to end down the carpet, benches tucked in close so the run
  // reads as one long table rather than a row of chairs. The great mosaic is
  // the best thing on this floor, so the feast keeps to the middle of it.
  for (let i = 0; i < 6; i++) {
    const v = 0.3 + i * 0.026;
    out.push({ model: "wooden_table_02", u: 0.5, v, rot: Math.PI / 2, scale: 1.25 });
    out.push({ model: "painted_wooden_bench", u: 0.435, v, rot: Math.PI / 2 });
    out.push({ model: "painted_wooden_bench", u: 0.565, v, rot: -Math.PI / 2 });
    if (i % 2 === 0) out.push({ model: "wooden_bowl_01", u: 0.487, v, y: 0.42 });
    if (i % 2 === 1) out.push({ model: "wine_bottles_01", u: 0.513, v, y: 0.42 });
  }
  return out;
};

export const THRONE: MapDef = {
  id: "throne",
  name: "Royal Throne Room",
  battleMapIds: ["fea0a818-7284-4ca4-8fa0-86aa7010cd5e"],
  url: "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/edc750d8-be55-4bb7-bd05-ef8471e64c65-qfajcNMsjxbpHlh5H9gXHwi2ARxGtK.jpg",
  painted: true,
  light: "day",
  sky: "#efe4cf",
  moon: "#ffe6bf",
  fog: 0.004,
  w: 17,
  h: 48,
  wall: { material: "marble", height: 3.6, tint: "#cfc4b2" },
  // Three floors. The painting's own flights are at v 0.52-0.58 and
  // v 0.17-0.20; each is built as shallow steps so a figure on them reads
  // right, and the flats between are platforms carrying the same painting.
  platforms: [
    { u0: 0.02, v0: 0.2, u1: 0.98, v1: 0.525, h: 0.55 },
    { u0: 0.33, v0: 0.5625, u1: 0.67, v1: 0.58, h: 0.14 },
    { u0: 0.33, v0: 0.5475, u1: 0.67, v1: 0.5625, h: 0.28 },
    { u0: 0.33, v0: 0.5325, u1: 0.67, v1: 0.5475, h: 0.41 },
    { u0: 0.33, v0: 0.525, u1: 0.67, v1: 0.5325, h: 0.55 },
    { u0: 0.37, v0: 0.19, u1: 0.63, v1: 0.2, h: 0.7 },
    { u0: 0.37, v0: 0.18, u1: 0.63, v1: 0.19, h: 0.85 },
    { u0: 0.37, v0: 0.17, u1: 0.63, v1: 0.18, h: 1.0 },
    { u0: 0.22, v0: 0.03, u1: 0.78, v1: 0.17, h: 1.15 },
  ],
  walls: [
    // the long walls, the top wall behind the dais, the doors at the bottom
    [0.015, 0.01, 0.985, 0.01],
    [0.015, 0.01, 0.015, 0.995],
    [0.985, 0.01, 0.985, 0.995],
    [0.015, 0.995, 0.36, 0.995],
    [0.64, 0.995, 0.985, 0.995],
    // the apse: the dais sits in a bay, its walls meeting the top wall
    [0.2, 0.01, 0.2, 0.2],
    [0.8, 0.01, 0.8, 0.2],
  ],
  // braziers at the side doors
  fires: [
    [0.09, 0.345],
    [0.09, 0.395],
    [0.91, 0.345],
    [0.91, 0.395],
  ],
  torches: [
    // the throne's light, and candles down the dais
    [0.5, 0.1, false, "candle", "#ffe2a8"],
    [0.44, 0.165, false, "candle", "#ffd48a"],
    [0.56, 0.165, false, "candle", "#ffd48a"],
    // sconces on the long walls
    [0.03, 0.25, false, "sconce"],
    [0.97, 0.25, false, "sconce"],
    [0.03, 0.55, false, "sconce"],
    [0.97, 0.55, false, "sconce"],
    [0.03, 0.8, false, "sconce"],
    [0.97, 0.8, false, "sconce"],
    // candelabra at the foot of the lower steps
    [0.38, 0.545, false, "candle", "#ffd48a"],
    [0.62, 0.545, false, "candle", "#ffd48a"],
  ],
  props: [
    // a seat on the dais, in the painted throne's colours, so the queen has something to sit on
    { model: "built:throne", u: 0.5, v: 0.104, rot: 0, scale: 0.95, tint: "#3f6a4a" },
    ...colonnade(0.13),
    ...colonnade(0.87),
    ...banners(0.035, Math.PI / 2),
    ...banners(0.965, -Math.PI / 2),
    // the candelabra
    { model: "brass_candleholders", u: 0.38, v: 0.545 },
    { model: "brass_candleholders", u: 0.62, v: 0.545 },
    { model: "brass_candleholders", u: 0.44, v: 0.165 },
    { model: "brass_candleholders", u: 0.56, v: 0.165 },
    // urns on the dais, beside the throne
    { model: "brass_vase_02", u: 0.26, v: 0.06 },
    { model: "brass_vase_02", u: 0.74, v: 0.06 },
    { model: "antique_ceramic_vase_01", u: 0.31, v: 0.05 },
    { model: "antique_ceramic_vase_01", u: 0.69, v: 0.05 },
    // The tapestry behind the dais: two panels, woods and sea, green and gold.
    // Scenery only — no text, no label, nothing to click.
    { model: "built:banner", u: 0.42, v: 0.032, rot: 0, tint: "#2f5a3a", h: 3.4, scale: 2.4 },
    { model: "built:banner", u: 0.58, v: 0.032, rot: 0, tint: "#7a6320", h: 3.4, scale: 2.4 },
    // The feast, down the middle of the mosaic level.
    ...feastTable(),
    // Dressing along the colonnades. Nothing in this room has to be walked
    // through, so it can afford to be furnished.
    { model: "potted_plant_01", u: 0.1, v: 0.24 },
    { model: "potted_plant_04", u: 0.9, v: 0.24 },
    { model: "potted_plant_04", u: 0.1, v: 0.49 },
    { model: "potted_plant_01", u: 0.9, v: 0.49 },
    { model: "wooden_bookshelf_worn", u: 0.07, v: 0.35, rot: Math.PI / 2 },
    { model: "treasure_chest", u: 0.93, v: 0.35, rot: -Math.PI / 2 },
    { model: "painted_wooden_bench", u: 0.11, v: 0.64, rot: Math.PI / 2 },
    { model: "painted_wooden_bench", u: 0.89, v: 0.64, rot: -Math.PI / 2 },
    { model: "painted_wooden_bench", u: 0.11, v: 0.79, rot: Math.PI / 2 },
    { model: "painted_wooden_bench", u: 0.89, v: 0.79, rot: -Math.PI / 2 },
    { model: "ceramic_vase_02", u: 0.08, v: 0.72 },
    { model: "ceramic_vase_03", u: 0.92, v: 0.72 },
    { model: "brass_vase_03", u: 0.08, v: 0.89 },
    { model: "brass_vase_03", u: 0.92, v: 0.89 },
    { model: "brass_candleholders", u: 0.31, v: 0.215 },
    { model: "brass_candleholders", u: 0.69, v: 0.215 },
  ],
  // The court, at home: the queen seated, her knights at the dais and the mosaic, her liaison at her hand.
  // Residents are scenery — they never fight. For a fight, put their stat blocks in the encounter instead.
  people: [
    // On the throne, not in it: forward on the seat, lifted onto the cushion.
    { model: COURT.titania, u: 0.5, v: 0.121, rot: 0, heightFt: 5.9, pose: "sit", phase: 0.3, name: "Titania", y: 0.4 },
    { model: COURT.goldenrod, u: 0.585, v: 0.135, rot: 0.35, heightFt: 6.1, phase: 1.2, name: "Dame Goldenrod" },
    { model: COURT.knight, u: 0.4, v: 0.15, rot: 0, heightFt: 6.0, phase: 0.6 },
    { model: COURT.knight, u: 0.6, v: 0.15, rot: 0, heightFt: 6.0, phase: 2.1 },
    { model: COURT.knight, u: 0.3, v: 0.31, rot: 1.2, heightFt: 6.0, phase: 1.7 },
    { model: COURT.knight, u: 0.7, v: 0.31, rot: -1.2, heightFt: 6.0, phase: 0.9 },
    { model: COURT.knight, u: 0.16, v: 0.62, rot: 1.4, heightFt: 6.0, phase: 2.6 },
    { model: COURT.knight, u: 0.84, v: 0.62, rot: -1.4, heightFt: 6.0, phase: 0.1 },
  ],
  look: [0.5, 0.45],
  eye: [0.6, 9.5, 9],
  looks: {
    throne: { at: [0.5, 0.13], eye: [0.3, 3.2, 4.6] },
    mosaic: { at: [0.5, 0.38], eye: [0.5, 7, 6.5] },
    doors: { at: [0.5, 0.85], eye: [0, 6, 7] },
    // The length of the hall in profile, so the two flights read as stairs.
    hall: { at: [0.5, 0.42], eye: [0, 5.5, 20] },
    top: { at: [0.5, 0.5], eye: [0, 34, 0.01] },
  },
  start: [0.5, 0.88],
};
