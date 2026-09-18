# The Immersive Table — user guide

The immersive table is the room your players are in: a built 3D scene of the
active map, lit by its own torches and weather, with a walking figure for every
token. It is a second view of the same table the HUD drives — nothing is set
up in it, and nothing can be changed from it. Put it on the TV (or send remote
players the link) and run the session from the HUD as you already do.

## Opening it

- **From the HUD:** the **🏰 Immersive** button in the top bar (beside 3D Board)
  opens the view for that session in a new tab. Drag the tab to the TV and press
  F11 for full screen.
- **By link:** `https://quest-lab-tau.vercel.app/table/<session id>/engine`. It is the
  same capability link as the Table View — anyone with it can watch, no sign-in.
  Remote players can open it themselves rather than watch a screen share.
- **A map on its own:** `https://quest-lab-tau.vercel.app/engine/spike?map=tavern`
  (`restwater`, `abode`) — for looking at a room without a session.

## What it shows, and what drives it

Everything comes from the HUD's **LIVE** and **MAPS** tabs:

| On the TV | You do this in the HUD |
|---|---|
| The room — walls, furniture, pools, torches | **MAPS** → pick the map. Maps the engine has scene data for (Restwater, Sorrel's abode, the tavern) render as built rooms; any other map renders as its picture, lit, with figures on it. |
| A figure walks to a new spot | Drag its token on the LIVE map. Figures walk in a straight line; place tokens where they should *stand*. |
| The camera glides to whoever's turn it is | Start the fight (**ROLL INIT**), then **END TURN**. It only follows a running fight. |
| A ring under a figure glows | That's the active combatant. Grey ring = defeated. |
| The dark closes in and only revealed ground is lit | **☐ Fog** on the LIVE tab, then **👁 Reveal** and tap the map to open a circle. **Hide all** takes the reveals back. The party is always shown; foes and markers only where revealed. |
| Weather in the air; the light dims | The weather preset and the 🌙 darkness slider (top right of the LIVE tab). |
| A title lands over the table | The **🎬** box under the LIVE map — type, Enter. ✕ takes it down. |
| A ripple on the floor | **◎ Ping** and tap the map. |
| A number floats up and the figure flinches | Apply damage or healing on a combatant. |
| A lantern on a post | A **light** token. |

The view has a few controls of its own, top left: **Grid**, **Follow the turn**
(off = the camera stays where you put it), **Frame the turn** (look at whoever's
up, now), and **?** for the key card.

## Controls (the same keys as TaleSpire)

| Key | Does |
|---|---|
| **W A S D** or arrows | move the view across the board |
| **Q / E** | turn the view |
| mouse wheel | zoom |
| left drag, or middle drag | orbit |
| right drag | pan |
| **double-click** the floor | glide the camera there |
| **F2** | back to the board's own view |
| **Space** | hide the interface — tap to toggle, hold to peek |
| **Tab** | nameplates on / off |
| **F1** | the key card |

Keys do nothing while you're typing in a field.

## Figures

Every token is a walking figure. A PC or a monster with a **3D figure** set on
it is that model; everyone else is the placeholder soldier. Height comes from
the character's race (a gnome stands 3.5 ft, a dragonborn 6.5) or the
monster's size (Large stands 10 ft), so a bought model and a Daz export stand
right beside each other whatever their files say.

- **Set one:** Characters → the character's card → the dashed **⬡ Drop a .glb**
  box (or paste a URL). A monster: Compendium → Monsters → open it → the same box
  under its art. The preview shows the figure idling; **Walk** makes it pace.
  The line under it says what the file is — a Mixamo or Genesis rig means the
  table's walk, hit and fall apply.
- **Make one:** `tools/figures/README.md` — Daz Studio exports go straight
  through the packer, no Mixamo needed; Mixamo characters need a T-pose download.
- A figure that fails to load falls back to the soldier on its own; the room
  never goes dark because of one file.

## Session 7, in order

1. HUD → **MAPS** → *Restwater*. Open **🏰 Immersive** on the TV. **+ Party** if the
   tokens aren't on this map yet; drag everyone to their starting spots.
2. **ROLL INIT** starts the fight; the camera follows turns from then on.
3. Down the ladder: **MAPS** → *Sorrel's abode*. The TV switches to the lair.
   **+ Party** again (or **Regroup**) to line the party up on the new map, then
   drag them where they climb down.
4. Fog if you want it: **☐ Fog** on, **👁 Reveal** around the party as they go.

## Honest limits, today

- Figures walk in straight lines and through walls or furniture — pathing
  around things is Milestone 4.
- Everyone from the Daz library wears the same leather set; outfits change as
  the library grows.
- Mira's stat block is Large, which the table stands at 10 ft; the story says 12.
- Steven and Sarranthia are the soldier by choice; Creed has no cloak (it hung
  past his boots).
- The engine wants a real GPU. On a laptop without one, expect a slideshow.
