import { useGLTF } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";

import { FT_PER_UNIT } from "./heights";

/**
 * A figure is a mesh and a rig; the walk is the engine's (Plan 111).
 *
 * Any model that comes through Mixamo — Character Creator exports, bought
 * humanoids, three.js's own Soldier — has the same skeleton, so one shared set
 * of clips drives all of them. What differs between files is everything else:
 * the root (Y-up, or a Blender −90° bake), the facing (+Z, or −Z), the units,
 * and — the trap — each bone's local axes, which Blender re-orients on the
 * way through. So clips are never copied bone-for-bone. They are *baked*: the
 * source rig is posed frame by frame, each bone's rotation is read as a change
 * from its rest pose in world space, turned into the target's facing, and
 * applied to the target bone's own rest pose. Hips travel is scaled to the
 * target's leg length. Both rigs need only agree on the rest pose itself (a
 * T-pose, Mixamo's standard); nothing else about the files has to match.
 *
 * The library is the Soldier's Idle/Walk/Run plus whatever `.glb` clips sit
 * in `/engine/anim/` and are listed in `clips.json` (Mixamo "without skin"
 * downloads, packed by tools/figures). A model that brings its own clips uses
 * them; a model without a humanoid rig gets none and stands as a statue.
 */
export const SOLDIER = "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r185/examples/models/gltf/Soldier.glb";
const ANIM_DIR = "/engine/anim";
const BAKE_FPS = 30;
export { DEFAULT_HEIGHT_FT, FT_PER_UNIT, heightFtForRace, heightFtForSize } from "./heights";

/** What a loaded glTF gives us, whichever loader typed it. */
export interface GltfLike {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
}

export const CLIP_NAMES = ["idle", "walk", "run", "hit", "death"] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/** A clip's name in a file → what the engine calls it. */
const ALIASES: [string, ClipName][] = [
  ["idle", "idle"],
  ["stand", "idle"],
  ["walk", "walk"],
  ["run", "run"],
  ["jog", "run"],
  ["hit", "hit"],
  ["react", "hit"],
  ["death", "death"],
  ["dying", "death"],
  ["die", "death"],
  ["fall", "death"],
];

export function canonicalClip(name: string): ClipName | null {
  const k = name.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return null;
  for (const [alias, c] of ALIASES) if (k === alias || k.startsWith(alias)) return c;
  return null;
}

/**
 * Other skeletons the table knows, named as the Mixamo bones they stand for:
 * Daz's Genesis 9 (`l_upperarm`) and Genesis 8 (`lShldrBend`). Twist and
 * metacarpal bones have no Mixamo counterpart and stay at rest, which is fine.
 */
