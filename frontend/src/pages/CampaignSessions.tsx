import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";

import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { sessionsApi } from "../api/sessions";
import type { Adventure, AdventureCreate, GameSession } from "../api/types";
import PcPicker from "../components/sessions/PcPicker";
import { useCampaignStore } from "../stores/useCampaignStore";

/**
 * CampaignSessions — every session in the campaign, grouped by arc (Plan 75).
 *
 * "Adventures" was an extra hop nobody needed: you opened the campaign, opened
 * an adventure, and only then saw sessions. Now the campaign opens straight
 * onto this page. Arcs (the same records as before) are collapsible headers
 * with their sessions underneath; a new arc is one field; a new session goes
 * into the arc you clicked and defaults to the last session's party. The
 * full arc editor (NPC roster, location notes) is a link away, not a step.
 */

const STATUS_BADGE: Record<string, string> = {
  Draft: "badge-draft",
  Ready: "badge-ready",
  InProgress: "badge-progress",
  Complete: "badge-complete",
};
const STATUS_EMOJI: Record<string, string> = {
  Draft: "📝",
  Ready: "✅",
  InProgress: "⚔️",
  Complete: "🏁",
};
const TIER_LABELS: Record<string, string> = {
  Tier1: "Tier 1 · lv 1–4",
  Tier2: "Tier 2 · lv 5–10",
  Tier3: "Tier 3 · lv 11–16",
  Tier4: "Tier 4 · lv 17–20",
};

const small: React.CSSProperties = { fontSize: "0.7rem" };

