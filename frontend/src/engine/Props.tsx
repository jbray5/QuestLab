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
  if (piece.model.startsWith("built:")) return <Built map={map} piece={piece} />;
  return <Model map={map} piece={piece} />;
}

/**
 * Pieces built from primitives (Plan 113, the Wednesday push) — what a palace
 * needs and no CDN carries. `tint` colours them, `h` sets their height, `scale`
 * their footprint. A column is a fluted stone shaft with a base and a cap; a
 * banner hangs from a rod; a throne is a high-backed seat in gold and cloth; a
 * dome is a ring of columns under a hemisphere.
 */
function Built({ map, piece }: { map: MapDef; piece: Piece }) {
  const [x, z] = toWorld(map, piece.u, piece.v);
  const kind = piece.model.slice(6);
  const s = piece.scale ?? 1;
  const stone = usePbr("sandstone", [1, 2]);
  if (kind === "column") {
    const h = piece.h ?? 2.6;
    return (
      <group position={[x, 0, z]} scale={[s, 1, s]}>
        <mesh position={[0, 0.08, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.16, 12]} />
          <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color={piece.tint ?? "#d8cdb8"} roughness={1} />
        </mesh>
        <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.2, 0.23, h, 14]} />
          <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color={piece.tint ?? "#d8cdb8"} roughness={1} />
        </mesh>
        <mesh position={[0, h - 0.08, 0]} castShadow>
          <cylinderGeometry args={[0.32, 0.22, 0.16, 12]} />
          <meshStandardMaterial color={piece.tint ?? "#d8cdb8"} roughness={0.9} />
        </mesh>
      </group>
    );
  }
  if (kind === "banner") {
    const h = piece.h ?? 2.3;
    return (
      <group position={[x, 0, z]} rotation={[0, piece.rot ?? 0, 0]}>
        <mesh position={[0, h, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.02, 0.02, 0.8 * s, 6]} />
          <meshStandardMaterial color="#5a4a2a" roughness={0.9} />
        </mesh>
        <mesh position={[0, h - 0.8 * s, 0]} castShadow receiveShadow>
          <planeGeometry args={[0.7 * s, 1.6 * s]} />
          <meshStandardMaterial color={piece.tint ?? "#5a2a7a"} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, h - 0.8 * s, 0.006]}>
          <planeGeometry args={[0.7 * s * 0.55, 1.6 * s * 0.28]} />
          <meshStandardMaterial color="#d6af36" roughness={0.5} metalness={0.6} side={THREE.DoubleSide} />
        </mesh>
      </group>
    );
  }
  if (kind === "throne") {
    const gold = { color: "#c9a23a", roughness: 0.32, metalness: 0.85 };
    const cloth = { color: piece.tint ?? "#7a1a2a", roughness: 0.85, metalness: 0 };
    return (
      <group position={[x, 0, z]} rotation={[0, piece.rot ?? 0, 0]} scale={s}>
        {/* a low dais of pale stone with a gold lip */}
        <mesh position={[0, 0.05, 0]} receiveShadow>
          <cylinderGeometry args={[0.95, 1.0, 0.1, 24]} />
          <meshStandardMaterial color="#e6dccb" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0.1, 0]}>
          <torusGeometry args={[0.95, 0.02, 8, 48]} />
          <meshStandardMaterial {...gold} />
        </mesh>
        {/* the seat: gold frame, cloth cushion, curved arms, a tall back that ends in a crest */}
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.7, 0.36, 0.6]} />
          <meshStandardMaterial {...gold} />
        </mesh>
        <mesh position={[0, 0.52, 0.02]} castShadow>
          <boxGeometry args={[0.6, 0.09, 0.52]} />
          <meshStandardMaterial {...cloth} />
        </mesh>
        <mesh position={[0, 1.0, -0.26]} castShadow receiveShadow>
          <boxGeometry args={[0.62, 1.3, 0.1]} />
          <meshStandardMaterial {...gold} />
        </mesh>
        <mesh position={[0, 1.0, -0.2]}>
          <boxGeometry args={[0.5, 1.1, 0.03]} />
          <meshStandardMaterial {...cloth} />
        </mesh>
        <mesh position={[0, 1.7, -0.26]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.31, 0.31, 0.1, 24, 1, false, 0, Math.PI]} />
          <meshStandardMaterial {...gold} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.95, -0.26]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshStandardMaterial color="#3fd28a" roughness={0.2} emissive="#1a8a4a" emissiveIntensity={0.5} />
        </mesh>
        {[-0.36, 0.36].map((dx) => (
          <mesh key={dx} position={[dx, 0.66, 0.02]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.04, 0.04, 0.56, 10]} />
            <meshStandardMaterial {...gold} />
          </mesh>
        ))}
        {[-0.36, 0.36].map((dx) => (
          <mesh key={`p${dx}`} position={[dx, 0.5, 0.26]} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 0.36, 10]} />
            <meshStandardMaterial {...gold} />
          </mesh>
        ))}
      </group>
    );
  }
  if (kind === "chalk") {
    // A ring chalked on the flagstones for the King of the Ring: flat, matte,
    // and just bright enough to read against a painted floor.
    return (
      <group position={[x, 0.03, z]} scale={s}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <ringGeometry args={[1.88, 2.0, 48]} />
          <meshBasicMaterial color="#f3ece0" transparent opacity={0.75} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <ringGeometry args={[0.24, 0.3, 24]} />
          <meshBasicMaterial color="#f3ece0" transparent opacity={0.45} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (kind === "dome") {
    const r = 1.9 * s;
    const h = piece.h ?? 2.8;
    return (
      <group position={[x, 0, z]}>
        {Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <mesh key={i} position={[Math.cos(a) * r, h / 2, Math.sin(a) * r]} castShadow receiveShadow>
              <cylinderGeometry args={[0.16, 0.19, h, 12]} />
              <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color={piece.tint ?? "#d8cdb8"} roughness={1} />
            </mesh>
          );
        })}
        <mesh position={[0, h, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[r + 0.3, r + 0.3, 0.18, 32]} />
          <meshStandardMaterial color={piece.tint ?? "#d8cdb8"} roughness={0.9} />
        </mesh>
        <mesh position={[0, h + 0.09, 0]} castShadow>
          <sphereGeometry args={[r + 0.1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#3f5a4a" roughness={0.6} metalness={0.3} />
        </mesh>
        <mesh position={[0, h + r + 0.15, 0]}>
          <sphereGeometry args={[0.16, 12, 12]} />
          <meshStandardMaterial color="#d6af36" roughness={0.4} metalness={0.8} />
        </mesh>
      </group>
    );
  }
  return null;
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
