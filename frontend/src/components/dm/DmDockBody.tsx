import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { adventuresApi } from "../../api/adventures";
import { npcsApi } from "../../api/npcs";
import { sessionsApi } from "../../api/sessions";
import type { RunbookScene } from "../../api/types";
import { zoomable } from "../../lib/lightbox";
import EditableRunbookText from "../runbook/EditableRunbookText";
import { rememberDockSession } from "./dmSession";
import SessionNotesEditor from "./SessionNotesEditor";

/**
 * DmDockBody — the contents of the DM notes dock (Plan 75).
 *
 * Three tabs, all DM-only:
 *   📝 Notes  — the session's running notes, autosaved as you type.
 *   🎬 Script — the runbook's scenes (read-aloud + DM notes), prev/next,
 *               NPC dialog hooks and encounter flows.
 *   👥 People — every NPC in the campaign with the DM-side face: secret,
 *               motivation, hooks, hidden/revealed.
 *
 * Rendered inside the floating dock and, unchanged, in the pop-out window at
 * /sessions/:id/notes. Never mounted on a player-facing route.
 */

type Tab = "notes" | "script" | "people";
const TAB_KEY = "ql-dock-tab";

interface Props {
  sessionId: string;
  onSessionChange: (id: string) => void;
}

export default function DmDockBody({ sessionId, onSessionChange }: Props) {
  const [tab, setTab] = useState<Tab>(() => {
    try {
      const v = localStorage.getItem(TAB_KEY);
      return v === "script" || v === "people" ? v : "notes";
    } catch {
      return "notes";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* tab just doesn't persist */
    }
  }, [tab]);

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId),
  });
  const { data: adventure } = useQuery({
    queryKey: ["adventure", session?.adventure_id],
    queryFn: () => adventuresApi.get(session!.adventure_id),
    enabled: !!session?.adventure_id,
  });
  const { data: siblings = [] } = useQuery({
    queryKey: ["sessions", session?.adventure_id],
    queryFn: () => sessionsApi.list(session!.adventure_id),
    enabled: !!session?.adventure_id,
  });
  const { data: runbook } = useQuery({
    queryKey: ["runbook", sessionId],
    queryFn: () => sessionsApi.getRunbook(sessionId),
    enabled: tab === "script",
  });
  const { data: npcs = [] } = useQuery({
    queryKey: ["npcs", adventure?.campaign_id],
    queryFn: () => npcsApi.list(adventure!.campaign_id),
    enabled: !!adventure?.campaign_id && tab === "people",
  });

  // ── Script: scene index remembered per session so dock + pop-out agree ───
  const sceneKey = `ql-dock-scene-${sessionId}`;
  const [sceneIdx, setSceneIdxRaw] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(sceneKey) ?? 0) || 0;
    } catch {
      return 0;
    }
  });
  function setSceneIdx(i: number) {
    setSceneIdxRaw(i);
    try {
      localStorage.setItem(sceneKey, String(i));
    } catch {
      /* fine */
    }
  }
  const scenes: RunbookScene[] = runbook?.scenes ?? [];
  const scene = scenes[Math.min(sceneIdx, Math.max(0, scenes.length - 1))];

  // ── People ────────────────────────────────────────────────────────────────
  const [q, setQ] = useState("");
  const people = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? npcs.filter((n) =>
          [n.name, n.role, n.location, ...(n.tags ?? [])]
            .filter(Boolean)
            .some((s) => String(s).toLowerCase().includes(needle)),
        )
      : npcs;
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [npcs, q]);

  const tabBtn = (k: Tab, label: string) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      className={`btn ${tab === k ? "btn-primary" : "btn-ghost"}`}
      style={{ fontSize: "0.68rem", padding: "0.15rem 0.55rem", textTransform: "none" }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      {/* Session picker + tabs */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 5,
          alignItems: "center",
          padding: "0.45rem 0.6rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface2)",
        }}
      >
        <select
          value={sessionId}
          onChange={(e) => {
            rememberDockSession(e.target.value);
            onSessionChange(e.target.value);
          }}
          title="Which session's notes to show"
          style={{ fontSize: "0.72rem", maxWidth: 190, padding: "0.15rem 0.3rem" }}
        >
          {siblings.length === 0 && session && (
            <option value={session.id}>
              S{session.session_number}{session.title ? ` · ${session.title}` : ""}
            </option>
          )}
          {siblings.map((s) => (
            <option key={s.id} value={s.id}>
              S{s.session_number}{s.title ? ` · ${s.title}` : ""}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 3, marginLeft: "auto" }}>
          {tabBtn("notes", "📝 Notes")}
          {tabBtn("script", "🎬 Script")}
          {tabBtn("people", "👥 People")}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: tab === "notes" ? 0 : "0.7rem 0.75rem", display: "flex", flexDirection: "column" }}>
        {tab === "notes" && <SessionNotesEditor sessionId={sessionId} />}

        {tab === "script" && (
          <div>
            {!runbook && (
              <div style={{ color: "var(--muted)", textAlign: "center", marginTop: "1.5rem", fontSize: "0.85rem" }}>
                <p>No runbook for this session yet.</p>
                <Link to={`/sessions/${sessionId}/run`} className="btn btn-secondary" style={{ display: "inline-block", marginTop: 6 }}>
                  Generate one →
                </Link>
              </div>
            )}
            {runbook && scenes.length === 0 && (
              <div>
                <h4 style={{ margin: "0 0 0.4rem", color: "var(--gold)" }}>Opening scene</h4>
                <p style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "var(--muted)", margin: 0 }}>{runbook.opening_scene}</p>
              </div>
            )}
            {runbook && scene && (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {scenes.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSceneIdx(i)}
                      className={`btn ${i === sceneIdx ? "btn-primary" : "btn-ghost"}`}
                      style={{ fontSize: "0.64rem", padding: "0.1rem 0.45rem" }}
                      title={s.title}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <h4 style={{ margin: "0 0 0.15rem", color: "var(--gold)", fontSize: "1rem" }}>{scene.title}</h4>
                {scene.estimated_minutes > 0 && (
                  <p style={{ fontSize: "0.68rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>~{scene.estimated_minutes} min</p>
                )}
                <div
                  style={{
                    background: "rgba(212,185,120,0.08)",
                    border: "1px solid var(--gold)",
                    borderLeft: "4px solid var(--gold)",
                    borderRadius: 6,
                    padding: "0.5rem 0.7rem",
                    marginBottom: "0.6rem",
                  }}
                >
                  <div style={{ fontSize: "0.6rem", color: "var(--gold)", fontWeight: 700, marginBottom: 3, textTransform: "uppercase" }}>Read aloud</div>
                  <EditableRunbookText kind="scene" sceneIndex={sceneIdx} field="read_aloud" sessionId={sessionId} runbook={runbook} variant="read_aloud" fontSize="0.92rem" />
                </div>
                <div
                  style={{
                    background: "rgba(108,71,255,0.07)",
                    border: "1px solid #5a3a9a",
                    borderLeft: "4px solid #5a3a9a",
                    borderRadius: 6,
                    padding: "0.5rem 0.7rem",
                    marginBottom: "0.6rem",
                  }}
                >
                  <div style={{ fontSize: "0.6rem", color: "#9575cd", fontWeight: 700, marginBottom: 3, textTransform: "uppercase" }}>DM notes</div>
                  <EditableRunbookText kind="scene" sceneIndex={sceneIdx} field="dm_notes" sessionId={sessionId} runbook={runbook} variant="dm_notes" fontSize="0.86rem" />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} disabled={sceneIdx === 0} onClick={() => setSceneIdx(sceneIdx - 1)}>
                    ← Prev
                  </button>
                  <button className="btn btn-secondary" style={{ fontSize: "0.7rem" }} disabled={sceneIdx >= scenes.length - 1} onClick={() => setSceneIdx(sceneIdx + 1)}>
                    Next →
                  </button>
                </div>
              </div>
            )}
            {runbook && runbook.encounter_flows?.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Encounter flows
                </div>
                {runbook.encounter_flows.map((f, i) => (
                  <details key={i} style={{ marginBottom: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--gold)", fontWeight: 600 }}>{f.encounter_name}</summary>
                    <ol style={{ margin: "0.3rem 0 0 1.1rem", padding: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
                      {f.round_by_round.map((r, j) => (
                        <li key={j} style={{ marginBottom: 2 }}>{r}</li>
                      ))}
                    </ol>
                    {f.tactics && <p style={{ fontSize: "0.76rem", margin: "0.3rem 0 0", color: "var(--text)" }}>⚔ {f.tactics}</p>}
                    {f.terrain_notes && <p style={{ fontSize: "0.76rem", margin: "0.2rem 0 0", color: "var(--muted)" }}>🗺 {f.terrain_notes}</p>}
                  </details>
                ))}
              </div>
            )}
            {runbook && runbook.npc_dialog?.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div style={{ fontSize: "0.62rem", fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  NPC dialog hooks
                </div>
                {runbook.npc_dialog.map((n, i) => (
                  <details key={i} style={{ marginBottom: 6 }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.82rem", color: "var(--gold)", fontWeight: 600 }}>{n.npc_name}</summary>
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, fontSize: "0.78rem", color: "var(--muted)" }}>
                      {n.lines.map((l, j) => (
                        <li key={j} style={{ fontStyle: "italic", marginBottom: 2 }}>&ldquo;{l}&rdquo;</li>
                      ))}
                      {n.improv_hooks.map((h, j) => (
                        <li key={`h${j}`} style={{ marginBottom: 2 }}>💡 {h}</li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "people" && (
          <div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, role, place, tag…"
              style={{ width: "100%", fontSize: "0.8rem", marginBottom: 8 }}
            />
            {people.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                {npcs.length === 0 ? "No NPCs in this campaign yet." : "Nobody matches."}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {people.map((n) => (
                <details
                  key={n.id}
                  style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "0.4rem 0.55rem",
                  }}
                >
                  <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", gap: 8, alignItems: "center" }}>
                    {n.portrait_url ? (
                      <img
                        src={n.portrait_url}
                        {...zoomable(n.portrait_url, n.name)}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, cursor: "zoom-in" }}
                      />
                    ) : (
                      <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>👤</span>
                    )}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", color: "var(--gold)", fontWeight: 600, fontSize: "0.88rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.name}
                      </span>
                      <span style={{ display: "block", fontSize: "0.7rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {[n.role, n.location].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {!n.is_revealed && <span className="badge badge-draft" style={{ fontSize: "0.58rem" }} title="Players haven't met them yet">hidden</span>}
                      {n.status !== "Alive" && <span className="badge badge-progress" style={{ fontSize: "0.58rem" }}>{n.status}</span>}
                    </span>
                  </summary>
                  <div style={{ marginTop: 6, fontSize: "0.78rem", lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 4 }}>
                    {n.personality && <p style={{ margin: 0 }}>{n.personality}</p>}
                    {n.motivation && <p style={{ margin: 0, color: "var(--muted)" }}>🎯 {n.motivation}</p>}
                    {n.secret && (
                      <p style={{ margin: 0, color: "#c8a2ff" }} title="DM only">
                        🔒 {n.secret}
                      </p>
                    )}
                    {n.dialog_hooks && n.dialog_hooks.length > 0 && (
                      <ul style={{ margin: "0.2rem 0 0 1rem", padding: 0, color: "var(--muted)" }}>
                        {n.dialog_hooks.map((h, i) => (
                          <li key={i} style={{ fontStyle: "italic" }}>&ldquo;{h}&rdquo;</li>
                        ))}
                      </ul>
                    )}
                    {n.notes && <p style={{ margin: 0, color: "var(--muted)", whiteSpace: "pre-wrap" }}>{n.notes}</p>}
                  </div>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
