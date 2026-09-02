import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Dice3D (Plan 69) — the die itself, Roll20-style.
 *
 * An imperative three.js overlay (no r3f — this also mounts on the 2D
 * projector page): a real polyhedron enters from the left, bounces and
 * tumbles across the board, and settles face-flat at center by
 * `durationMs`. The RESULT is stamped by the parent once it rests — so
 * the number can never contradict the server's roll. Obsidian body,
 * gold edges, transparent canvas.
 */

const GEOMETRY: Record<string, () => THREE.BufferGeometry> = {
  d4: () => new THREE.TetrahedronGeometry(1.25),
  d6: () => new THREE.BoxGeometry(1.55, 1.55, 1.55),
  d8: () => new THREE.OctahedronGeometry(1.15),
  // d10/d100: stretched octahedron reads as the kite-faced die at a glance.
  d10: () => new THREE.OctahedronGeometry(1.05).scale(1, 1.35, 1),
  d100: () => new THREE.OctahedronGeometry(1.05).scale(1, 1.35, 1),
  d12: () => new THREE.DodecahedronGeometry(1.1),
  d20: () => new THREE.IcosahedronGeometry(1.2),
};

/** Quaternion that lays the geometry's first face flat toward the camera. */
function restOrientation(geo: THREE.BufferGeometry): THREE.Quaternion {
  const pos = geo.getAttribute("position");
  const a = new THREE.Vector3().fromBufferAttribute(pos, 0);
  const b = new THREE.Vector3().fromBufferAttribute(pos, 1);
  const c = new THREE.Vector3().fromBufferAttribute(pos, 2);
  const normal = new THREE.Vector3()
    .subVectors(b, a)
    .cross(new THREE.Vector3().subVectors(c, a))
    .normalize();
  // Face the camera-ish: up and slightly forward.
  const target = new THREE.Vector3(0, 0.35, 1).normalize();
  return new THREE.Quaternion().setFromUnitVectors(normal, target);
}

export default function Dice3D({
  die,
  rollKey,
  durationMs,
}: {
  die: string;
  rollKey: string;
  durationMs: number;
}) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const w = el.clientWidth || 600;
    const h = el.clientHeight || 400;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50);
    camera.position.set(0, 2.2, 7);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.AmbientLight(0xfff2d0, 0.55));
    const key = new THREE.DirectionalLight(0xffe9b0, 1.5);
    key.position.set(-3, 6, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8d7bd8, 0.7);
    rim.position.set(4, 2, -3);
    scene.add(rim);

    const geo = (GEOMETRY[die] ?? GEOMETRY.d20)();
    const body = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x241d33,
        flatShading: true,
        metalness: 0.45,
        roughness: 0.4,
      }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 1),
      new THREE.LineBasicMaterial({ color: 0xd6af36, transparent: true, opacity: 0.9 }),
    );
    const dieGroup = new THREE.Group();
    dieGroup.add(body);
    dieGroup.add(edges);
    scene.add(dieGroup);

    // Soft shadow blob under the travel path.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.55;
    scene.add(shadow);

    const rest = restOrientation(geo);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Deterministic-feeling randomness per roll.
    let seed = 0;
    for (const ch of rollKey) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const rand = (n: number) => {
      seed = (seed * 9301 + 49297) % 233280;
      return (seed / 233280) * n;
    };
    const spinAxis = new THREE.Vector3(
      0.6 + rand(0.8),
      0.8 + rand(0.6),
      0.4 + rand(0.9),
    ).normalize();
    const spinSpeed = 9 + rand(5);

    const startX = -6.5;
    const bounces = 3;
    const start = performance.now();
    let raf = 0;
    const scratchQ = new THREE.Quaternion();

    const frame = (now: number) => {
      const t = reduced ? 1 : Math.min(1, (now - start) / durationMs);
      const ease = 1 - Math.pow(1 - t, 2.2);
      dieGroup.position.x = startX * (1 - ease);
      // Decaying bounce train.
      const bounce = Math.abs(Math.cos(t * Math.PI * bounces)) * Math.pow(1 - t, 2) * 2.4;
      dieGroup.position.y = -0.9 + bounce;
      shadow.position.x = dieGroup.position.x;
      shadow.scale.setScalar(0.7 + 0.5 * (1 - bounce / 2.4));
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.26 * (1 - bounce / 2.4);

      if (t < 0.82) {
        // Free tumble that slows with the throw.
        const step = spinSpeed * (1 - t * 0.75) * 0.016;
        scratchQ.setFromAxisAngle(spinAxis, step);
        dieGroup.quaternion.multiplyQuaternions(scratchQ, dieGroup.quaternion);
      } else {
        // Settle: slerp onto the rest face with a dying wobble.
        const k = (t - 0.82) / 0.18;
        dieGroup.quaternion.slerp(rest, Math.min(1, k * 0.35 + 0.08));
        dieGroup.rotation.z += Math.sin(k * 14) * 0.015 * (1 - k);
      }
      renderer.render(scene, camera);
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        dieGroup.quaternion.copy(rest);
        dieGroup.position.set(0, -0.9, 0);
        renderer.render(scene, camera);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      geo.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [die, rollKey, durationMs]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
