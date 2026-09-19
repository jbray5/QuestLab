# Plan 00113 — Strikes: attacks the table can see, and a table that keeps up

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Started:** 2026-09-18
**Last updated:** 2026-09-18
**Implemented by:** Claude Code
**Program:** [00107 — The Immersive Table](00107-immersive-table.md)

---

## Purpose
Justin, the night before session 7: "can you add combat animations for melee and
ranged spell attacks? and colors for different spell types?" and "everything is
pretty laggy." Today a hit is a number floating off the figure that took it and
a flinch. Nobody swings, nothing flies. The table knows whose turn it is, so it
knows who struck: when damage lands during a running fight, the active
combatant is the attacker. That one inference gives every hit a source, and the
DM's choice of damage type gives it a colour.

The lag has a known shape: three shadow-casting torches (six renders each),
ambient occlusion, depth of field and a 1.5× pixel ratio, over a dozen skinned
figures. A **Fast** mode drops the expensive passes, and a probe turns it on by
itself when the machine can't hold the frame rate.

---

## Progress
- [x] Step 1: The strike event — `publish_table_fx` carries `from_ref` (the active combatant when damage or healing lands on someone else) and `flavor` (the damage type the DM chose); `SessionCombatantUpdate.hit_flavor` rides the HP patch and is never stored; test
- [x] Step 2: The DM's choice — a chip row on the HUD's combat tracker ("Next hit: ⚔ weapon / 🔥 fire / ❄ cold …"), sticky until changed; casting a spell from a PC's spell panel sets it to the spell's damage type
- [x] Step 3: The engine plays it — the attacker turns to the target and strikes: a lunge and a swing when adjacent, a raised-arms cast with a bolt when not (an arrow streak for a weapon); the bolt's colour is the damage type's; the target flinches when it lands, not before
- [x] Step 4: Fast mode — one toggle (persisted) that drops torch shadows, ambient occlusion and depth of field and pins the pixel ratio to 1; an fps probe turns it on after a slow first few seconds
- [x] Step 5: Verified on the spike (`?strike=melee|cast`) and the live table; gate green

---

## Surprises and Discoveries
- `hit_flavor` rides `SessionCombatantUpdate` but is not a column; the repo's `update_one`
  excludes it from the `setattr` loop. SQLModel's `Field` takes `regex=`, not pydantic's `pattern=`.
- The arm swing is additive on top of the clip: the bones' quaternions are saved before the bend
  and restored at the top of the next frame, so a bone the clip does not animate cannot drift.
  A positive angle about the figure's world right axis raises the arm forward-up; 2.5 rad is
  over the head, 0.5 rad is waist height — checked on the spike with `?strike=melee&hold=0.28`.
- Daz's Diffuse Color tint never survives the FBX export (every material lands at 1,1,1), which
  is why Sorrel was pale on the table. Tints are now applied to the packed file
  (`scratchpad/figs/tint_glb.mjs`, on the raw glb before optimize). A pose baked into the Daz
  export survives as the rig's rest — the hag's hunch — but arrives deeper than dialled.
- `npx eslint src` over the whole frontend reports 26 pre-existing errors (Confetti's Math.random
  in render, setState-in-effect in TableView/TownCrier, unused `_readOnly` aliases …). The
  engine and every file touched here lint clean; the rest is a chore for a quiet day.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-09-18 | Who attacked | ask the DM per hit / the active combatant | active combatant | The tracker already knows whose turn it is; a per-hit picker is friction at the table. Outside a running fight there is no attacker and the hit plays as before. |
| 2026-09-18 | Attack clips | Mixamo clips per rig / procedural | procedural, additive on the rig's mapped bones | Works on every rig the table has (Mixamo, Genesis 8/9, the Soldier) tonight; a Mixamo swing dropped into `clips.json` can replace it later without touching the wiring. |
| 2026-09-18 | Damage type | inferred from the attacker / DM picks | DM picks, sticky, spell panel pre-fills | Inference gets fire wrong for a sorcerer casting Ray of Frost; one chip before the hit is cheap and the spell panel does it for casters anyway. |
| 2026-09-18 | Fast mode | manual only / auto only / both | both | The TV machine changes; a probe catches the bad case, the toggle lets Justin decide. |

---

## Validation and Acceptance
- [x] A damage patch during a running fight publishes `from_ref` = the active combatant's token ref and the chosen `flavor`; outside a fight, neither
- [x] On the table, a melee hit shows the attacker lunging at the target; a spell shows a bolt in the type's colour and a burst where it lands; the target flinches on impact
- [x] Fast mode drops the frame cost visibly (no torch shadows, no AO/DoF) and survives a reload
- [x] Gate green

---

## Follow-up, the morning after (2026-09-18, same day)
Justin's first DM pass: tokens all read "Cultist" (the projection now gives a foe token its
tracker row's numbered name); the struck figure now turns to face its attacker; the spell
panel was only on the character sheet, so the HUD card now lists a PC's damaging and
healing spells as **Cast** chips; a **turn card** (headshot + name) sits top right of the TV.
The lag's real cause was strand hair: 520k–930k triangles per figure (Eirgrid, Mavick),
3–4 million skinned triangles on the table. Decimated to 30% with meshopt
(`scratchpad/figs/simplify_hair.mjs`, reads the packed glb) and re-uploaded. A scripted DM
night (`scratchpad/shots/pressure.mjs`) drives a scratch session through moves, every kind
of hit, a KO, the hatch, the descent, fog and a reroll, and reads the projection and the
table's console after each beat.

