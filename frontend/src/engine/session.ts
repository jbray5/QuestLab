import * as THREE from "three";

import type { TableMapSummary, TableProjection, TableToken } from "../api/types";
import type { MapDef } from "./maps";
import { snapToCell, toWorld } from "./maps";
import { MAPS } from "./registry";

/**
 * A session's table, as the engine sees it (Plan 109).
 *
 * The Table View's projection is the truth: which map is active, where every
 * token stands in image pixels, whose turn it is. This file only translates.
 * A map the engine has a definition for renders as built; any other map
 * renders as its own picture, lit, with the tokens standing on it — so the
 * engine can open every session today, and gains scene data map by map.
 */

/** The scene for whatever map the DM has active. */
export function resolveMap(m: TableMapSummary): MapDef {
  const known = Object.values(MAPS).find((d) => d.battleMapIds?.includes(m.id));
  if (known) return known;
  // No scene data yet: the picture as a lit floor, sized by its grid.
  const grid = m.grid_size && m.grid_size > 0 ? m.grid_size : Math.round(Math.min(m.width, m.height) / 16);
  const w = Math.max(4, Math.round(m.width / grid));
  const h = Math.max(4, Math.round(m.height / grid));
  const span = Math.max(w, h);
  return {
    id: `map:${m.id}`,
    name: m.name || "the table",
    battleMapIds: [m.id],
    url: m.image_url,
    painted: true,
    light: "day",
    w,
    h,
    walls: [],
    torches: [],
    props: [],
    look: [0.5, 0.5],
    eye: [span * 0.05, span * 0.62, span * 0.58],
    start: [0.5, 0.5],
  };
}

/** The cell a token stands on. Tokens are image pixels; the engine is cells. */
export function tokenCell(map: MapDef, m: TableMapSummary, t: TableToken): THREE.Vector3 {
  const u = Math.min(1, Math.max(0, t.x / Math.max(1, m.width)));
  const v = Math.min(1, Math.max(0, t.y / Math.max(1, m.height)));
  const [x, z] = toWorld(map, u, v);
  return snapToCell(map, new THREE.Vector3(x, 0, z));
}

/** Everything the engine draws for one token. */
export interface Figure {
  id: string;
  label: string;
  kind: TableToken["kind"];
  cell: THREE.Vector3;
  size: number;
  active: boolean;
  down: boolean;
}

export function figures(map: MapDef, p: TableProjection): Figure[] {
  if (!p.map) return [];
  const m = p.map;
  return p.tokens
    .filter((t) => t.kind !== "light")
    .map((t) => ({
      id: t.id,
      label: t.label,
      kind: t.kind,
      cell: tokenCell(map, m, t),
      size: Math.min(2.2, Math.max(1, t.size || 1)),
      active: !!p.active_token_ref && t.ref_id === p.active_token_ref,
      down: !!t.ref_id && p.defeated_refs.includes(t.ref_id),
    }));
}
