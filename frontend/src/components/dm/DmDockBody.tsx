import { useEffect, useMemo, useState } from "react";
import {
  Clapperboard, Lightbulb, Lock, Map as MapIcon, NotebookPen, Swords, Target, UserRound, Users,
} from "lucide-react";
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
import { statusLabel } from "../../lib/labels";

// Plan 91 — the face the DM's dock shows: the true form once revealed, else the disguise.
const npcFace = (n: { portrait_url: string | null; true_form_url?: string | null; true_form_revealed?: boolean }) =>
  n.true_form_revealed && n.true_form_url ? n.true_form_url : n.portrait_url;

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

// Lamplit (Plan 121): sentence-case group labels, compact buttons, inline icons.
const groupLabel: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: 4 };
const smallBtn: React.CSSProperties = { minHeight: 28, fontSize: "0.8125rem", padding: "0.15rem 0.6rem" };
const iconInline: React.CSSProperties = { verticalAlign: "-2px", color: "var(--muted)" };

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

  const tabBtn = (k: Tab, label: string, icon: React.ReactNode) => (
    <button
      key={k}
      onClick={() => setTab(k)}
      className="btn btn-ghost"
      aria-pressed={tab === k}
      style={{
        minHeight: 28,
        fontSize: "0.8125rem",
        padding: "0.1rem 0.55rem",
        gap: "0.3rem",
        ...(tab === k
          ? { background: "var(--accent-active)", color: "var(--accent-active-text)", borderColor: "var(--accent-line)" }
          : {}),
      }}
    >
      {icon}
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
          aria-label="Session"
          style={{ fontSize: "0.8125rem", maxWidth: 190, padding: "0.2rem 0.35rem", width: "auto", minWidth: 0, flex: "1 1 120px" }}
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
          {tabBtn("notes", "Notes", <NotebookPen size={14} aria-hidden />)}
          {tabBtn("script", "Script", <Clapperboard size={14} aria-hidden />)}
          {tabBtn("people", "People", <Users size={14} aria-hidden />)}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: tab === "notes" ? 0 : "0.7rem 0.75rem", display: "flex", flexDirection: "column" }}>
        {tab === "notes" && <SessionNotesEditor sessionId={sessionId} />}

        {tab === "script" && (
          <div>
            {!runbook && (
              <div style={{ color: "var(--muted)", textAlign: "center", marginTop: "1.5rem", fontSize: "0.875rem", lineHeight: 1.5 }}>
                <p style={{ color: "var(--text2)" }}>The script is your runbook: read-aloud text and notes, scene by scene.</p>
                <p>This session doesn&rsquo;t have one yet.</p>
                <Link to={`/sessions/${sessionId}/prep`} className="btn btn-secondary" style={{ marginTop: 6 }}>
                  Write it in session prep →
                </Link>
              </div>
            )}
            {runbook && scenes.length === 0 && (
              <div>
                <div style={groupLabel}>Opening scene · read aloud</div>
                <div className="read-aloud" style={{ fontSize: "0.95rem", padding: "0.6rem 0.8rem", whiteSpace: "pre-wrap" }}>
                  {runbook.opening_scene || (
                    <span style={{ color: "var(--muted)", fontStyle: "normal", fontFamily: "var(--font-ui)", fontSize: "0.8125rem" }}>
                      Nothing written yet — add scenes in session prep.
                    </span>
                  )}
                </div>
              </div>
            )}
            {runbook && scene && (
              <div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                  {scenes.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSceneIdx(i)}
                      className="btn btn-ghost num"
                      aria-pressed={i === sceneIdx}
                      aria-label={`Scene ${i + 1}: ${s.title}`}
                      style={{
                        minHeight: 26,
                        minWidth: 30,
                        fontSize: "0.8125rem",
                        padding: "0.05rem 0.45rem",
                        ...(i === sceneIdx
                          ? { background: "var(--accent-active)", color: "var(--accent-active-text)", borderColor: "var(--accent-line)" }
                          : {}),
                      }}
                      title={s.title}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <h4 className="story" style={{ margin: "0 0 0.1rem", color: "var(--text)", fontSize: "1.2rem", fontWeight: 700 }}>{scene.title}</h4>
                {scene.estimated_minutes > 0 && (
                  <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0 0.5rem" }}>
                    About <span className="num">{scene.estimated_minutes}</span> min
                  </p>
                )}
                <div style={groupLabel}>Read aloud</div>
                <div className="read-aloud" style={{ padding: "0.55rem 0.75rem", marginBottom: "0.7rem" }}>
                  <EditableRunbookText kind="scene" sceneIndex={sceneIdx} field="read_aloud" sessionId={sessionId} runbook={runbook} variant="read_aloud" fontSize="0.95rem" />
                </div>
                <div style={groupLabel}>Your notes for this scene</div>
                <div
                  style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "0.55rem 0.75rem",
                    marginBottom: "0.7rem",
                  }}
                >
                  <EditableRunbookText kind="scene" sceneIndex={sceneIdx} field="dm_notes" sessionId={sessionId} runbook={runbook} variant="dm_notes" fontSize="0.875rem" />
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="btn btn-ghost" style={smallBtn} disabled={sceneIdx === 0} onClick={() => setSceneIdx(sceneIdx - 1)}>
                    ← Previous
                  </button>
                  <button className="btn btn-secondary" style={smallBtn} disabled={sceneIdx >= scenes.length - 1} onClick={() => setSceneIdx(sceneIdx + 1)}>
                    Next →
                  </button>
                </div>
              </div>
            )}
            {runbook && runbook.encounter_flows?.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div style={groupLabel}>How the fights should go</div>
                {runbook.encounter_flows.map((f, i) => (
                  <details key={i} style={{ marginBottom: 6 }}>
                    <summary className="story" style={{ cursor: "pointer", fontSize: "1rem", color: "var(--text)", fontWeight: 700 }}>{f.encounter_name}</summary>
                    <ol style={{ margin: "0.3rem 0 0 1.2rem", padding: 0, fontSize: "0.8125rem", color: "var(--text2)" }}>
                      {f.round_by_round.map((r, j) => (
                        <li key={j} style={{ marginBottom: 2 }}>{r}</li>
                      ))}
                    </ol>
                    {f.tactics && (
                      <p style={{ fontSize: "0.8125rem", margin: "0.35rem 0 0", color: "var(--text)" }}>
                        <Swords size={13} aria-hidden style={iconInline} /> {f.tactics}
                      </p>
                    )}
                    {f.terrain_notes && (
                      <p style={{ fontSize: "0.8125rem", margin: "0.2rem 0 0", color: "var(--muted)" }}>
                        <MapIcon size={13} aria-hidden style={iconInline} /> {f.terrain_notes}
                      </p>
                    )}
                  </details>
                ))}
              </div>
            )}
            {runbook && runbook.npc_dialog?.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <div style={groupLabel}>What the NPCs might say</div>
                {runbook.npc_dialog.map((n, i) => (
                  <details key={i} style={{ marginBottom: 6 }}>
                    <summary className="story" style={{ cursor: "pointer", fontSize: "1rem", color: "var(--text)", fontWeight: 700 }}>{n.npc_name}</summary>
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, fontSize: "0.8125rem", color: "var(--text2)" }}>
                      {n.lines.map((l, j) => (
                        <li key={j} className="story" style={{ fontStyle: "italic", marginBottom: 2, fontSize: "0.9rem" }}>&ldquo;{l}&rdquo;</li>
                      ))}
                      {n.improv_hooks.map((h, j) => (
                        <li key={`h${j}`} style={{ marginBottom: 2, color: "var(--muted)", listStyle: "none", marginLeft: "-1rem" }}>
                          <Lightbulb size={13} aria-hidden style={iconInline} /> {h}
                        </li>
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
              aria-label="Search NPCs"
              style={{ width: "100%", fontSize: "0.875rem", padding: "0.35rem 0.6rem", marginBottom: 8 }}
            />
            {people.length === 0 && (
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", lineHeight: 1.5 }}>
                {npcs.length === 0
                  ? "Every NPC in the campaign shows here with their secret, motive and hooks. This campaign has none yet — add them from the campaign's NPCs page."
                  : "Nobody matches."}
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {people.map((n) => (
                <details
                  key={n.id}
                  style={{
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "0.45rem 0.6rem",
                  }}
                >
                  <summary style={{ cursor: "pointer", listStyle: "none", display: "flex", gap: 8, alignItems: "center" }}>
                    {npcFace(n) ? (
                      <img
                        src={npcFace(n) ?? undefined}
                        {...zoomable(npcFace(n) ?? "", n.name)}
                        alt=""
                        style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flexShrink: 0, cursor: "zoom-in" }}
                      />
                    ) : (
                      <span style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface3)", color: "var(--text2)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <UserRound size={18} aria-hidden />
                      </span>
                    )}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="story" style={{ display: "block", color: "var(--text)", fontWeight: 700, fontSize: "1rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {n.name}
                      </span>
                      <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {[n.role, n.location].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span style={{ display: "flex", gap: 3, flexShrink: 0 }}>
                      {!n.is_revealed && <span className="pill" style={{ fontSize: "0.75rem", padding: "0 0.5rem" }} title="Players haven't met them yet">Not met yet</span>}
                      {n.status !== "Alive" && (
                        <span className={`pill ${/dead/i.test(n.status) ? "pill-danger" : "pill-amber"}`} style={{ fontSize: "0.75rem", padding: "0 0.5rem" }}>
                          {statusLabel(n.status)}
                        </span>
                      )}
                    </span>
                  </summary>
                  <div style={{ marginTop: 6, fontSize: "0.8125rem", lineHeight: 1.45, display: "flex", flexDirection: "column", gap: 4 }}>
                    {n.personality && <p style={{ margin: 0 }}>{n.personality}</p>}
                    {n.motivation && (
                      <p style={{ margin: 0, color: "var(--text2)" }}>
                        <Target size={13} aria-hidden style={iconInline} /> <span style={{ color: "var(--muted)" }}>Wants:</span> {n.motivation}
                      </p>
                    )}
                    {n.secret && (
                      <p style={{ margin: 0, color: "var(--amber-text)" }} title="DM only">
                        <Lock size={13} aria-hidden style={iconInline} /> <span style={{ color: "var(--muted)" }}>Secret:</span> {n.secret}
                      </p>
                    )}
                    {n.dialog_hooks && n.dialog_hooks.length > 0 && (
                      <ul style={{ margin: "0.2rem 0 0 1rem", padding: 0, color: "var(--text2)" }}>
                        {n.dialog_hooks.map((h, i) => (
                          <li key={i} className="story" style={{ fontStyle: "italic", fontSize: "0.9rem" }}>&ldquo;{h}&rdquo;</li>
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
