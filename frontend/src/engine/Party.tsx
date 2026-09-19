import { Component, type ReactNode } from "react";
import * as THREE from "three";

import type { TableProjection } from "../api/types";
import type { Fog } from "./fogOfWar";
import { Bolt, Burst, FloatingNumber } from "./Fx";
import { FT_PER_UNIT } from "./heights";
import type { MapDef } from "./maps";
import { type Figure, figures, lights } from "./session";
import { flavorColor, strikeKind, TIMING } from "./strikes";
import { Torch } from "./Torch";
import { Walker } from "./Walker";

/**
 * Everyone on the table (Plan 109): one walking figure per token, told apart
 * by nameplate and by the ring under its feet — the party gold, foes red,
 * anything else grey, the active one bright. A token that carries a model
 * (Plan 111) is that model, at the height the table gave it; the rest are
 * the placeholder.
 *
 * Under fog (Plan 110) the party is always shown; everyone else only where
 * the DM has revealed. The DM's light tokens stand as lanterns. Damage and
 * healing float up from whoever took it, and they flinch.
 */
const TINT: Record<string, string> = { pc: "#d6af36", monster: "#c04a4a", custom: "#8a8a9a", light: "#8a8a9a" };

export interface HitFx {
  id: string;
  ref: string;
  kind: "damage" | "heal";
  amount: number | null;
  /** Who dealt it (Plan 113) — the active combatant's token ref, when a fight was running. */
  from?: string | null;
  /** What kind of hit: "weapon", "fire" … — its colour. */
  flavor?: string | null;
  /** When it arrived (performance.now); the strike's clock. */
  at: number;
}

/**
 * One figure's model failing to load must not black out the room: the
 * boundary swaps that figure for the placeholder and leaves everyone else be.
 */
export class FigureBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("figure fell back to the placeholder:", error.message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function Party({
  map,
  projection,
  fog = null,
  fx = [],
  onFxDone,
  labels = true,
}: {
  map: MapDef;
  projection: TableProjection;
  fog?: Fog | null;
  fx?: HitFx[];
  onFxDone?: (id: string) => void;
  /** Nameplates on (the default) or off — Tab on the table. */
  labels?: boolean;
}) {
  const figs = figures(map, projection).filter((f) => !fog || f.kind === "pc" || fog.revealed(f.u, f.v));
  const lamps = lights(map, projection).filter((l) => !fog || fog.revealed(l.u, l.v));
  // Plan 113 — a hit with a source is a strike: the attacker swings or casts, a bolt
  // crosses the room when they are apart, and the blow lands when it arrives.
  const byRef = new Map<string, Figure>();
  for (const f of figs) if (f.ref) byRef.set(f.ref, f);
  const strikes = fx.flatMap((x) => {
    if (!x.from || x.from === x.ref) return [];
    const from = byRef.get(x.from);
    const to = byRef.get(x.ref);
    if (!from || !to) return [];
    const kind = strikeKind(x.flavor, from.cell.distanceTo(to.cell));
    return [{ fx: x, from, to, kind, timing: TIMING[kind] }];
  });
  const strikeOf = (x: HitFx) => strikes.find((s) => s.fx.id === x.id);
  const chest = (f: Figure) => new THREE.Vector3(f.cell.x, 0.55 * (f.heightFt / FT_PER_UNIT), f.cell.z);
  // Everyone looks at whoever is acting.
  const actor = figs.find((f) => f.active) ?? null;
  return (
    <group>
      {figs.map((f) => {
        const mine = f.ref ? fx.filter((x) => x.ref === f.ref) : [];
        const hits = mine.filter((x) => x.kind === "damage");
        const last = hits.length ? hits[hits.length - 1] : undefined;
        const landing = last ? strikeOf(last) : undefined;
        const outgoing = f.ref ? strikes.filter((s) => s.fx.from === f.ref) : [];
        const swing = outgoing.length ? outgoing[outgoing.length - 1] : undefined;
        const common = {
          cell: f.cell,
          tint: TINT[f.kind] ?? TINT.custom,
          active: f.active,
          down: f.down,
          size: f.size,
          label: labels ? f.label : undefined,
          hit: last?.id,
          hitAt: last ? last.at + (landing?.timing.impact ?? 0) : undefined,
          hitFrom: landing ? landing.from.cell : null,
          strike: swing ? { id: swing.fx.id, kind: swing.kind, toward: swing.to.cell, at: swing.fx.at } : null,
          attention: actor && actor !== f ? actor.cell : null,
        };
        return (
          <group key={f.id}>
            {f.model ? (
              <FigureBoundary key={f.model.url} fallback={<Walker {...common} model={{ url: null, heightFt: f.model.heightFt }} />}>
                <Walker {...common} model={f.model} />
              </FigureBoundary>
            ) : (
              <Walker {...common} model={{ url: null, heightFt: f.heightFt }} />
            )}
            {mine.map((x) => (
              <FloatingNumber key={x.id} at={f.cell} kind={x.kind} amount={x.amount} delay={strikeOf(x)?.timing.impact ?? 0} onDone={() => onFxDone?.(x.id)} />
            ))}
          </group>
        );
      })}
      {strikes
        .filter((s) => s.kind === "melee")
        .map((s) => (
          <Burst key={`b${s.fx.id}`} at={chest(s.to)} color={flavorColor(s.fx.flavor)} t0={s.fx.at + s.timing.impact} />
        ))}
      {strikes
        .filter((s) => s.kind !== "melee")
        .map((s) => (
          <Bolt key={s.fx.id} from={chest(s.from)} to={chest(s.to)} color={flavorColor(s.fx.flavor)} kind={s.kind as "shoot" | "cast"} launchMs={s.timing.launch} impactMs={s.timing.impact} t0={s.fx.at} />
        ))}
      {lamps.map((l) => (
        <Torch key={l.id} position={[l.cell.x, 1.4, l.cell.z]} post intensity={26} />
      ))}
    </group>
  );
}
