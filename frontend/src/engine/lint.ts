import type { MapDef, Seg } from "./maps";
import { toWorld } from "./maps";

/**
 * The sanity check (Plan 108, third pass).
 *
 * Justin: "we need like a sanity check for each map — what is normal spacing
 * for doorways, what makes sense for a building." A traced map is a guess made
 * by eye; these are the things a builder would know without looking:
 *
 *   - a doorway is five feet — one cell; a double door is two. Narrower than
 *     three feet, nobody fits; wider than fifteen, a wall is probably missing
 *   - walls meet at corners; a wall that ends in open space is a tracing slip
 *   - walls sit on cell edges, or somebody stands half inside one
 *   - a torch hangs on a wall; a torch three feet from any wall is floating
 *   - a table is not inside a wall
 *   - every part of the floor can be walked to from where the character starts
 *
 * Everything is in cells (one cell is five feet). Findings say where, in the
 * map's own u/v, so they can be found on the picture.
 */
export interface Finding {
  level: "error" | "warn" | "note";
  what: string;
  /** Picture coords, for finding it on the map. */
  at?: [number, number];
}

const ft = (cells: number) => `${Math.round(cells * 5)} ft`;

interface Wall {
  i: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  len: number;
  axis: "h" | "v" | "d";
  /** The line the wall lies on: z for horizontal, x for vertical. */
  line: number;
  lo: number;
  hi: number;
}

function walls(m: MapDef): Wall[] {
  return m.walls.map((s: Seg, i) => {
    const [x0, z0] = toWorld(m, s[0], s[1]);
    const [x1, z1] = toWorld(m, s[2], s[3]);
    const dx = x1 - x0;
    const dz = z1 - z0;
    const axis = Math.abs(dz) < 0.15 ? "h" : Math.abs(dx) < 0.15 ? "v" : "d";
    const line = axis === "h" ? (z0 + z1) / 2 : axis === "v" ? (x0 + x1) / 2 : NaN;
    const [lo, hi] = axis === "h" ? [Math.min(x0, x1), Math.max(x0, x1)] : [Math.min(z0, z1), Math.max(z0, z1)];
    return { i, x0, z0, x1, z1, len: Math.hypot(dx, dz), axis, line, lo, hi };
  });
}

function toUV(m: MapDef, x: number, z: number): [number, number] {
  return [Number((x / m.w + 0.5).toFixed(3)), Number((z / m.h + 0.5).toFixed(3))];
}

/** Distance from a point to a segment. */
function distToWall(px: number, pz: number, w: Wall): number {
  const dx = w.x1 - w.x0;
  const dz = w.z1 - w.z0;
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - w.x0) * dx + (pz - w.z0) * dz) / l2));
  return Math.hypot(px - (w.x0 + t * dx), pz - (w.z0 + t * dz));
}

