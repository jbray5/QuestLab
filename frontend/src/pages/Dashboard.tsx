import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { campaignsApi } from "../api/campaigns";
import { useAuthStore } from "../stores/useAuthStore";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Campaign } from "../api/types";
import Flourish from "../components/Flourish";

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
      <h1 style={{ textAlign: "center", marginBottom: 0 }}>QuestLab</h1>
      <Flourish />
      <p
        className="text-muted"
        style={{ marginBottom: "2rem", textAlign: "center", fontStyle: "italic" }}
      >
        Select a campaign to dive in, or forge a new one.
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
      className="ql-modal-in"
      style={{
        maxWidth: 520,
        margin: "5vh auto 3rem",
        padding: "2rem 2rem 1.75rem",
        background: "var(--surface)",
        border: "1px solid var(--gold)",
        borderRadius: 12,
        boxShadow: "0 8px 40px rgba(0,0,0,0.5), 0 0 60px rgba(201, 168, 76, 0.08)",
        textAlign: "center",
      }}
    >
      <img
        src="/d20.svg"
        alt=""
        aria-hidden
        style={{ width: 72, height: 72, marginBottom: "0.4rem" }}
      />
      <h1
        style={{
          fontSize: "1.6rem",
          margin: 0,
          color: "var(--gold)",
          fontFamily: "Cinzel Decorative, serif",
        }}
      >
        QuestLab
      </h1>
      <Flourish width={180} />
      <p
        style={{
          marginBottom: "1.4rem",
          fontStyle: "italic",
          color: "var(--muted)",
        }}
      >
        An AI-powered campaign studio. Plan your worlds, run your sessions,
        and put a live sheet in every player's hand.
      </p>
      <form
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}
      >
        <label
          htmlFor="dm-email"
          style={{
            fontSize: "0.65rem",
            color: "var(--muted)",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            textAlign: "left",
          }}
        >
          DM email
        </label>
        <input
          id="dm-email"
          name="email"
          type="email"
          required
          autoFocus
          placeholder="you@example.com"
          style={{
            padding: "0.55rem 0.75rem",
            fontSize: "1rem",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            color: "var(--text)",
          }}
        />
        <button className="btn btn-primary" type="submit" style={{ marginTop: "0.4rem" }}>
          Enter the lab →
        </button>
      </form>
      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.7rem",
          color: "var(--muted)",
        }}
      >
        Stored on this device only. Change any time from the sidebar.
      </p>
    </div>
  );
}