const ALIASES_BY_SIDE: [string, string][] = [
  // Genesis 9
  ["hip", "hips"],
  ["spine1", "spine"],
  ["spine2", "spine1"],
  ["spine3", "spine2"],
  ["neck1", "neck"],
  ["l_shoulder", "leftshoulder"],
  ["l_upperarm", "leftarm"],
  ["l_forearm", "leftforearm"],
  ["l_hand", "lefthand"],
  ["l_thigh", "leftupleg"],
  ["l_shin", "leftleg"],
  ["l_foot", "leftfoot"],
  ["l_toes", "lefttoebase"],
  ["l_thumb1", "lefthandthumb1"],
  ["l_thumb2", "lefthandthumb2"],
  ["l_thumb3", "lefthandthumb3"],
  ["l_index1", "lefthandindex1"],
  ["l_index2", "lefthandindex2"],
  ["l_index3", "lefthandindex3"],
  ["l_mid1", "lefthandmiddle1"],
  ["l_mid2", "lefthandmiddle2"],
  ["l_mid3", "lefthandmiddle3"],
  ["l_ring1", "lefthandring1"],
  ["l_ring2", "lefthandring2"],
  ["l_ring3", "lefthandring3"],
  ["l_pinky1", "lefthandpinky1"],
  ["l_pinky2", "lefthandpinky2"],
  ["l_pinky3", "lefthandpinky3"],
  // Genesis 8
  ["abdomenlower", "spine"],
  ["abdomenupper", "spine1"],
  ["chestlower", "spine2"],
  ["necklower", "neck"],
  ["lcollar", "leftshoulder"],
  ["lshldrbend", "leftarm"],
  ["lforearmbend", "leftforearm"],
  ["lhand", "lefthand"],
  ["lthighbend", "leftupleg"],
  ["lshin", "leftleg"],
  ["lfoot", "leftfoot"],
  ["ltoe", "lefttoebase"],
  ["lthumb1", "lefthandthumb1"],
  ["lthumb2", "lefthandthumb2"],
  ["lthumb3", "lefthandthumb3"],
  ["lindex1", "lefthandindex1"],
  ["lindex2", "lefthandindex2"],
  ["lindex3", "lefthandindex3"],
  ["lmid1", "lefthandmiddle1"],
  ["lmid2", "lefthandmiddle2"],
  ["lmid3", "lefthandmiddle3"],
  ["lring1", "lefthandring1"],
  ["lring2", "lefthandring2"],
  ["lring3", "lefthandring3"],
  ["lpinky1", "lefthandpinky1"],
  ["lpinky2", "lefthandpinky2"],
  ["lpinky3", "lefthandpinky3"],
];
const BONE_ALIAS: Record<string, string> = {};
for (const [from, to] of ALIASES_BY_SIDE) {
  BONE_ALIAS[from] = to;
  if (from.startsWith("l_")) BONE_ALIAS[`r_${from.slice(2)}`] = to.replace("left", "right");
  else if (from.startsWith("l") && to.startsWith("left")) BONE_ALIAS[`r${from.slice(1)}`] = to.replace("left", "right");
}

/** A bone's name with the rig prefix off and other rigs' names translated, so rigs match up: `mixamorig:LeftArm` and `l_upperarm` → `leftarm`. */
function boneKey(name: string): string {
  const bare = name.replace(/^mixamorig:?/i, "").toLowerCase();
  return BONE_ALIAS[bare] ?? bare;
}

export function findBone(root: THREE.Object3D, key: string): THREE.Object3D | null {
  let found: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!found && (o as THREE.Bone).isBone && boneKey(o.name) === key) found = o;
  });
  return found;
}

/**
 * Which way a rig faces at rest: the toes point forward. Returns the yaw that
 * rotates +Z onto the rig's forward, so a walker turns it with
 * `rotation.y = wantYaw - forwardYaw`. A rig without toes is taken to face +Z.
 */
export function detectForwardYaw(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const f = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (const [ankle, toe] of [
    ["leftfoot", "lefttoebase"],
    ["rightfoot", "righttoebase"],
  ]) {
    const A = findBone(root, ankle);
    const B = findBone(root, toe);
    if (A && B) f.add(B.getWorldPosition(b).sub(A.getWorldPosition(a)));
  }
  f.y = 0;
  if (f.lengthSq() < 1e-8) return 0;
  return Math.atan2(f.x, f.z);
}

interface RestBone {
  bone: THREE.Object3D;
  key: string;
  /** The parent's key when the parent is a bone we track; else null and the parent is static. */
  parentKey: string | null;
  q: THREE.Quaternion;
  p: THREE.Vector3;
  parentQ: THREE.Quaternion;
  parentInverse: THREE.Matrix4;
  /** Local rest rotation — what an unmapped bone keeps while its mapped ancestor moves. */
  localQ: THREE.Quaternion;
}

/** A rig read in its rest pose: every bone's world transform, its facing, its hips height. */
interface Rig {
  bones: RestBone[];
  byKey: Map<string, RestBone>;
  yaw: number;
  hipsHeight: number;
}

/**
 * The rig at rest. If the file carries a T-pose clip (the Soldier does), the
 * rest is read with it applied, so an idle bind pose does not become the
 * reference every other rig is measured against.
 */
