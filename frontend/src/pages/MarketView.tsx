import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { shopsApi } from "../api/shops";
import { STORE_CSS } from "../components/store/storeTheme";

/**
 * MarketView — the player-facing town market (Plan 47), /market/:campaignId.
 *
 * A capability URL listing every shop in the campaign as a browsable card.
 * Players wander from here into individual storefronts.
 */

export default function MarketView() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: market } = useQuery({
    queryKey: ["market", campaignId],
    queryFn: () => shopsApi.market(campaignId as string),
    enabled: !!campaignId,
    refetchInterval: 30000,
  });

  return (
    <div className="store-root">
      <style>{STORE_CSS}</style>
      <div className="store-inner">
        <h1 className="store-title" style={{ paddingTop: "1.6rem" }}>
          🏮 The Town Market
        </h1>
        <div className="store-sub">{market?.campaign_name ?? ""}</div>
        <p className="store-blurb">
          Stalls and shopfronts open for business — step inside any of them and browse the
          wares. Prices are the keeper's asking; haggling happens at the table.
        </p>
        <div className="market-grid">
          {(market?.shops ?? []).map((shop) => (
            <Link key={shop.id} className="market-card" to={`/shop/${shop.id}`}>
              <div className="market-card-img">
                {shop.banner_url ? (
                  <img src={shop.banner_url} alt={shop.name} loading="lazy" />
                ) : (
                  <span style={{ fontSize: "3rem", opacity: 0.5 }}>🏪</span>
                )}
              </div>
              <div className="market-card-body">
                <h3>{shop.name}</h3>
                <div className="store-sub" style={{ fontSize: "0.83rem" }}>
                  {shop.keeper ? `${shop.keeper}` : ""}
                  {shop.keeper && shop.location ? " · " : ""}
                  {shop.location ?? ""}
                </div>
                <div style={{ marginTop: 6, fontSize: "0.78rem", color: "#8f8672" }}>
                  {shop.item_count} wares on display
                </div>
              </div>
            </Link>
          ))}
        </div>
        {market && market.shops.length === 0 && (
          <p style={{ color: "#6b6b7a", marginTop: "2rem" }}>
            The market square is quiet today — no stalls are open yet.
          </p>
        )}
      </div>
    </div>
  );
}
