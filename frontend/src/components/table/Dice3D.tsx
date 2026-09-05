import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Dice3D (Plan 69; real dice in Plan 80) — the die itself, Roll20-style.
 *
 * An imperative three.js overlay (no r3f — this also mounts on the 2D
 * projector page). A true polyhedron with a number on every face enters
 * from the left, bounces and tumbles across the board, and settles with the
 * rolled face toward the viewer, number upright, by `durationMs`. The face
 * that lands is the server's result — the die can never contradict it.
 * Crimson resin, gold numerals and edges, transparent canvas.
 *
 * Face numbering follows real dice: opposite faces of a d20 sum to 21, a
 * d12 to 13, a d8 to 9, a d6 to 7; a d10 reads 0–9 and a d100 reads 00–90.
 */

interface Face {
  /** Indices into the flat, non-indexed position buffer (3 per triangle). */
  tris: number[][];
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  /** In-plane basis: u to the right, v toward the number's top. */
  u: THREE.Vector3;
  v: THREE.Vector3;
  /** Circumradius on the face plane (for atlas scaling). */
  radius: number;
  number: number;
}

const ATLAS_COLS = 5;
const ATLAS_ROWS = 4;
const ATLAS_PX = 1024;

// ── Geometry ────────────────────────────────────────────────────────────────