function readRig(root: THREE.Object3D, tpose: THREE.AnimationClip | null): Rig {
  let mixer: THREE.AnimationMixer | null = null;
  if (tpose) {
    mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(tpose).play();
    mixer.setTime(0);
  }
  root.updateMatrixWorld(true);
  const bones: RestBone[] = [];
  const byKey = new Map<string, RestBone>();
  root.traverse((o) => {
    if (!(o as THREE.Bone).isBone) return;
    const key = boneKey(o.name);
    if (byKey.has(key)) return;
    const parent = o.parent;
    const parentKey = parent && (parent as THREE.Bone).isBone && byKey.has(boneKey(parent.name)) ? boneKey(parent.name) : null;
    const rb: RestBone = {
      bone: o,
      key,
      parentKey,
      q: o.getWorldQuaternion(new THREE.Quaternion()),
      p: o.getWorldPosition(new THREE.Vector3()),
      parentQ: parent ? parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion(),
      parentInverse: parent ? parent.matrixWorld.clone().invert() : new THREE.Matrix4(),
      localQ: o.quaternion.clone(),
    };
    bones.push(rb);
    byKey.set(key, rb);
  });
  const yaw = detectForwardYaw(root);
  const hips = byKey.get("hips");
  const hipsHeight = hips ? Math.max(1e-6, hips.p.y) : 1;
  if (mixer) {
    mixer.stopAllAction();
    if (tpose) mixer.uncacheClip(tpose);
  }
  return { bones, byKey, yaw, hipsHeight };
}

/**
 * The child bone that gives a bone its line, present in both rigs: the hand
 * prefers its middle finger, everything else takes the first child both
 * skeletons have. Null for a bone whose children the other rig lacks.
 */
function limbChild(tb: RestBone, target: Rig, other: Rig): string | null {
  // Breadth-first through descendants, looking past bones the other rig lacks
  // (Genesis 8's twist bones sit between the upper arm and the forearm).
  const keys: string[] = [];
  const queue: THREE.Object3D[] = [...tb.bone.children];
  while (queue.length) {
    const c = queue.shift()!;
    const k = boneKey(c.name);
    if (target.byKey.has(k) && other.byKey.has(k)) keys.push(k);
    else queue.push(...c.children);
  }
  if (!keys.length) return null;
  return keys.find((k) => k.endsWith("handmiddle1")) ?? keys[0];
}

/**
 * One clip, baked onto another rig: the source is posed at 30 fps and each
 * bone's world-space change from rest — turned into the target's facing — is
 * applied to the target bone's rest and written back as its local rotation.
 * The hips also carry the source's travel, scaled by leg length.
 */
