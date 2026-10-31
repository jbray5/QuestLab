import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Play, Plus } from "lucide-react";
import { sessionsApi } from "../api/sessions";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { useCampaignStore } from "../stores/useCampaignStore";
import { useIsCompact } from "../hooks/useIsCompact";
import PcPicker from "../components/sessions/PcPicker";
import { statusLabel } from "../lib/labels";
import RowMenu from "../components/RowMenu";

const STATUS_BADGE: Record<string, string> = {
  Draft: "badge-draft",
  Ready: "badge-ready",
  InProgress: "badge-progress",
  Complete: "badge-complete",
};

/** The Advance button says where it moves the session (Draft \u2192 Ready \u2192 In progress \u2192 Complete). */
const NEXT_STATUS_ACTION: Record<string, string> = {
  Draft: "Mark ready",
  Ready: "Mark in progress",
  InProgress: "Mark complete",
};

/** Session numbers are set as Roman numerals in the story face (DESIGN.md \u00A71). */
function toRoman(n: number): string {
  if (!Number.isFinite(n) || n < 1 || n >= 4000) return String(n);
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let rest = Math.floor(n);
  let out = "";
  for (const [value, mark] of table) {
    while (rest >= value) {
      out += mark;
      rest -= value;
    }
  }
  return out;
}

/** Row buttons: a notch smaller than page actions. */
const compactBtn: React.CSSProperties = { fontSize: "0.875rem", padding: "0.3rem 0.75rem" };
/** Read by screen readers, not drawn. */
const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
};

