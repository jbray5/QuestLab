import * as THREE from "three";

import type { TableProjection } from "../api/types";

/**
 * Fog of war, the engine's way (Plan 110).
 *
 * The DM reveals regions (polygons) and brushes circles, all in the picture's
 * pixels; the 2D table feathers a dark overlay with holes cut at those. Here
 * the same shapes become two things: a soft-edged mask laid over the floor so
 * the unrevealed ground is dark, and a test — is this spot revealed? — so
 * nothing stands in the dark that shouldn't: no wall, no torch, no furniture,
 * no figure except the party, who are always shown (the 2D table's rule).
 */
export interface Fog {
  revealed: (u: number, v: number) => boolean;
  mask: THREE.CanvasTexture;
}

function inPolygon(x: number, y: number, poly: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The fog for a projection, or null when the DM has it off. */
export function buildFog(p: TableProjection, size = 1024): Fog | null {
  if (!p.fog_on || !p.map) return null;
  const { width, height } = p.map;
  const regions = p.revealed_regions ?? [];
  const brushes = p.brush_reveals ?? [];
  const revealed = (u: number, v: number) => {
    const x = u * width;
    const y = v * height;
    return (
      regions.some((poly) => poly.length >= 3 && inPolygon(x, y, poly)) ||
      brushes.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r)
    );
  };

  // The mask: white is fog, black is clear; the alpha map reads it as opacity.
  const scale = size / Math.max(width, height);
  const w = Math.max(2, Math.round(width * scale));
  const h = Math.max(2, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  // Feather by about a third of a cell, like the 2D table.
  const cell = (p.map.grid_size && p.map.grid_size > 0 ? p.map.grid_size : width / 24) * scale;
  ctx.filter = `blur(${Math.max(2, Math.round(cell * 0.35))}px)`;
  ctx.fillStyle = "#000";
  for (const poly of regions) {
    if (poly.length < 3) continue;
    ctx.beginPath();
    ctx.moveTo(poly[0][0] * scale, poly[0][1] * scale);
    for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0] * scale, poly[i][1] * scale);
    ctx.closePath();
    ctx.fill();
  }
  for (const b of brushes) {
    ctx.beginPath();
    ctx.arc(b.x * scale, b.y * scale, b.r * scale, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.filter = "none";
  const mask = new THREE.CanvasTexture(canvas);
  mask.colorSpace = THREE.NoColorSpace;
  mask.needsUpdate = true;
  return { revealed, mask };
}