function bakeClip(lib: LibraryClip, target: Rig, name: string): THREE.AnimationClip {
  const src = cloneSkeleton(lib.scene);
  const rig = readRig(src, lib.tpose);
  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(lib.clip).play();

  const up = new THREE.Vector3(0, 1, 0);
  const turn = new THREE.Quaternion().setFromAxisAngle(up, target.yaw - rig.yaw);
  const turnBack = turn.clone().invert();
  const k = target.hipsHeight / rig.hipsHeight;
  const duration = Math.max(lib.clip.duration, 1 / BAKE_FPS);
  const n = Math.ceil(duration * BAKE_FPS) + 1;
  const times = new Float32Array(n);
  const mapped = target.bones.filter((tb) => rig.byKey.has(tb.key));
  const quat = new Map<string, Float32Array>(mapped.map((tb) => [tb.key, new Float32Array(n * 4)]));
  // The two rigs need not share a rest pose (Mixamo T-pose, Daz A-pose): each
  // target bone is first turned so its rest limb lies along the source's rest
  // limb, then the source's motion is applied. End bones borrow their parent's turn.
  const LIMB = /arm|hand|shoulder|leg|foot|toe|thumb|index|middle|ring|pinky/;
  const align = new Map<string, THREE.Quaternion>();
  const dirT = new THREE.Vector3();
  const dirS = new THREE.Vector3();
  // A bone's parent in the bake is its nearest ancestor the source also has; the
  // unmapped bones between (Daz's pelvis, spine4, neck2, metacarpals) keep their
  // rest rotation, so that chain is folded into the parent's orientation each frame.
  const mappedKeys = new Set(mapped.map((tb) => tb.key));
  const ancestor = new Map<string, { key: string | null; chain: THREE.Quaternion }>();
  for (const tb of mapped) {
    const chain = new THREE.Quaternion();
    let k = tb.parentKey;
    const between: THREE.Quaternion[] = [];
    while (k && !mappedKeys.has(k)) {
      between.unshift(target.byKey.get(k)!.localQ);
      k = target.byKey.get(k)!.parentKey;
    }
    for (const q of between) chain.multiply(q);
    ancestor.set(tb.key, { key: k, chain });
  }
  for (const tb of mapped) {
    const sb = rig.byKey.get(tb.key)!;
    let a: THREE.Quaternion | null = null;
    // Only limbs are lined up: an A-pose arm has to become a T-pose arm. The
    // trunk is left alone — every rig stands upright, and a source whose
    // rest spine happens to curve would otherwise bend the target at the hips.
    const shared = LIMB.test(tb.key) ? limbChild(tb, target, rig) : null;
    if (shared) {
      dirT.copy(target.byKey.get(shared)!.p).sub(tb.p);
      dirS.copy(rig.byKey.get(shared)!.p).sub(sb.p).applyQuaternion(turn);
      if (dirT.lengthSq() > 1e-8 && dirS.lengthSq() > 1e-8) a = new THREE.Quaternion().setFromUnitVectors(dirT.normalize(), dirS.normalize());
    }
    if (!a && tb.parentKey && align.has(tb.parentKey)) a = align.get(tb.parentKey)!.clone();
    align.set(tb.key, a ?? new THREE.Quaternion());
  }
  const hipsPos = new Float32Array(n * 3);
  const hips = target.byKey.get("hips");

  const wq = new THREE.Quaternion();
  const restInv = new THREE.Quaternion();
  const d = new THREE.Quaternion();
  const desired = new THREE.Quaternion();
  const local = new THREE.Quaternion();
  const parentWorldQ = new THREE.Quaternion();
  const world = new Map<string, THREE.Quaternion>(mapped.map((tb) => [tb.key, new THREE.Quaternion()]));
  const wp = new THREE.Vector3();
  const pw = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const t = Math.min(i / BAKE_FPS, duration);
    times[i] = t;
    mixer.setTime(t);
    src.updateMatrixWorld(true);
    for (const tb of mapped) {
      const sb = rig.byKey.get(tb.key)!;
      sb.bone.getWorldQuaternion(wq);
      restInv.copy(sb.q).invert();
      // The source bone's change from its rest, in world space, turned to face the target's way.
      d.copy(turn).multiply(wq).multiply(restInv).multiply(turnBack);
      desired.copy(d).multiply(align.get(tb.key)!).multiply(tb.q);
      world.get(tb.key)!.copy(desired);
      const anc = ancestor.get(tb.key)!;
      if (anc.key) parentWorldQ.copy(world.get(anc.key)!).multiply(anc.chain);
      else parentWorldQ.copy(tb.parentQ);
      local.copy(parentWorldQ).invert().multiply(desired);
      const out = quat.get(tb.key)!;
      out[i * 4] = local.x;
      out[i * 4 + 1] = local.y;
      out[i * 4 + 2] = local.z;
      out[i * 4 + 3] = local.w;
      if (hips && tb === hips) {
        sb.bone.getWorldPosition(wp).sub(sb.p).applyQuaternion(turn).multiplyScalar(k);
        pw.copy(tb.p).add(wp).applyMatrix4(tb.parentInverse);
        hipsPos[i * 3] = pw.x;
        hipsPos[i * 3 + 1] = pw.y;
        hipsPos[i * 3 + 2] = pw.z;
      }
    }
  }
  mixer.stopAllAction();
  mixer.uncacheClip(lib.clip);

  const tracks: THREE.KeyframeTrack[] = [];
  for (const tb of mapped) tracks.push(new THREE.QuaternionKeyframeTrack(`${tb.bone.name}.quaternion`, times, quat.get(tb.key)!));
  if (hips && rig.byKey.has("hips")) tracks.push(new THREE.VectorKeyframeTrack(`${hips.bone.name}.position`, times, hipsPos));
  return new THREE.AnimationClip(name, duration, tracks);
}

export interface LibraryClip {
  name: ClipName;
  clip: THREE.AnimationClip;
  /** The rig the clip was authored on — posed to bake the clip onto another. */
  scene: THREE.Object3D;
  tpose: THREE.AnimationClip | null;
}

