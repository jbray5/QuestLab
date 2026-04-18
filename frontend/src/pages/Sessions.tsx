import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { PlayerCharacter } from "../api/types";

const STATUS_BADGE: Record<string, string> = {
  Draft: "badge-draft",
  Ready: "badge-ready",
  InProgress: "badge-progress",
  Complete: "badge-complete",
};

const STATUS_EMOJI: Record<string, string> = {
  Draft: "\u{1F4DD}",
  Ready: "\u2705",
  InProgress: "\u2694\uFE0F",
  Complete: "\u{1F3C1}",
};

function PcPicker({
  characters,
  selected,
  onChange,
}: {
  characters: PlayerCharacter[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  function toggle(id: string) {
    onChange(
      selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id],
    );
  }

  if (characters.length === 0) {
    return <p className="text-sm text-muted">No characters in this campaign yet.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
      {characters.map((c) => (
        <label
          key={c.id}
          className="flex items-center gap-2"
          style={{
            padding: "0.35rem 0.5rem",
            borderRadius: 6,
            cursor: "pointer",
            background: selected.includes(c.id) ? "var(--surface2)" : "transparent",
            border: selected.includes(c.id)
              ? "1px solid var(--gold)"
              : "1px solid var(--border)",
          }}
        >
          <input
            type="checkbox"
            checked={selected.includes(c.id)}
            onChange={() => toggle(c.id)}
            style={{ accentColor: "var(--gold)" }}
          />
          <span style={{ color: "var(--gold)", fontWeight: 600, fontSize: "0.85rem" }}>
            {c.character_name}
          </span>
          <span className="text-sm text-muted">
            Lv{c.level} {c.race} {c.character_class}
          </span>
        </label>
      ))}
    </div>
  );
}

export default function Sessions() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCampaign, activeAdventure } = useCampaignStore();

  // Derive campaignId from store, or fetch adventure to get it (direct-URL fallback)
  const { data: adventure } = useQuery({
    queryKey: ["adventure", adventureId],
    queryFn: () => adventuresApi.get(adventureId!),
    enabled: !!adventureId && !activeCampaign && !activeAdventure,
  });
  const campaignId = activeCampaign?.id ?? activeAdventure?.campaign_id ?? adventure?.campaign_id;

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [sessionNumber, setSessionNumber] = useState(1);
  const [datePlanned, setDatePlanned] = useState("");
  const [selectedPcIds, setSelectedPcIds] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit attending PCs state
  const [editingPcsFor, setEditingPcsFor] = useState<string | null>(null);
  const [editPcIds, setEditPcIds] = useState<string[]>([]);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", adventureId],
    queryFn: () => sessionsApi.list(adventureId!),
    enabled: !!adventureId,
  });

  const { data: characters = [] } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const create = useMutation({
    mutationFn: () =>
      sessionsApi.create(adventureId!, {
        title,
        session_number: sessionNumber,
        date_planned: datePlanned || undefined,
        attending_pc_ids: selectedPcIds.length > 0 ? selectedPcIds : undefined,
      }),
    onSuccess: () => {
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["sessions", adventureId] });
      setTitle(""); setSessionNumber(sessions.length + 2); setDatePlanned("");
      setSelectedPcIds([]); setShowForm(false);
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const updatePcs = useMutation({
    mutationFn: ({ id, pcIds }: { id: string; pcIds: string[] }) =>
      sessionsApi.update(id, { attending_pc_ids: pcIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", adventureId] });
      setEditingPcsFor(null);
    },
  });

  const advance = useMutation({
    mutationFn: (id: string) => sessionsApi.advance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", adventureId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", adventureId] }),
  });

  function pcName(id: string): string {
    return characters.find((c) => c.id === id)?.character_name ?? id.slice(0, 8);
  }

  function openPcEditor(sessionId: string, currentIds: string[]) {
    setEditingPcsFor(sessionId);
    setEditPcIds(currentIds ?? []);
  }

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav className="text-sm" style={{ marginBottom: "0.75rem", opacity: 0.7 }}>
        <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => navigate("/")}>Dashboard</span>
        {activeCampaign && (
          <>
            {" / "}
            <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => navigate(`/campaigns/${activeCampaign.id}/adventures`)}>
              {activeCampaign.name}
            </span>
          </>
        )}
        {(activeAdventure || adventure) && (
          <>
            {" / "}
            <span style={{ color: "var(--text-secondary)" }}>{activeAdventure?.title ?? adventure?.title}</span>
          </>
        )}
        {" / "}
        <strong>Sessions</strong>
      </nav>
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Sessions</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Session"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3>New Session</h3>
          <div className="grid-2">
            <div className="form-group">
              <label>Session # *</label>
              <input type="number" value={sessionNumber} onChange={(e) => setSessionNumber(Number(e.target.value))} min={1} />
            </div>
            <div className="form-group">
              <label>Date Planned</label>
              <input type="date" value={datePlanned} onChange={(e) => setDatePlanned(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Heist..." />
          </div>
          <div className="form-group">
            <label>Attending Characters</label>
            <PcPicker characters={characters} selected={selectedPcIds} onChange={setSelectedPcIds} />
          </div>
          {createError && (
            <p className="text-sm" style={{ color: "var(--crimson2)", marginBottom: "0.5rem" }}>
              Error: {createError}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? "Creating..." : "Create Session"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {sessions.map((s) => (
          <div key={s.id} className="card">
            <div className="flex items-center" style={{ justifyContent: "space-between" }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "1.2rem" }}>{STATUS_EMOJI[s.status] ?? "\u{1F4DD}"}</span>
                <div>
                  <strong style={{ color: "var(--gold)" }}>
                    Session {s.session_number}{s.title ? `: ${s.title}` : ""}
                  </strong>
                  <div className="flex items-center gap-2" style={{ marginTop: "0.2rem" }}>
                    <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-draft"}`}>
                      {s.status}
                    </span>
                    {s.date_planned && (
                      <span className="text-sm text-muted">{s.date_planned}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => navigate(`/sessions/${s.id}/run`)}
                >
                  Run
                </button>
                <button
                  className="btn btn-primary"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => navigate(`/sessions/${s.id}/hud`)}
                  title="Open Session HUD"
                >
                  HUD
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => openPcEditor(s.id, s.attending_pc_ids)}
                >
                  Party
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => advance.mutate(s.id)}
                  disabled={s.status === "Complete" || advance.isPending}
                >
                  Advance
                </button>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => window.confirm("Delete session?") && del.mutate(s.id)}
                >
                  Delete
                </button>
              </div>
            </div>

            {/* Attending PCs summary */}
            {s.attending_pc_ids && s.attending_pc_ids.length > 0 && editingPcsFor !== s.id && (
              <div className="flex items-center gap-2" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
                <span className="text-sm text-muted">Party:</span>
                {s.attending_pc_ids.map((id) => (
                  <span key={id} className="badge badge-ready" style={{ fontSize: "0.7rem" }}>
                    {pcName(id)}
                  </span>
                ))}
              </div>
            )}

            {/* Inline PC editor */}
            {editingPcsFor === s.id && (
              <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem" }}>
                <h4 style={{ fontSize: "0.85rem", marginBottom: "0.5rem" }}>Attending Characters</h4>
                <PcPicker characters={characters} selected={editPcIds} onChange={setEditPcIds} />
                <div className="flex gap-2" style={{ marginTop: "0.5rem" }}>
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: "0.75rem" }}
                    onClick={() => updatePcs.mutate({ id: s.id, pcIds: editPcIds })}
                    disabled={updatePcs.isPending}
                  >
                    {updatePcs.isPending ? "Saving..." : "Save Party"}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: "0.75rem" }}
                    onClick={() => setEditingPcsFor(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
        {!isLoading && sessions.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">{"\u{1F4C5}"}</div>
            <p>No sessions yet - create one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
