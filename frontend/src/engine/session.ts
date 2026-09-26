import * as THREE from "three";

import type { TableMapSummary, TableProjection, TableToken } from "../api/types";
import { DEFAULT_HEIGHT_FT } from "./heights";
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

/** A picture-pixel point as fractions of the picture, clamped onto it. */
export function pixelToUV(m: TableMapSummary, x: number, y: number): [number, number] {
  return [Math.min(1, Math.max(0, x / Math.max(1, m.width))), Math.min(1, Math.max(0, y / Math.max(1, m.height)))];
}

/** The cell under a picture-pixel point. Tokens are image pixels; the engine is cells. */
export function pixelToCell(map: MapDef, m: TableMapSummary, x: number, y: number): THREE.Vector3 {
  const [u, v] = pixelToUV(m, x, y);
  const [wx, wz] = toWorld(map, u, v);
  return snapToCell(map, new THREE.Vector3(wx, 0, wz));
}

/** Everything the engine draws for one token. */
export interface Figure {
  id: string;
  /** The combatant this token stands for — what turn glow and hit effects name. */
  ref: string | null;
  label: string;
  kind: TableToken["kind"];
  u: number;
  v: number;
  cell: THREE.Vector3;
  size: number;
  active: boolean;
  down: boolean;
  /** The rigged model this token carries (Plan 111), if any. */
  model: { url: string; heightFt: number } | null;
  /** How tall it stands, in feet — sent by the table from race or size. */
  heightFt: number;
}

export function figures(map: MapDef, p: TableProjection): Figure[] {
  if (!p.map) return [];
  const m = p.map;
  return p.tokens
    // A light is a lantern, not a person. A crowd knot is a whole group of
    // them and draws itself (Crowd.tsx) — it must not also stand here as one
    // figure with a nameplate and a turn ring.
    .filter((t) => t.kind !== "light" && t.crowd == null)
    .map((t) => {
      const [u, v] = pixelToUV(m, t.x, t.y);
      return {
        id: t.id,
        ref: t.ref_id ?? null,
        label: t.label,
        kind: t.kind,
        u,
        v,
        cell: pixelToCell(map, m, t.x, t.y),
        size: Math.min(2.2, Math.max(1, t.size || 1)),
        active: !!p.active_token_ref && t.ref_id === p.active_token_ref,
        down: !!t.ref_id && p.defeated_refs.includes(t.ref_id),
        model: t.model_url ? { url: t.model_url, heightFt: t.model_height_ft ?? DEFAULT_HEIGHT_FT } : null,
        heightFt: t.model_height_ft ?? DEFAULT_HEIGHT_FT,
      };
    });
}

/** The DM's light tokens — torches they placed on the table (Plan 110). */
export function lights(map: MapDef, p: TableProjection): { id: string; u: number; v: number; cell: THREE.Vector3 }[] {
  if (!p.map) return [];
  const m = p.map;
  return p.tokens
    .filter((t) => t.kind === "light")
    .map((t) => {
      const [u, v] = pixelToUV(m, t.x, t.y);
      return { id: t.id, u, v, cell: pixelToCell(map, m, t.x, t.y) };
    });
}
