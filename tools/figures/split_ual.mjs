// Split the Quaternius Universal Animation Library (CC0) into the engine's
// per-clip files: each carries one clip first, the T-pose second (trimmed to
// a single frame), and the rig with its mesh cut down to one skinned triangle,
// so a file is the clip's weight and little else.
//   node split_ual.mjs <UAL1_Standard.glb> <out dir>
import fs from "node:fs";
import path from "node:path";
import { Accessor, NodeIO, Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { prune, resample } from "@gltf-transform/functions";

const [src, outDir] = process.argv.slice(2);
const WANT = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  run: "Jog_Fwd_Loop",
  hit: "Hit_Chest",
  death: "Death01",
  slash: "Sword_Attack",
  cast: "Spell_Simple_Shoot",
  shoot: "Pistol_Shoot",
};
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
fs.mkdirSync(outDir, { recursive: true });
const manifest = [];
for (const [name, clipName] of Object.entries(WANT)) {
  const doc = await io.read(src);
  const root = doc.getRoot();
  const anims = root.listAnimations();
  const keep = anims.find((a) => a.getName() === clipName);
  const tpose = anims.find((a) => a.getName() === "A_TPose");
  if (!keep) {
    console.log(`no clip ${clipName} for ${name}`);
    continue;
  }
  // An animation owns its channels and samplers; dropping it alone leaves their accessors in the file.
  const drop = (a) => {
    for (const ch of a.listChannels()) ch.dispose();
    for (const smp of a.listSamplers()) smp.dispose();
    a.dispose();
  };
  for (const a of anims) if (a !== keep && a !== tpose) drop(a);
  keep.setName(name);
  // The T-pose is a held pose: one frame says it all.
  if (tpose) {
    for (const s of tpose.listSamplers()) {
      const inp = s.getInput();
      const out = s.getOutput();
      if (!inp || !out) continue;
      const n = out.getElementSize();
      const first = new Float32Array(n);
      out.getElement(0, first);
      const i2 = doc.createAccessor().setType("SCALAR").setArray(new Float32Array([0])).setBuffer(root.listBuffers()[0]);
      const o2 = doc.createAccessor().setType(out.getType()).setArray(first).setBuffer(root.listBuffers()[0]);
      // The old accessors are shared by every sampler of the pose; prune drops them once nothing points at them.
      s.setInput(i2).setOutput(o2).setInterpolation("STEP");
    }
    tpose.setName("A_TPose");
  }
  // Put the clip first: the engine reads animations[0] as the clip.
  const list = root.listAnimations();
  if (list[0] !== keep) {
    // gltf-transform keeps insertion order; recreate by detaching and re-adding is not exposed,
    // so swap names is not enough — rebuild order through the graph by disposing and re-creating the T-pose copy.
    // Simplest: rely on the writer emitting in creation order; the T-pose was created before the clip,
    // so clone the clip into a fresh animation created after the T-pose, and dispose the original.
    const fresh = doc.createAnimation(name);
    for (const ch of keep.listChannels()) fresh.addChannel(ch);
    for (const s of keep.listSamplers()) fresh.addSampler(s);
    keep.dispose();
    // Now the order is [T-pose, fresh]; make the T-pose the later one the same way.
    if (tpose) {
      const t2 = doc.createAnimation("A_TPose");
      for (const ch of tpose.listChannels()) t2.addChannel(ch);
      for (const s of tpose.listSamplers()) t2.addSampler(s);
      tpose.dispose();
    }
  }
  // The mesh: one skinned triangle on the pelvis, enough to keep the skin and its joints in the file.
  const skin = root.listSkins()[0];
  const joints = skin.listJoints();
  const pelvisIdx = Math.max(0, joints.findIndex((j) => j.getName() === "pelvis"));
  const buffer = root.listBuffers()[0];
  const pos = doc.createAccessor().setType("VEC3").setArray(new Float32Array([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0])).setBuffer(buffer);
  const jnt = doc.createAccessor().setType("VEC4").setArray(new Uint8Array([pelvisIdx, 0, 0, 0, pelvisIdx, 0, 0, 0, pelvisIdx, 0, 0, 0])).setBuffer(buffer);
  const wgt = doc.createAccessor().setType("VEC4").setArray(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])).setBuffer(buffer);
  const prim = doc.createPrimitive().setMode(Primitive.Mode.TRIANGLES).setAttribute("POSITION", pos).setAttribute("JOINTS_0", jnt).setAttribute("WEIGHTS_0", wgt);
  const mesh = doc.createMesh("rig").addPrimitive(prim);
  for (const node of root.listNodes()) {
    if (node.getMesh()) {
      const old = node.getMesh();
      node.setMesh(mesh);
      old.dispose();
    }
  }
  for (const m of root.listMaterials()) m.dispose();
  await doc.transform(resample(), prune());
  const out = path.join(outDir, `${name}.glb`);
  await io.write(out, doc);
  const kb = Math.round(fs.statSync(out).size / 1024);
  const names = doc.getRoot().listAnimations().map((a) => a.getName());
  console.log(`${name}.glb ${kb} KB  animations: ${names.join(", ")}`);
  manifest.push(name);
}
fs.writeFileSync(path.join(outDir, "clips.json"), JSON.stringify(manifest) + "\n");
console.log("clips.json:", manifest.join(", "));
void Accessor;
