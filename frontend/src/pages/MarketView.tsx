import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Store } from "lucide-react";

import { shopsApi } from "../api/shops";
import { STORE_CSS } from "../components/store/storeTheme";

/**
 * MarketView — the player-facing town market (Plan 47), /market/:campaignId.
 *
 * A capability URL listing every shop in the campaign as a browsable card.
 * Players wander from here into individual storefronts. Opened from the
 * phone's Bag tab with ?pc=<pcId>, it links back there (Plan 122).
 */

export default function MarketView() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const [params] = useSearchParams();
  // Plan 50 — a pc param makes the storefronts transactional for that PC.
  const pc = params.get("pc");
  const pcSuffix = pc ? `?pc=${pc}` : "";
  const { data: market, isError } = useQuery({
    queryKey: ["market", campaignId],
    queryFn: () => shopsApi.market(campaignId as string),
    enabled: !!campaignId,
    refetchInterval: 30000,
  });

  return (
    <div className="store-root">
      <style>{STORE_CSS}</style>
      <div className="store-inner" style={{ maxWidth: 720 }}>
        {pc && (
          <nav className="store-nav" aria-label="Back">
            <Link className="store-back" to={`/play/${pc}?tab=bag`}>
              <ChevronLeft size={18} /> Back to your sheet
            </Link>
          </nav>
        )}
        <p className="store-eyebrow" style={{ marginTop: pc ? 4 : 24 }}>Market</p>
        <h1 className="store-title">{market?.campaign_name ?? "The town market"}</h1>
        {(market?.shops.length ?? 0) > 0 && (
          <p className="store-sub" style={{ margin: 0 }}>
            Step into a shop to see what it sells and what it costs.
            {pc ? " Buy with your own coin, or sell what you carry." : ""} Haggling happens at the
            table.
          </p>
        )}
        {isError && (
          <p className="store-note err" style={{ marginTop: 16 }}>
            We couldn&rsquo;t open the market. Check your connection, or ask your DM for a fresh link.
          </p>
        )}
        {!market && !isError && <p className="store-note" style={{ marginTop: 16 }}>Opening the market…</p>}
        <div className="market-grid">
          {(market?.shops ?? []).map((shop) => (
            <Link key={shop.id} className="market-card" to={`/shop/${shop.id}${pcSuffix}`}>
              {shop.banner_url && (
                <div className="market-card-img">
                  <img src={shop.banner_url} alt="" loading="lazy" />
                </div>
              )}
              <div className="market-card-body">
                {!shop.banner_url && (
                  <span className="market-card-icon" aria-hidden>
                    <Store size={20} />
                  </span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3>{shop.name}</h3>
                  {(shop.keeper || shop.location) && (
                    <div className="store-sub" style={{ fontSize: "0.875rem" }}>
                      {[shop.keeper, shop.location].filter(Boolean).join(" · ")}
                    </div>
                  )}
                  <div className="store-note" style={{ marginTop: 2 }}>
                    <span className="num">{shop.item_count}</span>{" "}
                    {shop.item_count === 1 ? "item" : "items"} for sale
                  </div>
                </div>
                <ChevronRight size={18} color="var(--muted)" />
              </div>
            </Link>
          ))}
        </div>
        {market && market.shops.length === 0 && (
          <div className="store-panel" style={{ marginTop: 16 }}>
            <span style={{ fontWeight: 600 }}>No shops are open yet</span>
            <span className="store-note" style={{ fontSize: "0.9375rem", color: "var(--text2)" }}>
              Your DM opens shops from their screen. Ask them what&rsquo;s for sale, or check back
              later; this page updates on its own.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
