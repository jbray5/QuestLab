import { useMemo, useState } from "react";

import type { Npc } from "../../api/npcs";
import type { RunbookScene } from "../../api/types";

interface NpcDialog {
  npc_name: string;
  lines: string[];
  improv_hooks?: string[];
}

interface Props {
  /** Campaign NPCs to render as cards (cards filter by current scene relevance). */
  npcs: Npc[];
  /** Currently-displayed runbook scene, used to surface scene-relevant NPCs first. */
  currentScene?: RunbookScene | null;
  /** Runbook-level NPC dialog rows (one per NPC) for inline dialog hooks. */
  runbookNpcDialog?: NpcDialog[];
}

/**
 * Plan 37/38 — "Tonight's Cast" sliding drawer (Plan 39 candidate).
 *
 * Surfaces campaign NPCs at-a-glance during a live session so the DM
 * doesn't have to leave the runbook view to remember an accent cue, a
 * dialog hook, or what an NPC is currently doing in the scene.
 *
 * Slides in from the right edge of the viewport over the existing
 * three-panel HUD layout. Toggle button is a small fixed-position chip.
 *
 * Each card surfaces: portrait + name + role + accent (parsed from
 * notes) + dialog hooks (from runbook npc_dialog if present, otherwise
 * from the NPC's stored dialog_hooks list).
 */
