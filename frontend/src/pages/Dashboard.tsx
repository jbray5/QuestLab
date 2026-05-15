import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { campaignsApi } from "../api/campaigns";
import { useAuthStore } from "../stores/useAuthStore";
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
  const { dmEmail, setDmEmail } = useAuthStore();

  const { data: campaigns = [], isLoading, isError } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
    enabled: !!dmEmail,
  });

  function open(c: Campaign) {
    setActiveCampaign(c);
    navigate(`/campaigns/${c.id}/adventures`);
  }

  if (!dmEmail) {
    return <SetEmailGate onSave={setDmEmail} />;
  }

  return (
    <div className="fade-in">
      <h1>Dashboard</h1>
      <p className="text-muted" style={{ marginBottom: "2rem" }}>
        Select a campaign to dive in, or create a new one.
      </p>

      {isError && (
        <div
          className="card"
          style={{
            background: "rgba(244,67,54,0.08)",
            border: "1px solid var(--red, #ef5350)",
            marginBottom: "1.5rem",
          }}
        >
          <strong style={{ color: "var(--red)" }}>API unreachable.</strong>{" "}
          Check that the backend is up and <code>VITE_API_BASE_URL</code>{" "}
          matches your deployed host.
        </div>
      )}

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

/**
 * First-load identity gate. Shown when no DM email is set on the device.
 *
 * Authentication is intentionally minimal: the email becomes the DM's
 * identity for authz (campaign ownership). In a hosted Azure deploy this
 * would come from Entra ID via X-MS-CLIENT-PRINCIPAL-NAME; for the
 * Vercel + Render deployment we let the DM type it on first visit.
 */
function SetEmailGate({ onSave }: { onSave: (email: string) => void }) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (email) onSave(email);
  };

  return (
    <div
      className="fade-in"
      style={{
        maxWidth: 480,
        margin: "3rem auto",
        padding: "1.5rem",
        background: "var(--surface)",
        border: "1px solid var(--gold)",
        borderRadius: 8,
      }}
    >
      <h1 style={{ fontSize: "1.4rem", marginBottom: "0.3rem", color: "var(--gold)" }}>
        ⚔ Welcome to QuestLab
      </h1>
      <p className="text-muted" style={{ marginBottom: "1.2rem", fontSize: "0.9rem" }}>
        Enter the email you want to use as your DM identity. This is how the
        app knows which campaigns belong to you. You can change it any time
        from the sidebar.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
        <input
          name="email"
          type="email"
          required
          autoFocus
          placeholder="you@example.com"
          style={{
            padding: "0.5rem 0.7rem",
            fontSize: "0.95rem",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text)",
          }}
        />
        <button className="btn btn-primary" type="submit">
          Continue
        </button>
      </form>
    </div>
  );
}
