import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { useQuality } from "./quality";

/**
 * A wall torch: a bracket, a flame the bloom pass picks up, and a point light
 * that flickers (Plan 108). This is the light everything else is lit by —
 * floor, walls and character together — which is the whole design rule.
 *
 * Torches no longer cast shadows: six renders each pinned the CPU. One directional
 * key light in the scene casts the room's shadows instead.
 */
export function Torch({
  position,
  shadow = false,
  intensity = 34,
  post = false,
  candle = false,
  color = "#ff9a3c",
}: {
  position: [number, number, number];
  shadow?: boolean;
  intensity?: number;
  /** A lantern on a pole standing on its own, rather than a sconce on a wall. */
  post?: boolean;
  /** A candle: a stub of wax, a small flame, a short warm light, no shaft, no shadow. */
  candle?: boolean;
  /** Torchlight unless said otherwise — a witch's lamp burns another colour. */
  color?: string;
}) {
  // The flame is the light's colour, pushed past white so the bloom catches it.
  const flame = new THREE.Color(color).multiplyScalar(5);
  const light = useRef<THREE.PointLight>(null);
  // Fast mode (Plan 113): no torch casts — six renders each is the first thing to go.
  const { fast } = useQuality();
  // `shadow` is kept on the map data for the day this comes back; today no torch casts.
  void shadow;
  void fast;
  const flameMesh = useRef<THREE.Mesh>(null);
  // The shaft: a faint additive cone of light falling from the flame, reading as light in the steam.
  const shaft = useRef<THREE.Mesh>(null);
  const shaftColor = new THREE.Color(color).multiplyScalar(1.6);
  // Each torch flickers on its own beat, seeded by where it hangs.
  const seed = position[0] * 7.3 + position[2] * 3.1;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + seed;
    const f = 0.86 + 0.14 * (Math.sin(t) * 0.5 + Math.sin(t * 2.3) * 0.3 + Math.sin(t * 5.1) * 0.2);
    if (light.current) light.current.intensity = intensity * f;
    if (flameMesh.current) flameMesh.current.scale.setScalar(0.9 + 0.2 * f);
    if (shaft.current) (shaft.current.material as THREE.MeshBasicMaterial).opacity = 0.028 + 0.018 * f;
  });
  return (
    <group position={position}>
      {candle ? (
        <mesh position={[0, -0.05, 0]}>
          <cylinderGeometry args={[0.022, 0.026, 0.09, 8]} />
          <meshStandardMaterial color="#e9d9b8" roughness={0.9} />
        </mesh>
      ) : post ? (
        <mesh position={[0, -position[1] / 2 - 0.05, 0]} castShadow>
          <cylinderGeometry args={[0.04, 0.06, position[1] - 0.1, 7]} />
          <meshStandardMaterial color="#2c2018" roughness={1} />
        </mesh>
      ) : (
        <mesh position={[0, -0.16, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.26, 7]} />
          <meshStandardMaterial color="#2c2018" roughness={1} />
        </mesh>
      )}
      <mesh ref={flameMesh} position={[0, candle ? 0.02 : 0, 0]}>
        <sphereGeometry args={[candle ? 0.03 : 0.1, 10, 10]} />
        <meshBasicMaterial color={flame} toneMapped={false} />
      </mesh>
      <mesh ref={shaft} position={[0, -1.0, 0]} renderOrder={4} visible={!candle}>
        <coneGeometry args={[0.7, 2.0, 24, 1, true]} />
        <meshBasicMaterial color={shaftColor} transparent blending={THREE.AdditiveBlending} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} opacity={0.03} />
      </mesh>
      <pointLight
        ref={light}
        color={color}
        intensity={intensity}
        distance={candle ? 4.5 : 18}
        decay={2}
        castShadow={false}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.003}
        shadow-radius={3}
      />
    </group>
  );
}
