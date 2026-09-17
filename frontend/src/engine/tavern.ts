/**
 * The Haunted Dockside Tavern (Margarita-shire), traced for the spike (Plan 108).
 *
 * Coordinates are normalized to the map (u across, v down), so they hold at
 * any resolution. Walls are segments; a gap between two segments is a doorway.
 * One unit of world space is one grid cell — five feet.
 */

/** A 2K derivative of the 4620×6440 Czepeku map — the full one is 30 MP. */
export const TAVERN_MAP_URL =
  "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/14fad705-0fd7-43b6-876b-31783625163e-QDH6Xt3CJQti4xWEMUfjffNbdKAeLE.jpg";

/** Map size in grid cells: 4620/140 by 6440/140. */
export const TAVERN_W = 33;
export const TAVERN_H = 46;

/** [u0, v0, u1, v1] */
export type Seg = [number, number, number, number];

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

export const TAVERN_WALLS: Seg[] = [...TAPROOM, ...WING, ...LOWER];

/** Where the torches hang: [u, v, castsShadow]. Three shadow casters is the budget. */
export const TAVERN_TORCHES: [number, number, boolean][] = [
  [0.125, 0.33, true],
  [0.4, 0.258, true],
  [0.665, 0.395, false],
  [0.86, 0.15, false],
  [0.86, 0.35, false],
  [0.13, 0.6, false],
  [0.375, 0.6, true],
  [0.565, 0.6, false],
  [0.86, 0.6, false],
];

/** Normalized map coords → world (x, z). Map centre is the origin; +z is down the map. */
export function toWorld(u: number, v: number): [number, number] {
  return [(u - 0.5) * TAVERN_W, (v - 0.5) * TAVERN_H];
}

/** Where the character starts and where the camera looks: the taproom floor. */
export const TAPROOM_CENTRE = toWorld(0.4, 0.33);
