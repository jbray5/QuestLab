import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { Plus, ScrollText } from "lucide-react";
import { api } from "../api/client";
import { campaignsApi } from "../api/campaigns";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Campaign } from "../api/types";
import RowMenu from "../components/RowMenu";

// Plan 83 — the whole campaign as one JSON file, named after it.
async function exportCampaign(c: Campaign): Promise<void> {
  const bundle = await api.get<unknown>(`/campaigns/${c.id}/export`);
  const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `questlab-${c.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "campaign"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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
    onSuccess: (made) => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      setName(""); setSetting(""); setTone(""); setDescription("");
      setShowForm(false);
      // Review 10/30 — a new campaign opens straight away.
      handleOpen(made);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => campaignsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["campaigns"] }),
  });

  function handleOpen(c: Campaign) {
    setActiveCampaign(c);
    navigate(`/campaigns/${c.id}/sessions`);
  }

  return (
    <div className="fade-in">
      <div
        className="flex items-center"
        style={{ marginBottom: "1.25rem", justifyContent: "space-between", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Campaigns</h1>
          <p className="text-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem" }}>
            Open one to plan and run its sessions.
          </p>
        </div>
        <button className={showForm ? "btn btn-secondary" : "btn btn-primary"} onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Plus size={16} aria-hidden /> New campaign
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3 style={{ marginBottom: "1rem" }}>New campaign</h3>
          <div className="form-group">
            <label>Campaign name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. The Sunken City of Yal'dur" />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Setting <span className="text-muted">(optional)</span></label>
              <input value={setting} onChange={(e) => setSetting(e.target.value)} placeholder="e.g. Forgotten Realms" />
            </div>
            <div className="form-group">
              <label>Tone <span className="text-muted">(optional)</span></label>
              <input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="e.g. Dark fantasy" />
            </div>
          </div>
          <div className="form-group">
            <label>Description <span className="text-muted">(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. A drowned city rises once a century — and this is the year."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create campaign"}
          </button>
          {create.isError && (
            <p style={{ color: "var(--danger-text)", marginTop: "0.5rem", fontSize: "0.875rem" }}>
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
            <div className="flex items-center" style={{ justifyContent: "space-between", gap: "0.75rem" }}>
              <div style={{ minWidth: 0 }}>
                <h2 className="story" style={{ fontSize: "1.3rem", margin: 0, lineHeight: 1.25 }}>
                  {c.name}
                </h2>
                {(c.setting || c.tone) && (
                  <div
                    className="flex items-center gap-2"
                    style={{ marginTop: "0.3rem", flexWrap: "wrap" }}
                  >
                    {c.setting && <span className="text-muted text-sm">{c.setting}</span>}
                    {c.tone && <span className="pill">{c.tone}</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2 items-center" onClick={(e) => e.stopPropagation()}>
                <Link
                  className="btn btn-secondary"
                  style={{ fontSize: "0.875rem", padding: "0.3rem 0.85rem" }}
                  to={`/campaigns/${c.id}/sessions`}
                  onClick={() => setActiveCampaign(c)}
                >
                  Open
                </Link>
                <RowMenu
                  label={`More for ${c.name}`}
                  items={[
                    {
                      // Plan 83 — the whole campaign as one JSON file.
                      label: "Download a copy (JSON)",
                      onSelect: () => void exportCampaign(c),
                    },
                    {
                      label: "Delete campaign…",
                      danger: true,
                      confirm: `Delete the campaign "${c.name}" — every arc, session, character and NPC in it? Export it first if you might want it back. This can't be undone.`,
                      onSelect: () => del.mutate(c.id),
                    },
                  ]}
                />
              </div>
            </div>
            {c.description && (
              <p
                className="story"
                style={{ marginTop: "0.5rem", marginBottom: 0, lineHeight: 1.5, color: "var(--text2)", maxWidth: "75ch" }}
              >
                {c.description}
              </p>
            )}
          </div>
        ))}
        {!isLoading && campaigns.length === 0 && !showForm && (
          <div className="empty-state">
            <ScrollText size={32} aria-hidden style={{ color: "var(--muted)", marginBottom: "0.75rem" }} />
            <p style={{ maxWidth: "46ch", margin: "0 auto" }}>
              A campaign is one group&rsquo;s story: its sessions, characters and NPCs. Start yours
              with <strong>New campaign</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
