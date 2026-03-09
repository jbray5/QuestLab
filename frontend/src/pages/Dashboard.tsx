import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { campaignsApi } from "../api/campaigns";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Campaign } from "../api/types";

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

      {isLoading && <p className="text-muted">Loading campaigns…</p>}

      <div className="grid-3" style={{ marginBottom: "2rem" }}>
        {campaigns.map((c) => (
          <div
            key={c.id}
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => open(c)}
          >
            <h3 style={{ fontSize: "1rem", marginBottom: "0.25rem" }}>{c.name}</h3>
            {c.setting && <p className="text-sm text-muted">{c.setting}</p>}
            {c.tone && (
              <span className="badge badge-draft" style={{ marginTop: "0.5rem" }}>
                {c.tone}
              </span>
            )}
          </div>
        ))}
      </div>

      <button className="btn btn-primary" onClick={() => navigate("/campaigns")}>
        + Manage Campaigns
      </button>
    </div>
  );
}
