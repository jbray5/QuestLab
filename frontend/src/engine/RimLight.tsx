import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

/**
 * A rim light (Plan 113, the Wednesday push): a cool light from behind and
 * above whatever the camera looks at, moving with the view, so a figure's
 * shoulders and hair carry a thin bright edge that lifts them off the floor.
 * Games do this for every character; here one light does it for the room,
 * since every figure is lit from the same side of the same view. No shadow.
 */
export function RimLight({ intensity = 0.9, color = "#a9c4ff" }: { intensity?: number; color?: string }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3 } | null;
  useFrame(() => {
    const l = light.current;
    const a = anchor.current;
    if (!l || !a) return;
    const tgt = controls?.target ?? _zero;
    // Behind the subject as seen from the camera, and high: the classic three-quarter back light.
    _dir.subVectors(tgt, camera.position);
    _dir.y = 0;
    if (_dir.lengthSq() < 1e-6) _dir.set(0, 0, 1);
    _dir.normalize();
    a.position.copy(tgt);
    l.position.set(tgt.x + _dir.x * 6 - _dir.z * 2.5, tgt.y + 7, tgt.z + _dir.z * 6 + _dir.x * 2.5);
    l.target = a;
  });
  return (
    <>
      <object3D ref={anchor} />
      <directionalLight ref={light} intensity={intensity} color={color} />
    </>
  );
}
const _dir = new THREE.Vector3();
const _zero = new THREE.Vector3();