export default function CampaignSessions() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCampaign, setActiveAdventure } = useCampaignStore();

  const { data: arcs = [], isLoading } = useQuery({
    queryKey: ["adventures", campaignId],
    queryFn: () => adventuresApi.list(campaignId!),
    enabled: !!campaignId,
  });
  const sessionQs = useQueries({
    queries: arcs.map((a) => ({
      queryKey: ["sessions", a.id],
      queryFn: () => sessionsApi.list(a.id),
    })),
  });
  const { data: characters = [] } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const sessionsByArc: Record<string, GameSession[]> = {};
  arcs.forEach((a, i) => {
    sessionsByArc[a.id] = [...(sessionQs[i]?.data ?? [])].sort(
      (x, y) => x.session_number - y.session_number,
    );
  });
  const allSessions = arcs.flatMap((a) => sessionsByArc[a.id] ?? []);
  const nextNumber = allSessions.reduce((m, s) => Math.max(m, s.session_number), 0) + 1;

  // ── Collapse state, per campaign ──────────────────────────────────────────
  const collapseKey = `ql-arcs-collapsed-${campaignId}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem(collapseKey) ?? "[]"));
    } catch {
      return new Set();
    }
  });
  function toggleArc(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(collapseKey, JSON.stringify([...next]));
      } catch {
        /* collapse state just doesn't persist */
      }
      return next;
    });
  }

  // ── Arcs ──────────────────────────────────────────────────────────────────
  const [arcFormOpen, setArcFormOpen] = useState(false);
  const [arcTitle, setArcTitle] = useState("");
  const [arcSynopsis, setArcSynopsis] = useState("");
  const [editArc, setEditArc] = useState<{ id: string; title: string; synopsis: string } | null>(null);

  const createArc = useMutation({
    mutationFn: () =>
      adventuresApi.create(campaignId!, {
        title: arcTitle.trim(),
        synopsis: arcSynopsis.trim() || undefined,
        tier: "Tier1",
        act_count: 3,
      }),
    onSuccess: (a: Adventure) => {
      void qc.invalidateQueries({ queryKey: ["adventures", campaignId] });
      setArcTitle("");
      setArcSynopsis("");
      setArcFormOpen(false);
      setActiveAdventure(a);
    },
  });
  const updateArc = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<AdventureCreate> }) =>
      adventuresApi.update(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["adventures", campaignId] });
      setEditArc(null);
    },
  });
  const deleteArc = useMutation({
    mutationFn: (id: string) => adventuresApi.delete(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["adventures", campaignId] }),
  });

  // ── Sessions ──────────────────────────────────────────────────────────────
  const [sessionFormFor, setSessionFormFor] = useState<string | null>(null);
  const [sTitle, setSTitle] = useState("");
  const [sNumber, setSNumber] = useState<number>(1);
  const [sDate, setSDate] = useState("");
  const [sPcs, setSPcs] = useState<string[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingPcsFor, setEditingPcsFor] = useState<string | null>(null);
  const [editPcIds, setEditPcIds] = useState<string[]>([]);

  function openSessionForm(arc: Adventure) {
    setActiveAdventure(arc);
    setSessionFormFor(arc.id);
    setSNumber(nextNumber);
    setSTitle("");
    setSDate("");
    const inArc = sessionsByArc[arc.id] ?? [];
    const prev = inArc[inArc.length - 1] ?? allSessions[allSessions.length - 1];
    setSPcs(prev?.attending_pc_ids?.length ? prev.attending_pc_ids : characters.map((c) => c.id));
    setCreateError(null);
  }
  const createSession = useMutation({
    mutationFn: (arcId: string) =>
      sessionsApi.create(arcId, {
        title: sTitle,
        session_number: sNumber,
        date_planned: sDate || undefined,
        attending_pc_ids: sPcs.length ? sPcs : undefined,
      }),
    onSuccess: (_s, arcId) => {
      void qc.invalidateQueries({ queryKey: ["sessions", arcId] });
      setSessionFormFor(null);
      setCreateError(null);
    },
    onError: (e: Error) => setCreateError(e.message),
  });
  const updatePcs = useMutation({
    mutationFn: ({ id, pcIds }: { id: string; pcIds: string[] }) =>
      sessionsApi.update(id, { attending_pc_ids: pcIds }),
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["sessions", s.adventure_id] });
      setEditingPcsFor(null);
    },
  });
  const advance = useMutation({
    mutationFn: (id: string) => sessionsApi.advance(id),
    onSuccess: (s) => void qc.invalidateQueries({ queryKey: ["sessions", s.adventure_id] }),
  });
  const del = useMutation({
    mutationFn: ({ id }: { id: string; arcId: string }) => sessionsApi.delete(id),
    onSuccess: (_r, v) => void qc.invalidateQueries({ queryKey: ["sessions", v.arcId] }),
  });

  const pcName = (id: string) =>
    characters.find((c) => c.id === id)?.character_name ?? id.slice(0, 8);

  return (
    <div className="fade-in">
      <nav className="text-sm" style={{ marginBottom: "0.75rem", opacity: 0.7 }}>
        <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => navigate("/")}>
          Dashboard
        </span>
        {activeCampaign && (
          <>
            {" / "}
            <span style={{ color: "var(--text-secondary)" }}>{activeCampaign.name}</span>
          </>
        )}
        {" / "}
        <strong>Sessions</strong>
      </nav>

      <div className="flex items-center" style={{ justifyContent: "space-between", marginBottom: "1rem", gap: "1rem" }}>
        <div>
          <h1 style={{ margin: 0 }}>Sessions</h1>
          <p className="text-sm text-muted" style={{ margin: "0.25rem 0 0" }}>
            Grouped by arc — a stretch of the story with its own encounters and maps.
          </p>
        </div>
        <button className="btn btn-ghost" onClick={() => setArcFormOpen((v) => !v)}>
          {arcFormOpen ? "Cancel" : "+ New arc"}
        </button>
      </div>

      {arcFormOpen && (
        <div className="card" style={{ maxWidth: 520, marginBottom: "1.25rem" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>New arc</h3>
          <div className="form-group">
            <label>Title *</label>
            <input
              value={arcTitle}
              onChange={(e) => setArcTitle(e.target.value)}
              placeholder="Into the Fey"
              autoFocus
            />
          </div>
          <div className="form-group">
            <label>One line about it (optional)</label>
            <textarea
              value={arcSynopsis}
              onChange={(e) => setArcSynopsis(e.target.value)}
              rows={2}
              style={{ resize: "vertical" }}
              placeholder="Where the party is headed and why."
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => createArc.mutate()}
            disabled={!arcTitle.trim() || createArc.isPending}
          >
            {createArc.isPending ? "Creating…" : "Create arc"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading…</p>}

      {arcs.map((arc) => {
        const list = sessionsByArc[arc.id] ?? [];
        // "Up next" = the first unfinished session dated today or later; if
        // none is dated, the first unfinished one.
        const today = new Date().toISOString().slice(0, 10);
        const open = list.filter((s) => s.status !== "Complete");
        const upNext = open.find((s) => s.date_planned && s.date_planned >= today) ?? open[0];
        const isCollapsed = collapsed.has(arc.id);
        return (
          <section key={arc.id} className="card" style={{ marginBottom: "0.9rem", padding: "0.8rem 1rem" }}>
            <div className="flex items-center" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
              <div
                className="flex items-center gap-2"
                style={{ cursor: "pointer", minWidth: 0, flexWrap: "wrap" }}
                onClick={() => toggleArc(arc.id)}
                title={isCollapsed ? "Show sessions" : "Hide sessions"}
              >
                <span style={{ color: "var(--muted)" }}>{isCollapsed ? "▸" : "▾"}</span>
                <strong style={{ color: "var(--gold)", fontSize: "1.05rem" }}>{arc.title}</strong>
                <span className="badge badge-draft" style={{ fontSize: "0.62rem" }}>
                  {TIER_LABELS[arc.tier] ?? arc.tier}
                </span>
                <span className="text-sm text-muted">
                  {list.length} session{list.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="flex gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" style={small} onClick={() => openSessionForm(arc)}>
                  + Session
                </button>
                <button
                  className="btn btn-ghost"
                  style={small}
                  onClick={() => {
                    setActiveAdventure(arc);
                    navigate(`/adventures/${arc.id}/encounters`);
                  }}
                >
                  💀 Encounters
                </button>
                <button
                  className="btn btn-ghost"
                  style={small}
                  onClick={() => {
                    setActiveAdventure(arc);
                    navigate(`/adventures/${arc.id}/maps`);
                  }}
                >
                  🗾 Map Builder
                </button>
                <button
                  className="btn btn-ghost"
                  style={small}
                  onClick={() =>
                    setEditArc(
                      editArc?.id === arc.id
                        ? null
                        : { id: arc.id, title: arc.title, synopsis: arc.synopsis ?? "" },
                    )
                  }
                >
                  Edit
                </button>
                <button
                  className="btn btn-danger"
                  style={small}
                  onClick={() =>
                    window.confirm(
                      list.length
                        ? `Delete "${arc.title}" and its ${list.length} session${list.length === 1 ? "" : "s"}?`
                        : `Delete "${arc.title}"?`,
                    ) && deleteArc.mutate(arc.id)
                  }
                >
                  Delete
                </button>
              </div>
            </div>

            {arc.synopsis && !isCollapsed && editArc?.id !== arc.id && (
              <p className="text-sm" style={{ margin: "0.4rem 0 0", opacity: 0.8, lineHeight: 1.5 }}>
                {arc.synopsis}
              </p>
            )}

            {editArc?.id === arc.id && (
              <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem", maxWidth: 520 }}>
                <div className="form-group">
                  <label className="text-sm">Title</label>
                  <input value={editArc.title} onChange={(e) => setEditArc({ ...editArc, title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="text-sm">Synopsis</label>
                  <textarea
                    value={editArc.synopsis}
                    onChange={(e) => setEditArc({ ...editArc, synopsis: e.target.value })}
                    rows={3}
                    style={{ resize: "vertical" }}
                  />
                </div>
                <div className="flex gap-2 items-center" style={{ flexWrap: "wrap" }}>
                  <button
                    className="btn btn-primary"
                    style={small}
                    disabled={!editArc.title.trim() || updateArc.isPending}
                    onClick={() =>
                      updateArc.mutate({
                        id: arc.id,
                        data: { title: editArc.title.trim(), synopsis: editArc.synopsis.trim() || undefined },
                      })
                    }
                  >
                    {updateArc.isPending ? "Saving…" : "Save"}
                  </button>
                  <button className="btn btn-ghost" style={small} onClick={() => setEditArc(null)}>
                    Cancel
                  </button>
                  <span
                    className="text-sm"
                    style={{ color: "var(--gold)", cursor: "pointer", marginLeft: "auto" }}
                    onClick={() => navigate(`/campaigns/${campaignId}/adventures`)}
                  >
                    Tier, acts, NPC roster, location notes →
                  </span>
                </div>
              </div>
            )}

            {sessionFormFor === arc.id && (
              <div style={{ marginTop: "0.75rem", borderTop: "1px solid var(--border)", paddingTop: "0.75rem", maxWidth: 520 }}>
                <h4 style={{ margin: "0 0 0.5rem" }}>New session in {arc.title}</h4>
                <div className="grid-2">
                  <div className="form-group">
                    <label>Session #</label>
                    <input type="number" min={1} value={sNumber} onChange={(e) => setSNumber(Number(e.target.value))} />
                  </div>
                  <div className="form-group">
                    <label>Date</label>
                    <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>Title</label>
                  <input value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="Restwater" autoFocus />
                </div>
                <div className="form-group">
                  <label>Who&rsquo;s playing</label>
                  <PcPicker characters={characters} selected={sPcs} onChange={setSPcs} />
                </div>
                {createError && (
                  <p className="text-sm" style={{ color: "var(--crimson2)", marginBottom: "0.5rem" }}>
                    {createError}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={() => createSession.mutate(arc.id)}
                    disabled={createSession.isPending}
                  >
                    {createSession.isPending ? "Creating…" : "Create session"}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setSessionFormFor(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!isCollapsed && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
                {list.map((s) => {
                  const isNext = upNext?.id === s.id;
                  const done = s.status === "Complete";
                  return (
                    <div
                      key={s.id}
                      style={{
                        padding: "0.6rem 0.8rem",
                        borderRadius: 8,
                        background: "var(--surface2)",
                        border: `1px solid ${isNext ? "var(--gold)" : "var(--border)"}`,
                        opacity: done ? 0.72 : 1,
                      }}
                    >
                      <div className="flex items-center" style={{ justifyContent: "space-between", gap: "0.5rem" }}>
                        <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                          <span style={{ fontSize: "1.1rem" }}>{STATUS_EMOJI[s.status] ?? "📝"}</span>
                          <div style={{ minWidth: 0 }}>
                            <strong style={{ color: "var(--gold)" }}>
                              Session {s.session_number}
                              {s.title ? `: ${s.title}` : ""}
                            </strong>
                            <div className="flex items-center gap-2" style={{ marginTop: "0.15rem", flexWrap: "wrap" }}>
                              {isNext && (
                                <span className="badge badge-ready" style={{ fontSize: "0.62rem" }}>
                                  ▶ up next
                                </span>
                              )}
                              <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-draft"}`} style={{ fontSize: "0.62rem" }}>
                                {s.status}
                              </span>
                              {s.date_planned && <span className="text-sm text-muted">{s.date_planned}</span>}
                              {s.attending_pc_ids && s.attending_pc_ids.length > 0 && editingPcsFor !== s.id && (
                                <span className="text-sm text-muted">· {s.attending_pc_ids.map(pcName).join(", ")}</span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
                          <button
                            className="btn btn-primary"
                            style={small}
                            title="Run the night from the HUD"
                            onClick={() => {
                              setActiveAdventure(arc);
                              navigate(`/sessions/${s.id}/hud`);
                            }}
                          >
                            HUD
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={small}
                            title="Before the night: brief, runbook, session pack"
                            onClick={() => {
                              setActiveAdventure(arc);
                              navigate(`/sessions/${s.id}/run`);
                            }}
                          >
                            Prep
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={small}
                            onClick={() => {
                              setEditingPcsFor(s.id);
                              setEditPcIds(s.attending_pc_ids ?? []);
                            }}
                          >
                            Party
                          </button>
                          <button
                            className="btn btn-ghost"
                            style={small}
                            onClick={() => advance.mutate(s.id)}
                            disabled={done || advance.isPending}
                            title="Draft → Ready → In progress → Complete"
                          >
                            Advance
                          </button>
                          <button
                            className="btn btn-danger"
                            style={small}
                            onClick={() => window.confirm("Delete session?") && del.mutate({ id: s.id, arcId: arc.id })}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {editingPcsFor === s.id && (
                        <div style={{ marginTop: "0.6rem", borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
                          <PcPicker characters={characters} selected={editPcIds} onChange={setEditPcIds} />
                          <div className="flex gap-2" style={{ marginTop: "0.5rem" }}>
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: "0.75rem" }}
                              onClick={() => updatePcs.mutate({ id: s.id, pcIds: editPcIds })}
                              disabled={updatePcs.isPending}
                            >
                              {updatePcs.isPending ? "Saving…" : "Save party"}
                            </button>
                            <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={() => setEditingPcsFor(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {list.length === 0 && sessionFormFor !== arc.id && (
                  <p className="text-sm text-muted" style={{ margin: 0 }}>
                    No sessions in this arc yet — <span style={{ color: "var(--gold)", cursor: "pointer" }} onClick={() => openSessionForm(arc)}>add one</span>.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}

      {!isLoading && arcs.length === 0 && !arcFormOpen && (
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <p>No arcs yet. Create your first arc, then add tonight&rsquo;s session to it.</p>
          <button className="btn btn-primary" onClick={() => setArcFormOpen(true)}>
            + New arc
          </button>
        </div>
      )}
    </div>
  );
}
