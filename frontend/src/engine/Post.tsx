import { Bloom, DepthOfField, EffectComposer, N8AO, SMAA, Vignette } from "@react-three/postprocessing";
import type * as THREE from "three";

/**
 * The post stack (Plan 112), in the order the image is built: ambient
 * occlusion on the raw frame so feet and wall bases get contact shadow, bloom
 * for the flames, the director's focus pull when a figure is framed, the
 * vignette, and anti-aliasing last (SMAA, in place of MSAA — multisampling
 * and screen-space AO do not mix).
 *
 * Depth of field is in world units in this postprocessing (6.36+): `focusRange` is
 * how many units either side of the target stay sharp — 3 units is 15 ft, a room.
 *
 * `focus` is the world point the camera is looking at when it matters — the
 * active figure's chest. With `cinema` off there is no depth of field at all,
 * for a DM who wants every corner sharp.
 */
export function Post({ focus, cinema = true }: { focus: THREE.Vector3 | [number, number, number] | null; cinema?: boolean }) {
  const target = focus && "x" in (focus as THREE.Vector3) ? ([(focus as THREE.Vector3).x, (focus as THREE.Vector3).y, (focus as THREE.Vector3).z] as [number, number, number]) : (focus as [number, number, number] | null);
  return (
    <EffectComposer multisampling={0}>
      <N8AO aoRadius={0.6} intensity={3} distanceFalloff={0.9} quality="medium" halfRes />
      <Bloom luminanceThreshold={1} mipmapBlur intensity={0.85} radius={0.7} />
      {cinema && target ? <DepthOfField target={target} focusRange={3} bokehScale={2.2} /> : <></>}
      <Vignette eskil={false} offset={0.22} darkness={0.8} />
      <SMAA />
    </EffectComposer>
  );
}