/** A pentagonal trapezohedron (the real d10 / d100 shape): ten kite faces. */
function trapezohedron(radius: number): THREE.BufferGeometry {
  const h = 0.14 * radius; // ring vertices alternate ±h
  const apex = 1.0 * radius;
  const ring: THREE.Vector3[] = [];
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5;
    ring.push(new THREE.Vector3(Math.cos(a) * 0.86 * radius, k % 2 === 0 ? h : -h, Math.sin(a) * 0.86 * radius));
  }
  const top = new THREE.Vector3(0, apex, 0);
  const bottom = new THREE.Vector3(0, -apex, 0);
  const pos: number[] = [];
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  for (let k = 0; k < 5; k++) {
    // Upper kite: top apex, ring[2k], ring[2k+1] (low), ring[2k+2]
    const r0 = ring[(2 * k) % 10], r1 = ring[(2 * k + 1) % 10], r2 = ring[(2 * k + 2) % 10];
    push(top, r1, r0);
    push(top, r2, r1);
    // Lower kite: bottom apex, ring[2k+1], ring[2k+2] (high), ring[2k+3]
    const s0 = ring[(2 * k + 1) % 10], s1 = ring[(2 * k + 2) % 10], s2 = ring[(2 * k + 3) % 10];
    push(bottom, s0, s1);
    push(bottom, s1, s2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const GEOMETRY: Record<string, () => THREE.BufferGeometry> = {
  d4: () => new THREE.TetrahedronGeometry(0.95).toNonIndexed(),
  d6: () => new THREE.BoxGeometry(1.15, 1.15, 1.15).toNonIndexed(),
  d8: () => new THREE.OctahedronGeometry(0.85).toNonIndexed(),
  d10: () => trapezohedron(0.9),
  d100: () => trapezohedron(0.9),
  d12: () => new THREE.DodecahedronGeometry(0.82).toNonIndexed(),
  d20: () => new THREE.IcosahedronGeometry(0.88).toNonIndexed(),
};

const SIDES: Record<string, number> = { d4: 4, d6: 6, d8: 8, d10: 10, d100: 10, d12: 12, d20: 20 };

/** Group coplanar triangles into faces and build an in-plane basis for each. */
function collectFaces(geo: THREE.BufferGeometry): Face[] {
  const pos = geo.getAttribute("position");
  const faces: Face[] = [];
  const triCount = pos.count / 3;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, t * 3);
    b.fromBufferAttribute(pos, t * 3 + 1);
    c.fromBufferAttribute(pos, t * 3 + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let face = faces.find((f) => f.normal.dot(n) > 0.999);
    if (!face) {
      face = { tris: [], normal: n, centroid: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3(), radius: 0, number: 0 };
      faces.push(face);
    }
    face.tris.push([t * 3, t * 3 + 1, t * 3 + 2]);
  }
  for (const f of faces) {
    // Centroid of the face's unique vertices; "up" points at the vertex
    // farthest from the centroid (a triangle's tip, a kite's apex).
    const verts: THREE.Vector3[] = [];
    for (const tri of f.tris) for (const i of tri) {
      const p = new THREE.Vector3().fromBufferAttribute(pos, i);
      if (!verts.some((q) => q.distanceToSquared(p) < 1e-8)) verts.push(p);
    }
    for (const p of verts) f.centroid.add(p);
    f.centroid.divideScalar(verts.length);
    let tip = verts[0], best = -1;
    for (const p of verts) {
      const d = p.distanceTo(f.centroid);
      if (d > best) { best = d; tip = p; }
    }
    f.radius = best;
    if (verts.length === 4 && verts.every((p) => Math.abs(p.distanceTo(f.centroid) - best) < 1e-4)) {
      // A square face (d6): the numeral's top points at an edge, not a corner.
      const tmpU = new THREE.Vector3().subVectors(verts[0], f.centroid).normalize();
      const tmpV = new THREE.Vector3().crossVectors(f.normal, tmpU);
      const ang = (p: THREE.Vector3) => Math.atan2(p.clone().sub(f.centroid).dot(tmpV), p.clone().sub(f.centroid).dot(tmpU));
      const ring = [...verts].sort((p, q) => ang(p) - ang(q));
      const mid = new THREE.Vector3().addVectors(ring[0], ring[1]).multiplyScalar(0.5);
      f.v.subVectors(mid, f.centroid).normalize();
    } else {
      f.v.subVectors(tip, f.centroid).normalize();
    }
    f.u.crossVectors(f.v, f.normal).normalize();
  }
  return faces;
}

/** Number the faces like a real die: opposite faces pair up and sum to sides + 1. */
function numberFaces(faces: Face[], sides: number, d100 = false): void {
  const unassigned = new Set(faces);
  let next = 1;
  const total = sides + 1;
  // Deterministic order: sort by normal so the layout is stable across mounts.
  const ordered = [...faces].sort((x, y) => x.normal.y - y.normal.y || x.normal.x - y.normal.x || x.normal.z - y.normal.z);
  for (const f of ordered) {
    if (!unassigned.has(f)) continue;
    const opposite = ordered.find((g) => unassigned.has(g) && g !== f && g.normal.dot(f.normal) < -0.999);
    f.number = next;
    unassigned.delete(f);
    if (opposite) {
      opposite.number = total - next;
      unassigned.delete(opposite);
    }
    next += 1;
    if (next > sides / 2 && opposite) continue;
  }
  // Any leftovers (odd shapes) get the remaining numbers.
  const used = new Set(faces.map((f) => f.number));
  let n = 1;
  for (const f of faces) {
    if (f.number) continue;
    while (used.has(n)) n++;
    f.number = n;
    used.add(n);
  }
  if (sides === 10) {
    // d10 reads 0–9 (0 opposite 9); d100 reads 00–90.
    for (const f of faces) f.number = d100 ? (f.number - 1) * 10 : f.number - 1;
  }
}

/** Paint one atlas cell per face: crimson resin with a gold numeral. */
function paintAtlas(faces: Face[], d100: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_PX;
  canvas.height = ATLAS_PX;
  const ctx = canvas.getContext("2d")!;
  const cw = ATLAS_PX / ATLAS_COLS, ch = ATLAS_PX / ATLAS_ROWS;
  ctx.fillStyle = "#6f1414";
  ctx.fillRect(0, 0, ATLAS_PX, ATLAS_PX);
  faces.forEach((f, i) => {
    const cx = (i % ATLAS_COLS) * cw, cy = Math.floor(i / ATLAS_COLS) * ch;
    const g = ctx.createRadialGradient(cx + cw * 0.42, cy + ch * 0.38, cw * 0.05, cx + cw / 2, cy + ch / 2, cw * 0.75);
    g.addColorStop(0, "#b3261f");
    g.addColorStop(0.55, "#8b1a1a");
    g.addColorStop(1, "#4d0d0f");
    ctx.fillStyle = g;
    ctx.fillRect(cx, cy, cw, ch);
    const label = d100 ? String(f.number).padStart(2, "0") : String(f.number);
    const size = Math.round(ch * (label.length > 1 ? 0.3 : 0.36));
    ctx.font = `700 ${size}px Georgia, "Times New Roman", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.strokeStyle = "rgba(40, 8, 8, 0.9)";
    ctx.strokeText(label, cx + cw / 2, cy + ch / 2 + size * 0.04);
    ctx.fillStyle = "#f0d27a";
    ctx.fillText(label, cx + cw / 2, cy + ch / 2 + size * 0.04);
    if (f.number === 6 || f.number === 9) {
      // Underline so 6 and 9 can't be confused, as on a real die.
      ctx.fillRect(cx + cw / 2 - size * 0.22, cy + ch / 2 + size * 0.5, size * 0.44, Math.max(2, size * 0.06));
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Map each face's vertices into its atlas cell so the numeral sits centered and upright. */
function applyUvs(geo: THREE.BufferGeometry, faces: Face[]): void {
  const pos = geo.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  const cellW = 1 / ATLAS_COLS, cellH = 1 / ATLAS_ROWS;
  const p = new THREE.Vector3(), d = new THREE.Vector3();
  faces.forEach((f, i) => {
    const cx = ((i % ATLAS_COLS) + 0.5) * cellW;
    const cy = 1 - (Math.floor(i / ATLAS_COLS) + 0.5) * cellH; // canvas y is flipped in UV space
    const k = (cellW * 0.46) / f.radius; // the face's far tip lands near the cell edge
    for (const tri of f.tris) for (const idx of tri) {
      p.fromBufferAttribute(pos, idx);
      d.subVectors(p, f.centroid);
      uv[idx * 2] = cx + d.dot(f.u) * k;
      uv[idx * 2 + 1] = cy + d.dot(f.v) * k * (cellW / cellH);
    }
  });
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
}

/** Orientation that presents `face` to the viewer with its numeral upright. */
function restOrientationFor(face: Face): THREE.Quaternion {
  const target = new THREE.Vector3(0, 0.42, 1).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(face.normal, target);
  // Spin about the viewing axis until the face's "up" points to screen-up.
  const up = face.v.clone().applyQuaternion(q);
  const screenUp = new THREE.Vector3(0, 1, 0).projectOnPlane(target).normalize();
  const upProj = up.projectOnPlane(target).normalize();
  const angle = Math.atan2(upProj.clone().cross(screenUp).dot(target), upProj.dot(screenUp));
  const fix = new THREE.Quaternion().setFromAxisAngle(target, angle);
  return fix.multiply(q);
}

export default function Dice3D({
  die,
  rollKey,
  durationMs,
  result,
}: {
  die: string;
  rollKey: string;
  durationMs: number;
  /** The server's roll for this die — the face that ends up on top. */
  result?: number;
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
    const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    camera.position.set(0, 2.4, 8.5);
    camera.lookAt(0, -0.2, 0);

    scene.add(new THREE.AmbientLight(0xfff2d0, 0.6));
    const key = new THREE.DirectionalLight(0xffe9b0, 1.6);
    key.position.set(-3, 6, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffd9c0, 0.5);
    fill.position.set(4, 1.5, 3);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8d7bd8, 0.6);
    rim.position.set(3, 2, -4);
    scene.add(rim);

    const sides = SIDES[die] ?? 20;
    const d100 = die === "d100";
    const geo = (GEOMETRY[die] ?? GEOMETRY.d20)();
    const faces = collectFaces(geo);
    numberFaces(faces, sides, d100);
    applyUvs(geo, faces);
    const atlas = paintAtlas(faces, d100);
    const body = new THREE.Mesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        map: atlas,
        flatShading: true,
        metalness: 0.08,
        roughness: 0.32,
        clearcoat: 0.7,
        clearcoatRoughness: 0.25,
      }),
    );
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo, 1),
      new THREE.LineBasicMaterial({ color: 0xd6af36, transparent: true, opacity: 0.55 }),
    );
    const dieGroup = new THREE.Group();
    dieGroup.add(body);
    dieGroup.add(edges);
    scene.add(dieGroup);

    // Soft shadow blob under the travel path.
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.0, 32),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.25;
    scene.add(shadow);

    // The face that must end up toward the viewer: the rolled number (d100
    // shows its tens), else whatever the geometry's first face is.
    const wanted = d100 && typeof result === "number" ? Math.floor(result / 10) * 10 : result;
    const landing = faces.find((f) => f.number === wanted) ?? faces[0];
    const rest = restOrientationFor(landing);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Deterministic-feeling randomness per roll.
    let seed = 0;
    for (const ch of rollKey) seed = (seed * 31 + ch.charCodeAt(0)) % 9973;
    const rand = (n: number) => {
      seed = (seed * 9301 + 49297) % 233280;
      return (seed / 233280) * n;
    };
    const spinAxis = new THREE.Vector3(0.6 + rand(0.8), 0.8 + rand(0.6), 0.4 + rand(0.9)).normalize();
    const spinSpeed = 10 + rand(5);

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
      const bounce = Math.abs(Math.cos(t * Math.PI * bounces)) * Math.pow(1 - t, 2) * 2.0;
      dieGroup.position.y = -0.7 + bounce;
      shadow.position.x = dieGroup.position.x;
      shadow.scale.setScalar(0.7 + 0.5 * (1 - bounce / 2.0));
      (shadow.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.26 * (1 - bounce / 2.0);

      if (t < 0.8) {
        // Free tumble that slows with the throw.
        const step = spinSpeed * (1 - t * 0.7) * 0.016;
        scratchQ.setFromAxisAngle(spinAxis, step);
        dieGroup.quaternion.multiplyQuaternions(scratchQ, dieGroup.quaternion);
      } else {
        // Settle: slerp onto the rolled face with a dying wobble.
        const k = (t - 0.8) / 0.2;
        dieGroup.quaternion.slerp(rest, Math.min(1, k * 0.4 + 0.1));
        dieGroup.rotation.z += Math.sin(k * 14) * 0.012 * (1 - k);
      }
      renderer.render(scene, camera);
      if (t < 1) {
        raf = requestAnimationFrame(frame);
      } else {
        dieGroup.quaternion.copy(rest);
        dieGroup.position.set(0, -0.7, 0);
        renderer.render(scene, camera);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
      geo.dispose();
      atlas.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [die, rollKey, durationMs, result]);

  return <div ref={host} style={{ position: "absolute", inset: 0 }} />;
}
