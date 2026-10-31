import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, ChevronDown, ChevronRight, Map as MapIcon, Play, Plus, Skull } from "lucide-react";

import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { sessionsApi } from "../api/sessions";
import type { Adventure, AdventureCreate, GameSession } from "../api/types";
import PcPicker from "../components/sessions/PcPicker";
import { useCampaignStore } from "../stores/useCampaignStore";
import { useIsCompact } from "../hooks/useIsCompact";
import { statusLabel } from "../lib/labels";
import RowMenu from "../components/RowMenu";

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
/** The Advance button says where it moves the session (Draft → Ready → In progress → Complete). */
const NEXT_STATUS_ACTION: Record<string, string> = {
  Draft: "Mark ready",
  Ready: "Mark in progress",
  InProgress: "Mark complete",
};
const TIER_LABELS: Record<string, string> = {
  Tier1: "Tier 1 · levels 1–4",
  Tier2: "Tier 2 · levels 5–10",
  Tier3: "Tier 3 · levels 11–16",
  Tier4: "Tier 4 · levels 17–20",
};

/** Session numbers are set as Roman numerals in the story face (DESIGN.md §1). */
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

/** Row and arc-header buttons: a notch smaller than page actions. */
const compactBtn: React.CSSProperties = { fontSize: "0.875rem", padding: "0.3rem 0.75rem" };
/** Read by screen readers, not drawn. */
const srOnly: React.CSSProperties = {
  position: "absolute", width: 1, height: 1, padding: 0, margin: -1,
  overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0,
};
/** A button that looks like the text it wraps (the arc name toggle, inline links). */
const bareBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "none", border: "none",
  padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left",
};