## The graphics pass, Friday night ("All of it")
1. **Real maps.** The Daz library keeps the normal (`_NM_`, `_Normal`, `_Normal_OpenGL`),
   roughness (`_R_`, `_Roughness`) and metallic (`_Metallic`) maps beside every colour map the
   export kept. `scratchpad/figs/attach_maps.mjs` indexes `Runtime/Textures`, derives the names
   from each material's colour texture, packs roughness+metallic into one glTF texture
   (G, B) and attaches normals at 2K, MR at 1K; `gltf-transform optimize` after. Every figure
   on the table (four PCs, Mira, Edrik, the dryads, the cultists, Sorrel) re-uploaded at
   5–20 MB. `dressFigure` defers to the maps when a file carries them.
2. **Clips.** `pack.mjs --anim slash|cast|shoot` accepted; the Walker plays them for a strike
   when present. Waiting on Justin's Mixamo downloads.
3. **Pools** already reflect (MeshReflectorMaterial). **Light shafts:** a faint additive cone
   under each torch flame.
4. Hair cards and sculpted rooms remain art work for another day.

## Saturday small hours — "take the browser as far as you can"
- **Faces against the canon painting.** A Daz lineup of every head in the library
  (`F:/DAZ 3D/ql-scratch/lineup.dsa`), then Willa (Amala/Kat, the laugh baked in), Nya
  (Laura/Amala, a half smile, pale skin) and Thane (Fabrice, dark Mavick) rebuilt from
  `specs.json` through `gen_faces.py`, exported with hair at 45%, maps attached, uploaded.
  Creed's scales warmed to golden olive by tint. The spike gained `?light=studio` and
  `&orbit=` for judging a face.
- **The look, rounds two and three.** Skin and eyes on the physical material (a warm sheen,
  a wet clearcoat); hair stays standard — anisotropy on decimated strands sparkles into the
  bloom. A filmic grade (saturation, contrast, grain). Candles as a third light. Wall caps.
  Heads turn toward the active combatant. Restwater's deck is wet and reflects
  (`MeshReflectorMaterial`, one extra render, off in Fast). Restwater dressed with Poly Haven
  props (buckets, baskets, a bench, jugs, a bed, a shelf, candlesticks) — every model checked
  against the CDN first, since a missing one crashes the room.
- **Sound**, synthesised (no files): whoosh/thud/twang/shimmer/pop/chime/boom/tick. An
  initiative strip of headshots. Monster tokens take their stat block's art.
- **The CPU.** Justin's CPU was the ceiling, not the GPU. Each shadow-casting torch is a
  point light: six scene renders a frame for its cube map, and three cast — eighteen extra
  passes of ~500 draw calls. Torches no longer cast; one directional key from high over the
  room casts the shadows (one pass). In Fast mode a figure with nothing to do holds its pose
  (no mixer tick) — game pieces that come alive on their turn. Sorrel rebuilt as a hag with
  the rest of the body telling it: leathers tinted to mud, a deep stoop, white hair to the
  waist, a scowl (`hag3` in `specs.json`).
- **Margarita-shire — the beach bar** (`engine/beach.ts`). Justin: "an immersive beach bar on
  the coast with tropical decor, amped up because it's in the Feywild, patrons at the bar and
  at tables, and a bartender." New engine pieces: `ground: "sand"` and `wall.material:
  "bamboo"` (Poly Haven textures under the file cap), a map's own `sky`/`moon`/`weather`, pools
  with no rim and no steam (the sea), and `people` — resident figures (`Locals.tsx`, still,
  facing one way, no ring). Patrons are tinted variants of Steven, Sarranthia and the
  cultist (`F:/DAZ 3D/ql-scratch/patron_*.glb`, URLs in `patrons.ts`). Poly Haven's
  `coast_rocks_0x` are 45-unit scans — bigger than the map; they buried everyone until the
  scene inspector (`shots/inspect.mjs`) found them. One prop's failed download used to black
  out the whole room; each prop now has its own boundary.
- **Saturday morning.** The beach bar is its own pair of battle maps (Day, Night), pictured
  by the engine's own top-down look (`?look=top&clean=1`, 1536×1024, grid 64) and created
  through the API (`scratchpad/make_beach_maps.py`); the brick tavern keeps the old
  Margarita-shire ids. The day variant is the night map with the sun's rig and a fey
  turquoise sky. The **map shelf** (`table_states.map_shelf`, migration 0051): the HUD's
  MAPS tab shows only the maps a session keeps; staging a map shelves it; the library is a
  click away. A CPU profile of the table page (`shots/profile.mjs`) shows the JavaScript
  thread 92% idle — the remaining cost is draw submission in the GPU process, which is why
  `chrome://gpu` matters more than any further script work.
- **Where the browser limit is, honestly.** Left on the table: face sculpts beyond blends of
  the six library heads (a morph pack), Nya's dress and Thane's ears (assets), motion-captured
  strikes (Justin's Mixamo downloads), hair as cards (modelling), subsurface scattering (a
  custom shader), baked global illumination (not a browser-table job). Everything else that
  three.js can do for a lit room of a dozen skinned figures is on.

## Outcomes and Retrospective
Shipped the night before session 7. A hit in a running fight now has a source and a colour:
the tracker's NEXT HIT chips and the spell panel's Cast button choose it, the API names the
attacker from whose turn it is, and the engine lunges, chops, aims or casts and lands the
blow when the bolt does. Fast mode is the answer to "everything is pretty laggy" until the
figures themselves are cheaper (35 draw calls per Daz figure is the next cost to cut —
a material merge in the packer). Sorrel was rebuilt as a hag: green, hunched, crooked, in rags.
