import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import type { BriefBeat, SessionBrief } from "../../api/types";

/**
 * BriefPanel — the glanceable DM brief (Plan 43).
 *
 * A launcher + modal that renders the session-2-winning format the app now
 * generates: a single cold open, beats with machine triggers, NPC play-faces,
 * per-PC spotlight cues, a danger dial, and open-ending roads. Nothing here is
 * read aloud except the cold open — it's a sheet the DM glances at and looks up
 * from, the deliberate inverse of a read-aloud runbook.
 */

export default function BriefPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-secondary"
        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
        onClick={() => setOpen(true)}
        title="The glanceable DM brief for this session"
      >
        📋 Brief
      </button>
      {open && <BriefModal sessionId={sessionId} onClose={() => setOpen(false)} />}
    </>
  );
}

function triggerChip(b: BriefBeat): string | null {
  const v = b.trigger_value;
  switch (b.trigger_kind) {
    case "hp_lte":
      return `${b.target ? b.target + " " : ""}HP ≤ ${v ?? "?"}`;
    case "round_gte":
      return `Round ${v ?? "?"}+`;
    case "on_defeated":
      return `${b.target || "foe"} defeated`;
    case "first_pc_down":
      return "First PC down";
    case "manual":
      return "Manual cue";
    default:
      return null;
  }
}

const KIND_ACCENT: Record<string, string> = {
  combat: "#b0472f",
  clock: "#c9a24a",
  reveal: "#6f83c0",
  rp: "#7a9a72",
};

function BriefModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);

  const { data: brief, isLoading } = useQuery({
    queryKey: ["session-brief", sessionId],
    queryFn: () => sessionsApi.getBrief(sessionId),
  });

  const generate = useMutation({
    mutationFn: () => sessionsApi.generateBrief(sessionId, notes),
    onSuccess: (b) => {
      qc.setQueryData(["session-brief", sessionId], b);
      setShowNotes(false);
    },
  });

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(3,3,7,0.74)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "3vh 1rem",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ql-modal"
        role="dialog"
        aria-label="DM brief"
        style={{
          background: "var(--surface, #16161c)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          width: "min(780px, 96vw)",
          maxWidth: "96vw",
          boxShadow: "0 12px 48px rgba(0,0,0,0.6)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.9rem 1.2rem",
            borderBottom: "1px solid var(--border)",
            position: "sticky",
            top: 0,
            background: "var(--surface, #16161c)",
            borderTopLeftRadius: 14,
            borderTopRightRadius: 14,
            zIndex: 1,
          }}
        >
          <strong
            style={{
              fontFamily: "Cinzel Decorative, Cinzel, serif",
              color: "var(--gold)",
              fontSize: "1.1rem",
              letterSpacing: "0.04em",
            }}
          >
            DM Brief
          </strong>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.72rem" }}
              onClick={() => setShowNotes((s) => !s)}
            >
              {brief ? "↻ Regenerate" : "✦ Generate"}
            </button>
            <button className="btn btn-ghost" style={{ padding: "0 0.45rem" }} onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        {showNotes && (
          <div style={{ padding: "0.8rem 1.2rem", borderBottom: "1px solid var(--border)" }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional planning notes to weave in (beats you want, tone, the 'what now' road…)"
              rows={3}
              style={{ width: "100%", fontSize: "0.8rem", resize: "vertical" }}
            />
            <button
              className="btn"
              style={{ marginTop: 6 }}
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? "Conjuring the brief…" : brief ? "Regenerate brief" : "Generate brief"}
            </button>
            {generate.isError && (
              <p style={{ color: "var(--danger, #ef5350)", fontSize: "0.72rem", marginTop: 4 }}>
                {(generate.error as Error).message}
              </p>
            )}
          </div>
        )}

        <div style={{ padding: "1.1rem 1.2rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {isLoading && <div style={{ color: "var(--muted)", fontStyle: "italic" }}>Loading…</div>}

          {!isLoading && !brief && (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem 0" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.4rem" }}>📋</div>
              No brief yet. Click <strong>✦ Generate</strong> to write a glanceable one from your
              campaign, session, and cast.
            </div>
          )}

          {brief && <BriefBody brief={brief} />}
        </div>
      </div>
    </div>
  );
}

