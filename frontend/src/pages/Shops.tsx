import { useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  formatPrice,
  shopsApi,
  type ShopRead,
  type StorefrontItem,
} from "../api/shops";

/**
 * Shops — the DM's marketplace manager (Plan 47), campaigns/:campaignId/shops.
 *
 * Create shops, AI-stock them, tune prices/stock, generate item + banner art,
 * and copy the player-facing capability links (/market, /shop/...).
 */

function playerUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

function CopyButton({ label, path }: { label: string; path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="btn btn-ghost"
      style={{ fontSize: "0.75rem" }}
      onClick={() => {
        void navigator.clipboard.writeText(playerUrl(path));
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? "✓ copied" : label}
    </button>
  );
}

function ItemRow({
  shopId,
  item,
  onChanged,
}: {
  shopId: string;
  item: StorefrontItem;
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

  return (
    <tr>
      <td style={{ width: 46 }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }}
          />
        ) : (
          <span style={{ opacity: 0.4 }}>—</span>
        )}
      </td>
      <td>
        <strong>{item.name}</strong>
        <div style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
          {item.item_type}
          {item.rarity !== "Common" ? ` · ${item.rarity}` : ""}
          {item.pitch ? ` — “${item.pitch}”` : ""}
        </div>
      </td>
      <td style={{ width: 90 }}>
        <input
          className="input"
          style={{ width: 72, fontSize: "0.8rem" }}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={() => void save()}
          title="Price in gp (0.5 = 5 sp)"
        />
      </td>
      <td style={{ width: 70 }}>
        <input
          className="input"
          style={{ width: 54, fontSize: "0.8rem" }}
          value={stock}
          placeholder="∞"
          onChange={(e) => setStock(e.target.value)}
          onBlur={() => void save()}
          title="Stock (empty = plenty)"
        />
      </td>
      <td style={{ width: 96, whiteSpace: "nowrap" }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.72rem" }}
          disabled={busy}
          title="Generate item art (gpt-image-1)"
          onClick={async () => {
            setBusy(true);
            try {
              await shopsApi.generateItemImage(shopId, item.shop_item_id);
              onChanged();
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "…" : "🎨"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.72rem" }}
          title="Remove from shop"
          onClick={async () => {
            await shopsApi.removeItem(shopId, item.shop_item_id);
            onChanged();
          }}
        >
          🗑
        </button>
      </td>
    </tr>
  );
}

function ShopCard({ shop, onChanged }: { shop: ShopRead; onChanged: () => void }) {
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

  const missingArt = (storefront?.items ?? []).filter((i) => !i.image_url);

  return (
    <div className="card" style={{ marginBottom: "0.8rem", overflow: "hidden" }}>
      {shop.banner_url && (
        <img
          src={shop.banner_url}
          alt={shop.name}
          style={{ width: "100%", maxHeight: 140, objectFit: "cover", borderRadius: 8 }}
        />
      )}
      <div className="flex" style={{ alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <h3 style={{ margin: "0.3rem 0" }}>{shop.name}</h3>
        <span style={{ color: "var(--text-dim)", fontSize: "0.8rem" }}>
          {shop.keeper ? `${shop.keeper} · ` : ""}
          {shop.item_count} items
        </span>
      </div>
      {shop.blurb && (
        <p style={{ margin: "0 0 0.5rem", fontSize: "0.85rem", color: "var(--text-dim)" }}>
          {shop.blurb}
        </p>
      )}
      <div className="flex" style={{ gap: 6, flexWrap: "wrap" }}>
        <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={() => setOpen((v) => !v)}>
          {open ? "▾ close" : "▸ manage stock"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          disabled={stockBusy}
          title="AI-stock: keeper, blurb, and priced inventory"
          onClick={async () => {
            const concept =
              window.prompt(
                "Shop concept for the AI (blank = infer from the name):",
                "",
              ) ?? undefined;
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
          {stockBusy ? "🪄 stocking…" : "🪄 AI stock"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          disabled={bannerBusy}
          title="Generate storefront banner art"
          onClick={async () => {
            setBannerBusy(true);
            try {
              await shopsApi.generateBanner(shop.id);
              onChanged();
            } finally {
              setBannerBusy(false);
            }
          }}
        >
          {bannerBusy ? "🖼 painting…" : "🖼 banner"}
        </button>
        {open && missingArt.length > 0 && (
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.75rem" }}
            disabled={artBusy !== null}
            title="Generate art for every item that has none (one at a time)"
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
            {artBusy ? `🎨 ${artBusy}…` : `🎨 art ×${missingArt.length}`}
          </button>
        )}
        <CopyButton label="🔗 player link" path={`/shop/${shop.id}`} />
        <a
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          href={`/shop/${shop.id}`}
          target="_blank"
          rel="noreferrer"
        >
          👁 preview
        </a>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          title="Delete shop"
          onClick={async () => {
            if (!window.confirm(`Delete ${shop.name}?`)) return;
            await shopsApi.remove(shop.id);
            onChanged();
          }}
        >
          🗑
        </button>
      </div>
      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          <table className="table" style={{ width: "100%", fontSize: "0.85rem" }}>
            <tbody>
              {(storefront?.items ?? []).map((item) => (
                <ItemRow key={item.shop_item_id} shopId={shop.id} item={item} onChanged={refresh} />
              ))}
            </tbody>
          </table>
          <form
            className="flex"
            style={{ gap: 6, marginTop: 6 }}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newItem.trim()) return;
              await shopsApi.addItem(shop.id, { name: newItem.trim(), price_gp: 0 });
              setNewItem("");
              refresh();
            }}
          >
            <input
              className="input"
              style={{ flex: 1, fontSize: "0.85rem" }}
              placeholder="Add item by name (new or from the catalog)…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
            />
            <button className="btn" style={{ fontSize: "0.8rem" }} type="submit">
              ＋
            </button>
          </form>
          {(storefront?.items ?? []).length > 0 && (
            <div style={{ marginTop: 4, fontSize: "0.72rem", color: "var(--text-dim)" }}>
              Till check: cheapest {formatPrice(Math.min(...storefront!.items.map((i) => i.price_gp)))}
              {" · "}priciest {formatPrice(Math.max(...storefront!.items.map((i) => i.price_gp)))}
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
  const [name, setName] = useState("");

  const shopsKey = ["shops", campaignId];
  const { data: shops = [] } = useQuery({
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
    <div>
      <div className="flex" style={{ alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <h2>🏪 Shops</h2>
        <CopyButton label="🔗 town market link (all shops)" path={`/market/${campaignId}`} />
        <a
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          href={`/market/${campaignId}`}
          target="_blank"
          rel="noreferrer"
        >
          👁 preview market
        </a>
      </div>
      <p style={{ color: "var(--text-dim)", fontSize: "0.85rem", marginTop: 0 }}>
        Players browse the market on their phones — send them the market link, or a single
        shop's link when they step inside. 🪄 AI stock invents the keeper and priced inventory;
        🎨 paints the item art.
      </p>
      <form
        className="flex"
        style={{ gap: 8, margin: "0.6rem 0 1rem", flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createMut.mutate(name.trim());
          setName("");
        }}
      >
        <input
          className="input"
          style={{ minWidth: 240 }}
          placeholder="New shop name (e.g. The Gilded Burr)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit" disabled={createMut.isPending}>
          ＋ shop
        </button>
      </form>
      {shops.map((shop) => (
        <ShopCard key={shop.id} shop={shop} onChanged={onChanged} />
      ))}
      {shops.length === 0 && (
        <p style={{ color: "var(--text-dim)" }}>
          No shops yet — name one above, then 🪄 AI-stock it.
        </p>
      )}
    </div>
  );
}
