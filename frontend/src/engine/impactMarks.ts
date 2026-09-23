import { useEffect, useSyncExternalStore } from "react";
import * as THREE from "three";

import { FT_PER_UNIT } from "./heights";
import type { HitFx } from "./Party";
import type { Figure } from "./session";

/**
 * The marks a fight leaves (Plan 113, the Tuesday push): what each hit put on
 * the floor, and the pool under whoever went down. They live in a small store
 * outside React — a hit is over in a second, its stain lasts minutes — and
 * the party reads them with useSyncExternalStore, so nothing is set inside an
 * effect. Impact.tsx draws them.
 */
export type MarkKind = "blood" | "scorch" | "frost" | "acid" | "rot" | "glow" | "pool";

export interface Mark {
  id: string;
  kind: MarkKind;
  /** Where it lies, in world units. */
  at: THREE.Vector3;
  /** When it appears (performance.now) — the moment the blow lands. */
  t0: number;
  seed: number;
  size: number;
  yaw: number;
  /** A hair of height so two marks on one spot do not flicker against each other. */
  lift: number;
  /** Which way the blow travelled (spray flies on with it). */
  dir: THREE.Vector3;
  /** How high the blow landed — where the spray starts. */
  hitY: number;
}

/** The mark a damage type leaves; null for the ones that leave none (force, psychic, thunder). */
export function markKind(flavor?: string | null): Exclude<MarkKind, "pool"> | null {
  switch (flavor ?? "weapon") {
    case "weapon":
      return "blood";
    case "fire":
    case "lightning":
      return "scorch";
    case "cold":
      return "frost";
    case "acid":
    case "poison":
      return "acid";
    case "necrotic":
      return "rot";
    case "radiant":
      return "glow";
    default:
      return null;
  }
}

/** Seconds a mark lasts; the last 15 are its fade. */
export const LIFE: Record<MarkKind, number> = { blood: 240, scorch: 300, frost: 50, acid: 120, rot: 150, glow: 14, pool: 360 };
const MAX_MARKS = 56;

export function hashId(s: string): number {
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
}

// ── the store
let marks: Mark[] = [];
const listeners = new Set<() => void>();
const seen = new Set<string>();
const wasDown = new Set<string>();

function emit() {
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function snapshot() {
  return marks;
}

export function addMarks(add: Mark[]): void {
  if (!add.length) return;
  marks = [...marks, ...add].slice(-MAX_MARKS);
  emit();
}

export function pruneMarks(now: number): void {
  const keep = marks.filter((m) => now - m.t0 < LIFE[m.kind] * 1000);
  if (keep.length !== marks.length) {
    marks = keep;
    emit();
  }
}

/** A new room: the old floor's stains do not come along. */
export function clearMarks(): void {
  wasDown.clear();
  if (marks.length) {
    marks = [];
    emit();
  }
}

/**
 * Keeps the store fed from the hits and the roster: one mark per damage event
 * that leaves one, at the target's feet, thrown on past them from wherever the
 * blow came; a pool under each figure the moment it goes down.
 */
export function useMarks(fx: HitFx[], figs: Figure[], landing: (x: HitFx) => { from: Figure; impact: number } | undefined): Mark[] {
  useEffect(() => {
    const add: Mark[] = [];
    const byRef = new Map<string, Figure>();
    for (const f of figs) if (f.ref) byRef.set(f.ref, f);
    for (const x of fx) {
      if (x.kind !== "damage" || seen.has(x.id)) continue;
      seen.add(x.id);
      const to = byRef.get(x.ref);
      const kind = markKind(x.flavor);
      if (!to || !kind) continue;
      const l = landing(x);
      const h = hashId(x.id);
      const dir = l ? to.cell.clone().sub(l.from.cell).setY(0) : new THREE.Vector3(Math.cos(h), 0, Math.sin(h));
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const amount = x.amount ?? 4;
      const size = Math.min(1.5, 0.55 + amount * 0.055) * (kind === "glow" ? 1.4 : 1);
      const at = to.cell.clone().addScaledVector(dir, 0.18 + Math.random() * 0.3);
      at.x += (Math.random() - 0.5) * 0.2;
      at.z += (Math.random() - 0.5) * 0.2;
      add.push({
        id: x.id,
        kind,
        at,
        t0: x.at + (l?.impact ?? 0),
        seed: h % 6,
        size,
        yaw: Math.atan2(dir.x, dir.z) + Math.PI / 2 + (Math.random() - 0.5) * 0.6,
        lift: (h % 7) * 0.0012,
        dir,
        hitY: 0.55 * (to.heightFt / FT_PER_UNIT),
      });
    }
    for (const f of figs) {
      if (f.down && !wasDown.has(f.id)) {
        wasDown.add(f.id);
        add.push({
          id: `pool:${f.id}:${Math.round(performance.now())}`,
          kind: "pool",
          at: f.cell.clone(),
          t0: performance.now() + 500,
          seed: hashId(f.id) % 6,
          size: 1.1 + Math.min(0.6, f.size * 0.2),
          yaw: Math.random() * Math.PI * 2,
          lift: 0.006,
          dir: new THREE.Vector3(0, 0, 1),
          hitY: 0.3,
        });
      } else if (!f.down) wasDown.delete(f.id);
    }
    addMarks(add);
  }, [fx, figs, landing]);
  // Prune what has faded, on a slow clock.
  useEffect(() => {
    const t = setInterval(() => pruneMarks(performance.now()), 10000);
    return () => clearInterval(t);
  }, []);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** The marks as they stand — for a bench that feeds the store itself. */
export function useMarkStore(): Mark[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
