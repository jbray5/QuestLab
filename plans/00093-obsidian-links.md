# Plan 00093 — DM cards → Obsidian vault links

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-07)

**Started:** 2026-09-07 · **Implemented by:** Claude Code

## Purpose
Justin keeps lore, NPC voices and secrets in a local Obsidian vault and wants
one click from a card to that page instead of alt-tabbing and searching.

## Shipped
- **`dm_note`** — an optional vault path ("People/Auntie Sorrel") on NPCs,
  monster stat blocks and battle maps (migration 0045, nullable VARCHAR(300)),
  present on each entity's Create / Read / Update schemas.
- **`ObsidianLink`** (`frontend/src/components/dm/ObsidianLink.tsx`) — a small
  🔮 icon button. Empty path renders nothing. The URI is built in
  `frontend/src/lib/obsidian.ts`:
  `obsidian://open?vault=DnD&file=` + `Hollowmere%2F` + `encodeURIComponent(dmNote)`.
  The vault and folder are two constants at the top of that file.
- **Rendered on DM-private surfaces only**: the NPC table face (the session
  HUD's Tonight's Cast and the DM's NPC library) and the monster stat block
  (the DM's bestiary and the session HUD). The battle-map link sits in the map
  editor's side panel rather than on the map card, because the card is a
  `<button>` and nesting an anchor inside it is invalid HTML.
- **Editors**: a path input in the NPC modal's prep face, in the monster stat
  block (saved on blur), and in the map editor (saved with the map).

## The spoiler rule
The path text names the secret, so it is kept out of the payload as well as
the render — a leak would take two mistakes, not one:
- `player_service.list_visible_npcs` and `table_service.get_projection` both
  build explicit dicts field by field; neither names `dm_note`.
- Every battle-map and monster route requires DM auth. The only
  unauthenticated reads are `/play/{pc_id}/*` and `/table/{session_id}`.
- Nothing renders it on BoardView (DM-auth but screen-shared), TableView,
  Table3DView, PlayerView, CharacterView, or any explorable.

## Verification
- `tests/test_services/test_plan93_dm_note.py` (5): the path round-trips and
  clears on all three entities; the players' NPC list omits both the key and
  the spoiler text; the table projection omits a map's note. Full suite: 892.
- Prod: saved on Aunti Sorrel ("People/Auntie Sorrel"), the Green Hag
  ("Bestiary/Green Hag") and a battle map ("Places/Crossroads clearing"). The
  unauthenticated `/play/{pc}/npcs` and `/table/{session}` responses carry
  neither the key nor the text.

## Notes
The field is `dm_note`, not `dmNote` — the API and its TypeScript types are
snake_case throughout (`portrait_url`, `true_form_url`), and a lone camelCase
field would need a mapping layer. The React prop is `dmNote`.
