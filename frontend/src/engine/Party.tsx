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
 * anything else grey, the active one bright. Every figure is the placeholder
 * until Milestone 3 gives the party their own models.
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
        return (
          <group key={f.id}>
            <Walker cell={f.cell} tint={TINT[f.kind] ?? TINT.custom} active={f.active} down={f.down} size={f.size} label={f.label} hit={lastHit} />
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
