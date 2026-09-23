import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The director (Plan 110): when the turn passes, the camera glides to whoever
 * is up, low and close — the way a table's attention actually moves. A hard
 * cut on a TV reads as a glitch; a glide reads as someone choosing the shot.
 *
 * It keeps whichever side of the figure the DM was already looking from, so
 * a glide never spins the room. `nonce` re-fires the same target ("frame the
 * turn"); `follow` false holds the camera wherever the DM left it.
 */
const GLIDE_S = 1.2;
// ~50° down: steep enough to see over the room's walls, low enough to read a face.
const DISTANCE = 5.2;
const HEIGHT = 6.2;

export function Director({
  at,
  nonce,
  follow,
  focus = null,
  kick = null,
}: {
  at: THREE.Vector3 | null;
  nonce: number;
  follow: boolean;
  /** A spot the viewer asked to look at (a double-click on the floor); glides there when its nonce changes. */
  focus?: { at: THREE.Vector3; nonce: number } | null;
  /** A blow landing (performance.now): the camera takes a small, quick kick, the way a shoulder-cam does. */
  kick?: { at: number; strength: number } | null;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const glide = useRef<{ t: number; fromPos: THREE.Vector3; fromTgt: THREE.Vector3; toPos: THREE.Vector3; toTgt: THREE.Vector3 } | null>(null);
  const last = useRef<string>("");
  const lastFocus = useRef(0);
  const kickOff = useRef(new THREE.Vector3());
  const kickDir = useRef<{ at: number; x: number; y: number; z: number }>({ at: 0, x: 0, y: 0, z: 0 });

  useEffect(() => {
    if (!controls) return;
    let target: THREE.Vector3 | null = null;
    if (focus && focus.nonce !== lastFocus.current) {
      lastFocus.current = focus.nonce;
      target = focus.at;
    } else {
      if (!at) return;
      const key = `${at.x},${at.z},${nonce}`;
      if (key === last.current) return;
      last.current = key;
      if (!follow && nonce === 0) return;
      target = at;
    }
    const toTgt = new THREE.Vector3(target.x, 0.7, target.z);
    // Keep the DM's current bearing; only the distance and height are ours.
    const dir = new THREE.Vector3().subVectors(camera.position, controls.target);
    dir.y = 0;
    if (dir.lengthSq() < 0.01) dir.set(0.4, 0, 1);
    dir.normalize();
    const toPos = toTgt.clone().addScaledVector(dir, DISTANCE);
    toPos.y = HEIGHT;
    glide.current = { t: 0, fromPos: camera.position.clone(), fromTgt: controls.target.clone(), toPos, toTgt };
  }, [at, nonce, follow, focus, camera, controls]);

  useFrame((_, dt) => {
    // The kick: a decaying shiver along one direction for a quarter second, undone frame by frame.
    camera.position.sub(kickOff.current);
    kickOff.current.set(0, 0, 0);
    if (kick) {
      const age = performance.now() - kick.at;
      if (age >= 0 && age < 260) {
        if (kickDir.current.at !== kick.at) {
          const a = Math.random() * Math.PI * 2;
          kickDir.current = { at: kick.at, x: Math.cos(a), y: 0.5, z: Math.sin(a) };
        }
        const f = 1 - age / 260;
        const amp = kick.strength * f * f * Math.sin((age / 1000) * Math.PI * 2 * 16);
        kickOff.current.set(kickDir.current.x * amp, kickDir.current.y * amp, kickDir.current.z * amp);
        camera.position.add(kickOff.current);
      }
    }
    const g = glide.current;
    if (!g || !controls) return;
    g.t = Math.min(1, g.t + dt / GLIDE_S);
    // Ease in and out.
    const k = g.t < 0.5 ? 2 * g.t * g.t : 1 - Math.pow(-2 * g.t + 2, 2) / 2;
    camera.position.lerpVectors(g.fromPos, g.toPos, k);
    controls.target.lerpVectors(g.fromTgt, g.toTgt, k);
    controls.update();
    if (g.t >= 1) glide.current = null;
  });
  return null;
}
