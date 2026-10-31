import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronLeft, Coins, Handshake, Search } from "lucide-react";

import { playApi, type GearRow } from "../api/play";
import { formatPrice, shopsApi, type StorefrontItem } from "../api/shops";
import { STORE_CSS, rarityClass, rarityLabel, typeIcon } from "../components/store/storeTheme";

/**
 * StorefrontView — the player-facing shop (Plan 47), /shop/:shopId.
 *
 * A capability URL like the Table View: no login, no DM data. Banner hero,
 * the keeper's patter, and a browsable list of priced wares.
 *
 * Plan 50: opened with ?pc=<pcId> (from the player's own sheet), the shop
 * becomes transactional — a purse and Buy buttons that spend the PC's coin
 * and drop the item into their pack. The bare link stays browse-only, so it
 * is always safe to screen-share. Plan 122: links back to the market and to
 * the player's bag, so the shop is never a dead end.
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

/** "1,200 gp 5 sp" with the numbers set in mono and the coin names in the UI font. */
function CoinText({ text }: { text: string }) {
  const parts = text.split(/(\d[\d,.]*)/).filter(Boolean);
  return <>{parts.map((p, i) => (/^\d/.test(p) ? <span key={i} className="num">{p}</span> : p))}</>;
}

/** Sell-from-your-pack + pool-coin strip, shown only in ?pc mode (Plan 51). */
function TradeBar({ pcId, onDone }: { pcId: string; onDone: (msg: string) => void }) {
  const [mode, setMode] = useState<"none" | "sell" | "pool">("none");
  const [error, setError] = useState<string | null>(null);
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");

  const { data: gear = [], isLoading: gearLoading } = useQuery({
    queryKey: ["trade-gear", pcId],
    queryFn: () => playApi.gear(pcId),
    enabled: mode === "sell",
  });
  const { data: party = [] } = useQuery({
    queryKey: ["trade-party", pcId],
    queryFn: () => playApi.party(pcId),
    enabled: mode === "pool",
  });

  const sellMut = useMutation({
    mutationFn: (g: GearRow) => playApi.sell(pcId, g.character_item_id),
    onSuccess: (r) => {
      setError(null);
      onDone(`Sold ${r.item_name} for ${formatPrice(r.amount_gp)}`);
    },
    onError: (err: Error) => setError(err.message),
  });
  const giveMut = useMutation({
    mutationFn: () => playApi.give(pcId, toId, Number(amount)),
    onSuccess: (r) => {
      setError(null);
      setAmount("");
      onDone(`Gave ${formatPrice(r.amount_gp)} to ${r.to_name}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const sellable = gear.filter((g) => g.sell_gp !== null && !g.equipped);

  return (
    <div className="trade-bar">
      <div className="store-chips">
        <button
          type="button"
          aria-pressed={mode === "sell"}
          className={mode === "sell" ? "store-chip on" : "store-chip"}
          onClick={() => setMode((m) => (m === "sell" ? "none" : "sell"))}
        >
          <Coins size={16} /> Sell from your pack
        </button>
        <button
          type="button"
          aria-pressed={mode === "pool"}
          className={mode === "pool" ? "store-chip on" : "store-chip"}
          onClick={() => setMode((m) => (m === "pool" ? "none" : "pool"))}
        >
          <Handshake size={16} /> Give coin to a friend
        </button>
      </div>
      {mode === "sell" && (
        <div className="store-panel" style={{ gap: 6 }}>
          <span className="store-label">The keeper pays half of what a thing is worth.</span>
          {gearLoading ? (
            <span className="store-note">Opening your pack…</span>
          ) : sellable.length === 0 ? (
            <span className="store-note" style={{ color: "var(--text2)" }}>
              Nothing the keeper will buy. Take gear off first (in Your look and gear) to sell it;
              quest items can&rsquo;t be sold.
            </span>
          ) : (
            sellable.map((g) => (
              <button
                type="button"
                key={g.character_item_id}
                className="trade-sell-row"
                disabled={sellMut.isPending}
                onClick={() => sellMut.mutate(g)}
              >
                <span style={{ minWidth: 0 }}>
                  {g.name}
                  {g.quantity > 1 ? <span className="num"> ×{g.quantity}</span> : ""}
                </span>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, flex: "none" }}>
                  <span className="store-label">Sell for</span>
                  <span className="store-price" style={{ fontSize: "0.95rem" }}>
                    <CoinText text={formatPrice(g.sell_gp as number)} />
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
      {mode === "pool" && (
        <div className="store-panel">
          <span className="store-note" style={{ color: "var(--text2)" }}>
            Pitching in for a group buy? Send gold to whoever is buying.
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <select
              aria-label="Give to"
              value={toId}
              onChange={(e) => setToId(e.target.value)}
              style={{ flex: "1 1 160px", minHeight: 44, width: "auto" }}
            >
              <option value="">Give to…</option>
              {party.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.character_name}
                </option>
              ))}
            </select>
            <input
              aria-label="Gold to give"
              className="num"
              style={{ width: 96, minHeight: 44, textAlign: "center" }}
              placeholder="gold"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 44 }}
              disabled={giveMut.isPending || !toId || !(Number(amount) > 0)}
              onClick={() => giveMut.mutate()}
            >
              {giveMut.isPending ? "Sending…" : "Give"}
            </button>
          </div>
        </div>
      )}
      {error && <div className="store-note err">{error}</div>}
    </div>
  );
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

  const buyMut = useMutation({
    mutationFn: () => playApi.buy(pcId as string, item.shop_item_id),
    onSuccess: (receipt) => {
      setError(null);
      onBought(`${receipt.item_name} is in your pack.`);
    },
    onError: (err: Error) => setError(err.message),
  });

  const soldOut = typeof item.stock === "number" && item.stock === 0;
  const priceCp = Math.round(item.price_gp * 100);
  const canAfford = purseCp === null || purseCp >= priceCp;
  const buyable = !!pcId && !item.cost_text && !soldOut;

  return (
    <div className="store-card">
      <div className="store-thumb">
        {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : typeIcon(item.item_type, 24)}
      </div>
      <div className="store-card-body">
        <h3>{item.name}</h3>
        <div className="store-meta">
          <span>{item.item_type}</span>
          {item.rarity !== "Common" && <span className={rarityClass(item.rarity)}>{rarityLabel(item.rarity)}</span>}
          {item.attunement_required && <span title="You must bond with it over a short rest to use its magic; you can be attuned to three items at once.">Needs attunement</span>}
        </div>
        {item.pitch && <div className="store-pitch">&ldquo;{item.pitch}&rdquo;</div>}
        {item.description && (
          <button
            type="button"
            className={expanded ? "store-desc" : "store-desc clamp"}
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            {item.description}
          </button>
        )}
        <div className="store-foot">
          <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className={item.cost_text ? "store-price barter" : "store-price"}>
              {item.cost_text ? item.cost_text : <CoinText text={formatPrice(item.price_gp)} />}
            </span>
            {typeof item.stock === "number" && (
              <span className={item.stock === 0 ? "store-stock out" : "store-stock"}>
                {item.stock === 0 ? "Sold out" : `Only ${item.stock} left`}
              </span>
            )}
          </span>
          {buyable && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 44 }}
              disabled={buyMut.isPending || !canAfford}
              onClick={() => buyMut.mutate()}
            >
              {buyMut.isPending ? "Buying…" : canAfford ? "Buy" : "Not enough coin"}
            </button>
          )}
        </div>
        {pcId && item.cost_text && (
          <div className="store-note">The keeper doesn&rsquo;t take coin for this. Bargain at the table.</div>
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

  const { data: shop, isError } = useQuery({
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
    void qc.invalidateQueries({ queryKey: ["trade-gear", pcId] });
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

  const sheetLink = pcId ? (
    <Link className="store-back" to={`/play/${pcId}?tab=bag`}>
      <ChevronLeft size={18} /> Back to your sheet
    </Link>
  ) : null;

  if (!shop) {
    return (
      <div className="store-root">
        <style>{STORE_CSS}</style>
        <div className="store-inner" style={{ maxWidth: 720 }}>
          {sheetLink && <nav className="store-nav" aria-label="Back">{sheetLink}</nav>}
          <p className="store-note" style={{ paddingTop: "30vh", textAlign: "center", fontSize: "1rem" }}>
            {isError ? "We couldn’t open this shop. It may have closed; ask your DM." : "Opening the shop…"}
          </p>
        </div>
      </div>
    );
  }

  const marketPath = `/market/${shop.campaign_id}${pcId ? `?pc=${pcId}` : ""}`;

  return (
    <div className="store-root">
      <style>{STORE_CSS}</style>
      <div className="store-inner">
        <nav className="store-nav" aria-label="Back">
          <Link className="store-back" to={marketPath}>
            <ChevronLeft size={18} /> Market
          </Link>
          {sheetLink}
        </nav>
        {shop.banner_url && (
          <div className="store-hero">
            <img src={shop.banner_url} alt="" />
          </div>
        )}
        <h1 className="store-title" style={{ marginTop: 10 }}>{shop.name}</h1>
        {(shop.keeper || shop.location) && (
          <div className="store-sub">
            {shop.keeper ? <>Kept by <span className="story" style={{ fontWeight: 700 }}>{shop.keeper}</span></> : null}
            {shop.keeper && shop.location ? " · " : ""}
            {shop.location ?? ""}
          </div>
        )}
        {shop.blurb && <p className="store-blurb">{shop.blurb}</p>}
        {pc && (
          <div className="store-panel store-purse">
            <div className="store-purse-row">
              <Coins size={18} color="var(--accent-text)" />
              <span className="store-label">Your coin</span>
              <span className="store-purse-coins"><CoinText text={purseLabel(pc)} /></span>
            </div>
          </div>
        )}
        {pcId && <TradeBar pcId={pcId} onDone={onBought} />}
        {!pcId && (
          <p className="store-note" style={{ marginTop: 12 }}>
            Browsing only. Open the market from your phone&rsquo;s Bag tab to buy and sell.
          </p>
        )}
        <div className="store-search-wrap">
          <Search size={16} />
          <input
            type="search"
            className="store-search"
            aria-label="Search this shop"
            placeholder="Search this shop"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {categories.length > 1 && (
          <div className="store-chips" style={{ marginBottom: 12 }}>
            <button
              type="button"
              aria-pressed={category === null}
              className={category === null ? "store-chip on" : "store-chip"}
              onClick={() => setCategory(null)}
            >
              Everything
            </button>
            {categories.map((c) => (
              <button
                type="button"
                key={c}
                aria-pressed={category === c}
                className={category === c ? "store-chip on" : "store-chip"}
                onClick={() => setCategory((cur) => (cur === c ? null : c))}
              >
                {typeIcon(c, 16)} {c}
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
          <div className="store-panel" style={{ marginTop: 8 }}>
            {shop.items.length === 0 ? (
              <span style={{ color: "var(--text2)" }}>
                The shelves are bare for now. Your DM stocks this shop from their screen.
              </span>
            ) : (
              <>
                <span style={{ color: "var(--text2)" }}>Nothing here matches that.</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ alignSelf: "flex-start", minHeight: 44 }}
                  onClick={() => {
                    setSearch("");
                    setCategory(null);
                  }}
                >
                  Show everything
                </button>
              </>
            )}
          </div>
        )}
        <nav className="store-nav" aria-label="Leave the shop" style={{ marginTop: 24 }}>
          <Link className="store-back" to={marketPath}>
            <ChevronLeft size={18} /> Back to the market
          </Link>
          {sheetLink}
        </nav>
      </div>
      {toast && (
        <div className="store-toast" role="status">
          <Check size={18} color="var(--teal)" /> {toast}
        </div>
      )}
    </div>
  );
}
