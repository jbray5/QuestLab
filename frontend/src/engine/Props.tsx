import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Component, type ReactNode, Suspense, useRef } from "react";
import * as THREE from "three";

import { modelUrl } from "./assets";
import type { MapDef, Piece } from "./maps";
import { toWorld } from "./maps";
import { usePbr } from "./materials";

/**
 * What stands in a map (Plan 108).
 *
 * A map's definition says what goes where; this file only knows how to stand
 * things up. The models come from assets.ts. Poly Haven models are in metres;
 * one world unit is five feet.
 */
const M = 1 / 1.524;

/** Letters left on a table: a few sheets, not quite squared up. */
function Papers({ map, piece }: { map: MapDef; piece: Piece }) {
  const [x, z] = toWorld(map, piece.u, piece.v);
  return (
    <group position={[x, (piece.y ?? 0) + 0.004, z]} rotation={[0, piece.rot ?? 0, 0]}>
      {[
        [0, 0, 0.0],
        [0.06, 0.03, 0.35],
        [-0.05, 0.05, -0.22],
        [0.02, -0.07, 0.12],
      ].map(([dx, dz, r], i) => (
        <mesh key={i} position={[dx, i * 0.002, dz]} rotation={[-Math.PI / 2, 0, r]} receiveShadow>
          <planeGeometry args={[0.2, 0.28]} />
          <meshStandardMaterial color="#e9dcc2" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

function Prop({ map, piece }: { map: MapDef; piece: Piece }) {
  if (piece.model === "papers") return <Papers map={map} piece={piece} />;
  return <Model map={map} piece={piece} />;
}

function Model({ map, piece }: { map: MapDef; piece: Piece }) {
  const { scene } = useGLTF(modelUrl(piece.model));
  const [x, z] = toWorld(map, piece.u, piece.v);
  return (
    <Clone
      object={scene}
      position={[x, piece.y ?? 0, z]}
      rotation={[piece.flip ? Math.PI : 0, piece.rot ?? 0, 0]}
      scale={M * (piece.scale ?? 1)}
      castShadow
      receiveShadow
    />
  );
}

/** An open fire: embers that bloom and a red light that never sits still. */
function Fire({ map, at }: { map: MapDef; at: [number, number] }) {
  const light = useRef<THREE.PointLight>(null);
  const coals = useRef<THREE.Mesh>(null);
  const [x, z] = toWorld(map, at[0], at[1]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 7 + x;
    const f = 0.75 + 0.25 * (Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.7) * 0.3 + Math.sin(t * 8.1) * 0.2);
    if (light.current) light.current.intensity = 30 * f;
    if (coals.current) (coals.current.material as THREE.MeshBasicMaterial).color.setRGB(1.9 * f, 0.42 * f, 0.08);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh ref={coals} position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.18, 16]} />
        <meshBasicMaterial color={[1.9, 0.42, 0.08]} toneMapped={false} />
      </mesh>
      <pointLight ref={light} position={[0, 0.7, 0]} color="#ff4a12" intensity={30} distance={12} decay={2} castShadow shadow-mapSize={[1024, 1024]} shadow-bias={-0.003} />
    </group>
  );
}

/** The bar counter itself: nothing on Poly Haven is a bar, so this one is built. */
function BarCounter({ map, at }: { map: MapDef; at: [number, number] }) {
  const planks = usePbr("planks", [3, 1]);
  const [x, z] = toWorld(map, at[0], at[1]);
  const len = 0.14 * map.w;
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[len, 0.68, 0.62]} />
        <meshStandardMaterial
          map={planks.map}
          normalMap={planks.normalMap}
          roughnessMap={planks.roughnessMap}
          color="#6a5140"
          roughness={1}
        />
      </mesh>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <boxGeometry args={[len + 0.12, 0.05, 0.78]} />
        <meshStandardMaterial
          map={planks.map}
          normalMap={planks.normalMap}
          roughnessMap={planks.roughnessMap}
          roughness={0.7}
        />
      </mesh>
    </group>
  );
}

/**
 * A hearth: a stone semicircle against a wall, coals that bloom, logs across
 * them, and a fire that flickers red where the torches flicker orange. The
 * light is the point; the stone is there to catch it.
 */
function Hearth({ map, at }: { map: MapDef; at: [number, number] }) {
  const stone = usePbr("wall", [2, 1]);
  const fire = useRef<THREE.PointLight>(null);
  const coals = useRef<THREE.Mesh>(null);
  const [x, z] = toWorld(map, at[0], at[1]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 7;
    const f = 0.8 + 0.2 * (Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.7) * 0.3 + Math.sin(t * 8.1) * 0.2);
    if (fire.current) fire.current.intensity = 26 * f;
    if (coals.current) (coals.current.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * f, 0.8 * f, 0.2);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.0, -0.42]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 2.0, 0.5]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#7d7770" roughness={1} />
      </mesh>
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.32, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#6f6a63" roughness={1} />
      </mesh>
      <mesh ref={coals} position={[0, 0.33, 0.42]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.42, 20]} />
        <meshBasicMaterial color={[2.4, 0.8, 0.2]} toneMapped={false} />
      </mesh>
      {[-0.35, 0.1, 0.5].map((r, i) => (
        <mesh key={i} position={[0, 0.4, 0.42]} rotation={[0, r, Math.PI / 2 - 0.15]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 0.8, 7]} />
          <meshStandardMaterial color="#1c1410" roughness={1} />
        </mesh>
      ))}
      <pointLight ref={fire} position={[0, 0.7, 0.5]} color="#ff5a1f" intensity={26} distance={14} decay={2} />
    </group>
  );
}

/** Everything a map's definition says stands in it. */
/**
 * One prop that fails to download (a CDN hiccup, a model that is not there at
 * this size) must not black out the room: it is simply absent. And one slow
 * file holds up only itself, not every table and stool.
 */
class PropBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.warn("a prop is missing:", error.message);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function MapProps({ map }: { map: MapDef }) {
  return (
    <group>
      {map.props.map((piece, i) => (
        <PropBoundary key={i}>
          <Suspense fallback={null}>
            <Prop map={map} piece={piece} />
          </Suspense>
        </PropBoundary>
      ))}
      {map.bar && <BarCounter map={map} at={map.bar} />}
      {map.hearth && <Hearth map={map} at={map.hearth} />}
      {map.fires?.map((f, i) => (
        <Fire key={i} map={map} at={f} />
      ))}
    </group>
  );
}
