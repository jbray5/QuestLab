import { useMemo, useState } from "react";
import { Drama, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useHudPrefs } from "../../stores/useHudPrefs";

import type { Npc } from "../../api/npcs";
import type { RunbookScene } from "../../api/types";
import NpcModal from "../npc/NpcModal";
import NpcTableFace from "../npc/NpcTableFace";

interface Props {
  /** Campaign NPCs to render as cards. */
  npcs: Npc[];
  /** Currently-displayed runbook scene, used to surface scene-relevant NPCs first. */
  currentScene?: RunbookScene | null;
  /** Names on this arc's NPC roster — tonight's cast by default (review 10/30). */
  rosterNames?: string[];
  /** This session's number; an NPC tagged "s9" / "session 9" belongs to session 9. */
  sessionNumber?: number;
}

const SESSION_TAG = /^s(?:ession)?[\s#-]*(\d+)$/i;

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
export default function TonightsCastDrawer({ npcs, currentScene, rosterNames = [], sessionNumber }: Props) {
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

  // Review 10/30 — the drawer listed every NPC in the campaign (20+, some
  // tagged for future sessions). By default it shows tonight's: on this
  // arc's roster, mentioned in the current scene, or tagged with this
  // session's number. If none qualify it shows everyone rather than nothing.
  const showAll = useHudPrefs((s) => s.castShowAll);
  const setShowAll = useHudPrefs((s) => s.setCastShowAll);
  const tonight = useMemo(() => {
    const roster = new Set(rosterNames.map((n) => n.trim().toLowerCase()));
    return npcs.filter((npc) => {
      const name = npc.name.toLowerCase();
      if (roster.has(name)) return true;
      if (sceneText.length > 0 && sceneText.includes(name)) return true;
      return (npc.tags ?? []).some((t) => {
        const m = SESSION_TAG.exec(t.trim());
        return !!m && sessionNumber !== undefined && Number(m[1]) === sessionNumber;
      });
    });
  }, [npcs, rosterNames, sceneText, sessionNumber]);
  const filtering = !showAll && tonight.length > 0 && tonight.length < npcs.length;
  const shown = filtering ? tonight : npcs;

  const sortedNpcs = useMemo(() => {
    const inScene = (npc: Npc) =>
      sceneText.length > 0 && sceneText.includes(npc.name.toLowerCase());
    return [...shown].sort((a, b) => {
      const aIn = inScene(a);
      const bIn = inScene(b);
      if (aIn !== bIn) return aIn ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [shown, sceneText]);

  return (
    <>
      <button
        onClick={() => setOpen((p) => !p)}
        title={open ? "Hide cast" : "Show tonight's cast"}
        aria-expanded={open}
        style={toggleStyle(open)}
      >
        {open ? <X size={18} aria-hidden /> : <Drama size={18} aria-hidden />}
        <span style={{ display: "block", fontSize: "0.75rem", marginTop: 2 }}>
          {open ? "Close" : "Cast"}
        </span>
      </button>

      <aside
        aria-hidden={!open}
        aria-label="Tonight's cast"
        style={{
          ...drawerStyle,
          transform: open ? "translateX(0)" : "translateX(100%)",
        }}
      >
        <header style={headerStyle}>
          <strong style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)" }}>
            Tonight&rsquo;s cast
          </strong>
          <span style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {currentScene ? (
              <>
                Scene: <span className="story" style={{ color: "var(--text2)", fontSize: "0.8125rem" }}>{currentScene.title?.slice(0, 40) ?? "—"}</span>
              </>
            ) : (
              "Who you'll voice tonight — click a card for more"
            )}
          </span>
        </header>
        {(filtering || showAll) && tonight.length > 0 && tonight.length < npcs.length && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 28, fontSize: "0.8125rem", margin: "0.5rem 0.75rem 0", padding: "0.15rem 0.6rem", alignSelf: "flex-start" }}
            onClick={() => setShowAll(!showAll)}
            title="Tonight = on this arc's NPC roster, mentioned in the scene, or tagged with this session"
          >
            {showAll ? `Show tonight's ${tonight.length} only` : `Show all ${npcs.length} NPCs`}
          </button>
        )}
        <div style={listStyle}>
          {sortedNpcs.length === 0 && (
            <div style={{ padding: "0.75rem 0.5rem", fontSize: "0.875rem", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 0.4rem", color: "var(--text2)" }}>
                Tonight&rsquo;s cast lists the NPCs you&rsquo;ll voice, with their manner and hooks at a glance.
              </p>
              <p style={{ margin: 0, color: "var(--muted)" }}>
                This campaign has no NPCs yet. Add them from the campaign&rsquo;s NPCs page.
              </p>
            </div>
          )}
          {sortedNpcs.map((npc) => {
            const inScene =
              sceneText.length > 0 &&
              sceneText.includes(npc.name.toLowerCase());
            return (
              <div key={npc.id} style={{ position: "relative" }}>
                {inScene && (
                  <span className="pill pill-next" style={inSceneBadgeStyle} title="Mentioned in the current scene">
                    In this scene
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
    width: 46,
    padding: "0.5rem 0.2rem 0.4rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    background: open ? "var(--accent-active)" : "var(--surface)",
    color: open ? "var(--accent-active-text)" : "var(--text)",
    border: `1px solid ${open ? "var(--accent-line)" : "var(--border2)"}`,
    borderRight: "none",
    borderRadius: "8px 0 0 8px",
    textAlign: "center",
    cursor: "pointer",
    transition: "right 240ms ease, background 200ms ease",
    boxShadow: "-4px 0 10px rgba(0,0,0,0.25)",
    fontFamily: "var(--font-ui)",
  };
}

const drawerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: DRAWER_WIDTH,
  background: "var(--surface)",
  borderLeft: "1px solid var(--border2)",
  boxShadow: "-12px 0 36px rgba(0,0,0,0.45)",
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
  top: -9,
  right: 8,
  zIndex: 1,
  fontSize: "0.75rem",
  padding: "0 0.55rem",
};
