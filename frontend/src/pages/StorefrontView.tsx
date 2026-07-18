import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { formatPrice, shopsApi, type StorefrontItem } from "../api/shops";
import { RARITY_COLORS, STORE_CSS, typeEmoji } from "../components/store/storeTheme";

/**
 * StorefrontView — the player-facing shop (Plan 47), /shop/:shopId.
 *
 * A capability URL like the Table View: no login, no DM data. Banner hero,
 * the keeper's patter, and a browsable card grid of priced wares.
 */

function ItemCard({ item }: { item: StorefrontItem }) {
  const [expanded, setExpanded] = useState(false);
  const rarityColor = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.Common;
  return (
    <div className="store-card">
      <div className="store-card-img">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" />
        ) : (
          <span className="ph">{typeEmoji(item.item_type)}</span>
        )}
      </div>
      <div className="store-card-body">
        <h3>{item.name}</h3>
        <div className="store-meta" style={{ color: rarityColor }}>
          {item.item_type}
          {item.rarity !== "Common" ? ` · ${item.rarity.replace("VeryRare", "Very Rare")}` : ""}
          {item.attunement_required ? " · attune" : ""}
        </div>
        {item.pitch && <div className="store-pitch">“{item.pitch}”</div>}
        {item.description && (
          <div
            className={expanded ? "store-desc" : "store-desc clamp"}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? undefined : "Tap for more"}
          >
            {item.description}
          </div>
        )}
        <div className="store-foot">
          <span className="store-price" style={item.cost_text ? { fontStyle: "italic", fontSize: "0.85rem" } : undefined}>
            {item.cost_text ? item.cost_text : formatPrice(item.price_gp)}
          </span>
          {typeof item.stock === "number" && (
            <span className="store-stock">
              {item.stock === 0 ? "sold out" : `only ${item.stock} left`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StorefrontView() {
  const { shopId } = useParams<{ shopId: string }>();
  const { data: shop } = useQuery({
    queryKey: ["storefront", shopId],
    queryFn: () => shopsApi.storefront(shopId as string),
    enabled: !!shopId,
    refetchInterval: 30000,
  });

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const set = new Set((shop?.items ?? []).map((i) => i.item_type));
    return [...set].sort();
  }, [shop?.items]);

  const visible = (shop?.items ?? []).filter((i) => {
    if (category && i.item_type !== category) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      i.name.toLowerCase().includes(q) ||
      (i.description ?? "").toLowerCase().includes(q) ||
      (i.pitch ?? "").toLowerCase().includes(q)
    );
  });

  if (!shop) {
    return (
      <div className="store-root">
        <style>{STORE_CSS}</style>
        <div
          className="store-inner"
          style={{ paddingTop: "30vh", textAlign: "center", color: "#6b6b7a" }}
        >
          Opening the shutters…
        </div>
      </div>
    );
  }

  return (
    <div className="store-root">
      <style>{STORE_CSS}</style>
      {shop.banner_url && (
        <div className="store-hero">
          <img src={shop.banner_url} alt={shop.name} />
        </div>
      )}
      <div className="store-inner">
        <h1 className="store-title">{shop.name}</h1>
        <div className="store-sub">
          {shop.keeper ? `Proprietor: ${shop.keeper}` : ""}
          {shop.keeper && shop.location ? " · " : ""}
          {shop.location ?? ""}
        </div>
        {shop.blurb && <p className="store-blurb">{shop.blurb}</p>}
        <div style={{ margin: "0.9rem 0 0.4rem" }}>
          <input
            className="store-search"
            placeholder="Search the shelves…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {categories.length > 1 && (
          <div className="store-chips">
            <button
              className={category === null ? "store-chip on" : "store-chip"}
              onClick={() => setCategory(null)}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "store-chip on" : "store-chip"}
                onClick={() => setCategory((cur) => (cur === c ? null : c))}
              >
                {typeEmoji(c)} {c}
              </button>
            ))}
          </div>
        )}
        <div className="store-grid">
          {visible.map((item) => (
            <ItemCard key={item.shop_item_id} item={item} />
          ))}
        </div>
        {visible.length === 0 && (
          <p style={{ color: "#6b6b7a", marginTop: "2rem" }}>
            Nothing on the shelves matches — try another word.
          </p>
        )}
        <p style={{ marginTop: "2.2rem" }}>
          <Link className="store-back" to={`/market/${shop.campaign_id}`}>
            ← back to the town market
          </Link>
        </p>
      </div>
    </div>
  );
}