function BriefBody({ brief }: { brief: SessionBrief }) {
  return (
    <>
      {/* Cold open — the ONE read-aloud */}
      {brief.cold_open && (
        <section>
          <SectionLabel>Cold open · read this aloud</SectionLabel>
          <blockquote
            style={{
              margin: 0,
              padding: "0.7rem 0.95rem",
              borderLeft: "3px solid var(--gold)",
              background: "rgba(214,175,54,0.07)",
              borderRadius: "0 6px 6px 0",
              fontFamily: "Georgia, 'Cinzel', serif",
              fontStyle: "italic",
              lineHeight: 1.5,
              color: "var(--text)",
            }}
          >
            {brief.cold_open}
          </blockquote>
        </section>
      )}

      {brief.premise && (
        <section>
          <SectionLabel>The spine</SectionLabel>
          <p style={{ margin: 0, color: "var(--text)", fontStyle: "italic" }}>{brief.premise}</p>
        </section>
      )}

      {/* Beats */}
      {brief.beats.length > 0 && (
        <section>
          <SectionLabel>Beats · glance, don't read</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {brief.beats.map((b, i) => {
              const accent = KIND_ACCENT[b.kind] ?? "var(--border)";
              const chip = triggerChip(b);
              return (
                <div
                  key={i}
                  style={{
                    borderLeft: `3px solid ${accent}`,
                    background: "var(--surface2, #1c1c22)",
                    borderRadius: "0 8px 8px 0",
                    padding: "0.55rem 0.75rem",
                  }}
                >
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <strong style={{ color: "var(--text)", fontSize: "0.9rem" }}>{b.title}</strong>
                    {chip && (
                      <span style={pillStyle("rgba(176,71,47,0.22)", "#e8926f")}>🔔 {chip}</span>
                    )}
                    <span style={pillStyle("rgba(255,255,255,0.06)", "var(--muted)")}>{b.kind}</span>
                    {b.spotlight_pc && (
                      <span style={pillStyle("rgba(214,175,54,0.16)", "var(--gold)")}>
                        ★ {b.spotlight_pc}
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--text)", marginTop: 3, lineHeight: 1.4 }}>{b.cue}</div>
                  {b.dm_note && (
                    <div style={{ color: "var(--muted)", fontSize: "0.76rem", marginTop: 3 }}>
                      <em>DM:</em> {b.dm_note}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* NPC play-faces */}
      {brief.npc_faces.length > 0 && (
        <section>
          <SectionLabel>NPC play-faces · how to play them</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.5rem" }}>
            {brief.npc_faces.map((n, i) => (
              <div
                key={i}
                style={{
                  background: "var(--surface2, #1c1c22)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0.55rem 0.7rem",
                }}
              >
                <div style={{ color: "var(--gold)", fontWeight: 700, fontFamily: "Cinzel, serif" }}>
                  {n.name}
                </div>
                {n.quick_who && <div style={{ fontSize: "0.8rem", color: "var(--text)" }}>{n.quick_who}</div>}
                {n.want_now && (
                  <div style={{ fontSize: "0.76rem", color: "var(--muted)", marginTop: 3 }}>
                    <em>wants:</em> {n.want_now}
                  </div>
                )}
                {n.knows.length > 0 && (
                  <ul style={{ margin: "3px 0 0", paddingLeft: "1.1rem", fontSize: "0.74rem", color: "var(--muted)" }}>
                    {n.knows.map((k, j) => (
                      <li key={j}>{k}</li>
                    ))}
                  </ul>
                )}
                {n.voice && (
                  <div style={{ fontSize: "0.74rem", color: "var(--muted)", marginTop: 3, fontStyle: "italic" }}>
                    {n.voice}
                  </div>
                )}
                {n.secret_short && (
                  <div style={{ fontSize: "0.74rem", color: "var(--crimson2, #c96)", marginTop: 3 }}>
                    🤫 {n.secret_short}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Spotlight */}
      {brief.spotlight.length > 0 && (
        <section>
          <SectionLabel>Spotlight · say these out loud</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {brief.spotlight.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ color: "var(--gold)", fontWeight: 700, minWidth: 70, fontSize: "0.82rem" }}>
                  {s.pc_name}
                </span>
                <span style={{ color: "var(--text)", fontSize: "0.85rem" }}>{s.flag}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Danger dial */}
      {brief.danger_dial && (
        <section>
          <SectionLabel>Danger dial</SectionLabel>
          <div
            style={{
              padding: "0.6rem 0.8rem",
              background: "rgba(176,71,47,0.1)",
              borderRadius: 8,
              border: "1px solid rgba(176,71,47,0.3)",
              color: "var(--text)",
              fontSize: "0.85rem",
              lineHeight: 1.45,
            }}
          >
            ⚖ {brief.danger_dial}
          </div>
        </section>
      )}

      {/* Roads */}
      {brief.roads.length > 0 && (
        <section>
          <SectionLabel>The roads · let the table choose</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem" }}>
            {brief.roads.map((r, i) => (
              <div
                key={i}
                style={{
                  background: "var(--surface2, #1c1c22)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "0.55rem 0.7rem",
                }}
              >
                <div style={{ color: "var(--gold)", fontWeight: 700, fontSize: "0.85rem" }}>🛣 {r.label}</div>
                <div style={{ fontSize: "0.8rem", color: "var(--text)", marginTop: 2 }}>{r.flavor}</div>
                {r.pull && (
                  <div style={{ fontSize: "0.73rem", color: "var(--muted)", marginTop: 2 }}>pull: {r.pull}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {brief.fallback && (
        <div style={{ fontSize: "0.74rem", color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: "0.6rem" }}>
          🛟 {brief.fallback}
        </div>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.66rem",
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: "var(--muted)",
        marginBottom: "0.4rem",
        fontWeight: 700,
      }}
    >
      {children}
    </div>
  );
}

function pillStyle(bg: string, color: string): React.CSSProperties {
  return {
    fontSize: "0.66rem",
    padding: "0.1rem 0.42rem",
    borderRadius: 999,
    background: bg,
    color,
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
}
