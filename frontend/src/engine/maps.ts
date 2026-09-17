import * as THREE from "three";

/**
 * What the engine needs to know about a map (Plan 108, third pass).
 *
 * The first pass hardcoded one tavern. Justin: "Let's go this route. Let me
 * see you do this with Restwater." So the scene is data now: every map is a
 * definition — its picture, its size in cells, its walls, its lights, what
 * stands in it — and the engine renders whichever one it is handed. This is
 * the seed of Milestone 4, where the DM makes these in the map builder and
 * they live on the battle map row instead of in a file.
 *
 * Coordinates are normalized to the picture (u across, v down) so they hold
 * at any resolution. One world unit is one grid cell — five feet.
 */

/** A wall: [u0, v0, u1, v1]. A gap between two segments is a doorway. */
export type Seg = [number, number, number, number];

/** A placed model: which one, where, turned how far, lifted how high, scaled, hung upside down. */
export interface Piece {
  model: string;
  u: number;
  v: number;
  rot?: number;
  y?: number;
  scale?: number;
  /** Hung from above — roots through a cave roof. */
  flip?: boolean;
}

/** A pool of water: centre and radii, all as fractions of the picture. */
export interface Pool {
  u: number;
  v: number;
  rx: number;
  ry: number;
}

export interface MapDef {
  id: string;
  name: string;
  /** The battle maps in the catalog this definition is the scene for (Plan 109). */
  battleMapIds?: string[];
  /** The painted picture, when there is one. A place with no picture is built only. */
  url?: string;
  /** Render the picture as the floor — a map with no scene data yet (Plan 109). */
  painted?: boolean;
  /** Torches unless said otherwise; "day" is a lit outdoor rig for a painted map. */
  light?: "torches" | "day";
  /** Size in cells. */
  w: number;
  h: number;
  walls: Seg[];
  /** Underground: everything beyond the outermost walls is rock, not floor. */
  solid?: boolean;
  /** What the walls are made of, and how tall. Brick and ten feet unless said otherwise. */
  wall?: { material: "wall" | "planks" | "rock"; height: number; tint: string };
  /** What the built floor is, under any boards. Cobbles unless said otherwise. */
  ground?: "floor" | "dirt";
  /** How thick the air is. The default is a night outdoors; a cave is thicker. */
  fog?: number;
  /** Open fires: a red, flickering light with embers under it. Pair with a fire-pit model. */
  fires?: [number, number][];
  /**
   * [u, v, castsShadow, kind?, color?]. A sconce hangs on a wall (the default);
   * a post stands on its own, like a lantern beside a pool. Torchlight unless
   * a colour says otherwise. Point-light shadows cost six renders each —
   * budget three.
   */
  torches: [number, number, boolean, ("sconce" | "post")?, string?][];
  props: Piece[];
  /** Built scene: where boards lie over the cobbles, as [u0, v0, u1, v1]. */
  planks?: Seg[];
  hearth?: [number, number];
  bar?: [number, number];
  pools?: Pool[];
  /** Stone basins with water in them — a fountain, a well. Radius in cells. */
  basins?: { u: number; v: number; r: number }[];
  /** Ways off this map: a trapdoor and ladder down, a ladder up. `to` names another map, once it exists. */
  exits?: { u: number; v: number; label: string; to?: string; kind?: "down" | "up" }[];
  /** Where the camera looks first, and where it stands relative to that. */
  look: [number, number];
  eye: [number, number, number];
  /** Named camera presets: ?look=<name>. */
  looks?: Record<string, { at: [number, number]; eye: [number, number, number] }>;
  /** Where the character starts. */
  start: [number, number];
}

/** Picture coords → world (x, z). The picture is centred on the origin; +z is down it. */
export function toWorld(m: MapDef, u: number, v: number): [number, number] {
  return [(u - 0.5) * m.w, (v - 0.5) * m.h];
}

/**
 * The centre of the cell under a point. The game lives on cells — a move is a
 * cell-to-cell decision and the walk is how the engine plays it.
 */
export function snapToCell(m: MapDef, p: THREE.Vector3): THREE.Vector3 {
  const ix = clamp(Math.floor(p.x + m.w / 2), 0, m.w - 1);
  const iz = clamp(Math.floor(p.z + m.h / 2), 0, m.h - 1);
  return new THREE.Vector3(ix + 0.5 - m.w / 2, 0, iz + 0.5 - m.h / 2);
}

