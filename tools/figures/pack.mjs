#!/usr/bin/env node
/**
 * Pack a rigged character, or a Mixamo clip, for QuestLab's immersive table
 * (Plan 111).
 *
 *   node pack.mjs <character.fbx|.glb> [-o out.glb] [--texture 1024]
 *   node pack.mjs --anim <name> <clip.fbx|.glb>
 *
 * A character: FBX → glTF (fbx2gltf), then textures to 1K WebP and meshopt
 * compression (gltf-transform) — a 60 MB Character Creator export lands
 * under 10 MB with its rig intact. Upload the result on the PC or the
 * monster in QuestLab.
 *
 * A clip (--anim): a Mixamo "without skin" download becomes
 * frontend/public/engine/anim/<name>.glb and is listed in clips.json, where
 * the engine picks it up for every figure. Names: idle, walk, run, hit, death.
 *
 * Needs: `npm install` in this folder once. See README.md for the whole path
 * from Character Creator to the table.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v ?? fallback;
};
const anim = flag("--anim");
const out = flag("-o");
const texture = Number(flag("--texture", "1024"));
const input = args[0];
if (!input || !existsSync(input)) {
  console.error("usage: node pack.mjs <character.fbx|.glb> [-o out.glb] [--texture 1024]\n       node pack.mjs --anim <idle|walk|run|hit|death|slash|cast|shoot> <clip.fbx|.glb>");
  process.exit(2);
}

// slash / cast / shoot: strikes (Plan 113) — the table swings, casts and aims with these when they exist.
const CLIPS = ["idle", "walk", "run", "hit", "death", "slash", "cast", "shoot"];
if (anim && !CLIPS.includes(anim)) {
  console.error(`--anim must be one of ${CLIPS.join(", ")}`);
  process.exit(2);
}

/** FBX → binary glTF, via the fbx2gltf package's bundled converter. */
function fbxToGlb(src, dst) {
  const bin = { win32: "Windows_NT/FBX2glTF.exe", darwin: "Darwin/FBX2glTF", linux: "Linux/FBX2glTF" }[process.platform];
  const exe = join(here, "node_modules", "fbx2gltf", "bin", bin);
  if (!existsSync(exe)) {
    console.error("fbx2gltf is not installed — run `npm install` in tools/figures first.");
    process.exit(1);
  }
  // --binary writes a .glb; --khr-materials-unlit is off so lights hit the model;
  // fbx2gltf appends .glb itself when the output has no extension.
  const base = dst.replace(/\.glb$/i, "");
  execFileSync(exe, ["--binary", "--input", src, "--output", base], { stdio: "inherit" });
  if (!existsSync(dst) && existsSync(`${base}.glb`)) renameSync(`${base}.glb`, dst);
}

function gltfTransform(cmdArgs) {
  const cli = join(here, "node_modules", ".bin", process.platform === "win32" ? "gltf-transform.cmd" : "gltf-transform");
  if (!existsSync(cli)) {
    console.error("gltf-transform is not installed — run `npm install` in tools/figures first.");
    process.exit(1);
  }
  execFileSync(cli, cmdArgs, { stdio: "inherit", shell: process.platform === "win32" });
}

const work = mkdtempSync(join(tmpdir(), "questlab-figure-"));
const isFbx = extname(input).toLowerCase() === ".fbx";
let glb = resolve(input);
if (isFbx) {
  glb = join(work, "converted.glb");
  console.log(`→ FBX to glTF: ${basename(input)}`);
  fbxToGlb(resolve(input), glb);
}

if (anim) {
  const animDir = resolve(here, "..", "..", "frontend", "public", "engine", "anim");
  const dst = join(animDir, `${anim}.glb`);
  console.log(`→ clip "${anim}" → ${dst}`);
  // Clips carry a skeleton and no mesh; prune what fbx2gltf leaves behind, nothing else.
  gltfTransform(["prune", glb, dst]);
  const manifest = join(animDir, "clips.json");
  const names = existsSync(manifest) ? JSON.parse(readFileSync(manifest, "utf8")) : [];
  if (!names.includes(anim)) names.push(anim);
  writeFileSync(manifest, JSON.stringify(names) + "\n");
  console.log(`✓ ${anim}.glb listed in clips.json — commit both, and every figure gets it.`);
} else {
  const dst = resolve(out ?? `${basename(input, extname(input))}.packed.glb`);
  console.log(`→ packing to ${dst} (textures ≤ ${texture}px WebP, meshopt)`);
  // The rig stays whole: no flattening or joining of nodes, no simplification.
  gltfTransform([
    "optimize", glb, dst,
    "--compress", "meshopt",
    "--texture-compress", "webp",
    "--texture-size", String(texture),
    "--flatten", "false",
    "--join", "false",
    "--simplify", "false",
    "--instance", "false",
  ]);
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  const before = readFileSync(resolve(input)).length;
  const after = readFileSync(dst).length;
  console.log(`✓ ${mb(before)} → ${mb(after)}. Upload it on the PC or monster in QuestLab; the preview shows the rig.`);
  if (after > 30 * 1048576) console.warn("⚠ over 30 MB — the upload cap. Try --texture 512.");
}
