import { Environment } from "@react-three/drei";
import { type ReactNode, useMemo } from "react";
import * as THREE from "three";

import { BuiltFloor } from "./BuiltScene";
import { Exits } from "./Exits";
import type { Fog } from "./fogOfWar";
import { CellMarker, GridOverlay } from "./grid";
import { HybridFloor } from "./HybridScene";
import type { MapDef } from "./maps";
import { toWorld } from "./maps";
import { Pools } from "./Pools";
import { MapProps } from "./Props";
import { useQuality } from "./quality";
import { Locals } from "./Locals";
import { Torch } from "./Torch";
import { Walls } from "./Walls";
import { Weather } from "./Weather";

/**
 * A map, rendered (Plan 109).
 *
 * Everything the spike assembled by hand, in one place, so the spike and the
 * live table draw exactly the same scene: the floor (built, or the picture
 * when that is all there is), the walls, the lights, what stands in it, the
 * water, the ways out, the grid. Whoever is standing on it comes in as
 * children. The camera and the post stay with the page.
 *
 * Under fog of war (Plan 110) only what the DM has revealed is built; the
 * rest of the floor lies under a soft-edged dark, and nothing stands there.
 */
function midpoint(seg: [number, number, number, number]): [number, number] {
  return [(seg[0] + seg[2]) / 2, (seg[1] + seg[3]) / 2];
}

/** The parts of a map the players may see. */
function visiblePart(map: MapDef, fog: Fog | null): MapDef {
  if (!fog) return map;
  const ok = (u: number, v: number) => fog.revealed(u, v);
  return {
    ...map,
    walls: map.walls.filter((s) => ok(...midpoint(s))),
    torches: map.torches.filter(([u, v]) => ok(u, v)),
    props: map.props.filter((p) => ok(p.u, p.v)),
    pools: map.pools?.filter((p) => ok(p.u, p.v)),
    basins: map.basins?.filter((b) => ok(b.u, b.v)),
    exits: map.exits?.filter((e) => ok(e.u, e.v)),
    hearth: map.hearth && ok(...map.hearth) ? map.hearth : undefined,
    bar: map.bar && ok(...map.bar) ? map.bar : undefined,
    fires: map.fires?.filter(([u, v]) => ok(u, v)),
  };
}

export function MapScene({
  map,
  painted = false,
  furniture = true,
  grid = false,
  target,
  darkness = 0,
  fog = null,
  weather = null,
  onFloorClick,
  onExit,
  revealedExits,
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
  fog?: Fog | null;
  weather?: string | null;
  onFloorClick?: (p: THREE.Vector3) => void;
  onExit?: (label: string, to?: string) => void;
  /** Hidden exits the players have found; leave undefined to show every exit. */
  revealedExits?: string[];
  children?: ReactNode;
}) {
  const day = map.light === "day";
  const overcast = weather === "rain" || weather === "snow";
  const dim = (1 - 0.85 * Math.min(1, Math.max(0, darkness))) * (overcast ? 0.8 : 1);
  const click = onFloorClick ?? (() => {});
  const usePicture = (painted || map.painted) && !!map.url;
  const bg = map.sky ?? (day ? (overcast ? "#0c0f14" : "#10141c") : "#05060a");
  const inTheAir = weather && weather !== "none" ? weather : (map.weather ?? null);
  const shown = useMemo(() => visiblePart(map, fog), [map, fog]);
  const { fast } = useQuality();
  return (
    <>
      <color attach="background" args={[bg]} />
      {/* Plan 112 — image-based light: a dim night sky under the torches, a dawn for day maps, so leather, plate and skin reflect a room rather than a void. */}
      <Environment preset={day ? "dawn" : "night"} environmentIntensity={(day ? (overcast ? 0.35 : 0.55) : 0.28) * dim} />
      <fogExp2 attach="fog" args={[bg, map.fog ?? (day ? (overcast ? 0.02 : 0.012) : 0.03)]} />
      {day ? (
        <>
          {/* A lit outdoor rig for a map with no scene data: a low sun and sky. */}
          <hemisphereLight args={[map.moon ?? (overcast ? "#8f9aad" : "#b9c8e6"), "#4a3a2a", 0.55 * dim]} />
          <ambientLight intensity={0.22 * dim} />
          <directionalLight
            position={[map.w * 0.35, map.w * 0.8, map.h * 0.3]}
            intensity={(overcast ? 1.0 : 1.7) * dim}
            color={overcast ? "#c9d2e0" : "#ffe2b8"}
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
          <hemisphereLight args={[map.moon ?? "#3b4a6b", "#0b0908", 0.14 * dim]} />
          <ambientLight intensity={0.05 * dim} />
          {/* The one shadow: a soft warm key from high over the room. Point-light shadows cost six
              renders per torch and pinned the CPU; this is one render and grounds every figure. */}
          {!fast && (
            <directionalLight
              position={[map.w * 0.5 + map.w * 0.25, map.w * 0.9, map.h * 0.5 + map.h * 0.35]}
              target-position={[map.w * 0.5, 0, map.h * 0.5]}
              intensity={0.55 * dim}
              color="#ffc98a"
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-map.w * 0.6}
              shadow-camera-right={map.w * 0.6}
              shadow-camera-top={map.h * 0.6}
              shadow-camera-bottom={-map.h * 0.6}
              shadow-camera-far={map.w * 3}
              shadow-bias={-0.0006}
              shadow-normalBias={0.02}
              shadow-radius={6}
              shadow-blurSamples={12}
            />
          )}
        </>
      )}
      {usePicture && map.url ? (
        <HybridFloor map={map} url={map.url} onClick={click} />
      ) : (
        <BuiltFloor map={map} onClick={click} />
      )}
      {fog && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} renderOrder={5}>
          <planeGeometry args={[map.w, map.h]} />
          <meshBasicMaterial color="#020306" transparent alphaMap={fog.mask} opacity={0.985} depthWrite={false} />
        </mesh>
      )}
      <Walls map={shown} />
      {shown.torches.map(([u, v, shadow, kind, color], i) => {
        const [x, z] = toWorld(map, u, v);
        if (kind === "candle") return <Torch key={i} position={[x, 0.62, z]} candle color={color ?? "#ffb66a"} intensity={5} />;
        return <Torch key={i} position={[x, 1.55, z]} shadow={shadow} post={kind === "post"} color={color} />;
      })}
      {furniture && <MapProps map={shown} />}
      {!!(shown.pools?.length || shown.basins?.length) && <Pools map={shown} />}
      {!!shown.exits?.length && <Exits map={shown} onExit={onExit ?? (() => {})} revealed={revealedExits} />}
      <Weather map={map} kind={inTheAir} />
      {!!map.people?.length && <Locals map={map} />}
      {grid && <GridOverlay map={map} />}
      {target && <CellMarker at={target} />}
      {children}
    </>
  );
}
