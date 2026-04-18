import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { campaignsApi } from "../api/campaigns";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Campaign } from "../api/types";

export default function Campaigns() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { setActiveCampaign } = useCampaignStore();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [setting, setSetting] = useState("");
  const [tone, setTone] = useState("");
  const [description, setDescription] = useState("");

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
  });

  const create = useMutation({
    mutationFn: () =>
      campaignsApi.create({
        name,
        setting,
        tone,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setName(""); setSetting(""); setTone(""); setDescription("");
      setShowForm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  function handleOpen(c: Campaign) {
    setActiveCampaign(c);
    navigate(`/campaigns/${c.id}/adventures`);
  }

  return (
    <div className="fade-in">
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Campaigns</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Campaign"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3 style={{ marginBottom: "1rem" }}>New Campaign</h3>
          <div className="form-group">
            <label>Campaign Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="The Sunken City of Yal'dur" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Setting</label>
              <input value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="Forgotten Realms" />
            </div>
            <div className="form-group">
              <label>Tone</label>
              <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="Dark fantasy" />
            </div>
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief overview of the campaign premise..."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create Campaign"}
          </button>
          {create.isError && (
            <p style={{ color: "var(--red)", marginTop: "0.5rem", fontSize: "0.85rem" }}>
              {(create.error as Error).message}
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {campaigns.map((c) => (
          <div
            key={c.id}
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => handleOpen(c)}
          >
            <div className="flex items-center" style={{ justifyContent: "space-between" }}>
              <div>
                <strong style={{ color: "var(--gold)", fontSize: "1.05rem" }}>{c.name}</strong>
                {c.setting && (
                  <span className="text-muted text-sm" style={{ marginLeft: "0.75rem" }}>
                    {c.setting}
                  </span>
                )}
                {c.tone && (
                  <span className="badge badge-draft" style={{ marginLeft: "0.5rem" }}>
                    {c.tone}
                  </span>
                )}
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={() => handleOpen(c)}>
                  Open
                </button>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => window.confirm("Delete campaign?") && del.mutate(c.id)}
                >
                  Delete
                </button>
              </div>
            </div>
            {c.description && (
              <p className="text-sm text-muted" style={{ marginTop: "0.4rem", marginBottom: 0, lineHeight: 1.5 }}>
                {c.description}
              </p>
            )}
          </div>
        ))}
        {!isLoading && campaigns.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📜</div>
            <p>No campaigns yet — create one above to start your adventure.</p>
          </div>
        )}
      </div>
    </div>
  );
}