function tposeOf(gltf: GltfLike): THREE.AnimationClip | null {
  return gltf.animations.find((c) => /^t[-_ ]?pose$/i.test(c.name.trim())) ?? null;
}

/**
 * The shared clips: the Soldier's, plus any packed Mixamo clips listed in
 * `/engine/anim/clips.json`, which win over the Soldier's for the same name.
 */
export function useClipLibrary(): LibraryClip[] {
  const soldier = useGLTF(SOLDIER);
  const manifest = useLoader(THREE.FileLoader, `${ANIM_DIR}/clips.json`);
  const names = useMemo(() => {
    try {
      const parsed = JSON.parse(String(manifest)) as unknown;
      return Array.isArray(parsed) ? parsed.map((n) => canonicalClip(String(n))).filter((n): n is ClipName => !!n) : [];
    } catch {
      return [];
    }
  }, [manifest]);
  const extras = useLoader(GLTFLoader, names.map((n) => `${ANIM_DIR}/${n}.glb`)) as unknown as GltfLike[];
  return useMemo(() => {
    const lib: LibraryClip[] = [];
    extras.forEach((g, i) => {
      const clip = g.animations[0];
      if (clip && !lib.some((l) => l.name === names[i])) lib.push({ name: names[i], clip, scene: g.scene, tpose: tposeOf(g) });
    });
    const tpose = tposeOf(soldier);
    for (const c of soldier.animations) {
      const n = canonicalClip(c.name);
      if (n && !lib.some((l) => l.name === n)) lib.push({ name: n, clip: c, scene: soldier.scene, tpose });
    }
    return lib;
  }, [soldier, extras, names]);
}

/** What the DM's preview reports about a file. */
export interface FigureInfo {
  rig: "mixamo" | "genesis" | "humanoid" | "none";
  /** The model's height as authored, in its own units (metres, usually). */
  rawHeight: number;
  ownClips: ClipName[];
  bones: number;
}

export function analyzeFigure(gltf: GltfLike): FigureInfo {
  const hips = findBone(gltf.scene, "hips");
  let bones = 0;
  gltf.scene.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones += 1;
  });
  const own = gltf.animations.map((c) => canonicalClip(c.name)).filter((n): n is ClipName => !!n);
  return {
    rig: !hips ? "none" : /^mixamorig/i.test(hips.name) ? "mixamo" : /^hip$/i.test(hips.name) ? "genesis" : "humanoid",
    rawHeight: measure(gltf.scene).height,
    ownClips: Array.from(new Set(own)),
    bones,
  };
}

/** A model made ready to stand on the table. */
export interface Fitted {
  body: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** Scale that makes the model `height` units tall. */
  scale: number;
  /** Lift that puts its lowest point on the floor, after scaling. */
  lift: number;
  height: number;
  forwardYaw: number;
}

/** Baked clips are per rig, not per figure: every clone of a model shares them. */
const baked = new Map<string, THREE.AnimationClip[]>();

/**
 * The clips a model will play: its own, by canonical name, then the library's
 * for whatever it lacks — baked onto its rig, unless the library clip was
 * authored on this very rig, in which case it plays as it is.
 */
function clipsFor(gltf: GltfLike, library: LibraryClip[], cacheKey: string): THREE.AnimationClip[] {
  const key = `${cacheKey}|${library.map((l) => l.name).join(",")}`;
  const hit = baked.get(key);
  if (hit) return hit;
  const clips: THREE.AnimationClip[] = [];
  const have = new Set<ClipName>();
  if (findBone(gltf.scene, "hips")) {
    for (const c of gltf.animations) {
      const n = canonicalClip(c.name);
      if (!n || have.has(n)) continue;
      const own = c.clone();
      own.name = n;
      clips.push(own);
      have.add(n);
    }
    let rig: Rig | null = null;
    for (const l of library) {
      if (have.has(l.name)) continue;
      if (l.scene === gltf.scene) {
        const same = l.clip.clone();
        same.name = l.name;
        clips.push(same);
      } else {
        rig ??= readRig(cloneSkeleton(gltf.scene), tposeOf(gltf));
        clips.push(bakeClip(l, rig, l.name));
      }
      have.add(l.name);
    }
  }
  baked.set(key, clips);
  return clips;
}

