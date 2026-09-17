import type { ReactNode } from "react";
import * as THREE from "three";

import { BuiltFloor } from "./BuiltScene";
import { Exits } from "./Exits";
import { CellMarker, GridOverlay } from "./grid";
import { HybridFloor } from "./HybridScene";
import type { MapDef } from "./maps";
import { toWorld } from "./maps";
import { Pools } from "./Pools";
import { MapProps } from "./Props";
import { Torch } from "./Torch";
import { Walls } from "./Walls";

/**
 * A map, rendered (Plan 109).
 *
 * Everything the spike assembled by hand, in one place, so the spike and the
 * live table draw exactly the same scene: the floor (built, or the picture
 * when that is all there is), the walls, the lights, what stands in it, the
 * water, the ways out, the grid. Whoever is standing on it comes in as
 * children. The camera and the post stay with the page.
 */
export function MapScene({
  map,
  painted = false,
  furniture = true,
  grid = false,
  target,
  darkness = 0,
  onFloorClick,
  onExit,
  children,
}: {
  map: MapDef;
  /** Draw the picture as the floor instead of the built one. */
  painted?: boolean;
  furniture?: boolean;
  grid?: boolean;
  target?: THREE.Vector3 | null;
  /** The DM's darkness dial, 0–1. */
  darkness?: number;
  onFloorClick?: (p: THREE.Vector3) => void;
  onExit?: (label: string, to?: string) => void;
  children?: ReactNode;
}) {
  const day = map.light === "day";
  const dim = 1 - 0.85 * Math.min(1, Math.max(0, darkness));
  const click = onFloorClick ?? (() => {});
  const usePicture = (painted || map.painted) && !!map.url;
  const bg = day ? "#10141c" : "#05060a";
  return (
    <>
      <color attach="background" args={[bg]} />
      <fogExp2 attach="fog" args={[bg, map.fog ?? (day ? 0.012 : 0.03)]} />
      {day ? (
        <>
          {/* A lit outdoor rig for a map with no scene data: a low sun and sky. */}
          <hemisphereLight args={["#b9c8e6", "#4a3a2a", 0.55 * dim]} />
          <ambientLight intensity={0.22 * dim} />
          <directionalLight
            position={[map.w * 0.35, map.w * 0.8, map.h * 0.3]}
            intensity={1.7 * dim}
            color="#ffe2b8"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-camera-left={-map.w * 0.6}
            shadow-camera-right={map.w * 0.6}
            shadow-camera-top={map.h * 0.6}
            shadow-camera-bottom={-map.h * 0.6}
            shadow-camera-far={map.w * 3}
            shadow-bias={-0.0015}
          />
        </>
      ) : (
        <>
          {/* Moonlight through the gaps, faint. The torches do the work. */}
          <hemisphereLight args={["#3b4a6b", "#0b0908", 0.14 * dim]} />
          <ambientLight intensity={0.05 * dim} />
        </>
      )}
      {usePicture && map.url ? (
        <HybridFloor map={map} url={map.url} onClick={click} />
      ) : (
        <BuiltFloor map={map} onClick={click} />
      )}
      <Walls map={map} />
      {map.torches.map(([u, v, shadow, kind, color], i) => {
        const [x, z] = toWorld(map, u, v);
        return <Torch key={i} position={[x, 1.55, z]} shadow={shadow} post={kind === "post"} color={color} />;
      })}
      {furniture && <MapProps map={map} />}
      {(map.pools || map.basins) && <Pools map={map} />}
      {map.exits && <Exits map={map} onExit={onExit ?? (() => {})} />}
      {grid && <GridOverlay map={map} />}
      {target && <CellMarker at={target} />}
      {children}
    </>
  );
}
