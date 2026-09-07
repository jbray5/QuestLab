# Plan 00091 — NPC true form: the face under the mask

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete (live-verified 2026-09-07)

**Started:** 2026-09-07 · **Implemented by:** Claude Code

## Purpose
Justin, prepping Session 9 of The Severance: attach the satyr art to Tavish,
the session's big bad, and a green-hag image to Aunti Sorrel "post reveal."
An NPC had one portrait slot, so a disguised villain had nowhere to keep the
face that appears when the mask comes off — and with generative art off, the
NPC modal had no way to upload a portrait at all.

## Shipped
- **Two faces per NPC.** `true_form_url` and `true_form_revealed` on npcs
  (migration 0044). The player-facing NPC list and every DM surface show the
  true form only once revealed; until then the disguise portrait shows.
- **Reveal on the table face.** NpcTableFace (the mid-scene card, also in
  Tonight's Cast) gets a "🎭 Reveal true form" button that flips the switch
  and swaps the portrait on the players' phones and the DM's dock at once;
  "↩ Disguise" puts the mask back.
- **Plain uploads in the NPC modal.** A preview + file-picker slot for the
  portrait and for the true form, stored in the art bucket through the
  existing map uploader (the AI generator stays behind its flag).
- **Content.** Tavish (Satyr, hidden until met) with the satyr art as his
  portrait; Aunti Sorrel (hidden until met) with the hag art as her true
  form and no disguise portrait yet — the reveal switch is off.

## Verification
- `tests/test_services/test_plan91_true_form.py`: the disguise shows until
  `true_form_revealed` flips, then the true form, then back; flipping the
  switch on an NPC with no true form changes nothing.
- Prod: migration 0044 applied on deploy; both images uploaded to the art
  bucket; both NPCs created in The Severance with the fields above and read
  back; the players' NPC list omits them while hidden.