export function lintMap(m: MapDef): Finding[] {
  const out: Finding[] = [];
  const W = walls(m);
  const say = (level: Finding["level"], what: string, x?: number, z?: number) =>
    out.push({ level, what, at: x === undefined || z === undefined ? undefined : toUV(m, x, z) });

  // ── doorways first: gaps between walls on the same line ───────────────────
  // (a doorway's jambs are wall ends that legitimately end in open space, so
  // they are collected here and forgiven below)
  const jambs: [number, number][] = [];
  const lines = new Map<string, Wall[]>();
  for (const w of W) {
    if (w.axis === "d") continue;
    const key = `${w.axis}:${Math.round(w.line * 4) / 4}`;
    lines.set(key, [...(lines.get(key) ?? []), w]);
  }
  for (const group of lines.values()) {
    const sorted = [...group].sort((a, b) => a.lo - b.lo);
    for (let k = 1; k < sorted.length; k++) {
      const a = sorted[k - 1];
      const b = sorted[k];
      const gap = b.lo - a.hi;
      if (gap <= 0.05) continue;
      const [gx, gz] = a.axis === "h" ? [a.hi + gap / 2, a.line] : [a.line, a.hi + gap / 2];
      if (gap < 0.6) say("error", `a ${ft(gap)} gap between walls ${a.i} and ${b.i} — too narrow to pass, and not a wall either`, gx, gz);
      else if (gap <= 2.4) say("note", `doorway ${ft(gap)} wide between walls ${a.i} and ${b.i}`, gx, gz);
      else if (gap <= 4) say("note", `opening ${ft(gap)} wide between walls ${a.i} and ${b.i} — an arch, or a missing wall?`, gx, gz);
      if (gap <= 4) {
        jambs.push(a.axis === "h" ? [a.hi, a.line] : [a.line, a.hi]);
        jambs.push(b.axis === "h" ? [b.lo, b.line] : [b.line, b.lo]);
      }
    }
  }
  const isJamb = (x: number, z: number) => jambs.some(([jx, jz]) => Math.hypot(jx - x, jz - z) < 0.2);

  // ── walls: length, angle, grid alignment, corners ──────────────────────────
  for (const w of W) {
    if (w.len < 0.4) say("warn", `wall ${w.i} is only ${ft(w.len)} long — a fragment?`, w.x0, w.z0);
    if (w.axis === "d" && !m.solid) say("note", `wall ${w.i} is diagonal — fine, just unusual for a building`, w.x0, w.z0);
    if (w.axis !== "d") {
      // A cell edge is at integer + gridOffset along that axis.
      const off = w.axis === "h" ? (m.h / 2) % 1 : (m.w / 2) % 1;
      const nearest = Math.round(w.line - off) + off;
      const slip = Math.abs(w.line - nearest);
      if (slip > 0.3)
        say("warn", `wall ${w.i} sits ${ft(slip)} off a cell edge — someone will stand half inside it`, w.x0, w.z0);
    }
    for (const [ex, ez] of [
      [w.x0, w.z0],
      [w.x1, w.z1],
    ] as const) {
      const touches = W.some((o) => o.i !== w.i && distToWall(ex, ez, o) < 0.36);
      const atEdge =
        Math.abs(Math.abs(ex) - m.w / 2) < 0.36 || Math.abs(Math.abs(ez) - m.h / 2) < 0.36;
      if (!touches && !atEdge && !isJamb(ex, ez)) say("warn", `wall ${w.i} ends in open space — does it meet anything?`, ex, ez);
    }
  }

  // ── torches on walls, props out of walls, everything on the map ───────────
  const inside = (x: number, z: number) => Math.abs(x) <= m.w / 2 && Math.abs(z) <= m.h / 2;
  const nearestWall = (x: number, z: number) => Math.min(...W.map((w) => distToWall(x, z, w)));
  m.torches.forEach(([u, v, , kind], i) => {
    const [x, z] = toWorld(m, u, v);
    if (!inside(x, z)) say("error", `torch ${i} is off the map`, x, z);
    if (kind === "post") return;
    const d = nearestWall(x, z);
    if (d > 0.6) say("warn", `torch ${i} floats ${ft(d)} from the nearest wall — a sconce hangs on one (or mark it a post)`, x, z);
  });
  m.props.forEach((p, i) => {
    const [x, z] = toWorld(m, p.u, p.v);
    if (!inside(x, z)) say("error", `${p.model} (${i}) is off the map`, x, z);
    else if (nearestWall(x, z) < 0.22) say("warn", `${p.model} (${i}) stands inside a wall`, x, z);
  });
  for (const p of m.pools ?? []) {
    const [x, z] = toWorld(m, p.u, p.v);
    if (!inside(x, z)) say("error", "a pool is off the map", x, z);
  }

  // ── can everything be reached from where the character starts? ───────────
  // Walls are snapped to the nearest cell edge and block crossing it. The
  // tolerance matters: a wall end of -5.000000000000001 must not spill into
  // the cell before it, or a doorway closes on a floating-point crumb.
  const EPS = 1e-6;
  const blockedV = new Set<string>(); // between (cx-1, cz) and (cx, cz): key `${cx},${cz}`
  const blockedH = new Set<string>(); // between (cx, cz-1) and (cx, cz)
  for (const w of W) {
    if (w.axis === "v") {
      const cx = Math.round(w.line + m.w / 2);
      for (let cz = Math.floor(w.lo + m.h / 2 + EPS); cz < Math.ceil(w.hi + m.h / 2 - EPS); cz++) blockedV.add(`${cx},${cz}`);
    } else if (w.axis === "h") {
      const cz = Math.round(w.line + m.h / 2);
      for (let cx = Math.floor(w.lo + m.w / 2 + EPS); cx < Math.ceil(w.hi + m.w / 2 - EPS); cx++) blockedH.add(`${cx},${cz}`);
    }
  }
  const [sx, sz] = toWorld(m, ...m.start);
  const start: [number, number] = [Math.floor(sx + m.w / 2), Math.floor(sz + m.h / 2)];
  const seen = new Set<string>([start.join(",")]);
  const queue = [start];
  while (queue.length) {
    const [cx, cz] = queue.shift()!;
    const step = (nx: number, nz: number, wall: boolean) => {
      if (wall || nx < 0 || nz < 0 || nx >= m.w || nz >= m.h) return;
      const k = `${nx},${nz}`;
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([nx, nz]);
      }
    };
    step(cx + 1, cz, blockedV.has(`${cx + 1},${cz}`));
    step(cx - 1, cz, blockedV.has(`${cx},${cz}`));
    step(cx, cz + 1, blockedH.has(`${cx},${cz + 1}`));
    step(cx, cz - 1, blockedH.has(`${cx},${cz}`));
  }
  // Underground, the cells beyond the outermost walls are rock, not rooms.
  let floor: (cx: number, cz: number) => boolean = () => true;
  if (m.solid && W.length) {
    const xs = W.flatMap((w) => [w.x0, w.x1]);
    const zs = W.flatMap((w) => [w.z0, w.z1]);
    const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    floor = (cx, cz) => {
      const x = cx + 0.5 - m.w / 2;
      const z = cz + 0.5 - m.h / 2;
      return x > x0 && x < x1 && z > z0 && z < z1;
    };
  }
  let unreachable = 0;
  const cells: string[] = [];
  let example: [number, number] | undefined;
  for (let cz = 0; cz < m.h; cz++)
    for (let cx = 0; cx < m.w; cx++)
      if (floor(cx, cz) && !seen.has(`${cx},${cz}`)) unreachable += 1;
  if (unreachable > 0) {
    // Name them, as cell columns and rows, so the room can be found.
    for (let cz = 0; cz < m.h; cz++)
      for (let cx = 0; cx < m.w; cx++)
        if (floor(cx, cz) && !seen.has(`${cx},${cz}`)) {
          example ??= [cx + 0.5 - m.w / 2, cz + 0.5 - m.h / 2];
          if (cells.length < 12) cells.push(`${cx},${cz}`);
        }
    say(
      "warn",
      `${unreachable} cells can't be walked to from the start — a room with no door, or a wall across a corridor (cells ${cells.join(" ")}${unreachable > 12 ? " …" : ""})`,
      example?.[0],
      example?.[1],
    );
  }
  return out;
}
