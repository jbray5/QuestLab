import { Component, type ReactNode } from "react";

import type { TableProjection } from "../api/types";
import type { Fog } from "./fogOfWar";
import { FloatingNumber } from "./Fx";
import type { MapDef } from "./maps";
import { figures, lights } from "./session";
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
}

/**
 * One figure's model failing to load must not black out the room: the
 * boundary swaps that figure for the placeholder and leaves everyone else be.
 */
class FigureBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
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
}: {
  map: MapDef;
  projection: TableProjection;
  fog?: Fog | null;
  fx?: HitFx[];
  onFxDone?: (id: string) => void;
}) {
  const figs = figures(map, projection).filter((f) => !fog || f.kind === "pc" || fog.revealed(f.u, f.v));
  const lamps = lights(map, projection).filter((l) => !fog || fog.revealed(l.u, l.v));
  return (
    <group>
      {figs.map((f) => {
        const mine = f.ref ? fx.filter((x) => x.ref === f.ref) : [];
        const hits = mine.filter((x) => x.kind === "damage");
        const lastHit = hits.length ? hits[hits.length - 1].id : undefined;
        const common = { cell: f.cell, tint: TINT[f.kind] ?? TINT.custom, active: f.active, down: f.down, size: f.size, label: f.label, hit: lastHit };
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
              <FloatingNumber key={x.id} at={f.cell} kind={x.kind} amount={x.amount} onDone={() => onFxDone?.(x.id)} />
            ))}
          </group>
        );
      })}
      {lamps.map((l) => (
        <Torch key={l.id} position={[l.cell.x, 1.4, l.cell.z]} post intensity={26} />
      ))}
    </group>
  );
}
