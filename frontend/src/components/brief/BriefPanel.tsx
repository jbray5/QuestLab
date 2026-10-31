import { useState } from "react";
import { Bell, ClipboardList, LifeBuoy, RefreshCw, Scale, Signpost, Sparkles, Star, X } from "lucide-react";
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
 *
 * Lamplit (Plan 121): Console panels for the tool, Alegreya for the fiction,
 * the cold open in a read-aloud story panel; no colored stripes, no emoji.
 */

export default function BriefPanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-secondary"
        style={{ minHeight: 30, fontSize: "0.8125rem", padding: "0.25rem 0.6rem", gap: "0.35rem" }}
        onClick={() => setOpen(true)}
        title="The glanceable DM brief for this session"
      >
        <ClipboardList size={15} aria-hidden /> Brief
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

/** Beat kinds read as neutral pills; only a fight beat leans red. */
const KIND_PILL: Record<string, string> = {
  combat: "pill pill-danger",
  clock: "pill pill-amber",
  reveal: "pill",
  rp: "pill pill-teal",
};

const panel: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "0.55rem 0.75rem",
};

const smallPill: React.CSSProperties = { fontSize: "0.75rem", padding: "0 0.5rem" };

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
        background: "rgba(5,8,7,0.72)",
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
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 12,
          width: "min(780px, 96vw)",
          maxWidth: "96vw",
          boxShadow: "0 12px 48px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0.8rem 1.1rem",
            borderBottom: "1px solid var(--border)",
            position: "sticky",
            top: 0,
            background: "var(--surface)",
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            zIndex: 1,
          }}
        >
          <strong style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", color: "var(--text)", fontSize: "1.05rem", fontWeight: 600 }}>
            <ClipboardList size={17} aria-hidden style={{ color: "var(--muted)" }} />
            DM brief
          </strong>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              style={{ minHeight: 30, fontSize: "0.8125rem", padding: "0.2rem 0.6rem", gap: "0.35rem" }}
              aria-expanded={showNotes}
              onClick={() => setShowNotes((s) => !s)}
            >
              {brief ? <RefreshCw size={14} aria-hidden /> : <Sparkles size={14} aria-hidden />}
              {brief ? "Regenerate" : "Generate"}
            </button>
            <button
              className="btn btn-ghost"
              style={{ minHeight: 30, width: 32, padding: 0, border: "none" }}
              onClick={onClose}
              aria-label="Close"
              title="Close"
            >
              <X size={17} aria-hidden />
            </button>
          </div>
        </div>

        {showNotes && (
          <div style={{ padding: "0.8rem 1.1rem", borderBottom: "1px solid var(--border)" }}>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional planning notes to weave in (beats you want, tone, the 'what now' road…)"
              aria-label="Planning notes"
              rows={3}
              style={{ width: "100%", fontSize: "0.875rem", resize: "vertical" }}
            />
            <button
              className="btn btn-primary"
              style={{ marginTop: 8 }}
              onClick={() => generate.mutate()}
              disabled={generate.isPending}
            >
              {generate.isPending ? "Writing the brief…" : brief ? "Regenerate brief" : "Generate brief"}
            </button>
            {generate.isError && (
              <p style={{ color: "var(--danger-text)", fontSize: "0.8125rem", marginTop: 6 }}>
                {(generate.error as Error).message}
              </p>
            )}
          </div>
        )}

        <div style={{ padding: "1.1rem", display: "flex", flexDirection: "column", gap: "1.1rem" }}>
          {isLoading && <div style={{ color: "var(--muted)" }}>Loading…</div>}

          {!isLoading && !brief && (
            <div style={{ textAlign: "center", color: "var(--muted)", padding: "1.5rem 0", lineHeight: 1.5 }}>
              <ClipboardList size={28} aria-hidden style={{ marginBottom: "0.4rem", opacity: 0.7 }} />
              <p style={{ margin: "0 0 0.25rem", color: "var(--text2)" }}>
                A one-page sheet for the table: the cold open, the beats, how to play each NPC.
              </p>
              <p style={{ margin: 0 }}>
                No brief yet. Click <strong style={{ color: "var(--text2)" }}>Generate</strong> to write one from your
                campaign, session and cast.
              </p>
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
          <blockquote className="read-aloud" style={{ margin: 0, fontSize: "1.05rem" }}>
            {brief.cold_open}
          </blockquote>
        </section>
      )}

      {brief.premise && (
        <section>
          <SectionLabel>The spine</SectionLabel>
          <p className="story" style={{ margin: 0, color: "var(--story-text)", fontStyle: "italic", fontSize: "1.02rem" }}>
            {brief.premise}
          </p>
        </section>
      )}

      {/* Beats */}
      {brief.beats.length > 0 && (
        <section>
          <SectionLabel>Beats · glance, don&rsquo;t read</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {brief.beats.map((b, i) => {
              const chip = triggerChip(b);
              return (
                <div key={i} style={panel}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
                    <strong style={{ color: "var(--text)", fontSize: "0.9375rem", fontWeight: 600 }}>{b.title}</strong>
                    {chip && (
                      <span className="pill pill-next" style={smallPill}>
                        <Bell size={12} aria-hidden /> {chip}
                      </span>
                    )}
                    <span className={KIND_PILL[b.kind] ?? "pill"} style={smallPill}>{b.kind}</span>
                    {b.spotlight_pc && (
                      <span className="pill" style={smallPill}>
                        <Star size={12} aria-hidden /> <span className="story">{b.spotlight_pc}</span>
                      </span>
                    )}
                  </div>
                  <div style={{ color: "var(--text)", marginTop: 4, lineHeight: 1.45, fontSize: "0.9375rem" }}>{b.cue}</div>
                  {b.dm_note && (
                    <div style={{ color: "var(--muted)", fontSize: "0.8125rem", marginTop: 4 }}>
                      DM: {b.dm_note}
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
          <SectionLabel>How to play the NPCs</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.5rem" }}>
            {brief.npc_faces.map((n, i) => (
              <div key={i} style={panel}>
                <div className="story" style={{ color: "var(--text)", fontWeight: 700, fontSize: "1.05rem" }}>
                  {n.name}
                </div>
                {n.quick_who && <div style={{ fontSize: "0.8125rem", color: "var(--text2)" }}>{n.quick_who}</div>}
                {n.want_now && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: 3 }}>
                    Wants: <span style={{ color: "var(--text2)" }}>{n.want_now}</span>
                  </div>
                )}
                {n.knows.length > 0 && (
                  <ul style={{ margin: "3px 0 0", paddingLeft: "1.1rem", fontSize: "0.8125rem", color: "var(--muted)" }}>
                    {n.knows.map((k, j) => (
                      <li key={j}>{k}</li>
                    ))}
                  </ul>
                )}
                {n.voice && (
                  <div className="story" style={{ fontSize: "0.9rem", color: "var(--text2)", marginTop: 3, fontStyle: "italic" }}>
                    {n.voice}
                  </div>
                )}
                {n.secret_short && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--amber-text)", marginTop: 3 }}>
                    <span style={{ color: "var(--muted)" }}>Secret:</span> {n.secret_short}
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
              <div key={i} style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span className="story" style={{ color: "var(--text)", fontWeight: 700, minWidth: 90, fontSize: "0.95rem" }}>
                  {s.pc_name}
                </span>
                <span style={{ color: "var(--text2)", fontSize: "0.875rem" }}>{s.flag}</span>
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
              ...panel,
              display: "flex",
              gap: "0.5rem",
              alignItems: "flex-start",
              color: "var(--text)",
              fontSize: "0.875rem",
              lineHeight: 1.45,
            }}
          >
            <Scale size={16} aria-hidden style={{ color: "var(--amber-text)", marginTop: 2 }} />
            <span>{brief.danger_dial}</span>
          </div>
        </section>
      )}

      {/* Roads */}
      {brief.roads.length > 0 && (
        <section>
          <SectionLabel>The roads · let the table choose</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "0.5rem" }}>
            {brief.roads.map((r, i) => (
              <div key={i} style={panel}>
                <div style={{ color: "var(--text)", fontWeight: 600, fontSize: "0.9375rem", display: "flex", gap: 6, alignItems: "center" }}>
                  <Signpost size={14} aria-hidden style={{ color: "var(--muted)" }} /> {r.label}
                </div>
                <div style={{ fontSize: "0.8125rem", color: "var(--text2)", marginTop: 2 }}>{r.flavor}</div>
                {r.pull && (
                  <div style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: 2 }}>Pull: {r.pull}</div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {brief.fallback && (
        <div style={{ fontSize: "0.8125rem", color: "var(--muted)", borderTop: "1px solid var(--border)", paddingTop: "0.6rem", display: "flex", gap: 6 }}>
          <LifeBuoy size={14} aria-hidden style={{ marginTop: 2, flex: "none" }} />
          <span>{brief.fallback}</span>
        </div>
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: "0.8125rem",
        color: "var(--muted)",
        marginBottom: "0.4rem",
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}
