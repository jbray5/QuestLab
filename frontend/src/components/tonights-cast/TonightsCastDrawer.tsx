import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Npc } from "../../api/npcs";
import type { RunbookScene } from "../../api/types";
import NpcModal from "../npc/NpcModal";
import NpcTableFace from "../npc/NpcTableFace";

interface Props {
  /** Campaign NPCs to render as cards. */
  npcs: Npc[];
  /** Currently-displayed runbook scene, used to surface scene-relevant NPCs first. */
  currentScene?: RunbookScene | null;
}

/**
 * "Tonight's Cast" sliding drawer.
 *
 * Plan 40 — refactored to render each NPC as its **Table face** (the
 * scannable mid-conversation read). Click any card to open the rich
 * Prep face (NpcModal) inline. The drawer keeps its scene-awareness:
 * NPCs mentioned in the current scene float to the top with a ★ badge.
 *
 * The old chip layout (portrait + accent parsing + raw dialog_hooks
 * rendering) is gone — that content lives in the Prep face now.
 */
export default function TonightsCastDrawer({ npcs, currentScene }: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Npc | null>(null);
  const qc = useQueryClient();

  // Scene-relevance detection: name-match against scene text. Inexact
  // but cheap; surfaces a ★ badge on relevant cards.
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

  return (
    <>
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

      <aside
        aria-hidden={!open}
        style={{
          ...drawerStyle,
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <header style={headerStyle}>
          <strong
            style={{ fontFamily: "Cinzel Decorative, serif", color: "var(--gold)" }}
          >
            🎭 Tonight's Cast
          </strong>
          <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
            {currentScene
              ? `Scene: ${currentScene.title?.slice(0, 30) ?? "—"}`
              : "No scene"}
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
              sceneText.length > 0 &&
              sceneText.includes(npc.name.toLowerCase());
            return (
              <div key={npc.id} style={{ position: "relative" }}>
                {inScene && (
                  <span style={inSceneBadgeStyle} title="Mentioned in the current scene">
                    ★ in scene
                  </span>
                )}
                <NpcTableFace
                  npc={npc}
                  onOpenPrep={() => setEditing(npc)}
                  compact
                />
              </div>
            );
          })}
        </div>
      </aside>

      {editing && (
        <NpcModal
          campaignId={editing.campaign_id}
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["npcs", editing.campaign_id] });
            setEditing(null);
          }}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["npcs", editing.campaign_id] });
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

// ── styles ──────────────────────────────────────────────────────────────────

const DRAWER_WIDTH = 360;

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

const inSceneBadgeStyle: React.CSSProperties = {
  position: "absolute",
  top: -8,
  right: 8,
  zIndex: 1,
  fontSize: "0.55rem",
  padding: "0.1rem 0.5rem",
  background: "var(--gold)",
  color: "var(--bg, #1a1a1a)",
  borderRadius: 10,
  letterSpacing: "0.04em",
  fontWeight: 700,
};
