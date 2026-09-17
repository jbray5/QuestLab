import { Grid } from "@react-three/drei";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { gridOffset } from "./maps";

/**
 * The combat grid (Plan 108, second pass).
 *
 * Justin: "will I still be controlling movement on a grid? For combat
 * purposes." Yes. The engine draws continuous positions, but the *game* lives
 * on cells: a move is a cell-to-cell decision and the walk is how the engine
 * plays the transition. One cell is one world unit — five feet. Snapping lives
 * in maps.ts with the rest of the geometry; this file draws.
 */

/** Faint cell lines on the map's cell edges, fading with distance so the far room stays dark. */
export function GridOverlay({ map }: { map: MapDef }) {
  const [ox, oz] = gridOffset(map);
  return (
    <Grid
      position={[ox, 0.015, oz]}
      args={[map.w, map.h]}
      cellSize={1}
      cellThickness={0.6}
      cellColor="#6f6a5a"
      sectionSize={5}
      sectionThickness={1}
      sectionColor="#8d8468"
      fadeDistance={34}
      fadeStrength={1.2}
      infiniteGrid={false}
    />
  );
}

/** The cell a character has been sent to. */
export function CellMarker({ at }: { at: THREE.Vector3 }) {
  return (
    <mesh position={[at.x, 0.02, at.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.34, 0.46, 32]} />
      <meshBasicMaterial color={[2.2, 1.7, 0.6]} toneMapped={false} transparent opacity={0.85} />
    </mesh>
  );
}
