import { useTexture } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

/** The CC0 Poly Haven sets in public/engine/tex — diffuse, normal (GL), roughness. */
export type PbrName = "wall" | "floor" | "planks" | "rock" | "dirt" | "sand" | "bamboo";

export interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/**
 * Load one PBR set, tiled `repeat` times across whatever it's put on.
 *
 * The loaded textures are shared by the loader cache, so they are cloned
 * before being configured — a clone shares the image data, so it costs only
 * the GPU upload, and it leaves the cached originals alone.
 */
export function usePbr(name: PbrName, repeat: [number, number]): PbrSet {
  const loaded = useTexture({
    map: `/engine/tex/${name}_diff.jpg`,
    normalMap: `/engine/tex/${name}_nor.jpg`,
    roughnessMap: `/engine/tex/${name}_rough.jpg`,
  });
  const [rx, ry] = repeat;
  return useMemo(() => {
    const prep = (t: THREE.Texture, colorSpace: string) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(rx, ry);
      c.anisotropy = 8;
      c.colorSpace = colorSpace;
      c.needsUpdate = true;
      return c;
    };
    return {
      map: prep(loaded.map, THREE.SRGBColorSpace),
      normalMap: prep(loaded.normalMap, THREE.NoColorSpace),
      roughnessMap: prep(loaded.roughnessMap, THREE.NoColorSpace),
    };
  }, [loaded, rx, ry]);
}