/** Where cell *edges* fall relative to the origin, so grid lines land on them. */
export function gridOffset(m: MapDef): [number, number] {
  return [(m.w / 2) % 1, (m.h / 2) % 1];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Make a traced map behave like a built one.
 *
 * A trace is a guess made by eye over a picture whose building was never
 * aligned to its own grid. In the built route the picture is only a
 * blueprint, so the geometry is free to be *right*: walls snap to cell edges
 * (nobody stands half inside one), a doorway narrower than a cell becomes
 * exactly one cell — five feet, a door — and a sconce hugs its wall. Diagonal
 * walls, props and pools are left as traced.
 */
export function normalizeMap(m: MapDef): MapDef {
  const ox = (m.w / 2) % 1;
  const oz = (m.h / 2) % 1;
  const snapX = (x: number) => Math.round(x - ox) + ox;
  const snapZ = (z: number) => Math.round(z - oz) + oz;
  const toUV = (x: number, z: number): [number, number] => [x / m.w + 0.5, z / m.h + 0.5];

  type W = { axis: "h" | "v" | "d"; line: number; lo: number; hi: number; raw: Seg };
  const ws: W[] = m.walls.map((seg) => {
    const [x0, z0] = toWorld(m, seg[0], seg[1]);
    const [x1, z1] = toWorld(m, seg[2], seg[3]);
    const axis: W["axis"] = Math.abs(z1 - z0) < 0.15 ? "h" : Math.abs(x1 - x0) < 0.15 ? "v" : "d";
    if (axis === "h") return { axis, line: snapZ((z0 + z1) / 2), lo: Math.min(x0, x1), hi: Math.max(x0, x1), raw: seg };
    if (axis === "v") return { axis, line: snapX((x0 + x1) / 2), lo: Math.min(z0, z1), hi: Math.max(z0, z1), raw: seg };
    return { axis, line: NaN, lo: 0, hi: 0, raw: seg };
  });

  // Doorways: on each line, a gap narrower than a cell but clearly meant as a
  // gap becomes one cell, centred where it was.
  const groups = new Map<string, W[]>();
  for (const w of ws) if (w.axis !== "d") groups.set(`${w.axis}:${w.line}`, [...(groups.get(`${w.axis}:${w.line}`) ?? []), w]);
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => a.lo - b.lo);
    for (let k = 1; k < sorted.length; k++) {
      const a = sorted[k - 1];
      const b = sorted[k];
      const gap = b.lo - a.hi;
      if (gap > 0.3 && gap < 1.0) {
        const c = (a.hi + b.lo) / 2;
        a.hi = c - 0.5;
        b.lo = c + 0.5;
      }
    }
  }
  // Ends onto cell edges; a wall that shrinks to nothing was inside a doorway.
  const walls: Seg[] = [];
  for (const w of ws) {
    if (w.axis === "d") {
      walls.push(w.raw);
      continue;
    }
    const snapEnd = w.axis === "h" ? snapX : snapZ;
    const lo = snapEnd(w.lo);
    const hi = snapEnd(w.hi);
    if (hi - lo < 0.25) continue;
    walls.push(w.axis === "h" ? [...toUV(lo, w.line), ...toUV(hi, w.line)] : [...toUV(w.line, lo), ...toUV(w.line, hi)]);
  }

  // Sconces hug the nearest wall, on the side they started.
  const segsW = walls.map((s) => {
    const [x0, z0] = toWorld(m, s[0], s[1]);
    const [x1, z1] = toWorld(m, s[2], s[3]);
    return { x0, z0, x1, z1 };
  });
  const torches = m.torches.map((t) => {
    const [u, v, shadow, kind, color] = t;
    if (kind === "post" || segsW.length === 0) return t;
    const [px, pz] = toWorld(m, u, v);
    let best = { d: Infinity, x: px, z: pz };
    for (const s of segsW) {
      const dx = s.x1 - s.x0;
      const dz = s.z1 - s.z0;
      const l2 = dx * dx + dz * dz || 1;
      const tt = clamp(((px - s.x0) * dx + (pz - s.z0) * dz) / l2, 0, 1);
      const qx = s.x0 + tt * dx;
      const qz = s.z0 + tt * dz;
      const d = Math.hypot(px - qx, pz - qz);
      if (d < best.d) {
        const nx = -dz / Math.sqrt(l2);
        const nz = dx / Math.sqrt(l2);
        const side = Math.sign((px - qx) * nx + (pz - qz) * nz) || 1;
        best = { d, x: qx + nx * side * 0.24, z: qz + nz * side * 0.24 };
      }
    }
    const [nu, nv] = toUV(best.x, best.z);
    return [nu, nv, shadow, kind, color] as MapDef["torches"][number];
  });

  return { ...m, walls, torches };
}
