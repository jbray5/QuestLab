import { OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

import { analyzeFigure } from "../engine/figureModel";
import { FT_PER_UNIT } from "../engine/heights";
import { Walker } from "../engine/Walker";

/**
 * A rigged model, standing in a small lit box so the DM can see it before it
 * reaches the table (Plan 111): it idles and slowly turns; "Walk" makes it
 * pace, which is the honest test of a rig. Under it, what the file is —
 * the rig, its authored height, and whether it brought its own clips or will
 * borrow the engine's. Loaded lazily: this is the only place outside the
 * engine pages that pulls in three.js.
 */
const A = new THREE.Vector3(-1.1, 0, 0);
const B = new THREE.Vector3(1.1, 0, 0);

export default function FigurePreview({ url, heightFt }: { url: string; heightFt: number }) {
  const gltf = useGLTF(url, true, true);
  const info = useMemo(() => analyzeFigure(gltf), [gltf]);
  const [pacing, setPacing] = useState(false);
  const [target, setTarget] = useState(A);
  useEffect(() => {
    if (!pacing) return;
    const id = window.setInterval(() => setTarget((t) => (t === A ? B : A)), 2400);
    return () => window.clearInterval(id);
  }, [pacing]);
  const h = heightFt / FT_PER_UNIT;
  const rig =
    info.rig === "mixamo"
      ? "Mixamo rig — the table's walk, hit and fall apply"
      : info.rig === "humanoid"
        ? "Humanoid rig — the table's clips will try to bind by bone name"
        : "No humanoid rig — it will stand still";
  const clips = info.ownClips.length ? `own clips: ${info.ownClips.join(", ")}` : "no clips of its own";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", width: 240 }}>
      <div style={{ height: 250, borderRadius: "0.5rem", overflow: "hidden", background: "#0b0a10", border: "1px solid var(--border)" }}>
        <Canvas shadows={{ type: THREE.PCFShadowMap }} dpr={[1, 1.5]} camera={{ fov: 30, near: 0.05, far: 50, position: [2.4, 1.4, 2.8] }}>
          <color attach="background" args={["#0b0a10"]} />
          <hemisphereLight args={["#b9c8e6", "#4a3a2a", 0.7]} />
          <directionalLight position={[3, 6, 2]} intensity={1.8} color="#ffe2b8" castShadow shadow-mapSize={[1024, 1024]} />
          <Walker cell={pacing ? target : A} model={{ url, heightFt }} tint="#d6af36" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <circleGeometry args={[2.2, 48]} />
            <meshStandardMaterial color="#2a2530" roughness={0.95} />
          </mesh>
          <OrbitControls target={[0, h * 0.5, 0]} autoRotate={!pacing} autoRotateSpeed={0.9} enablePan={false} minDistance={1} maxDistance={8} />
        </Canvas>
      </div>
      <div style={{ fontSize: "0.7rem", color: "var(--muted)", lineHeight: 1.35 }}>
        <div>{rig}</div>
        <div>
          {info.rawHeight > 0 ? `${info.rawHeight.toFixed(2)} m in the file → ` : ""}
          stands {heightFt.toFixed(1)} ft on the table · {info.bones} bones · {clips}
        </div>
      </div>
      <button type="button" className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem", alignSelf: "flex-start" }} onClick={() => setPacing((p) => !p)}>
        {pacing ? "Stand" : "Walk"}
      </button>
    </div>
  );
}