/**
 * How tall a model stands and where its feet are, in its own units. From the
 * skeleton when it has one — head to feet — so a cloak, a tail or a scabbard
 * hanging past the boots cannot make the figure shorter or float it; from the
 * bounding box for a rig-less prop.
 */
function measure(root: THREE.Object3D): { height: number; bottom: number } {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const fromBox = { height: box.isEmpty() ? 0 : box.max.y - box.min.y, bottom: box.isEmpty() ? 0 : box.min.y };
  const head = findBone(root, "head");
  const feet = [findBone(root, "leftfoot"), findBone(root, "rightfoot"), findBone(root, "lefttoebase"), findBone(root, "righttoebase")].filter((b): b is THREE.Object3D => !!b);
  if (!head || !feet.length) return fromBox;
  const v = new THREE.Vector3();
  const footY = Math.min(...feet.map((b) => b.getWorldPosition(v).y));
  const top = findBone(root, "headtop_end");
  const headY = head.getWorldPosition(v).y;
  const crown = top ? top.getWorldPosition(v).y : headY + 0.13 * (headY - footY);
  const height = crown - footY;
  if (height < 1e-3) return fromBox;
  // Soles sit a little under the ankle joint; never below what the mesh actually reaches.
  return { height, bottom: Math.max(fromBox.bottom, footY - 0.04 * height) };
}

/**
 * What a material is, from its name. Daz and Mixamo exports arrive with colour
 * maps only — no normal, roughness or metalness maps — and every surface at
 * roughness 1, which is why faces looked like chalk. The names are reliable
 * (Genesis: "Head", "Arms", "EyeMoisture Left", "Cornea"; outfits: "LVA_Belt_Buckle"),
 * so the surface type can be read from them and given the response a real
 * material would have under the room's light.
 */
const EYE_GLASS = /eyemoisture|cornea|tear|eyereflection|eye_?moist/i;
const EYE = /\beyes?\b|iris|sclera|pupil/i;
const HAIR = /hair|scalp|eyebrow|eyelash|beard|brow|lash|stubble/i;
const MOUTH = /mouth|teeth|tongue|gums|lips/i;
const SKIN = /skin|face|head|body|arms|legs|torso|ears|nails|neck|hands|feet|genital|nipple/i;
const METAL = /metal|plate|armou?r|steel|iron|gold|silver|buckle|blade|chain|mail|greave|gauntlet|pauldron|helm|cuirass|rivet|clasp|ring|hilt|guard/i;
const LEATHER = /leather|boot|belt|strap|shoe|glove|harness|scabbard|sheath/i;
const CLOTH = /cloth|shirt|pant|tunic|robe|cloak|cape|skirt|dress|sleeve|collar|cuff|hood|sash|wrap|linen|wool/i;

function dressMaterial(m: THREE.Material): void {
  const std = m as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || std.userData.dressed) return;
  std.userData.dressed = true;
  const n = m.name || "";
  // A colour with alpha 0 and no map is a layer the export lost the alpha mask for
  // (Genesis eyelash cards, the tear line): opaque brown strips across the face. Off.
  if (std.opacity === 0 && !std.transparent && !std.map) {
    std.visible = false;
    return;
  }
  if (EYE_GLASS.test(n)) {
    // The wet layer over the eye: nearly invisible, all highlight.
    std.transparent = true;
    std.opacity = 0.12;
    std.depthWrite = false;
    std.roughness = 0.04;
    std.metalness = 0;
    return;
  }
  if (EYE.test(n)) {
    std.roughness = 0.18;
    std.metalness = 0;
  } else if (HAIR.test(n)) {
    std.roughness = 0.62;
    std.metalness = 0;
  } else if (MOUTH.test(n)) {
    std.roughness = 0.42;
    std.metalness = 0;
  } else if (SKIN.test(n)) {
    std.roughness = 0.55;
    std.metalness = 0;
  } else if (METAL.test(n)) {
    std.roughness = 0.38;
    std.metalness = 0.85;
  } else if (LEATHER.test(n)) {
    std.roughness = 0.68;
    std.metalness = 0;
  } else if (CLOTH.test(n)) {
    std.roughness = 0.85;
    std.metalness = 0;
  } else if (std.roughness >= 0.999 && !std.roughnessMap) {
    std.roughness = 0.8;
  }
  // A figure packed with its real maps (attach_maps.mjs) says its own roughness and
  // metalness; the guesses above are only for files that carry colour alone.
  if (std.roughnessMap) std.roughness = 1;
  if (std.metalnessMap) std.metalness = 1;
}