export default function TonightsCastDrawer({
  npcs,
  currentScene,
  runbookNpcDialog,
}: Props) {
  const [open, setOpen] = useState(false);

  // Detect which NPCs appear in the current scene by name-matching against
  // read_aloud + dm_notes. Inexact but cheap; surfaces a "★ in this scene"
  // tag on relevant cards.
  const sceneText = useMemo(() => {
    if (!currentScene) return "";
    return [
      currentScene.title || "",
      currentScene.read_aloud || "",
      currentScene.dm_notes || "",
    ]
      .join(" ")
      .toLowerCase();
  }, [currentScene]);

  // Sort: NPCs mentioned in the current scene first, then by name.
  const sortedNpcs = useMemo(() => {
    const inScene = (npc: Npc) =>
      sceneText.length > 0 && sceneText.includes(npc.name.toLowerCase());
    return [...npcs].sort((a, b) => {
      const aIn = inScene(a);
      const bIn = inScene(b);
      if (aIn !== bIn) return aIn ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [npcs, sceneText]);

  const dialogByName = useMemo(() => {
    const m: Record<string, NpcDialog> = {};
    for (const d of runbookNpcDialog ?? []) {
      m[d.npc_name.toLowerCase()] = d;
    }
    return m;
  }, [runbookNpcDialog]);

  return (
    <>
      {/* Toggle button — fixed to right edge of viewport */}
      <button
        onClick={() => setOpen((p) => !p)}
        title={open ? "Hide cast" : "Show tonight's cast"}
        style={toggleStyle(open)}
      >
        {open ? "✕" : "🎭"}
        <span style={{ display: "block", fontSize: "0.55rem", marginTop: 2 }}>
          {open ? "Close" : "Cast"}
        </span>
      </button>

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        style={{
          ...drawerStyle,
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <header style={headerStyle}>
          <strong style={{ fontFamily: "Cinzel Decorative, serif", color: "var(--gold)" }}>
            🎭 Tonight's Cast
          </strong>
          <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
            {currentScene ? `Scene: ${currentScene.title?.slice(0, 30) ?? "—"}` : "No scene"}
          </span>
        </header>
        <div style={listStyle}>
          {sortedNpcs.length === 0 && (
            <p className="text-sm text-muted" style={{ padding: "1rem" }}>
              No NPCs in this campaign yet.
            </p>
          )}
          {sortedNpcs.map((npc) => {
            const inScene =
              sceneText.length > 0 && sceneText.includes(npc.name.toLowerCase());
            const accent = parseAccent(npc.notes ?? "");
            const dialog = dialogByName[npc.name.toLowerCase()];
            const hooks =
              dialog?.lines && dialog.lines.length > 0
                ? dialog.lines
                : (npc.dialog_hooks ?? []);
            return (
              <article key={npc.id} style={cardStyle(inScene)}>
                <div style={{ display: "flex", gap: "0.55rem", alignItems: "flex-start" }}>
                  {npc.portrait_url ? (
                    <img
                      src={npc.portrait_url}
                      alt={npc.name}
                      style={portraitStyle}
                    />
                  ) : (
                    <div style={{ ...portraitStyle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.4rem" }}>
                      👤
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.3rem", flexWrap: "wrap" }}>
                      <strong style={{ color: "var(--gold)", fontSize: "0.85rem", fontFamily: "Cinzel Decorative, serif" }}>
                        {npc.name}
                      </strong>
                      {inScene && (
                        <span style={inSceneTagStyle} title="Mentioned in the current scene">
                          ★ in scene
                        </span>
                      )}
                    </div>
                    {npc.role && (
                      <p style={{ margin: 0, fontSize: "0.7rem", color: "var(--muted)", fontStyle: "italic" }}>
                        {npc.role}
                      </p>
                    )}
                  </div>
                </div>

                {accent && (
                  <div style={accentStyle}>
                    <span style={accentLabelStyle}>Accent</span>
                    <p style={{ margin: 0, fontSize: "0.72rem", color: "var(--text)", lineHeight: 1.4 }}>
                      {accent}
                    </p>
                  </div>
                )}

                {hooks.length > 0 && (
                  <ul style={hooksListStyle}>
                    {hooks.slice(0, 4).map((h, i) => (
                      <li key={i} style={hookItemStyle}>
                        “{h}”
                      </li>
                    ))}
                  </ul>
                )}

                {dialog?.improv_hooks && dialog.improv_hooks.length > 0 && (
                  <details style={{ marginTop: "0.4rem", fontSize: "0.7rem", color: "var(--muted)" }}>
                    <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
                      Improv hooks ({dialog.improv_hooks.length})
                    </summary>
                    <ul style={{ marginTop: "0.3rem", paddingLeft: "1rem" }}>
                      {dialog.improv_hooks.map((h, i) => (
                        <li key={i} style={{ marginBottom: "0.2rem" }}>{h}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the accent description from an NPC's notes field. We've been
 * embedding it as `**Accent:** <description>` at the end of the notes
 * during the Severance seed; this pulls it back out for prominent display.
 */
function parseAccent(notes: string): string | null {
  const match = notes.match(/\*\*Accent:\*\*\s*([\s\S]+?)(?:\n\n|$)/i);
  if (!match) return null;
  return match[1].trim().replace(/\s+/g, " ");
}

// ── styles ──────────────────────────────────────────────────────────────────

const DRAWER_WIDTH = 340;

function toggleStyle(open: boolean): React.CSSProperties {
  return {
    position: "fixed",
    top: "50%",
    right: open ? DRAWER_WIDTH : 0,
    transform: "translateY(-50%)",
    zIndex: 9501,
    width: 44,
    padding: "0.5rem 0.3rem",
    background: open ? "var(--gold)" : "var(--surface)",
    color: open ? "var(--bg, #1a1a1a)" : "var(--gold)",
    border: "1px solid var(--gold)",
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    fontSize: "1.1rem",
    textAlign: "center",
    cursor: "pointer",
    transition: "right 240ms ease, background 200ms ease",
    boxShadow: "-4px 0 10px rgba(0,0,0,0.25)",
    fontFamily: "Cinzel Decorative, serif",
  };
}

const drawerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: DRAWER_WIDTH,
  background: "var(--surface)",
  borderLeft: "1px solid var(--gold)",
  boxShadow: "-12px 0 36px rgba(0,0,0,0.5)",
  display: "flex",
  flexDirection: "column",
  zIndex: 9500,
  transition: "transform 240ms ease",
};

const headerStyle: React.CSSProperties = {
  padding: "0.7rem 0.85rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface2)",
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "0.6rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.6rem",
};

function cardStyle(inScene: boolean): React.CSSProperties {
  return {
    padding: "0.55rem",
    borderRadius: 8,
    background: inScene ? "rgba(201, 168, 76, 0.08)" : "var(--surface2)",
    border: inScene ? "1px solid var(--gold)" : "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
    gap: "0.4rem",
  };
}

const portraitStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 6,
  border: "1px solid var(--gold)",
  background: "var(--surface)",
  objectFit: "cover",
  flexShrink: 0,
};

const inSceneTagStyle: React.CSSProperties = {
  fontSize: "0.55rem",
  padding: "0.1rem 0.35rem",
  background: "var(--gold)",
  color: "var(--bg, #1a1a1a)",
  borderRadius: 8,
  letterSpacing: "0.04em",
  fontWeight: 700,
};

const accentStyle: React.CSSProperties = {
  padding: "0.4rem 0.5rem",
  background: "rgba(0,0,0,0.25)",
  borderRadius: 4,
  borderLeft: "2px solid var(--gold)",
};

const accentLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.55rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  marginBottom: "0.15rem",
};

const hooksListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.25rem",
};

const hookItemStyle: React.CSSProperties = {
  fontSize: "0.72rem",
  color: "var(--text-secondary, var(--muted))",
  fontStyle: "italic",
  lineHeight: 1.4,
};
