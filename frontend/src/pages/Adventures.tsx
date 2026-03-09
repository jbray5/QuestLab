import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adventuresApi } from "../api/adventures";
import { useCampaignStore } from "../stores/useCampaignStore";

const STATUS_BADGE: Record<string, string> = {
  planning: "badge-draft",
  active: "badge-ready",
  complete: "badge-complete",
};

export default function Adventures() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setActiveAdventure } = useCampaignStore();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");

  const { data: adventures = [], isLoading } = useQuery({
    queryKey: ["adventures", campaignId],
    queryFn: () => adventuresApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const create = useMutation({
    mutationFn: () => adventuresApi.create(campaignId!, { title, synopsis }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adventures", campaignId] });
      setTitle(""); setSynopsis(""); setShowForm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => adventuresApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adventures", campaignId] }),
  });

  function openAdventure(a: { id: string; campaign_id: string; title: string; synopsis: string | null; status: string; created_at: string | null }) {
    setActiveAdventure(a);
    navigate(`/adventures/${a.id}/sessions`);
  }

  return (
    <div className="fade-in">
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Adventures</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Adventure"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 480 }}>
          <h3>New Adventure</h3>
          <div className="form-group">
            <label>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Lost Mines of…" />
          </div>
          <div className="form-group">
            <label>Synopsis</label>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="A brief description of the adventure arc…"
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create Adventure"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {adventures.map((a) => (
          <div
            key={a.id}
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => openAdventure(a)}
          >
            <div className="flex items-center" style={{ justifyContent: "space-between" }}>
              <div>
                <strong style={{ color: "var(--gold)" }}>{a.title}</strong>
                <span
                  className={`badge ${STATUS_BADGE[a.status] ?? "badge-draft"}`}
                  style={{ marginLeft: "0.75rem" }}
                >
                  {a.status}
                </span>
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => navigate(`/adventures/${a.id}/sessions`)}>
                  Sessions
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => navigate(`/adventures/${a.id}/encounters`)}>
                  Encounters
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => navigate(`/adventures/${a.id}/maps`)}>
                  Map
                </button>
                <button className="btn btn-danger" style={{ fontSize: "0.75rem" }}
                  onClick={() => window.confirm("Delete adventure?") && del.mutate(a.id)}>
                  Delete
                </button>
              </div>
            </div>
            {a.synopsis && (
              <p className="text-sm text-muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                {a.synopsis}
              </p>
            )}
          </div>
        ))}
        {!isLoading && adventures.length === 0 && (
          <p className="text-muted">No adventures yet — create one above.</p>
        )}
      </div>
    </div>
  );
}
