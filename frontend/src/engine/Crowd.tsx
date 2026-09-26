import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

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

/** One knot's ring: where it is, and how much of it is still lit. */
type Knot = { x: number; z: number; standing: number; start: number };

type Person = {
  x: number;
  z: number;
  /** How tall this one stands, as a multiple of the base body. */
  size: number;
  /** Which way they face, and how far into their idle bob they are. */
  yaw: number;
  phase: number;
  state: "up" | "down" | "gone";
  color: THREE.Color;
};

/** Everyone the crowd tokens add up to, laid out around their knots. */
function people(map: MapDef, p: TableProjection): { crowd: Person[]; knots: Knot[] } {
  if (!p.map) return { crowd: [], knots: [] };
  const out: Person[] = [];
  const knots: Knot[] = [];
  for (const t of p.tokens) {
    if (t.crowd == null) continue;
    const [u, v] = pixelToUV(p.map, t.x, t.y);
    const [cx, cz] = toWorld(map, u, v);
    const up = t.crowd ?? 0;
    const down = (t.hurt ?? 0) + (t.dying ?? 0);
    const gone = t.dead ?? 0;
    const total = up + down + gone;
    // The ring measures the living against however many this knot began with.
    knots.push({ x: cx, z: cz, standing: up, start: Math.max(1, total) });
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
        // A festival is not a row of identical pegs: some of this crowd are
        // children and halflings, a few are tall.
        size: 0.82 + j0 * 0.42,
        state,
        color:
          state === "gone"
            ? GONE
            : new THREE.Color(CLOTH[Math.floor(j1 * CLOTH.length) % CLOTH.length]),
      });
    }
  }
  return { crowd: out, knots };
}

// One body, one head, one material each — built once and shared by every
// crowd on every map, because an instanced draw needs a concrete geometry and
// material up front rather than JSX children.
/**
 * A bystander, in the only detail that survives the distance this is seen
 * from: two legs, a torso, two arms. One merged geometry so a crowd is one
 * draw. The head is separate because it is the one part that is not cloth.
 */
function buildBody(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const put = (g: THREE.BufferGeometry, x: number, y: number, z = 0, tilt = 0) => {
    if (tilt) g.rotateZ(tilt);
    g.translate(x, y, z);
    parts.push(g);
  };
  // Legs, slightly apart.
  put(new THREE.BoxGeometry(0.1, 0.44, 0.13), -0.075, 0.22);
  put(new THREE.BoxGeometry(0.1, 0.44, 0.13), 0.075, 0.22);
  // Torso, a touch wider at the shoulder than the waist.
  const torso = new THREE.CylinderGeometry(0.16, 0.12, 0.4, 8);
  put(torso, 0, 0.64);
  // Arms, hanging with a slight outward tilt so the silhouette is not a slab.
  put(new THREE.BoxGeometry(0.07, 0.36, 0.085), -0.185, 0.64, 0, 0.13);
  put(new THREE.BoxGeometry(0.07, 0.36, 0.085), 0.185, 0.64, 0, -0.13);
  return mergeGeometries(parts, false)!;
}

const bodyGeo = buildBody();
const headGeo = new THREE.SphereGeometry(0.115, 9, 8);
// The knot ring: a flat annulus about fifteen feet across, drawn additively so
// it glows on a bright painted floor and simply vanishes when it goes out.
const ringGeo = new THREE.RingGeometry(1.15, 1.5, 40);
ringGeo.rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
  side: THREE.DoubleSide,
});
const RING_LIT = new THREE.Color("#ffc34d");
const cloth = new THREE.MeshStandardMaterial({ roughness: 0.9 });
const skin = new THREE.MeshStandardMaterial({ roughness: 0.85 });

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3(1, 1, 1);
const _euler = new THREE.Euler();
const _col = new THREE.Color();

export function Crowd({
  map,
  projection,
  fog,
}: {
  map: MapDef;
  projection: TableProjection;
  fog: Fog | null;
}) {
  const { crowd, knots } = useMemo(() => {
    const seen = (x: number, z: number) =>
      !fog || fog.revealed(x / map.w + 0.5, z / map.h + 0.5);
    const all = people(map, projection);
    // Under fog only the revealed part of the festival is built.
    return {
      crowd: all.crowd.filter((c) => seen(c.x, c.z)),
      knots: all.knots.filter((k) => seen(k.x, k.z)),
    };
  }, [map, projection, fog]);

  const bodies = useRef<THREE.InstancedMesh>(null);
  const heads = useRef<THREE.InstancedMesh>(null);
  const rings = useRef<THREE.InstancedMesh>(null);
  const n = crowd.length;
  const k = knots.length;

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

  // A ring's brightness and size are the knot's count, so they only move when
  // somebody goes down or gets back up.
  useLayoutEffect(() => {
    const mesh = rings.current;
    if (!mesh) return;
    for (let i = 0; i < knots.length; i++) {
      const kn = knots[i];
      const frac = kn.standing / kn.start;
      _pos.set(kn.x, 0.04, kn.z);
      const size = 0.72 + 0.28 * frac;
      mesh.setMatrixAt(
        i,
        _m.compose(_pos, _q.identity(), _scl.set(size, 1, size)),
      );
      // Additive blending means a black ring is an absent one.
      _col.copy(RING_LIT).multiplyScalar(frac <= 0 ? 0 : 0.28 + 0.72 * frac);
      mesh.setColorAt(i, _col);
    }
    _scl.set(1, 1, 1);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [knots]);

  useFrame(({ clock }) => {
    if (!bodies.current || !heads.current) return;
    const t = clock.elapsedTime;
    for (let i = 0; i < n; i++) {
      const c = crowd[i];
      const h = c.size;
      _scl.set(h, h, h);
      let headY: number;
      if (c.state === "up") {
        // Standing: a slow breath, and a little sway while they watch the games.
        const bob = Math.sin(t * 1.6 + c.phase) * 0.018;
        _euler.set(0, c.yaw + Math.sin(t * 0.5 + c.phase) * 0.12, 0);
        _pos.set(c.x, bob, c.z);
        headY = 0.9 * h + bob;
      } else {
        // Down: face to the boards, and staying there.
        _euler.set(Math.PI / 2, c.yaw, 0);
        _pos.set(c.x, 0.12 * h, c.z);
        headY = 0.115 * h;
      }
      _q.setFromEuler(_euler);
      bodies.current.setMatrixAt(i, _m.compose(_pos, _q, _scl));
      // The head rides the body: on the shoulders, or out front when down.
      if (c.state === "up") _pos.set(c.x, headY, c.z);
      else _pos.set(c.x + Math.sin(c.yaw) * 0.62 * h, headY, c.z + Math.cos(c.yaw) * 0.62 * h);
      heads.current.setMatrixAt(i, _m.compose(_pos, _q, _scl));
    }
    _scl.set(1, 1, 1);
    bodies.current.instanceMatrix.needsUpdate = true;
    heads.current.instanceMatrix.needsUpdate = true;
  });

  if (n === 0 && k === 0) return null;
  return (
    <group>
      {k > 0 && (
        <instancedMesh
          ref={rings}
          args={[ringGeo, ringMat, k]}
          key={`r${k}`}
          frustumCulled={false}
          renderOrder={2}
        />
      )}
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
