import type { TableProjection } from "../api/types";
import type { MapDef } from "./maps";
import { figures } from "./session";
import { Walker } from "./Walker";

/**
 * Everyone on the table (Plan 109): one walking figure per token, told apart
 * by nameplate and by the ring under its feet — the party gold, foes red,
 * anything else grey, the active one bright. Every figure is the placeholder
 * until Milestone 3 gives the party their own models.
 */
const TINT: Record<string, string> = { pc: "#d6af36", monster: "#c04a4a", custom: "#8a8a9a", light: "#8a8a9a" };

export function Party({ map, projection }: { map: MapDef; projection: TableProjection }) {
  return (
    <group>
      {figures(map, projection).map((f) => (
        <Walker key={f.id} cell={f.cell} tint={TINT[f.kind] ?? TINT.custom} active={f.active} down={f.down} size={f.size} label={f.label} />
      ))}
    </group>
  );
}
