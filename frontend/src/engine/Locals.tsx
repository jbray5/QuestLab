import { Suspense } from "react";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { adornFor } from "./adorn";
import { toWorld } from "./maps";
import { FigureBoundary } from "./Party";
import { Walker } from "./Walker";

/**
 * The people who live on a map (Plan 113): patrons at a bar, a bartender.
 * Each is a still figure — a clip settles and holds — facing where the map
 * says, with no ring and no name, and never part of the fight. A model that
 * fails to load is simply absent; one slow file holds up only itself.
 */
export function Locals({ map }: { map: MapDef }) {
  return (
    <group>
      {(map.people ?? []).map((p, i) => {
        if (!p.model) return null;
        const [x, z] = toWorld(map, p.u, p.v);
        const cell = new THREE.Vector3(x, 0, z);
        return (
          <Suspense key={i} fallback={null}>
            <FigureBoundary fallback={null}>
              <Walker cell={cell} model={{ url: p.model, heightFt: p.heightFt ?? 5.7 }} still phase={p.phase ?? (i * 0.7) % 3} facing={p.rot ?? 0} ring={false} tint="#8a8a9a" rest={p.pose ?? "idle"} adorn={adornFor(p.name)} />
            </FigureBoundary>
          </Suspense>
        );
      })}
    </group>
  );
}