export default function Sessions() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const qc = useQueryClient();
  const { activeCampaign, activeAdventure } = useCampaignStore();
  const phone = useIsCompact(640);

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

  // "Up next" = the first unfinished session dated today or later; if none is
  // dated, the first unfinished one (same rule as the campaign sessions page).
  const ordered = [...sessions].sort((x, y) => x.session_number - y.session_number);
  const today = new Date().toISOString().slice(0, 10);
  const unfinished = ordered.filter((s) => s.status !== "Complete");
  const upNext = unfinished.find((s) => s.date_planned && s.date_planned >= today) ?? unfinished[0];
  const longestNumeral = ordered.reduce((m, s) => Math.max(m, toRoman(s.session_number).length), 1);
  const numeralWidth = `max(2rem, calc(${longestNumeral} * 0.62em + 0.25rem))`;
  const arcTitle = activeAdventure?.title ?? adventure?.title;

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
        {arcTitle && (
          <>
            {" / "}
            <span className="story" style={{ color: "var(--text2)" }}>{arcTitle}</span>
          </>
        )}
        {" / "}
        <span style={{ color: "var(--text)" }}>Sessions</span>
      </nav>
      <div
        className="flex items-center"
        style={{ marginBottom: "1.25rem", justifyContent: "space-between", gap: "1rem" }}
      >
        <h1 style={{ margin: 0 }}>Sessions</h1>
        <button
          className={showForm || upNext ? "btn btn-secondary" : "btn btn-primary"}
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? (
            "Cancel"
          ) : (
            <>
              <Plus size={16} aria-hidden /> New session
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 520 }}>
          <h3 style={{ marginBottom: "0.75rem" }}>New session</h3>
          <div className="grid-2">
            <div className="form-group">
              <label>Session number *</label>
              <input type="number" value={sessionNumber} onChange={(e) => setSessionNumber(Number(e.target.value))} min={1} />
            </div>
            <div className="form-group">
              <label>Date planned</label>
              <input type="date" value={datePlanned} onChange={(e) => setDatePlanned(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. The Heist..." />
          </div>
          <div className="form-group">
            <label>Who&rsquo;s playing</label>
            <PcPicker characters={characters} selected={selectedPcIds} onChange={setSelectedPcIds} />
          </div>
          {createError && (
            <p className="text-sm" style={{ color: "var(--danger-text)", marginBottom: "0.5rem" }}>
              Error: {createError}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? "Creating..." : "Create session"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading...</p>}

      {sessions.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {sessions.map((s, i) => {
            const isNext = upNext?.id === s.id;
            const done = s.status === "Complete";
            const last = i === sessions.length - 1;
            const players =
              s.attending_pc_ids && s.attending_pc_ids.length > 0 && editingPcsFor !== s.id
                ? s.attending_pc_ids.map(pcName).join(", ")
                : "";
            const subline = [s.date_planned, players].filter(Boolean).join(" · ");
            return (
              <div
                key={s.id}
                style={{
                  position: "relative",
                  padding: "0.75rem 1rem 0.75rem 0.85rem",
                  background: isNext ? "var(--accent-soft)" : "transparent",
                  // The lit row draws its own top edge over the hairline above it.
                  marginTop: isNext && i > 0 ? -1 : 0,
                  borderTop: isNext && i > 0 ? "1px solid var(--accent-line)" : "none",
                  borderBottom: last
                    ? "none"
                    : `1px solid ${isNext ? "var(--accent-line)" : "var(--border)"}`,
                }}
              >
                <div
                  className="flex items-center"
                  style={{ justifyContent: "space-between", gap: "0.6rem 1rem", flexWrap: "wrap" }}
                >
                  <div
                    className="flex"
                    style={{ alignItems: "baseline", gap: "0.75rem", minWidth: 0, flex: "1 1 280px" }}
                  >
                    <span
                      aria-hidden
                      title={`Session ${s.session_number}`}
                      className="story"
                      style={{
                        flex: "0 0 auto",
                        width: numeralWidth,
                        textAlign: "center",
                        fontSize: "1.15rem",
                        fontWeight: isNext ? 700 : 500,
                        color: isNext ? "var(--accent-text)" : "var(--muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {toRoman(s.session_number)}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        className="story"
                        style={{
                          fontSize: "1.125rem",
                          lineHeight: 1.3,
                          fontWeight: isNext ? 700 : 500,
                          color: done ? "var(--text2)" : "var(--text)",
                        }}
                      >
                        {s.title ? (
                          <>
                            <span style={srOnly}>Session {s.session_number}: </span>
                            {s.title}
                          </>
                        ) : (
                          `Session ${s.session_number}`
                        )}
                      </div>
                      {(isNext || subline || phone) && (
                        <div
                          className="text-sm text-muted"
                          style={{
                            marginTop: "0.15rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          {phone && (
                            <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-draft"}`}>
                              {statusLabel(s.status)}
                            </span>
                          )}
                          {isNext && <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>Up next</span>}
                          {isNext && subline && !phone && <span aria-hidden>·</span>}
                          {subline && <span>{subline}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="flex gap-2 items-center"
                    style={{
                      flexWrap: "wrap",
                      justifyContent: phone ? "flex-start" : "flex-end",
                      marginLeft: phone ? 0 : "auto",
                    }}
                  >
                    {!phone && (
                      <span
                        className={`badge ${STATUS_BADGE[s.status] ?? "badge-draft"}`}
                        style={{ marginRight: "0.25rem" }}
                      >
                        {statusLabel(s.status)}
                      </span>
                    )}
                    {!done && (
                      <button
                        className="btn btn-ghost"
                        style={compactBtn}
                        onClick={() => advance.mutate(s.id)}
                        disabled={advance.isPending}
                        title="Move the status on: Draft → Ready → In progress → Complete"
                      >
                        {NEXT_STATUS_ACTION[s.status] ?? "Advance"}
                      </button>
                    )}
                    <Link className="btn btn-secondary" style={compactBtn} to={`/sessions/${s.id}/prep`}>
                      Prep
                    </Link>
                    <Link
                      className={`btn ${isNext ? "btn-primary" : "btn-secondary"}`}
                      style={compactBtn}
                      to={`/sessions/${s.id}/hud`}
                      title="Run the night from the HUD, the DM's screen at the table"
                    >
                      <Play size={14} aria-hidden /> Run
                    </Link>
                    <RowMenu
                      label={`More for session ${s.session_number}`}
                      items={[
                        {
                          label: "Who's playing…",
                          onSelect: () => openPcEditor(s.id, s.attending_pc_ids),
                        },
                        {
                          label: "Delete session…",
                          danger: true,
                          confirm: `Delete Session ${s.session_number}${s.title ? `: ${s.title}` : ""}? This can't be undone.`,
                          onSelect: () => del.mutate(s.id),
                        },
                      ]}
                    />
                  </div>
                </div>

                {/* Inline PC editor */}
                {editingPcsFor === s.id && (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      marginLeft: phone ? 0 : `calc(${numeralWidth} + 0.75rem)`,
                      borderTop: "1px solid var(--border)",
                      paddingTop: "0.75rem",
                      maxWidth: 560,
                    }}
                  >
                    <h3 style={{ fontSize: "0.9375rem", marginBottom: "0.5rem" }}>Who&rsquo;s playing</h3>
                    <PcPicker characters={characters} selected={editPcIds} onChange={setEditPcIds} />
                    <div className="flex gap-2" style={{ marginTop: "0.6rem" }}>
                      <button
                        className="btn btn-primary"
                        style={compactBtn}
                        onClick={() => updatePcs.mutate({ id: s.id, pcIds: editPcIds })}
                        disabled={updatePcs.isPending}
                      >
                        {updatePcs.isPending ? "Saving..." : "Save party"}
                      </button>
                      <button className="btn btn-ghost" style={compactBtn} onClick={() => setEditingPcsFor(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!isLoading && sessions.length === 0 && !showForm && (
        <div className="empty-state">
          <CalendarDays size={32} aria-hidden style={{ color: "var(--muted)", marginBottom: "0.75rem" }} />
          <p style={{ maxWidth: "46ch", margin: "0 auto" }}>
            No sessions in this arc yet. Add one with <strong>New session</strong> to plan who&rsquo;s
            playing and when.
          </p>
        </div>
      )}
    </div>
  );
}