export default function CampaignSessions() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCampaign, setActiveAdventure } = useCampaignStore();
  const phone = useIsCompact(640);

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
        // Plan 83 — no tier: the server infers it from the party's levels.
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

  // Review 10/30 — from a brand-new campaign to a working HUD in two clicks:
  // the session goes into the arc you've been playing (or a fresh "Unsorted"
  // arc, renamed or moved later), everyone at the table attends, and the HUD opens.
  const quick = useMutation({
    mutationFn: async () => {
      const latest = [...allSessions].sort((x, y) => y.session_number - x.session_number)[0];
      let arc = arcs.find((a) => a.id === latest?.adventure_id) ?? arcs[arcs.length - 1];
      if (!arc) {
        arc = await adventuresApi.create(campaignId!, { title: "Unsorted", act_count: 3 });
      }
      setActiveAdventure(arc);
      return sessionsApi.create(arc.id, {
        // The HUD already says "Session N"; the title says when.
        title: `Quick session, ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
        session_number: nextNumber,
        attending_pc_ids: characters.length ? characters.map((c) => c.id) : undefined,
      });
    },
    onSuccess: (s) => {
      void qc.invalidateQueries({ queryKey: ["adventures", campaignId] });
      void qc.invalidateQueries({ queryKey: ["sessions", s.adventure_id] });
      navigate(`/sessions/${s.id}/hud`);
    },
    onError: (e: Error) => setCreateError(e.message),
  });

  const pcName = (id: string) =>
    characters.find((c) => c.id === id)?.character_name ?? id.slice(0, 8);

  return (
    <div className="fade-in">
      <nav className="text-sm" style={{ marginBottom: "0.75rem", color: "var(--muted)" }}>
        <Link to="/">Dashboard</Link>
        {activeCampaign && (
          <>
            {" / "}
            <span className="story" style={{ color: "var(--text2)" }}>{activeCampaign.name}</span>
          </>
        )}
        {" / "}
        <span style={{ color: "var(--text)" }}>Sessions</span>
      </nav>

      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", marginBottom: "1.25rem", gap: "1rem" }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Sessions</h1>
          <p className="text-muted" style={{ margin: "0.25rem 0 0", fontSize: "0.9375rem" }}>
            Grouped by arc — a stretch of the story with its own encounters and maps.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setArcFormOpen((v) => !v)}>
            {arcFormOpen ? (
              "Cancel"
            ) : (
              <>
                <Plus size={16} aria-hidden /> New arc
              </>
            )}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => quick.mutate()}
            disabled={quick.isPending}
            title="Make the next session and open the HUD — sort it into an arc later"
          >
            {quick.isPending ? (
              "Setting the table…"
            ) : (
              <>
                <Play size={16} aria-hidden /> Run a quick session
              </>
            )}
          </button>
        </div>
      </div>
      {quick.isError && (
        <p className="text-sm" style={{ color: "var(--danger-text)" }}>
          {createError}
        </p>
      )}

      {arcFormOpen && (
        <div className="card" style={{ maxWidth: 520, marginBottom: "1.25rem" }}>
          <h3 style={{ marginBottom: "0.75rem" }}>New arc</h3>
          <div className="form-group">
            <label>Title *</label>
            <input
              value={arcTitle}
              onChange={(e) => setArcTitle(e.target.value)}
              placeholder="e.g. Into the Fey"
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
        // Review 10/30 — "0 sessions" flashed before the real list arrived.
        const arcLoading = !!sessionQs[arcs.indexOf(arc)]?.isLoading;
        // "Up next" = the first unfinished session dated today or later; if
        // none is dated, the first unfinished one.
        const today = new Date().toISOString().slice(0, 10);
        const open = list.filter((s) => s.status !== "Complete");
        const upNext = open.find((s) => s.date_planned && s.date_planned >= today) ?? open[0];
        const isCollapsed = collapsed.has(arc.id);
        const editing = editArc?.id === arc.id;
        const adding = sessionFormFor === arc.id;
        const hasBody = !isCollapsed || editing || adding;
        // The numeral column is as wide as this arc's longest numeral, so titles line up.
        const longestNumeral = list.reduce((m, s) => Math.max(m, toRoman(s.session_number).length), 1);
        const numeralWidth = `max(2rem, calc(${longestNumeral} * 0.62em + 0.25rem))`;
        return (
          <section
            key={arc.id}
            style={{
              marginBottom: "1rem",
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-center"
              style={{
                justifyContent: "space-between",
                gap: "0.75rem 1rem",
                padding: "0.85rem 1rem 0.85rem 0.85rem",
                background: "var(--surface2)",
                borderBottom: hasBody ? "1px solid var(--border)" : "none",
              }}
            >
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <h2 className="story" style={{ fontSize: "1.35rem", margin: 0, lineHeight: 1.25 }}>
                  <button
                    type="button"
                    style={bareBtn}
                    onClick={() => toggleArc(arc.id)}
                    aria-expanded={!isCollapsed}
                    title={isCollapsed ? "Show sessions" : "Hide sessions"}
                  >
                    {isCollapsed ? (
                      <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)" }} />
                    ) : (
                      <ChevronDown size={18} aria-hidden style={{ color: "var(--muted)" }} />
                    )}
                    <span>{arc.title}</span>
                  </button>
                </h2>
                <div className="text-sm text-muted" style={{ marginTop: "0.15rem", paddingLeft: "calc(18px + 0.4rem)" }}>
                  {TIER_LABELS[arc.tier] ?? arc.tier}
                  {" · "}
                  {arcLoading ? "…" : `${list.length} session${list.length === 1 ? "" : "s"}`}
                </div>
                {arc.synopsis && !isCollapsed && !editing && (
                  <p
                    className="story"
                    style={{
                      margin: "0.35rem 0 0",
                      paddingLeft: "calc(18px + 0.4rem)",
                      color: "var(--text2)",
                      lineHeight: 1.45,
                      maxWidth: "70ch",
                    }}
                  >
                    {arc.synopsis}
                  </p>
                )}
              </div>
              <div
                className="flex gap-2 items-center"
                style={{ flexWrap: "wrap", justifyContent: phone ? "flex-start" : "flex-end" }}
              >
                <button className="btn btn-secondary" style={compactBtn} onClick={() => openSessionForm(arc)}>
                  <Plus size={15} aria-hidden /> Add session
                </button>
                <Link
                  className="btn btn-ghost"
                  style={compactBtn}
                  to={`/adventures/${arc.id}/encounters`}
                  onClick={() => setActiveAdventure(arc)}
                >
                  <Skull size={15} aria-hidden /> Encounters
                </Link>
                <Link
                  className="btn btn-ghost"
                  style={compactBtn}
                  to={`/adventures/${arc.id}/maps`}
                  onClick={() => setActiveAdventure(arc)}
                >
                  <MapIcon size={15} aria-hidden /> Map builder
                </Link>
                <RowMenu
                  label={`More for ${arc.title}`}
                  items={[
                    {
                      label: "Rename or describe…",
                      onSelect: () =>
                        setEditArc(
                          editArc?.id === arc.id
                            ? null
                            : { id: arc.id, title: arc.title, synopsis: arc.synopsis ?? "" },
                        ),
                    },
                    {
                      label: "Delete arc…",
                      danger: true,
                      confirm: list.length
                        ? `Delete the arc "${arc.title}" and its ${list.length} session${list.length === 1 ? "" : "s"}? This can't be undone.`
                        : `Delete the arc "${arc.title}"? This can't be undone.`,
                      onSelect: () => deleteArc.mutate(arc.id),
                    },
                  ]}
                />
              </div>
            </div>

            {editing && editArc && (
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: !isCollapsed || adding ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ maxWidth: 520 }}>
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
                      style={compactBtn}
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
                    <button className="btn btn-ghost" style={compactBtn} onClick={() => setEditArc(null)}>
                      Cancel
                    </button>
                    <Link className="text-sm" style={{ marginLeft: "auto" }} to={`/campaigns/${campaignId}/adventures`}>
                      Tier, acts, NPC roster, location notes →
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {adding && (
              <div
                style={{
                  padding: "1rem 1.25rem",
                  borderBottom: !isCollapsed ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ maxWidth: 520 }}>
                  <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem" }}>
                    New session in <span className="story">{arc.title}</span>
                  </h3>
                  <div className="grid-2">
                    <div className="form-group">
                      <label>Session number</label>
                      <input type="number" min={1} value={sNumber} onChange={(e) => setSNumber(Number(e.target.value))} />
                    </div>
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" value={sDate} onChange={(e) => setSDate(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Title</label>
                    <input value={sTitle} onChange={(e) => setSTitle(e.target.value)} placeholder="e.g. The Gilded Kettle" autoFocus />
                  </div>
                  <div className="form-group">
                    <label>Who&rsquo;s playing</label>
                    <PcPicker characters={characters} selected={sPcs} onChange={setSPcs} />
                  </div>
                  {createError && (
                    <p className="text-sm" style={{ color: "var(--danger-text)", marginBottom: "0.5rem" }}>
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
              </div>
            )}

            {!isCollapsed && (
              <div>
                {list.map((s, i) => {
                  const isNext = upNext?.id === s.id;
                  const done = s.status === "Complete";
                  const last = i === list.length - 1;
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
                        marginTop: isNext ? -1 : 0,
                        borderTop: isNext ? "1px solid var(--accent-line)" : "none",
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
                                {isNext && (
                                  <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>Up next</span>
                                )}
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
                          <Link
                            className="btn btn-secondary"
                            style={compactBtn}
                            title="Before the night: brief, runbook, session pack"
                            to={`/sessions/${s.id}/prep`}
                            onClick={() => setActiveAdventure(arc)}
                          >
                            Prep
                          </Link>
                          <Link
                            className={`btn ${isNext ? "btn-primary" : "btn-secondary"}`}
                            style={compactBtn}
                            title="Run the night from the HUD, the DM's screen at the table"
                            to={`/sessions/${s.id}/hud`}
                            onClick={() => setActiveAdventure(arc)}
                          >
                            <Play size={14} aria-hidden /> Run
                          </Link>
                          <RowMenu
                            label={`More for session ${s.session_number}`}
                            items={[
                              {
                                label: "Who's playing…",
                                onSelect: () => {
                                  setEditingPcsFor(s.id);
                                  setEditPcIds(s.attending_pc_ids ?? []);
                                },
                              },
                              {
                                label: "Delete session…",
                                danger: true,
                                confirm: `Delete Session ${s.session_number}${s.title ? `: ${s.title}` : ""}? Its notes and combat go with it. This can't be undone.`,
                                onSelect: () => del.mutate({ id: s.id, arcId: arc.id }),
                              },
                            ]}
                          />
                        </div>
                      </div>

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
                          <PcPicker characters={characters} selected={editPcIds} onChange={setEditPcIds} />
                          <div className="flex gap-2" style={{ marginTop: "0.6rem" }}>
                            <button
                              className="btn btn-primary"
                              style={compactBtn}
                              onClick={() => updatePcs.mutate({ id: s.id, pcIds: editPcIds })}
                              disabled={updatePcs.isPending}
                            >
                              {updatePcs.isPending ? "Saving…" : "Save party"}
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
                {arcLoading && (
                  <p className="text-sm text-muted" style={{ margin: 0, padding: "0.75rem 1rem" }}>
                    Loading sessions…
                  </p>
                )}
                {!arcLoading && list.length === 0 && sessionFormFor !== arc.id && (
                  <p className="text-sm text-muted" style={{ margin: 0, padding: "0.75rem 1rem" }}>
                    No sessions in this arc yet —{" "}
                    <button
                      type="button"
                      style={{ ...bareBtn, display: "inline", color: "var(--accent-text)" }}
                      onClick={() => openSessionForm(arc)}
                    >
                      add one
                    </button>
                    .
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}

      {!isLoading && arcs.length === 0 && !arcFormOpen && (
        <div className="empty-state">
          <CalendarDays size={32} aria-hidden style={{ color: "var(--muted)", marginBottom: "0.75rem" }} />
          <p style={{ maxWidth: "46ch", margin: "0 auto 1rem" }}>
            Sessions are the nights you play. Run one now and sort it into an arc later, or plan the
            story into arcs first.
          </p>
          <div className="flex gap-2" style={{ justifyContent: "center" }}>
            <button className="btn btn-secondary" onClick={() => quick.mutate()} disabled={quick.isPending}>
              {quick.isPending ? (
                "Setting the table…"
              ) : (
                <>
                  <Play size={16} aria-hidden /> Run a quick session
                </>
              )}
            </button>
            <button className="btn btn-secondary" onClick={() => setArcFormOpen(true)}>
              <Plus size={16} aria-hidden /> New arc
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
