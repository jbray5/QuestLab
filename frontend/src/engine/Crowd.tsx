import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import type { TableProjection } from "../api/types";
import type { Fog } from "./fogOfWar";
import type { MapDef } from "./maps";
import { toWorld } from "./maps";
import { pixelToUV } from "./session";

/**
 * The festival crowd (Plan 114, Session 8).
 *
 * Eight tokens stand for the crowd at the Summer Games, each holding a count
 * of how many bystanders are on their feet, how many the herd has put on the
 * ground, and how many are gone. This draws those numbers as people: a small
 * knot of figures around each token, standing while they can, face down when
 * they cannot, and still and grey once they are lost.
 *
 * They are scenery, not combatants — no rings, no nameplates, no blood. The
 * damage marks the table paints for a fight are for creatures who fight back.
 *
 * Cost matters: there can be thirty-odd of them alongside the party and nine
 * animals, so a whole crowd is four instanced meshes and no skinning at all.
 * At table distance a bobbing capsule reads as a person perfectly well.
 */

/** Cloth colours for the Summer Court's crowd: greens and golds, a little varied. */
// Deep greens and bronzes. The festival ground is pale, brightly lit and
// bloomed, so anything mid-toned washes out into it — these are darker than
// the Summer Court would actually wear, and that is what makes them read.
const CLOTH = ["#2f4a1c", "#40552a", "#6b5316", "#38512a", "#7a5f1c", "#27401a"];
const SKIN = new THREE.Color("#8a6144");
const GONE = new THREE.Color("#33333a");

/** A deterministic scatter so a knot never reshuffles between frames. */
function jitter(seed: number): [number, number, number] {
  const a = Math.sin(seed * 12.9898) * 43758.5453;
  const b = Math.sin(seed * 78.233) * 17231.1237;
  const c = Math.sin(seed * 39.425) * 24634.6345;
  return [a - Math.floor(a), b - Math.floor(b), c - Math.floor(c)];
}

type Person = {
  x: number;
  z: number;
  /** Which way they face, and how far into their idle bob they are. */
  yaw: number;
  phase: number;
  state: "up" | "down" | "gone";
  color: THREE.Color;
};

/** Everyone the crowd tokens add up to, laid out around their knots. */
function people(map: MapDef, p: TableProjection): Person[] {
  if (!p.map) return [];
  const out: Person[] = [];
  for (const t of p.tokens) {
    if (t.crowd == null) continue;
    const [u, v] = pixelToUV(p.map, t.x, t.y);
    const [cx, cz] = toWorld(map, u, v);
    const up = t.crowd ?? 0;
    const down = (t.hurt ?? 0) + (t.dying ?? 0);
    const gone = t.dead ?? 0;
    const total = up + down + gone;
    for (let i = 0; i < total; i++) {
      const [j0, j1, j2] = jitter(i * 7.7 + cx * 3.1 + cz * 5.3);
      const ring = 0.55 + j2 * 0.75;
      const ang = j0 * Math.PI * 2;
      const state: Person["state"] = i < up ? "up" : i < up + down ? "down" : "gone";
      out.push({
        x: cx + Math.cos(ang) * ring,
        z: cz + Math.sin(ang) * ring,
        yaw: j1 * Math.PI * 2,
        phase: j2 * 6.28,
        state,
        color:
          state === "gone"
            ? GONE
            : new THREE.Color(CLOTH[Math.floor(j1 * CLOTH.length) % CLOTH.length]),
      });
    }
  }
  return out;
}

// One body, one head, one material each — built once and shared by every
// crowd on every map, because an instanced draw needs a concrete geometry and
// material up front rather than JSX children.
const bodyGeo = new THREE.CapsuleGeometry(0.17, 0.72, 3, 8);
const headGeo = new THREE.SphereGeometry(0.16, 9, 8);
const cloth = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const skin = new THREE.MeshStandardMaterial({ roughness: 0.85 });

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();

export function Crowd({
  map,
  projection,
  fog,
}: {
  map: MapDef;
  projection: TableProjection;
  fog: Fog | null;
}) {
  const crowd = useMemo(() => {
    const all = people(map, projection);
    if (!fog) return all;
    // Under fog only the revealed part of the festival is built.
    return all.filter((c) => fog.revealed(c.x / map.w + 0.5, c.z / map.h + 0.5));
  }, [map, projection, fog]);

  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const n = crowd.length;

  // Colours only change when the crowd does, so they are set outside the frame loop.
  useLayoutEffect(() => {
    if (!bodies.current) return;
    crowd.forEach((c, i) => bodies.current!.setColorAt(i, c.color));
    if (bodies.current.instanceColor) bodies.current.instanceColor.needsUpdate = true;
    if (heads.current) {
      crowd.forEach((c, i) => heads.current!.setColorAt(i, c.state === "gone" ? GONE : SKIN));
      if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true;
    }
  }, [crowd]);

  useFrame(({ clock }) => {
    if (!bodies.current || !heads.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const c = crowd[i];
      if (c.state === "up") {
        // Standing: a slow breath, and a little sway while they watch the games.
        const bob = Math.sin(t * 1.6 + c.phase) * 0.02;
        _euler.set(0, c.yaw + Math.sin(t * 0.5 + c.phase) * 0.12, 0);
        _pos.set(c.x, 0.64 + bob, c.z);
      } else {
        // Down: face to the boards, and staying there.
        _euler.set(Math.PI / 2, c.yaw, 0);
        _pos.set(c.x, 0.19, c.z);
      }
      _q.setFromEuler(_euler);
      bodies.current.setMatrixAt(i, _m.compose(_pos, _q, _scl));
      // The head rides the body: up top when standing, out front when down.
      if (c.state === "up") _pos.set(c.x, 1.16 + Math.sin(t * 1.6 + c.phase) * 0.02, c.z);
      else _pos.set(c.x + Math.sin(c.yaw) * 0.55, 0.19, c.z + Math.cos(c.yaw) * 0.55);
      heads.current.setMatrixAt(i, _m.compose(_pos, _q, _scl));
    }
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });

  if (n === 0) return null;
  return (
    <group>
      <instancedMesh
        ref={bodies}
        args={[bodyGeo, cloth, n]}
        key={`b${n}`}
        castShadow
        receiveShadow
        frustumCulled={false}
      />
      <instancedMesh
        ref={heads}
        args={[headGeo, skin, n]}
        key={`h${n}`}
        castShadow
        frustumCulled={false}
      />
    </group>
  );
}
