import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

/**
 * A flame (Plan 113, the Wednesday push): a card that always faces the camera
 * about its own upright axis, drawn by a shader — layered noise scrolling up
 * through a teardrop mask, white-hot at the core, the torch's colour at the
 * edge, additive so the bloom catches it. Replaces the glowing sphere that
 * stood in for fire since Plan 108. One draw, no texture, no file.
 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uSeed;
  varying vec2 vUv;
  // Value noise, three octaves — enough for fire at table distance.
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  float fbm(vec2 p) {
    return 0.5 * noise(p) + 0.25 * noise(p * 2.1 + 7.0) + 0.125 * noise(p * 4.3 + 19.0);
  }
  void main() {
    vec2 uv = vUv;
    // The flame's body: a teardrop, wide at the base, narrowing to the tip, that the noise gnaws at.
    float x = (uv.x - 0.5) * 2.0;
    float y = uv.y;
    float n = fbm(vec2(x * 2.2 + uSeed, y * 3.0 - uTime * 2.4));
    float n2 = fbm(vec2(x * 4.0 - uSeed, y * 5.0 - uTime * 3.6));
    float width = 0.85 * (1.0 - y) * (0.55 + 0.45 * sqrt(y)) + 0.02;
    float edge = abs(x) + (n - 0.5) * 0.55 * (0.3 + y) + (n2 - 0.5) * 0.18;
    float body = smoothstep(width, width - 0.28, edge);
    // Fade at the tip and a little at the base, so it never cuts off square.
    body *= smoothstep(1.0, 0.72, y) * smoothstep(0.0, 0.08, y);
    if (body <= 0.003) discard;
    // Core to edge: white-hot, then the torch's colour, then a deep red rim.
    float core = smoothstep(width * 0.9, 0.0, edge) * (1.0 - y * 0.6);
    vec3 col = mix(uColor * 0.8, vec3(1.0, 0.93, 0.75), core);
    col = mix(vec3(0.6, 0.12, 0.02), col, smoothstep(0.0, 0.35, body));
    // Past white for the bloom.
    gl_FragColor = vec4(col * (1.6 + 1.6 * core) * body, body);
  }
`;

export function Flame({ height = 0.42, width = 0.26, color = "#ff9a3c", seed = 0, lift = 0 }: { height?: number; width?: number; color?: string; seed?: number; lift?: number }) {
  const mesh = useRef<THREE.Mesh>(null);
  const camera = useThree((s) => s.camera);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uSeed: { value: seed } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    // A torch keeps its colour and seed for life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    material.uniforms.uTime.value = clock.elapsedTime + seed;
    // Face the camera about the upright axis only, so the fire never lies down.
    const dx = camera.position.x - m.getWorldPosition(_p).x;
    const dz = camera.position.z - _p.z;
    m.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <mesh ref={mesh} material={material} position={[0, lift + height / 2, 0]} renderOrder={5} frustumCulled={false}>
      <planeGeometry args={[width, height]} />
    </mesh>
  );
}
const _p = new THREE.Vector3();
