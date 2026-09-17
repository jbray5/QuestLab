import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * A character who walks where you point (Plan 108).
 *
 * The placeholder is three.js's Soldier — real proportions, Idle/Walk clips —
 * loaded from a CDN for the spike only; the party's own models come from the
 * Character Creator pipeline in Milestone 3. What matters here is the rule
 * the model obeys: a move is a *walk*, with a turn to face the way, a walk
 * cycle while under way, and a settle into idle on arrival.
 */
const SOLDIER = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Soldier.glb";
/** One unit is five feet; a six-foot human is 1.2 units. The model is ~1.8 tall. */
const SCALE = 0.66;
const SPEED = 1.5; // units per second — a brisk walk
/** The Soldier faces -Z; flip the yaw so it walks forward, not backward. */
const FACING = Math.PI;

export function Walker({ start, target }: { start: [number, number]; target: THREE.Vector3 | null }) {
  const group = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(SOLDIER);
  const { actions } = useAnimations(animations, group);
  const walking = useRef(false);
  const pos = useRef(new THREE.Vector3(start[0], 0, start[1]));
  const yaw = useRef(0);

  useEffect(() => {
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    actions.Idle?.reset().play();
  }, [scene, actions]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const p = pos.current;
    if (target) {
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 0.08) {
        if (!walking.current) {
          walking.current = true;
          actions.Idle?.fadeOut(0.2);
          actions.Walk?.reset().fadeIn(0.2).play();
        }
        const step = Math.min(dist, SPEED * dt);
        p.x += (dx / dist) * step;
        p.z += (dz / dist) * step;
        // Turn toward the way, smoothly.
        const want = Math.atan2(dx, dz) + FACING;
        let d = want - yaw.current;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw.current += d * Math.min(1, dt * 10);
      } else if (walking.current) {
        walking.current = false;
        actions.Walk?.fadeOut(0.25);
        actions.Idle?.reset().fadeIn(0.25).play();
      }
    }
    g.position.copy(p);
    g.rotation.y = yaw.current;
  });

  return (
    <group ref={group} scale={SCALE}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(SOLDIER);
