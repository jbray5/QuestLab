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
    // the throne is Czepeku's own, winged and gilt, painted on the dais — nothing built stands on it
    ...colonnade(0.13),
    ...colonnade(0.87),
    ...banners(0.035, Math.PI / 2),
    ...banners(0.965, -Math.PI / 2),
    // the candelabra
    { model: "brass_candleholders", u: 0.38, v: 0.545 },
    { model: "brass_candleholders", u: 0.62, v: 0.545 },
    { model: "brass_candleholders", u: 0.44, v: 0.165 },
    { model: "brass_candleholders", u: 0.56, v: 0.165 },
    // urns by the apse
    { model: "brass_vase_02", u: 0.24, v: 0.06 },
    { model: "brass_vase_02", u: 0.76, v: 0.06 },
  ],
  look: [0.5, 0.45],
  eye: [0.6, 9.5, 9],
  looks: {
    throne: { at: [0.5, 0.13], eye: [0.3, 3.2, 4.6] },
    mosaic: { at: [0.5, 0.38], eye: [0.5, 7, 6.5] },
    doors: { at: [0.5, 0.85], eye: [0, 6, 7] },
    top: { at: [0.5, 0.5], eye: [0, 34, 0.01] },
  },
  start: [0.5, 0.88],
};
