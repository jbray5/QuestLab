# Plan 00047 — Player Marketplace ("explore the town shops")

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Created:** 2026-07-17 (owner ask: "a full marketplace for the players with a
storefront full of images of items and prices they can explore in town").
Target: usable for Session 3 (Sat 2026-07-18) town scenes in Hollowmere.

## Concept
Shops belong to a campaign. Each shop is a themed storefront (keeper, blurb,
banner art) stocked with priced items. Players get **capability URLs** — the
same trust model as the Table View (UUID is the secret, no stats leak):

- `/market/:campaignId` — the town square: every shop as a browsable card.
- `/shop/:shopId` — one storefront: banner hero, keeper's patter, item cards
  with AI images, prices, rarity, descriptions.

The DM manages shops at `campaigns/:campaignId/shops` — create, AI-stock,
edit prices/stock, generate item art, copy player links.

## Data model (migration 0027, additive)
- `shops`: id, campaign_id FK→campaigns, name, keeper, blurb, location,
  banner_url, created_at.
- `shop_items`: id, shop_id FK→shops, item_id FK→items, price_gp FLOAT
  (fractions = silver/copper; display-side formats "5 sp"), stock INT NULL
  (NULL = plenty), pitch (keeper's one-liner, player-facing), sort_order.
- Items live in the EXISTING `items` catalog (SRD weapons/magic items are
  already seeded with value_gp + image_url). AI stocking reuses catalog rows
  by case-insensitive name match, creates new ones otherwise — so item art
  is shared across shops and campaigns.

## AI
- **Stock the shop** (Claude, `complete_structured`): shop concept + campaign
  setting/tone → keeper + blurb + N items (name/type/rarity/description/
  price/stock/pitch). Prices anchored to 5e conventions.
- **Item art** (gpt-image-1 1024×1024 → Vercel Blob `items/item-{id}.png`):
  painterly product shot on dark parchment; saved on the catalog item.
- **Shop banner** (gpt-image-1 1536×1024 → `shops/shop-{id}.png`).

## Layers
- `domain/shop.py` — Shop, ShopItem tables + Create/Update/Read +
  StorefrontItem/StorefrontRead/MarketShop (player-safe projections).
- `db/repos/shop_repo.py` — ShopRepo, ShopItemRepo (pure CRUD).
- `services/shop_service.py` — authz (campaign DM), CRUD, stock_shop,
  generate_item_image, generate_banner, storefront/market projections.
- `api/routers/shops.py` — DM endpoints (auth) + GET /storefront/{shop_id}
  and GET /market/{campaign_id} (capability, no auth).
- Frontend: `api/shops.ts`, DM `pages/Shops.tsx`, player
  `pages/MarketView.tsx` + `pages/StorefrontView.tsx`, routes + nav link.
- Tests: `tests/test_services/test_shop_service.py` — authz, stocking with
  mocked Claude, catalog reuse, projection safety, image gen with mocked
  OpenAI/Blob.

## Non-goals (this pass)
- No purchase transactions/gold deduction — players browse, the table
  transacts verbally; DM edits stock. (Cart + PC gold sync is a fast-follow.)
- No per-player visibility rules; a storefront URL shows the whole shop.