/**
 * Skin and eyes get the physical model: skin a faint sheen that reads as the
 * soft scatter real skin has, eyes a wet clearcoat. Shared materials map to
 * one upgrade.
 */
const upgraded = new WeakMap<THREE.Material, THREE.MeshPhysicalMaterial>();
function physical(m: THREE.Material): THREE.Material {
  const std = m as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial || !std.visible) return m;
  const n = m.name || "";
  // Hair stays on the standard model: any anisotropic lobe on decimated strands sparkles into the bloom.
  if (HAIR.test(n)) return m;
  const eye = EYE.test(n) && !EYE_GLASS.test(n);
  const skin = !eye && SKIN.test(n) && !MOUTH.test(n);
  if (!skin && !eye) return m;
  const had = upgraded.get(m);
  if (had) return had;
  const p = new THREE.MeshPhysicalMaterial();
  // Copy the standard fields only: MeshPhysicalMaterial.copy expects a physical source.
  THREE.MeshStandardMaterial.prototype.copy.call(p, std);
  p.userData = { ...std.userData };
  if (eye) {
    // A wet eye: the clearcoat catches the torch as a single point.
    p.clearcoat = 1;
    p.clearcoatRoughness = 0.08;
    p.roughness = 0.35;
    p.envMapIntensity = 1.4;
  } else {
    p.sheen = 0.35;
    p.sheenColor = new THREE.Color(1.0, 0.72, 0.58);
    p.sheenRoughness = 0.85;
    p.clearcoat = 0.05;
    p.clearcoatRoughness = 0.55;
  }
  upgraded.set(m, p);
  return p;
}

/** Give every material in a figure its surface response. Idempotent; runs on the shared scene once. */
export function dressFigure(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) dressMaterial(m);
    if (Array.isArray(mesh.material)) mesh.material = mesh.material.map(physical);
    else mesh.material = physical(mesh.material);
  });
}

/** Meshes that cost a shadow pass and give nothing back at table distance. */
const NO_SHADOW = /hair|scalp|eyelash|lash|eyebrow|brow|tear|moisture|cornea|eye|mouth|teeth|tongue|nail|beard|cap$/i;
/** Meshes nobody can see from the table: skipped entirely. */
const TINY = /fingernail|toenail|^tear$|mouth cavity/i;

export function fitFigure(gltf: GltfLike, library: LibraryClip[], heightUnits: number, cacheKey: string): Fitted {
  dressFigure(gltf.scene);
  const body = cloneSkeleton(gltf.scene);
  body.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const names = mats.map((m) => m.name || "").join("|") + "|" + (mesh.name || "");
    if (TINY.test(names)) {
      mesh.visible = false;
      return;
    }
    mesh.castShadow = !NO_SHADOW.test(names);
    mesh.receiveShadow = true;
  });
  const { height: raw, bottom } = measure(gltf.scene);
  const scale = raw > 1e-3 ? heightUnits / raw : 1;
  const lift = -bottom * scale;
  return { body, clips: clipsFor(gltf, library, cacheKey), scale, lift, height: heightUnits, forwardYaw: detectForwardYaw(body) };
}

/** The model at `url` (the Soldier when null), fitted to the table. Suspends while loading. */
export function useFigure(url: string | null, heightFt: number): Fitted {
  const gltf = useGLTF(url ?? SOLDIER, true, true);
  const library = useClipLibrary();
  const heightUnits = Math.max(0.2, heightFt) / FT_PER_UNIT;
  return useMemo(() => fitFigure(gltf, library, heightUnits, url ?? SOLDIER), [gltf, library, heightUnits, url]);
}

/** Warm the cache for a model the table is about to show. */
export function preloadFigure(url: string | null | undefined): void {
  useGLTF.preload(url || SOLDIER, true, true);
}
