import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * The table's camera keys, matched to TaleSpire's so a player who knows one
 * knows the other (Plan 111 follow-up):
 *
 *   W A S D / arrows   move the view across the board
 *   Q / E              turn the view
 *   wheel              zoom (OrbitControls)
 *   left drag          orbit · middle drag  orbit · right drag  pan   (OrbitControls)
 *   F2                 back to the board's own view
 *
 * Space (interface), Tab (names), F1 (help) and double-click (focus) are the
 * page's, since they touch HTML; this component only drives the camera.
 * Keys never fire while typing in a field.
 */
const PAN_PER_S = 0.9; // fraction of the camera's distance, per second
const TURN_PER_S = Math.PI * 0.6;

function typing(): boolean {
  const el = document.activeElement as HTMLElement | null;
  const tag = el?.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable;
}

export function CameraKeys({ home, homeNonce }: { home: { eye: [number, number, number]; look: THREE.Vector3 }; homeNonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;
  const held = useRef(new Set<string>());

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["w", "a", "s", "d", "q", "e", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) {
        held.current.add(k);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      held.current.delete(k);
    };
    const blur = () => held.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // F2 / "home": the board's own view again.
  const seen = useRef(homeNonce);
  useEffect(() => {
    if (homeNonce === seen.current || !controls) return;
    seen.current = homeNonce;
    camera.position.set(home.eye[0], home.eye[1], home.eye[2]);
    controls.target.copy(home.look);
    controls.update();
  }, [homeNonce, home, camera, controls]);

  useFrame((_, dt) => {
    const h = held.current;
    if (!h.size || !controls) return;
    const fwd = new THREE.Vector3().subVectors(controls.target, camera.position);
    const dist = Math.max(2, fwd.length());
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const move = new THREE.Vector3();
    if (h.has("w") || h.has("ArrowUp")) move.add(fwd);
    if (h.has("s") || h.has("ArrowDown")) move.sub(fwd);
    if (h.has("d") || h.has("ArrowRight")) move.sub(right);
    if (h.has("a") || h.has("ArrowLeft")) move.add(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(PAN_PER_S * dist * dt);
      camera.position.add(move);
      controls.target.add(move);
    }
    const turn = (h.has("q") ? 1 : 0) - (h.has("e") ? 1 : 0);
    if (turn) {
      const off = new THREE.Vector3().subVectors(camera.position, controls.target);
      off.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn * TURN_PER_S * dt);
      camera.position.copy(controls.target).add(off);
    }
    controls.update();
  });
  return null;
}
