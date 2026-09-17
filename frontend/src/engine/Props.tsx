import { Clone, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

import { usePbr } from "./materials";
import { toWorld } from "./tavern";

/**
 * Furniture for the tavern (Plan 108, second pass).
 *
 * Justin: "show me some furniture or a bar in the second one." The pieces are
 * Poly Haven photoscans — CC0, real materials, loaded from their CDN for the
 * spike the way the placeholder character is. Placed where the painter put
 * them, so the same layout can stand on the painted floor or the built one.
 *
 * Poly Haven models are in metres; one world unit is five feet.
 */
const M = 1 / 1.524;
const CDN = "https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k";
const url = (name: string) => `${CDN}/${name}/${name}_1k.gltf`;

// Poly Haven's glTFs reference `textures/x.jpg` beside the model, but the CDN
// keeps the JPEGs in a separate tree (Models/jpg/1k/<model>/x.jpg). Without
// this every prop loads untextured and silently flat. Scoped to that one host
// and path shape, so nothing else the app loads is touched.
const PH_TEXTURE = /^(https:\/\/dl\.polyhaven\.org\/file\/ph-assets\/Models)\/gltf\/\dk\/([^/]+)\/textures\/(.+)$/;
THREE.DefaultLoadingManager.setURLModifier((u) => u.replace(PH_TEXTURE, "$1/jpg/1k/$2/$3"));

type Piece = { model: string; u: number; v: number; rot?: number; y?: number };

/** Three seats round a table, in map units (0.6 of a cell out). */
const seatsAround = (u: number, v: number): Piece[] => [
  { model: "wooden_stool_01", u: u - 0.018, v, rot: Math.PI / 2 },
  { model: "wooden_stool_01", u: u + 0.018, v, rot: -Math.PI / 2 },
  { model: "wooden_stool_01", u, v: v + 0.013, rot: Math.PI },
];

const ROUND_TABLES: [number, number][] = [
  [0.335, 0.301],
  [0.45, 0.306],
  [0.359, 0.386],
  [0.6, 0.384],
];

const TAVERN_PROPS: Piece[] = [
  ...ROUND_TABLES.map(([u, v]) => ({ model: "round_wooden_table_01", u, v })),
  ...ROUND_TABLES.flatMap(([u, v]) => seatsAround(u, v)),
  // Long tables with stools along them, down the left side and on the right.
  { model: "wooden_table_02", u: 0.185, v: 0.286, rot: Math.PI / 2 },
  { model: "wooden_stool_01", u: 0.206, v: 0.28, rot: -Math.PI / 2 },
  { model: "wooden_stool_01", u: 0.206, v: 0.293, rot: -Math.PI / 2 },
  { model: "wooden_table_02", u: 0.185, v: 0.372, rot: Math.PI / 2 },
  { model: "wooden_stool_01", u: 0.206, v: 0.366, rot: -Math.PI / 2 },
  { model: "wooden_stool_01", u: 0.206, v: 0.379, rot: -Math.PI / 2 },
  { model: "wooden_table_02", u: 0.607, v: 0.281, rot: Math.PI / 2 },
  { model: "wooden_stool_01", u: 0.586, v: 0.275, rot: Math.PI / 2 },
  { model: "wooden_stool_01", u: 0.586, v: 0.288, rot: Math.PI / 2 },
  // Barrels and crates: the cluster bottom-left, a loose one, two by the hearth.
  { model: "wine_barrel_01", u: 0.27, v: 0.395, rot: 0.4 },
  { model: "wooden_crate_02", u: 0.292, v: 0.402, rot: 1.1 },
  { model: "wine_barrel_01", u: 0.312, v: 0.39, rot: 2.3 },
  { model: "wine_barrel_01", u: 0.338, v: 0.372, rot: 1.7 },
  { model: "wooden_crate_02", u: 0.29, v: 0.291, rot: 0.2 },
  { model: "wine_barrel_01", u: 0.495, v: 0.294, rot: 2.9 },
  // The bar: a cabinet against the wall, barrels beside it, stools in front.
  { model: "GothicCabinet_01", u: 0.575, v: 0.2455, rot: 0 },
  { model: "wine_barrel_01", u: 0.518, v: 0.247, rot: 0.9 },
  { model: "wine_barrel_01", u: 0.632, v: 0.247, rot: 2.2 },
  { model: "wooden_stool_01", u: 0.55, v: 0.266, rot: 0 },
  { model: "wooden_stool_01", u: 0.575, v: 0.266, rot: 0 },
  { model: "wooden_stool_01", u: 0.6, v: 0.266, rot: 0 },
  { model: "jug_01", u: 0.562, v: 0.257, y: 0.7 },
  { model: "wooden_bowl_01", u: 0.59, v: 0.257, y: 0.7 },
];

for (const name of new Set(TAVERN_PROPS.map((p) => p.model))) useGLTF.preload(url(name));

function Prop({ model, u, v, rot = 0, y = 0 }: Piece) {
  const { scene } = useGLTF(url(model));
  const [x, z] = toWorld(u, v);
  return (
    <Clone
      object={scene}
      position={[x, y, z]}
      rotation={[0, rot, 0]}
      scale={M}
      castShadow
      receiveShadow
    />
  );
}

/** The bar counter itself: nothing on Poly Haven is a bar, so this one is built. */
function BarCounter() {
  const planks = usePbr("planks", [3, 1]);
  const [x, z] = toWorld(0.575, 0.257);
  const len = 0.14 * 33; // 4.6 units, along the wall
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
 * The hearth: a stone semicircle against the top wall where the painter put
 * one, with coals that bloom and a fire that flickers red where the torches
 * flicker orange. The light is the point; the stone is there to catch it.
 */
export function Hearth() {
  const stone = usePbr("wall", [2, 1]);
  const fire = useRef<THREE.PointLight>(null);
  const coals = useRef<THREE.Mesh>(null);
  const [x, z] = toWorld(0.389, 0.253);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 7;
    const f = 0.8 + 0.2 * (Math.sin(t * 1.3) * 0.5 + Math.sin(t * 3.7) * 0.3 + Math.sin(t * 8.1) * 0.2);
    if (fire.current) fire.current.intensity = 26 * f;
    if (coals.current) (coals.current.material as THREE.MeshBasicMaterial).color.setRGB(2.4 * f, 0.8 * f, 0.2);
  });
  return (
    <group position={[x, 0, z]}>
      {/* chimney breast against the wall */}
      <mesh position={[0, 1.0, -0.42]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 2.0, 0.5]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#7d7770" roughness={1} />
      </mesh>
      {/* the low semicircular hearth */}
      <mesh position={[0, 0.16, 0]} rotation={[0, Math.PI, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.5, 1.6, 0.32, 24, 1, false, 0, Math.PI]} />
        <meshStandardMaterial map={stone.map} normalMap={stone.normalMap} roughnessMap={stone.roughnessMap} color="#6f6a63" roughness={1} />
      </mesh>
      {/* coals, with logs lying across them */}
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

/** Every piece in the taproom, plus the bar and the hearth. */
export function TavernProps() {
  return (
    <group>
      {TAVERN_PROPS.map((p, i) => (
        <Prop key={i} {...p} />
      ))}
      <BarCounter />
      <Hearth />
    </group>
  );
}
