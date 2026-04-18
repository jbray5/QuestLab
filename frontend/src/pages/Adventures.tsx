import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adventuresApi } from "../api/adventures";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Adventure } from "../api/types";

const TIER_BADGE: Record<string, string> = {
  Tier1: "badge-ready",
  Tier2: "badge-draft",
  Tier3: "badge-progress",
  Tier4: "badge-artifact",
};

const TIER_LABELS: Record<string, string> = {
  Tier1: "Tier 1 (1-4)",
  Tier2: "Tier 2 (5-10)",
  Tier3: "Tier 3 (11-16)",
  Tier4: "Tier 4 (17-20)",
};

const TIER_OPTIONS = ["Tier1", "Tier2", "Tier3", "Tier4"];

interface NpcEntry {
  name: string;
  role: string;
  notes: string;
}

export default function Adventures() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCampaign, setActiveAdventure } = useCampaignStore();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [synopsis, setSynopsis] = useState("");
  const [tier, setTier] = useState("Tier1");
  const [actCount, setActCount] = useState(3);
  const [locationNotes, setLocationNotes] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Edit state
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSynopsis, setEditSynopsis] = useState("");
  const [editTier, setEditTier] = useState("Tier1");
  const [editActCount, setEditActCount] = useState(3);
  const [editLocationNotes, setEditLocationNotes] = useState("");

  const { data: adventures = [], isLoading } = useQuery({
    queryKey: ["adventures", campaignId],
    queryFn: () => adventuresApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const create = useMutation({
    mutationFn: () =>
      adventuresApi.create(campaignId!, {
        title,
        synopsis: synopsis.trim() || undefined,
        tier,
        act_count: actCount,
        location_notes: locationNotes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adventures", campaignId] });
      setTitle(""); setSynopsis(""); setTier("Tier1"); setActCount(3);
      setLocationNotes(""); setShowForm(false);
    },
  });

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      adventuresApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["adventures", campaignId] });
      setEditId(null);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => adventuresApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["adventures", campaignId] }),
  });

  function openAdventure(a: Adventure) {
    setActiveAdventure(a);
    navigate(`/adventures/${a.id}/sessions`);
  }

  function startEdit(a: Adventure) {
    setEditId(a.id);
    setEditTitle(a.title);
    setEditSynopsis(a.synopsis ?? "");
    setEditTier(a.tier);
    setEditActCount(a.act_count);
    setEditLocationNotes(a.location_notes ?? "");
  }

  function saveEdit(id: string) {
    update.mutate({
      id,
      data: {
        title: editTitle,
        synopsis: editSynopsis.trim() || null,
        tier: editTier,
        act_count: editActCount,
        location_notes: editLocationNotes.trim() || null,
      },
    });
  }

  function toggleExpand(id: string) {
    setExpandedId(expandedId === id ? null : id);
  }

  const npcs = (a: Adventure): NpcEntry[] =>
    (a.npc_roster ?? []).map((n) => ({
      name: String(n.name ?? ""),
      role: String(n.role ?? ""),
      notes: String(n.notes ?? ""),
    }));

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav className="text-sm" style={{ marginBottom: "0.75rem", opacity: 0.7 }}>
        <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => navigate("/")}>Dashboard</span>
        {activeCampaign && (
          <>
            {" / "}
            <span style={{ color: "var(--text-secondary)" }}>{activeCampaign.name}</span>
          </>
        )}
        {" / "}
        <strong>Adventures</strong>
      </nav>
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Adventures</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Adventure"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3 style={{ marginBottom: "1rem" }}>New Adventure</h3>
          <div className="form-group">
            <label>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Lost Mines of..." />
          </div>
          <div className="form-group">
            <label>Synopsis</label>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="A brief description of the adventure arc..."
              rows={3}
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Tier</label>
              <select value={tier} onChange={(e) => setTier(e.target.value)}>
                {TIER_OPTIONS.map((t) => (
                  <option key={t} value={t}>{TIER_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Acts</label>
              <input type="number" min={1} max={5} value={actCount} onChange={(e) => setActCount(Number(e.target.value))} />
            </div>
          </div>
          <div className="form-group">
            <label>Location Notes</label>
            <textarea
              value={locationNotes}
              onChange={(e) => setLocationNotes(e.target.value)}
              placeholder="Key locations, terrain, atmosphere..."
              rows={2}
              style={{ resize: "vertical" }}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!title.trim() || create.isPending}
          >
            {create.isPending ? "Creating..." : "Create Adventure"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {adventures.map((a) => (
          <div key={a.id} className="card">
            {/* Header row */}
            <div
              className="flex items-center"
              style={{ justifyContent: "space-between", cursor: "pointer" }}
              onClick={() => toggleExpand(a.id)}
            >
              <div className="flex items-center gap-2">
                <strong style={{ color: "var(--gold)", fontSize: "1.05rem" }}>{a.title}</strong>
                <span className={`badge ${TIER_BADGE[a.tier] ?? "badge-draft"}`}>
                  {TIER_LABELS[a.tier] ?? a.tier}
                </span>
                <span className="text-sm text-muted">{a.act_count} acts</span>
                {npcs(a).length > 0 && (
                  <span className="text-sm text-muted" title={npcs(a).map((n) => n.name).join(", ")}>
                    | {npcs(a).length} NPC{npcs(a).length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => openAdventure(a)}>
                  Open
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => { setActiveAdventure(a); navigate(`/adventures/${a.id}/encounters`); }}>
                  Encounters
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => { setActiveAdventure(a); navigate(`/adventures/${a.id}/maps`); }}>
                  Map
                </button>
                <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }}
                  onClick={() => startEdit(a)}>
                  Edit
                </button>
                <button className="btn btn-danger" style={{ fontSize: "0.75rem" }}
                  onClick={() => window.confirm("Delete adventure?") && del.mutate(a.id)}>
                  Delete
                </button>
              </div>
            </div>

            {/* Synopsis */}
            {a.synopsis && (
              <p className="text-sm" style={{ marginTop: "0.5rem", marginBottom: 0, opacity: 0.85, lineHeight: 1.5 }}>
                {a.synopsis}
              </p>
            )}

            {/* Expanded details */}
            {expandedId === a.id && (
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                {/* Location Notes */}
                {a.location_notes && (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <h4 style={{ fontSize: "0.85rem", marginBottom: "0.3rem" }}>Location Notes</h4>
                    <p className="text-sm" style={{ margin: 0, whiteSpace: "pre-wrap", opacity: 0.8 }}>
                      {a.location_notes}
                    </p>
                  </div>
                )}

                {/* NPC Roster */}
                {npcs(a).length > 0 && (
                  <div>
                    <h4 style={{ fontSize: "0.85rem", marginBottom: "0.4rem" }}>NPC Roster</h4>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      {npcs(a).map((npc, i) => (
                        <div
                          key={i}
                          style={{
                            padding: "0.5rem 0.75rem",
                            background: "var(--surface2)",
                            borderRadius: 6,
                            borderLeft: "3px solid var(--gold)",
                          }}
                        >
                          <div className="flex items-center gap-2">
                            <strong style={{ color: "var(--gold)", fontSize: "0.9rem" }}>{npc.name}</strong>
                            {npc.role && (
                              <span className="badge badge-draft" style={{ fontSize: "0.65rem" }}>{npc.role}</span>
                            )}
                          </div>
                          {npc.notes && (
                            <p className="text-sm text-muted" style={{ margin: "0.2rem 0 0", lineHeight: 1.4 }}>
                              {npc.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!a.location_notes && npcs(a).length === 0 && (
                  <p className="text-sm text-muted">No location notes or NPCs added yet.</p>
                )}
              </div>
            )}

            {/* Inline edit form */}
            {editId === a.id && (
              <div
                style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}
                onClick={(e) => e.stopPropagation()}
              >
                <h4 style={{ marginBottom: "0.75rem" }}>Edit Adventure</h4>
                <div className="form-group">
                  <label className="text-sm">Title</label>
                  <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="text-sm">Synopsis</label>
                  <textarea value={editSynopsis} onChange={(e) => setEditSynopsis(e.target.value)} rows={3} style={{ resize: "vertical" }} />
                </div>
                <div className="grid-2">
                  <div className="form-group">
                    <label className="text-sm">Tier</label>
                    <select value={editTier} onChange={(e) => setEditTier(e.target.value)}>
                      {TIER_OPTIONS.map((t) => (
                        <option key={t} value={t}>{TIER_LABELS[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="text-sm">Acts</label>
                    <input type="number" min={1} max={5} value={editActCount} onChange={(e) => setEditActCount(Number(e.target.value))} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="text-sm">Location Notes</label>
                  <textarea value={editLocationNotes} onChange={(e) => setEditLocationNotes(e.target.value)} rows={2} style={{ resize: "vertical" }} />
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-primary" onClick={() => saveEdit(a.id)} disabled={!editTitle.trim() || update.isPending}>
                    {update.isPending ? "Saving..." : "Save"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditId(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!isLoading && adventures.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🗺</div>
            <p>No adventures yet - create one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
