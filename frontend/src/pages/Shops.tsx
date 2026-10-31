import { useState, type CSSProperties } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  EyeOff,
  ExternalLink,
  Link2,
  Palette,
  Plus,
  Sparkles,
  Store,
} from "lucide-react";
import { AI_ON } from "../lib/flags";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  formatPrice,
  shopsApi,
  type ShopRead,
  type StorefrontItem,
} from "../api/shops";
import RowMenu, { type RowMenuItem } from "../components/RowMenu";
import { useIsCompact } from "../hooks/useIsCompact";
import { word } from "../lib/plural";

/**
 * Shops — the DM's marketplace manager (Plan 47), campaigns/:campaignId/shops.
 *
 * Create shops, stock them, tune prices/stock and copy the player-facing
 * capability links (/market, /shop/...). With AI features on, it can also
 * stock a shop and paint item and banner art. Lamplit + phones: Plan 123.
 */

function playerUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

function CopyButton({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => {
        void navigator.clipboard.writeText(playerUrl(path));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? <Check size={16} /> : <Link2 size={16} />}
      {copied ? "Copied" : label}
    </button>
  );
}

const FIELD_LABEL: CSSProperties = {
  fontSize: "0.8125rem",
  color: "var(--muted)",
  marginBottom: "0.2rem",
};

function ItemRow({
  shopId,
  item,
  phone,
  onChanged,
}: {
  shopId: string;
  item: StorefrontItem;
  phone: boolean;
  onChanged: () => void;
}) {
  const [price, setPrice] = useState(String(item.price_gp));
  const [stock, setStock] = useState(item.stock === null || item.stock === undefined ? "" : String(item.stock));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const priceNum = Number(price);
    await shopsApi.updateItem(shopId, item.shop_item_id, {
      price_gp: Number.isFinite(priceNum) ? priceNum : item.price_gp,
      stock: stock.trim() === "" ? null : Math.max(0, Math.floor(Number(stock)) || 0),
    });
    onChanged();
  };

  const menu: RowMenuItem[] = [
    ...(AI_ON
      ? [
          {
            label: busy ? "Painting…" : "Paint item art",
            disabled: busy,
            onSelect: async () => {
              setBusy(true);
              try {
                await shopsApi.generateItemImage(shopId, item.shop_item_id);
                onChanged();
              } finally {
                setBusy(false);
              }
            },
          },
        ]
      : []),
    {
      label: "Remove from shop",
      danger: true,
      confirm: `Remove ${item.name} from this shop?`,
      onSelect: async () => {
        await shopsApi.removeItem(shopId, item.shop_item_id);
        onChanged();
      },
    },
  ];

  const thumb = item.image_url ? (
    <img
      src={item.image_url}
      alt=""
      style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }}
    />
  ) : (
    <span
      aria-hidden
      style={{
        width: 40,
        height: 40,
        borderRadius: 6,
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        display: "block",
      }}
    />
  );

  const name = (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontWeight: 600, color: "var(--text)", lineHeight: 1.3 }}>{item.name}</div>
      <div style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.4 }}>
        {item.item_type}
        {item.rarity !== "Common" ? ` · ${item.rarity === "VeryRare" ? "Very rare" : item.rarity}` : ""}
        {item.pitch && (
          <span className="story" style={{ fontStyle: "italic", color: "var(--text2)" }}>
            {" "}
            — “{item.pitch}”
          </span>
        )}
      </div>
    </div>
  );

  const priceInput = (
    <input
      className="num"
      inputMode="decimal"
      aria-label={`Price of ${item.name} in gold pieces`}
      value={price}
      onChange={(e) => setPrice(e.target.value)}
      onBlur={() => void save()}
      title="Price in gp (0.5 = 5 sp)"
    />
  );
  const stockInput = (
    <input
      className="num"
      inputMode="numeric"
      aria-label={`How many ${item.name} in stock`}
      value={stock}
      placeholder="∞"
      onChange={(e) => setStock(e.target.value)}
      onBlur={() => void save()}
      title="Stock (empty = plenty)"
    />
  );

  if (phone) {
    // Name first, the two numbers on their own row, the menu at the row's right.
    return (
      <div className="ql-table-row" style={{ padding: "0.75rem 0" }}>
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          {thumb}
          <div style={{ flex: 1, minWidth: 0 }}>{name}</div>
          <RowMenu items={menu} label={`More for ${item.name}`} />
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: "0.75rem",
            marginTop: "0.6rem",
          }}
        >
          <div>
            <div style={FIELD_LABEL}>Price (gp)</div>
            {priceInput}
          </div>
          <div>
            <div style={FIELD_LABEL}>Stock</div>
            {stockInput}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ql-table-row"
      style={{
        display: "grid",
        gridTemplateColumns: "40px minmax(0, 1fr) 88px 72px auto",
        gap: "0.75rem",
        alignItems: "center",
        padding: "0.5rem 0",
      }}
    >
      {thumb}
      {name}
      {priceInput}
      {stockInput}
      <RowMenu items={menu} label={`More for ${item.name}`} />
    </div>
  );
}

