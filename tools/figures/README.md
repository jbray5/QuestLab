# Figures for the immersive table

How a character gets from Reallusion Character Creator (or a bought model) to
walking on the table (Plan 111). The engine supplies the animation; a figure
is a mesh on a Mixamo rig, nothing more.

## Once

```
cd tools/figures
npm install
```

That installs the FBX converter and the glTF packer here, not in the app.

## A character

1. **Character Creator → FBX.** Export the clothed character as FBX
   (`File → Export → FBX (Clothed Character)`), target tool *Blender* or
   *Unity*, textures embedded, **T-pose**, no animation. Real-world height is
   fine — the table sets the standing height itself.
2. **Mixamo → rig.** At mixamo.com, *Upload Character*, drop the FBX, place the
   markers, finish. Pick any animation (it is discarded) and download:
   *Format FBX Binary, Pose T-pose, With Skin*. This is the file the engine
   wants: the character on the standard `mixamorig` skeleton.
   A bought model that is already on a Mixamo rig skips this step.
3. **Pack.**
   ```
   node pack.mjs "C:\path\to\Willa.fbx" -o willa.glb
   ```
   FBX → glTF, textures to 1K WebP, meshopt compression. A 60 MB export lands
   under 10 MB. `--texture 512` if it is still over the 30 MB upload cap.
4. **Upload.** On the character (DM › Characters, or the monster's stat block)
   drop `willa.glb` on the *3D figure* box. The preview shows the figure idling
   and turning; **Walk** makes it pace. The line under it says what the file is:

   - *Mixamo rig — the table's walk, hit and fall apply* — good.
   - *Humanoid rig* — bones without the `mixamorig` prefix (Ready Player Me,
     some shops); the clips bind by bone name and usually work.
   - *No humanoid rig* — it will stand as a statue.

   Height comes from the character's race (a gnome stands 3.5 ft, a goliath
   7.5) or the monster's size category; the model is scaled to it whatever the
   file says.

## The shared clips

Every figure walks with the same clips. Today those are the Soldier's Idle,
Walk and Run. Mixamo has better ones, and hit and death clips the engine will
use the moment they exist:

1. At mixamo.com pick **X Bot** as the character, then an animation —
   *Idle*, *Walking* (tick **In Place**), *Running* (In Place), a *Hit
   Reaction*, a *Death*. Download each: *FBX Binary, 30 fps, Without Skin*.
2. Pack each as a named clip:
   ```
   node pack.mjs --anim idle  "Idle.fbx"
   node pack.mjs --anim walk  "Walking.fbx"
   node pack.mjs --anim run   "Running.fbx"
   node pack.mjs --anim hit   "Hit Reaction.fbx"
   node pack.mjs --anim death "Death.fbx"
   ```
   Each lands in `frontend/public/engine/anim/` and is listed in `clips.json`.
   Commit those files; every figure — the Soldier included — plays them from
   the next deploy.

Walk and run **must be In Place**: the engine moves the figure; the clip only
moves its legs.

## What the engine does with a file

- Reads the rig's rest pose (a T-pose), which way its toes point, and how
  high its hips sit.
- Bakes each shared clip onto the rig in world space, so a Blender re-export
  and a raw Mixamo file animate the same, whatever their bone axes.
- Uses the model's own `idle` / `walk` / `run` / `hit` / `death` clips instead,
  when the file has them (by name, loosely: "Walking" counts).
- Falls back to the Soldier for that one figure if the file fails to load.

Licences: Mixamo characters and animations are royalty-free in projects under
Adobe's terms; Character Creator exports are Justin's; bought models follow
their own licence. Nothing here ships as public content.
