# Plan 00050 — Transactional Market (buy from your phone)

## Status
[ ] Not started  [ ] In progress  [ ] Blocked  [x] Complete

**Shipped 2026-07-17 (d6a1ae2 + 76b905d).** E2E-verified in prod on a
scratch campaign (created → bought → asserted purse 10 gp − 3.5 gp =
6 gp 5 sp, stock 2→1, item in pack, 409s for barter/broke → deleted).
The E2E also surfaced a latent bug — PCs with inventory/spells/features
were undeletable (FK, no cascade) — fixed in CharacterRepo.delete.

**Created:** 2026-07-17 (owner: "make the market transactional — pick what
they want, spend coin from their account, deduct it, place the item in
their inventory"). Target: live for Session 3 (Sat 2026-07-18).

## Trust model
Buying rides the **player capability URL**, not the shop URL:
`POST /play/{pc_id}/buy {shop_item_id}`. You can only spend from a purse
whose sheet-link you hold. The storefront pages become purchase-aware only
when opened with `?pc=<pcId>` (the player's own sheet links them there);
the bare market link stays browse-only — safe to screen-share.

## Flow
1. Player opens 🏪 Market from their sheet (link carries `?pc=`).
2. Storefront shows their purse and a Buy button per item.
3. Buy → `shop_service.purchase`:
   - shop item + catalog item exist; shop is in the PC's campaign
   - `cost_text` items refuse coin ("The Tallyman does not take coin") —
     fey bargains stay narrative
   - stock: 0 = sold out; a counted item decrements
   - purse: all denominations valued in copper (pp 1000 / gp 100 / ep 50 /
     sp 10 / cp 1); insufficient funds → clear error with shortfall
   - deduction: total-copper accounting, change re-denominated gp/sp/cp
     (value-exact; ep/pp are folded — documented, current purses are gp-only)
   - item lands via `inventory_service.add_item` (quantity-merges, emits
     `pc.inventory.updated`); `pc.updated` also published (purse changed)
4. Response is a receipt (item, price, new purse, stock left); the UI
   refreshes purse + storefront and confirms.

## Layers
- `domain/shop.py`: `PurchaseReceipt`.
- `services/shop_service.py`: `purchase()` + purse-math helpers.
- `services/player_service.py`: thin `buy_item` dispatch (player-scope entry).
- `api/routers/play.py`: `POST /play/{pc_id}/buy`.
- Frontend: buy buttons + purse chip on StorefrontView, `?pc=` threading on
  Market/Storefront links, 🏪 Market button on the player sheet.
- No migration — uses existing currency + inventory columns.

## Non-goals
- No haggling/discount mechanics (DM edits prices live instead).
- No refunds endpoint — DM reverses manually via inventory + currency edit.
- Fey-market bargains stay DM-run (that's the point of them).
