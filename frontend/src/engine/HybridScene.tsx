import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { MapDef } from "./maps";
import { normalMapFromImage } from "./normalMap";

/**
 * The painted map as the ground — the hybrid's floor (Plan 108).
 *
 * The map is albedo, not a finished picture: ambient is kept low so the torches
 * dominate and the painter's baked shading recedes, and a normal map made from
 * the image itself lets the light catch on the flagstones. Walls, torches and
 * the character are shared with the built scene; only this floor differs.
 */
export function HybridFloor({ map, url, onClick }: { map: MapDef; url: string; onClick: (p: THREE.Vector3) => void }) {
  const loaded = useTexture(url);
  // The loader caches its texture; configure a clone and leave the cache alone.
  const tex = useMemo(() => {
    const c = loaded.clone();
    c.colorSpace = THREE.SRGBColorSpace;
    c.anisotropy = 8;
    c.needsUpdate = true;
    return c;
  }, [loaded]);
  const [normal, setNormal] = useState<THREE.CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    normalMapFromImage(url, 1024, 1.4)
      .then((t) => {
        if (live) setNormal(t);
      })
      .catch(() => {
        /* the floor still works flat */
      });
    return () => {
      live = false;
    };
  }, [url]);
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      onClick={(e) => {
        e.stopPropagation();
        onClick(e.point);
      }}
    >
      <planeGeometry args={[map.w, map.h]} />
      <meshStandardMaterial
        map={tex}
        normalMap={normal ?? undefined}
        normalScale={new THREE.Vector2(0.45, 0.45)}
        roughness={0.92}
        metalness={0}
      />
    </mesh>
  );
}
