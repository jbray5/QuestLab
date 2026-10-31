import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ChevronRight, Map as MapIcon, Pencil, Plus, Route, Skull } from "lucide-react";
import { adventuresApi } from "../api/adventures";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Adventure } from "../api/types";
import RowMenu from "../components/RowMenu";

const TIER_LABELS: Record<string, string> = {
  Tier1: "Tier 1 · levels 1–4",
  Tier2: "Tier 2 · levels 5–10",
  Tier3: "Tier 3 · levels 11–16",
  Tier4: "Tier 4 · levels 17–20",
};

/** Row buttons: a notch smaller than page actions. */
const compactBtn: React.CSSProperties = { fontSize: "0.875rem", padding: "0.3rem 0.75rem" };

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
      <nav className="text-sm" style={{ marginBottom: "0.75rem", color: "var(--muted)" }}>
        <Link to="/">Dashboard</Link>
        {activeCampaign && (
          <>
            {" / "}
            <Link to={`/campaigns/${activeCampaign.id}/sessions`} className="story">
              {activeCampaign.name}
            </Link>
          </>
        )}
        {" / "}
        <span style={{ color: "var(--text)" }}>Arcs</span>
      </nav>
      <div
        className="flex items-center"
        style={{ marginBottom: "1.25rem", justifyContent: "space-between", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Arcs</h1>
          <p className="text-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem" }}>
            The longer stretches of your story: tier, acts, NPC roster and location notes.
          </p>
        </div>
        <button className={showForm ? "btn btn-secondary" : "btn btn-primary"} onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Plus size={16} aria-hidden /> New arc
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3 style={{ marginBottom: "1rem" }}>New arc</h3>
          <div className="form-group">
            <label>Title *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Lost Mines of..." />
          </div>
          <div className="form-group">
            <label>Synopsis</label>
            <textarea
              value={synopsis}
              onChange={(e) => setSynopsis(e.target.value)}
              placeholder="e.g. Where the party is headed and why."
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
            <label>Location notes</label>
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
            {create.isPending ? "Creating..." : "Create arc"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {adventures.map((a) => (
          <div key={a.id} className="card" style={{ padding: "1rem 1.1rem" }}>
            {/* Header row */}
            <div
              className="flex items-center"
              style={{ justifyContent: "space-between", gap: "0.75rem 1rem" }}
            >
              {/* The whole title block toggles; the button inside gives keyboards and
                  screen readers the same switch (its click bubbles up here). */}
              <div
                onClick={() => toggleExpand(a.id)}
                title={expandedId === a.id ? "Hide details" : "Show location notes and NPCs"}
                style={{ cursor: "pointer", minWidth: 0, flex: "1 1 260px" }}
              >
                <h2 className="story" style={{ fontSize: "1.3rem", margin: 0, lineHeight: 1.25 }}>
                  <button
                    type="button"
                    aria-expanded={expandedId === a.id}
                    style={{
                      display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "none",
                      border: "none", padding: 0, margin: 0, font: "inherit", color: "inherit",
                      cursor: "pointer", textAlign: "left",
                    }}
                  >
                    {expandedId === a.id ? (
                      <ChevronDown size={18} aria-hidden style={{ color: "var(--muted)" }} />
                    ) : (
                      <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)" }} />
                    )}
                    <span>{a.title}</span>
                  </button>
                </h2>
                <div className="text-sm text-muted" style={{ marginTop: "0.15rem", paddingLeft: "calc(18px + 0.4rem)" }}>
                  {TIER_LABELS[a.tier] ?? a.tier}
                  {" · "}
                  {a.act_count} act{a.act_count !== 1 ? "s" : ""}
                  {npcs(a).length > 0 && (
                    <span title={npcs(a).map((n) => n.name).join(", ")}>
                      {" · "}
                      {npcs(a).length} NPC{npcs(a).length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2 items-center" style={{ flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-secondary" style={compactBtn} onClick={() => openAdventure(a)}>
                  <CalendarDays size={15} aria-hidden /> Sessions
                </button>
                <button
                  className="btn btn-ghost"
                  style={compactBtn}
                  onClick={() => { setActiveAdventure(a); navigate(`/adventures/${a.id}/encounters`); }}
                >
                  <Skull size={15} aria-hidden /> Encounters
                </button>
                <button
                  className="btn btn-ghost"
                  style={compactBtn}
                  onClick={() => { setActiveAdventure(a); navigate(`/adventures/${a.id}/maps`); }}
                >
                  <MapIcon size={15} aria-hidden /> Map builder
                </button>
                <button className="btn btn-ghost" style={compactBtn} onClick={() => startEdit(a)}>
                  <Pencil size={15} aria-hidden /> Edit
                </button>
                <RowMenu
                  label={`More for ${a.title}`}
                  items={[
                    {
                      label: "Delete arc…",
                      danger: true,
                      confirm: `Delete the arc "${a.title}" and everything in it? This can't be undone.`,
                      onSelect: () => del.mutate(a.id),
                    },
                  ]}
                />
              </div>
            </div>

            {/* Synopsis */}
            {a.synopsis && (
              <p
                className="story"
                style={{
                  margin: "0.4rem 0 0",
                  paddingLeft: "calc(18px + 0.4rem)",
                  color: "var(--text2)",
                  lineHeight: 1.5,
                  maxWidth: "75ch",
                }}
              >
                {a.synopsis}
              </p>
            )}

            {/* Expanded details */}
            {expandedId === a.id && (
              <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.85rem" }}>
                {/* Location notes */}
                {a.location_notes && (
                  <div style={{ marginBottom: "1rem" }}>
                    <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.3rem" }}>Location notes</h3>
                    <p style={{ margin: 0, whiteSpace: "pre-wrap", color: "var(--text2)", lineHeight: 1.5 }}>
                      {a.location_notes}
                    </p>
                  </div>
                )}

                {/* NPC roster */}
                {npcs(a).length > 0 && (
                  <div>
                    <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.4rem" }}>NPC roster</h3>
                    <div
                      style={{
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "var(--surface2)",
                      }}
                    >
                      {npcs(a).map((npc, i, all) => (
                        <div
                          key={i}
                          style={{
                            padding: "0.55rem 0.8rem",
                            borderBottom: i === all.length - 1 ? "none" : "1px solid var(--border)",
                          }}
                        >
                          <div className="flex items-center gap-2" style={{ flexWrap: "wrap" }}>
                            <span className="story" style={{ fontWeight: 500, fontSize: "1.05rem", color: "var(--text)" }}>
                              {npc.name}
                            </span>
                            {npc.role && <span className="pill">{npc.role}</span>}
                          </div>
                          {npc.notes && (
                            <p className="text-sm text-muted" style={{ margin: "0.2rem 0 0", lineHeight: 1.45 }}>
                              {npc.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!a.location_notes && npcs(a).length === 0 && (
                  <p className="text-sm text-muted" style={{ margin: 0 }}>
                    No location notes or NPCs yet. Use <strong>Edit</strong> to add location notes.
                  </p>
                )}
              </div>
            )}

            {/* Inline edit form */}
            {editId === a.id && (
              <div
                style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 style={{ fontSize: "1rem", marginBottom: "0.75rem" }}>Edit arc</h3>
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
                  <label className="text-sm">Location notes</label>
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
        {!isLoading && adventures.length === 0 && !showForm && (
          <div className="empty-state">
            <Route size={32} aria-hidden style={{ color: "var(--muted)", marginBottom: "0.75rem" }} />
            <p style={{ maxWidth: "46ch", margin: "0 auto" }}>
              An arc is a stretch of the story with its own sessions, encounters and maps. Add the
              first one with <strong>New arc</strong>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
