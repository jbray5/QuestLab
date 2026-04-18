import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { campaignsApi, type CampaignStats } from "../api/campaigns";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Campaign } from "../api/types";

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-sm" style={{
      display: "inline-flex", alignItems: "center", gap: "0.3rem",
      padding: "0.15rem 0.5rem", borderRadius: 12,
      background: "var(--surface2)", color: "var(--text-secondary)",
    }}>
      <strong style={{ color: "var(--gold)" }}>{value}</strong> {label}
    </span>
  );
}

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const { data: stats } = useQuery({
    queryKey: ["campaign-stats", campaign.id],
    queryFn: () => campaignsApi.stats(campaign.id),
  });

  return (
    <div className="card" style={{ cursor: "pointer" }} onClick={onClick}>
      <h3 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>{campaign.name}</h3>
      {campaign.setting && (
        <p className="text-sm text-muted" style={{ marginBottom: "0.25rem" }}>{campaign.setting}</p>
      )}
      {campaign.description && (
        <p className="text-sm" style={{ marginBottom: "0.5rem", opacity: 0.8, lineHeight: 1.5 }}>
          {campaign.description.length > 120 ? campaign.description.slice(0, 120) + "..." : campaign.description}
        </p>
      )}
      {stats && (
        <div className="flex gap-2" style={{ flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <StatPill label="adventures" value={stats.adventures} />
          <StatPill label="sessions" value={stats.sessions} />
          <StatPill label="characters" value={stats.characters} />
          <StatPill label="encounters" value={stats.encounters} />
        </div>
      )}
      {campaign.tone && (
        <span className="badge badge-draft" style={{ marginTop: "0.25rem" }}>
          {campaign.tone}
        </span>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { setActiveCampaign } = useCampaignStore();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
  });

  function open(c: Campaign) {
    setActiveCampaign(c);
    navigate(`/campaigns/${c.id}/adventures`);
  }

  return (
    <div className="fade-in">
      <h1>Dashboard</h1>
      <p className="text-muted" style={{ marginBottom: "2rem" }}>
        Select a campaign to dive in, or create a new one.
      </p>

      {isLoading && <p className="text-muted">Loading campaigns...</p>}

      <div className="grid-3" style={{ marginBottom: "2rem" }}>
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} onClick={() => open(c)} />
        ))}
      </div>

      <button className="btn btn-primary" onClick={() => navigate("/campaigns")}>
        + Manage Campaigns
      </button>
    </div>
  );
}
