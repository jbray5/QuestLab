# Plan 00111 — Milestone 3: the party's own models

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-17
**Last updated:** 2026-09-17
**Implemented by:** Claude Code
**Program:** [00107 — The Immersive Table](00107-immersive-table.md)

---

## Purpose
Every figure on the live table is the same soldier. Milestone 3 makes each
one *theirs*: a PC or a monster can carry a rigged 3D model, and the engine
walks it, turns it, staggers it when it is hit and drops it when it falls —
with one shared set of animations driving every model, so a new character
needs a mesh and a rig, never its own clips.

Justin builds the humanoids in Reallusion Character Creator and rigs them
through Mixamo ("In, but as non-AI as possible"); the dragonborn, the gnome and
a monster set are bought. This plan is the pipeline those models drop into,
proven end to end today with the models we already have.

---

## Progress
- [x] Step 1: `model_url` on PCs and monsters; the projection resolves each token's model and a sensible height (race / creature size) at build time; `POST /uploads/model` takes a `.glb` (magic-checked, 30 MB) to Vercel Blob
- [x] Step 2: The engine's figure pipeline — any Mixamo-rigged glb: height normalised, facing detected from the feet, the shared clip library retargeted onto it (hips scaled to the model), its own clips used when it brings them; a run for long moves, a hit clip or a recoil, a death clip or a topple; a bad model falls back to the soldier instead of blanking the room
- [x] Step 3: The DM drops a `.glb` on a PC or a monster and sees it idle and turn in a preview before it ever reaches the table
- [x] Step 4: `tools/figures` — the packing script (FBX → glb, textures to 1K, meshopt) and the runbook for Character Creator → Mixamo → QuestLab
- [x] Step 5: Verified — X Bot driven by the Soldier's clips on the spike; live on the table as Nya beside the Soldiers (prod, CDN-hosted, put back afterwards); the DM preview on the Characters page; gate green (950 tests)

---

## Surprises and Discoveries
- **The soldier is a Mixamo rig.** Its bones are `mixamorig:Hips`, `Spine`…
  and its Idle/Walk/Run clips are Mixamo clips — so they are the shared
  library, today, for every model that comes through Mixamo. Justin's hit and
  death clips join the library as files; nothing in the engine changes.
- **Bone-local rotations do not transfer between exports of the same rig.**
  The first cut copied clip tracks by bone name — the standard Mixamo trick —
  and X Bot came out crumpled. Blender re-orients bone axes on FBX import, so
  the same `mixamorig:LeftArm` has a different local frame in the Soldier
  (a Blender bake) than in a raw export. The fix is to bake: pose the source,
  read each bone's world-space change from its rest, turn it into the
  target's facing, apply it to the target bone's rest. Only the rest pose (a
  T-pose) has to agree. The Soldier's own `TPose` clip is used as its rest.
- **Facing can be read from the feet.** A rigged humanoid's toes point
  forward in its rest pose; `toe − ankle` gives the model's forward vector, so
  no model needs a hand-entered facing. The soldier faces −Z (a Blender bake);
  a raw Mixamo export faces +Z; both detect.
- **Daz Studio is scriptable from the command line, and the engine takes its
  rigs directly.** `DAZStudio.exe -instanceName Builder -noPrompt build.dsa`
  builds a figure by dial and preset, captures previews and exports the FBX
  with the right options — no UI. And with Genesis bone names aliased and the
  bake aligning each limb to the source's, a Daz A-pose export walks on the
  Soldier's clips without Mixamo. Willa was built this way in one evening,
  from the library Justin installed; the rest of the party is the same
  script with different specs.
- **Vercel Blob is already cross-origin.** `Access-Control-Allow-Origin: *`,
  a year of immutable cache — a `.glb` there loads into the engine page with
  no proxy.
- **Height is not in the file.** Character Creator exports real metres; a
  bought model is whatever the artist typed. The projection sends a height in
  feet — from the PC's race, from the monster's size — and the engine scales
  the model's bounding box to it. A gnome is a gnome whatever the file says.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-17 | Animations | (a) each model ships its own clips (b) one shared Mixamo library retargeted at load | (b), (a) honoured when present | A character is a mesh and a rig; the walk is the engine's. Justin's pipeline needs no Blender pass per character. |
| 2026-09-17 | Where the model lives | (a) a registry in code (b) `model_url` on the row, resolved into the projection | (b) | A model is campaign data like a portrait; the DM sets it where they set the portrait. |
| 2026-09-17 | Height | in the file / a field / derived | derived (race, size), normalised by bounding box | Zero fields to fill in, and every model stands the right height beside every other. A per-character override is one column when it is wanted. |
| 2026-09-17 | Bad models | blank the scene / fall back | fall back to the soldier, per figure | A broken upload on one monster must not black out the party's screen. |
| 2026-09-17 | Preview | none / a spinning figure in the editor | the figure, idling | The DM sees the rig, the height and the clips before Saturday, not during. |

---

## Context and Orientation
- `frontend/src/engine/figureModel.ts` — the clip library, retargeting, normalisation, facing
- `frontend/src/engine/Walker.tsx` — takes a `model`
- `frontend/src/engine/session.ts`, `Party.tsx`, `EngineTable.tsx` — the model rides the token
- `frontend/src/components/ModelUpload.tsx` + `FigurePreview.tsx` — the DM's drop zone and preview
- `api/routers/uploads.py` (`/uploads/model`), `services/table_service.py` (projection), `domain/*.py`
- `alembic/versions/0050_figure_models.py`
- `tools/figures/` — `pack.mjs` and the runbook

---

## Validation and Acceptance
- [x] A PC with a `model_url` shows that model on the table, at its race's height, walking with the shared clips — X Bot as Nya on the live "Into the Fey" table
- [x] A model with no compatible rig stands still rather than failing; a model that fails to load falls back to the soldier
- [x] `/uploads/model` rejects a non-glb and an oversize file; accepts a glb
- [x] The DM preview shows the figure idling and reports rig / height / clips
- [ ] Justin's first Character Creator export walks on the table — *Justin, with the runbook*
- [x] Gate green

---

## Outcomes and Retrospective
- The engine now takes any Mixamo-rigged `.glb` per PC or monster and walks
  it with the shared clips; X Bot — a rig authored differently from the
  Soldier — idles and walks correctly on the spike with the Soldier's clips
  baked onto it, and its packed form (meshopt + WebP, 611 KB from 2.9 MB)
  loads with its own clips.
- What Justin does next is in `tools/figures/README.md`: Character Creator →
  Mixamo → `pack.mjs` → drop on the character. The preview tells him what
  the file is before Saturday. Hit and death clips are five Mixamo downloads
  and five `pack.mjs --anim` runs; the engine uses them the moment they exist.
- Not done here: a per-character height override (one column when a race
  default is wrong for someone), non-humanoid monsters (a wolf on a quadruped
  rig needs its own clips — the own-clips path handles it, the library does
  not), and the models themselves.