function ShopCard({ shop, phone, onChanged }: { shop: ShopRead; phone: boolean; onChanged: () => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [stockBusy, setStockBusy] = useState(false);
  const [bannerBusy, setBannerBusy] = useState(false);
  const [artBusy, setArtBusy] = useState<string | null>(null);
  const [newItem, setNewItem] = useState("");

  const storefrontKey = ["storefront", shop.id];
  const { data: storefront } = useQuery({
    queryKey: storefrontKey,
    queryFn: () => shopsApi.storefront(shop.id),
    enabled: open,
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: storefrontKey });
    onChanged();
  };

  const items = storefront?.items ?? [];
  const missingArt = items.filter((i) => !i.image_url);

  const menu: RowMenuItem[] = [
    {
      label: shop.hidden ? "Show on the market" : "Hide from the market",
      onSelect: async () => {
        await shopsApi.update(shop.id, { hidden: !shop.hidden });
        onChanged();
      },
    },
    ...(AI_ON
      ? [
          {
            label: bannerBusy ? "Painting the banner…" : "Paint a banner",
            disabled: bannerBusy,
            onSelect: async () => {
              setBannerBusy(true);
              try {
                await shopsApi.generateBanner(shop.id);
                onChanged();
              } finally {
                setBannerBusy(false);
              }
            },
          },
        ]
      : []),
    {
      label: "Delete shop",
      danger: true,
      confirm: `Delete ${shop.name} and everything it stocks?`,
      onSelect: async () => {
        await shopsApi.remove(shop.id);
        onChanged();
      },
    },
  ];

  return (
    <div className="card" style={{ marginBottom: "1rem", overflow: "hidden" }}>
      {shop.banner_url && (
        <img
          src={shop.banner_url}
          alt=""
          style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8, marginBottom: "0.6rem" }}
        />
      )}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", flexWrap: "wrap" }}>
            <h3 className="story" style={{ margin: 0, fontSize: "1.3rem" }}>
              {shop.name}
            </h3>
            {shop.hidden && (
              <span
                className="pill pill-amber"
                title="Hidden from the player market. Players can still open it from its own link."
              >
                <EyeOff size={13} /> Hidden
              </span>
            )}
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.875rem", marginTop: "0.15rem" }}>
            {shop.keeper ? (
              <>
                <span className="story" style={{ color: "var(--text2)", fontSize: "0.95rem" }}>
                  {shop.keeper}
                </span>
                {" · "}
              </>
            ) : null}
            <span className="num">{shop.item_count}</span> {word(shop.item_count, "item")}
          </div>
        </div>
        <RowMenu items={menu} label={`More for ${shop.name}`} />
      </div>
      {shop.blurb && (
        <p className="story" style={{ margin: "0.5rem 0 0", fontSize: "1rem", color: "var(--story-text)" }}>
          {shop.blurb}
        </p>
      )}
      <div className="ql-actions" style={{ justifyContent: "flex-start", marginTop: "0.75rem" }}>
        <button type="button" className="btn btn-secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {open ? "Hide stock" : "Manage stock"}
        </button>
        <CopyButton label="Copy player link" path={`/shop/${shop.id}`} />
        <a className="btn btn-ghost" href={`/shop/${shop.id}`} target="_blank" rel="noreferrer">
          <ExternalLink size={16} /> Preview
        </a>
        {AI_ON && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={stockBusy}
            title="Stock with AI: keeper, blurb and a priced inventory"
            onClick={async () => {
              const concept =
                window.prompt("Shop concept for the AI (blank = infer from the name):", "") ?? undefined;
              const countRaw = window.prompt("How many items?", "10");
              if (countRaw === null) return;
              setStockBusy(true);
              setOpen(true);
              try {
                await shopsApi.stock(shop.id, concept || undefined, Math.min(24, Math.max(1, Number(countRaw) || 10)));
                refresh();
              } finally {
                setStockBusy(false);
              }
            }}
          >
            <Sparkles size={16} /> {stockBusy ? "Stocking…" : "Stock with AI"}
          </button>
        )}
        {AI_ON && open && missingArt.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
            disabled={artBusy !== null}
            title="Paint art for every item that has none (one at a time)"
            onClick={async () => {
              for (const item of missingArt) {
                setArtBusy(item.name);
                try {
                  await shopsApi.generateItemImage(shop.id, item.shop_item_id);
                } catch {
                  // keep going — one failed image shouldn't stop the batch
                }
                void qc.invalidateQueries({ queryKey: storefrontKey });
              }
              setArtBusy(null);
              refresh();
            }}
          >
            <Palette size={16} />
            {artBusy ? `${artBusy}…` : (
              <>
                Paint art for <span className="num">{missingArt.length}</span>
              </>
            )}
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: "0.9rem" }}>
          {!phone && items.length > 0 && (
            <div
              className="ql-table-head"
              style={{
                display: "grid",
                gridTemplateColumns: "40px minmax(0, 1fr) 88px 72px 2.375rem",
                gap: "0.75rem",
                padding: "0.35rem 0",
                background: "transparent",
              }}
            >
              <span />
              <span>Item</span>
              <span>Price (gp)</span>
              <span>Stock</span>
              <span />
            </div>
          )}
          {items.map((item) => (
            <ItemRow key={item.shop_item_id} shopId={shop.id} item={item} phone={phone} onChanged={refresh} />
          ))}
          {storefront && items.length === 0 && (
            <p className="text-sm text-muted" style={{ margin: "0 0 0.5rem" }}>
              Nothing on the shelves yet. Add the first item below.
            </p>
          )}
          <form
            style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              await shopsApi.addItem(shop.id, { name: newItem.trim(), price_gp: 0 });
              setNewItem("");
              refresh();
            }}
          >
            <input
              type="text"
              style={{ flex: 1, minWidth: 0 }}
              aria-label={`Add an item to ${shop.name}`}
              placeholder="Add an item by name (new or from the catalog)…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
            />
            <button className="btn btn-secondary" type="submit" disabled={!newItem.trim()}>
              <Plus size={16} /> Add
            </button>
          </form>
          {items.length > 0 && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--muted)" }}>
              Cheapest <span className="num">{formatPrice(Math.min(...items.map((i) => i.price_gp)))}</span>
              {" · "}priciest <span className="num">{formatPrice(Math.max(...items.map((i) => i.price_gp)))}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Shops() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const phone = useIsCompact(640);
  const [name, setName] = useState("");

  const shopsKey = ["shops", campaignId];
  const { data: shops = [], isLoading: shopsLoading } = useQuery({
    queryKey: shopsKey,
    queryFn: () => shopsApi.list(campaignId as string),
    enabled: !!campaignId,
  });
  const onChanged = () => void qc.invalidateQueries({ queryKey: shopsKey });

  const createMut = useMutation({
    mutationFn: (shopName: string) => shopsApi.create(campaignId as string, { name: shopName }),
    onSuccess: onChanged,
  });

  return (
    <div className="fade-in">
      <div
        className="flex"
        style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem 1rem", marginBottom: "1rem" }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h1 style={{ marginBottom: "0.2rem" }}>Shops</h1>
          <p className="text-sm text-muted" style={{ margin: 0, maxWidth: 640 }}>
            Players browse the market on their phones. Send them the market link, or one shop&rsquo;s
            link when they step inside.
            {AI_ON && " Stock with AI invents the keeper and a priced inventory; it can paint item art too."}
          </p>
        </div>
        <div className="ql-actions">
          <CopyButton label="Copy market link" path={`/market/${campaignId}`} />
          <a className="btn btn-ghost" href={`/market/${campaignId}`} target="_blank" rel="noreferrer">
            <ExternalLink size={16} /> Preview market
          </a>
        </div>
      </div>
      <form
        style={{ display: "flex", gap: "0.5rem", margin: "0 0 1.25rem", maxWidth: 560 }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMut.mutate(name.trim());
          setName("");
        }}
      >
        <input
          type="text"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="New shop name"
          placeholder="New shop name (e.g. The Gilded Burr)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={createMut.isPending || !name.trim()}>
          <Plus size={16} /> New shop
        </button>
      </form>
      {shops.map((shop) => (
        <ShopCard key={shop.id} shop={shop} phone={phone} onChanged={onChanged} />
      ))}
      {!shopsLoading && shops.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">
            <Store size={28} />
          </div>
          <p style={{ maxWidth: 460, margin: "0 auto" }}>
            Shops are what players can buy between fights, priced and stocked by you. Name the first
            one above, then add what it sells.
          </p>
        </div>
      )}
    </div>
  );
}
