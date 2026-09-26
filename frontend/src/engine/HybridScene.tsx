import { useTexture } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import type { MapDef, Platform } from "./maps";
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
  const mat = (
    <meshStandardMaterial
      map={tex}
      normalMap={normal ?? undefined}
      normalScale={new THREE.Vector2(0.45, 0.45)}
      roughness={0.92}
      metalness={0}
    />
  );
  return (
    <>
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(e.point);
        }}
      >
        <planeGeometry args={[map.w, map.h]} />
        {mat}
      </mesh>
      {(map.platforms ?? []).map((p, i) => (
        <RaisedFloor key={i} map={map} plat={p} tex={tex} normal={normal} onClick={onClick} />
      ))}
    </>
  );
}

/**
 * One raised floor: the same painting, the same place on it, higher up.
 *
 * The slice of texture is chosen by rewriting the plane's UVs rather than
 * cropping the image, so every platform shares one texture and one upload.
 * A plain stone box underneath turns a floating slab into a step.
 */
function RaisedFloor({
  map,
  plat,
  tex,
  normal,
  onClick,
}: {
  map: MapDef;
  plat: Platform;
  tex: THREE.Texture;
  normal: THREE.CanvasTexture | null;
  onClick: (p: THREE.Vector3) => void;
}) {
  const w = (plat.u1 - plat.u0) * map.w;
  const d = (plat.v1 - plat.v0) * map.h;
  const cx = ((plat.u0 + plat.u1) / 2 - 0.5) * map.w;
  const cz = ((plat.v0 + plat.v1) / 2 - 0.5) * map.h;

  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(w, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      // The picture's v runs top-to-bottom; the texture's runs bottom-to-top.
      const lu = uv.getX(i);
      const lv = uv.getY(i);
      uv.setXY(i, plat.u0 + lu * (plat.u1 - plat.u0), 1 - plat.v1 + lv * (plat.v1 - plat.v0));
    }
    uv.needsUpdate = true;
    return g;
  }, [w, d, plat.u0, plat.u1, plat.v0, plat.v1]);

  return (
    <group position={[cx, 0, cz]}>
      {/* The riser: solid stone from the floor up to the platform's lip. */}
      <mesh position={[0, plat.h / 2, 0]} receiveShadow castShadow>
        <boxGeometry args={[w, plat.h, d]} />
        {/* Warm stone, well below the painting's own marble: a riser lit by
            the day rig blows out to white if it starts anywhere near it. */}
        <meshStandardMaterial color="#8d8474" roughness={0.95} metalness={0} />
      </mesh>
      {/* The painting again, at height. */}
      <mesh
        geometry={geo}
        position={[0, plat.h + 0.004, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onClick(e.point);
        }}
      >
        <meshStandardMaterial
          map={tex}
          normalMap={normal ?? undefined}
          normalScale={new THREE.Vector2(0.45, 0.45)}
          roughness={0.92}
          metalness={0}
        />
      </mesh>
    </group>
  );
}
