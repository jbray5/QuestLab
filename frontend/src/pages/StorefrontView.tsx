import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { playApi } from "../api/play";
import { formatPrice, shopsApi, type StorefrontItem } from "../api/shops";
import { RARITY_COLORS, STORE_CSS, typeEmoji } from "../components/store/storeTheme";

/**
 * StorefrontView — the player-facing shop (Plan 47), /shop/:shopId.
 *
 * A capability URL like the Table View: no login, no DM data. Banner hero,
 * the keeper's patter, and a browsable card grid of priced wares.
 *
 * Plan 50: opened with ?pc=<pcId> (from the player's own sheet), the shop
 * becomes transactional — a purse chip and Buy buttons that spend the PC's
 * coin and drop the item into their pack. The bare link stays browse-only,
 * so it is always safe to screen-share.
 */

/** Player purse rendered the way a keeper counts it. */
function purseLabel(p: { pp: number; gp: number; ep: number; sp: number; cp: number }): string {
  const bits: string[] = [];
  if (p.pp) bits.push(`${p.pp} pp`);
  bits.push(`${p.gp} gp`);
  if (p.ep) bits.push(`${p.ep} ep`);
  if (p.sp) bits.push(`${p.sp} sp`);
  if (p.cp) bits.push(`${p.cp} cp`);
  return bits.join(" ");
}

function ItemCard({
  item,
  pcId,
  purseCp,
  onBought,
}: {
  item: StorefrontItem;
  pcId: string | null;
  purseCp: number | null;
  onBought: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rarityColor = RARITY_COLORS[item.rarity] ?? RARITY_COLORS.Common;

  const buyMut = useMutation({
    mutationFn: () => playApi.buy(pcId as string, item.shop_item_id),
    onSuccess: (receipt) => {
      setError(null);
      onBought(`${receipt.item_name} — added to your pack`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const soldOut = typeof item.stock === "number" && item.stock === 0;
  const priceCp = Math.round(item.price_gp * 100);
  const canAfford = purseCp === null || purseCp >= priceCp;
  const buyable = !!pcId && !item.cost_text && !soldOut;

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
          <span
            className="store-price"
            style={item.cost_text ? { fontStyle: "italic", fontSize: "0.85rem" } : undefined}
          >
            {item.cost_text ? item.cost_text : formatPrice(item.price_gp)}
          </span>
          {typeof item.stock === "number" && (
            <span className="store-stock">
              {item.stock === 0 ? "sold out" : `only ${item.stock} left`}
            </span>
          )}
        </div>
        {buyable && (
          <button
            className="store-buy"
            disabled={buyMut.isPending || !canAfford}
            onClick={() => buyMut.mutate()}
          >
            {buyMut.isPending ? "counting coin…" : canAfford ? "🪙 Buy" : "not enough coin"}
          </button>
        )}
        {pcId && item.cost_text && (
          <div className="store-note">The keeper takes no coin — bargain at the table.</div>
        )}
        {error && <div className="store-note err">{error}</div>}
      </div>
    </div>
  );
}

export default function StorefrontView() {
  const { shopId } = useParams<{ shopId: string }>();
  const [params] = useSearchParams();
  const pcId = params.get("pc");
  const qc = useQueryClient();

  const { data: shop } = useQuery({
    queryKey: ["storefront", shopId],
    queryFn: () => shopsApi.storefront(shopId as string),
    enabled: !!shopId,
    refetchInterval: 30000,
  });
  const { data: pc } = useQuery({
    queryKey: ["storefront-pc", pcId],
    queryFn: () => playApi.get(pcId as string),
    enabled: !!pcId,
  });

  const [toast, setToast] = useState<string | null>(null);
  const onBought = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2600);
    void qc.invalidateQueries({ queryKey: ["storefront", shopId] });
    void qc.invalidateQueries({ queryKey: ["storefront-pc", pcId] });
  };

  const purseCp = pc
    ? pc.pp * 1000 + pc.gp * 100 + pc.ep * 50 + pc.sp * 10 + pc.cp
    : null;

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

  const marketPath = `/market/${shop.campaign_id}${pcId ? `?pc=${pcId}` : ""}`;

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
        {pc && (
          <div className="store-purse">
            🪙 {pc.character_name}&rsquo;s purse: <strong>{purseLabel(pc)}</strong>
          </div>
        )}
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
            <ItemCard
              key={item.shop_item_id}
              item={item}
              pcId={pcId}
              purseCp={purseCp}
              onBought={onBought}
            />
          ))}
        </div>
        {visible.length === 0 && (
          <p style={{ color: "#6b6b7a", marginTop: "2rem" }}>
            Nothing on the shelves matches — try another word.
          </p>
        )}
        <p style={{ marginTop: "2.2rem" }}>
          <Link className="store-back" to={marketPath}>
            ← back to the town market
          </Link>
        </p>
      </div>
      {toast && <div className="store-toast">✓ {toast}</div>}
    </div>
  );
}
