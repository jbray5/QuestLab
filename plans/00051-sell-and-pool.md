# Plan 00051 — Sell to Vendors + Pool Coin

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Created:** 2026-07-18 (owner: "make a sell option where they can sell
their items to vendors for gold... and a way to pool their gold for a
group purchase or all pitch in for one character to buy something").

## Design
Two player-capability actions, same trust model as buying (Plan 50):

1. **Sell** — `POST /play/{pc_id}/sell {character_item_id}`. Classic 5e
   convention: vendors pay **half the item's catalog value**. One unit per
   tap (quantity decrements; the row disappears at zero). Refusals:
   equipped items ("unequip it first" — no accidental sword sales), items
   worth nothing, and quest items (the Ciphered Page is not for sale).
   Coin credits with the same copper-exact math as buying.
2. **Pool coin** — `POST /play/{pc_id}/give {to_pc_id, amount_gp}`.
   Direct transfers between party members: "everyone pitch in" is
   everyone sending coin to the designated buyer, who then buys. Same
   campaign only, not to yourself, capped by the purse; both purses
   re-denominated; both sheets update live over SSE.
   Plus `GET /play/{pc_id}/party` — names+ids of campaign PCs (the
   transfer dropdown; names only, no stats).

## Layers
- `domain/shop.py`: SellRequest/SellReceipt, GiveRequest/TransferReceipt.
- `services/shop_service.py`: `sell()` + `sell_price()` (single source of
  the half-value rule; also surfaces `sell_gp` on gear rows).
- `services/player_service.py`: `sell_item`/`give_coin`/`list_party`
  dispatches; `list_gear` rows gain `sell_gp`.
- `api/routers/play.py`: the three routes.
- Frontend: storefront (with `?pc=`) gains a "💰 Sell from your pack"
  section and a "🤝 Pool coin" widget next to the purse chip.
- No migration.

## Non-goals
- No per-shop haggling/buy-rates (DM adjudicates special sales at table).
- No shared party-fund ledger — transfers to a buyer are the pool.
- Sold items do not enter shop stock (vendor "keeps" them).
