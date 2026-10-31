import { api } from "../api/client";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Dices, ScrollText } from "lucide-react";
import { campaignsApi } from "../api/campaigns";
import { useCampaignStore } from "../stores/useCampaignStore";
import { useTourStore } from "../stores/useTourStore";
import type { Campaign } from "../api/types";
import { word } from "../lib/plural";

/** One count in the card's muted stat line: "5 sessions". */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <span className="num" style={{ color: "var(--text2)" }}>{value}</span> {word(value, label)}
    </span>
  );
}

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const { data: stats } = useQuery({
    queryKey: ["campaign-stats", campaign.id],
    queryFn: () => campaignsApi.stats(campaign.id),
  });

  return (
    <div
      className="card"
      style={{ cursor: "pointer", display: "flex", flexDirection: "column", gap: "0.5rem" }}
      onClick={onClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div>
        <h2 className="story" style={{ fontSize: "1.3rem", margin: 0, lineHeight: 1.25 }}>{campaign.name}</h2>
        {(campaign.setting || campaign.tone) && (
          <div className="flex items-center gap-2" style={{ marginTop: "0.3rem", flexWrap: "wrap" }}>
            {campaign.setting && <span className="text-sm text-muted">{campaign.setting}</span>}
            {campaign.tone && <span className="pill">{campaign.tone}</span>}
          </div>
        )}
      </div>
      {campaign.description && (
        <p className="story" style={{ margin: 0, color: "var(--text2)", lineHeight: 1.5 }}>
          {campaign.description.length > 120 ? campaign.description.slice(0, 120) + "..." : campaign.description}
        </p>
      )}
      {stats && (
        <div
          className="text-sm text-muted"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.15rem 0.6rem",
            marginTop: "auto",
            paddingTop: "0.6rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <Stat label="arc" value={stats.adventures} />
          <Stat label="session" value={stats.sessions} />
          <Stat label="character" value={stats.characters} />
          <Stat label="encounter" value={stats.encounters} />
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { setActiveCampaign } = useCampaignStore();
  const { completed: tourCompleted, isOpen: tourOpen, start: startTour } = useTourStore();

  const { data: campaigns = [], isLoading, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
  });

  // Plan 36 — auto-launch the tour on first sign-in for a brand-new DM.
  // Only fires when (a) the campaign list has finished loading, (b)
  // they have NO campaigns yet, and (c) the tour hasn't been completed
  // or skipped on this device.
  useEffect(() => {
    if (!isLoading && !isError && campaigns.length === 0 && !tourCompleted && !tourOpen) {
      startTour();
    }
  }, [isLoading, isError, campaigns.length, tourCompleted, tourOpen, startTour]);

  function open(c: Campaign) {
    setActiveCampaign(c);
    navigate(`/campaigns/${c.id}/sessions`);
  }

  // A brand-new DM's next step is the sample night; after that, their campaigns.
  const fresh = !isLoading && !isError && campaigns.length === 0;

  return (
    <div className="fade-in">
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem" }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Your campaigns</h1>
          <p className="text-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem" }}>
            Open a campaign to plan or run its next session.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            className={fresh ? "btn btn-primary" : "btn btn-secondary"}
            title="A ready-made adventure, four pregens, a staged map and an encounter — run it tonight"
            data-tour-id="sample-campaign"
            onClick={() => {
              // Plan 83 — build it (or find it) and land in the HUD with the script open.
              void api
                .post<{ campaign_id: string; session_id?: string | null }>("/onboarding/starter")
                .then((r) => navigate(r.session_id ? `/sessions/${r.session_id}/hud?script=1` : "/campaigns"))
                .catch(() => navigate("/campaigns"));
            }}
          >
            <Dices size={16} aria-hidden /> Run the sample night
          </button>
          <button
            className={fresh ? "btn btn-secondary" : "btn btn-primary"}
            onClick={() => navigate("/campaigns")}
          >
            Manage campaigns
          </button>
        </div>
      </div>

      {isError && (
        <div
          className="card"
          role="alert"
          style={{
            background: "var(--danger-soft)",
            borderColor: "var(--danger-line)",
            marginBottom: "1.5rem",
          }}
        >
          <strong style={{ color: "var(--danger-text)" }}>Can&rsquo;t reach the server.</strong>{" "}
          Check that the backend is up and <code>VITE_API_BASE_URL</code>{" "}
          matches your deployed host.
        </div>
      )}

      {isLoading && <p className="text-muted">Loading campaigns...</p>}

      {fresh && (
        <div className="empty-state">
          <ScrollText size={32} aria-hidden style={{ color: "var(--muted)", marginBottom: "0.75rem" }} />
          <p style={{ maxWidth: "48ch", margin: "0 auto" }}>
            No campaigns yet. <strong>Run the sample night</strong> to play a ready-made adventure
            tonight, or start your own from <strong>Manage campaigns</strong>.
          </p>
        </div>
      )}

      <div className="grid-3" style={{ marginBottom: "2rem" }}>
        {campaigns.map((c) => (
          <CampaignCard key={c.id} campaign={c} onClick={() => open(c)} />
        ))}
      </div>
    </div>
  );
}
