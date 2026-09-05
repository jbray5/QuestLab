import { useState } from "react";

import type { PlayerCharacter } from "../../api/types";
import { useIsCompact } from "../../hooks/useIsCompact";
import MapCanvas from "./MapCanvas";
import { useTableController } from "./useTableController";

/**
 * TableConsole — the DM's control surface for the projected Table View (Plan 42).
 *
 * A launcher button that opens a modal with a live, editable preview of exactly
 * what the remote table sees. The DM picks a map, reveals fog regions one tap at
 * a time, drags tokens, dims the world with the darkness dial (the lantern
 * clock), drops scene title cards, and pings. Edits apply optimistically to the
 * preview and PATCH the server, which pushes to the projector over SSE.
 *
 * Plan 75: the table logic moved into useTableController so the HUD's inline
 * 🎮 Live pane and this modal drive the very same state.
 */

interface Props {
  sessionId: string;
  campaignId: string;
  party: PlayerCharacter[];
}

export default function TableConsole({ sessionId, campaignId, party }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="btn btn-ghost"
        onClick={() => setOpen(true)}
        title="Drive the projected battle map"
        style={{ fontSize: "0.8rem" }}
      >
        🗺 Table
      </button>
      {open && (
        <TableConsoleModal
          sessionId={sessionId}
          campaignId={campaignId}
          party={party}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function TableConsoleModal({
  sessionId,
  campaignId,
  party,
  onClose,
}: Props & { onClose: () => void }) {
  const compact = useIsCompact(720);
  const [titleDraft, setTitleDraft] = useState("");
  const t = useTableController(sessionId, campaignId, party);
  const { state, maps, activeMap } = t;

  const tableUrl = `${window.location.origin}/table/${sessionId}`;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(3,3,7,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ql-modal"
        style={{
          background: "var(--surface, #16161c)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          width: "min(1180px, 96vw)",
          maxHeight: "92vh",
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) 300px",
          overflow: compact ? "auto" : "hidden",
        }}
        role="dialog"
        aria-label="Table View console"
      >
        {/* Live preview */}
        <div style={{ background: "#06060b", minHeight: 420, position: "relative", display: "flex" }}>
          <MapCanvas
            map={activeMap}
            fogOn={state?.fog_on ?? false}
            revealedRegions={t.revealedPolygons}
            brushReveals={state?.brush_reveals ?? []}
            tokens={state?.tokens ?? []}
            darkness={state?.darkness ?? 0}
            activeTokenRef={t.activeTokenRef}
            editable
            onCanvasPointerDown={t.onCanvasDown}
            onTokenMove={t.moveTokenLocal}
            onTokenDragEnd={() => t.commitTokens()}
          />
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              display: "flex",
              gap: 6,
              background: "rgba(6,6,12,0.6)",
              padding: "4px 6px",
              borderRadius: 8,
            }}
          >
            <button
              className={t.mode === "ping" ? "btn" : "btn btn-ghost"}
              style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
              onClick={() => t.setMode("ping")}
            >
              ◎ Ping
            </button>
            <button
              className={t.mode === "place" ? "btn" : "btn btn-ghost"}
              style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
              onClick={() => t.setMode("place")}
            >
              ＋ Marker
            </button>
          </div>
        </div>

        {/* Controls */}
        <aside
          style={{
            padding: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.9rem",
            overflowY: "auto",
            borderLeft: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontFamily: "Cinzel, serif", color: "var(--gold)" }}>Table</strong>
            <button className="btn btn-ghost" style={{ padding: "0 0.4rem" }} onClick={onClose}>✕</button>
          </div>

          <a href={tableUrl} target="_blank" rel="noreferrer" className="btn" style={{ textAlign: "center" }}>
            Open Table View ↗
          </a>
          <a
            href={`${tableUrl}/3d`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            style={{ textAlign: "center", fontSize: "0.8rem" }}
          >
            Open 3D Table View ↗
          </a>
          <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: -4 }}>
            Share either on the players&rsquo; screen / projector — the 3D one is the pretty one.
          </div>

          <label style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
            Active map
            <select
              value={state?.active_map_id ?? ""}
              onChange={(e) => t.patchNow({ active_map_id: e.target.value || null })}
              style={{ width: "100%", marginTop: 4 }}
            >
              <option value="">— none —</option>
              {maps.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>

          {activeMap && activeMap.regions.length > 0 && (
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={state?.fog_on ?? false}
                  onChange={(e) => t.patchNow({ fog_on: e.target.checked })}
                />
                Fog of war
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                {activeMap.regions.map((r) => {
                  const on = (state?.revealed_region_ids ?? []).includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => t.toggleRegion(r.id)}
                      className={on ? "btn" : "btn btn-ghost"}
                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                      title={on ? "Revealed — tap to hide" : "Hidden — tap to reveal"}
                    >
                      {on ? "👁 " : "🌫 "}
                      {r.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
            Darkness · {Math.round((state?.darkness ?? 0) * 100)}%
            <input
              type="range"
              min={0}
              max={1}
              step={0.02}
              value={state?.darkness ?? 0}
              onChange={(e) => t.setDarknessLive(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>Scene title card</div>
            <div style={{ display: "flex", gap: 5 }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && t.patchNow({ title: titleDraft })}
                placeholder="e.g. Hold the Hearth"
                style={{ flex: 1, fontSize: "0.75rem" }}
              />
              <button className="btn" style={{ padding: "0 0.5rem" }} onClick={() => t.patchNow({ title: titleDraft })}>
                Show
              </button>
            </div>
            {state?.title && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.68rem", marginTop: 4 }}
                onClick={() => t.patchNow({ title: "" })}
              >
                Clear &ldquo;{state.title}&rdquo;
              </button>
            )}
          </div>

          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>Tokens</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={t.addPartyTokens} disabled={!activeMap}>
                + Party
              </button>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={() => t.addToken("monster")} disabled={!activeMap}>
                + Foe
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.7rem" }}
                onClick={t.addFoesFromCombat}
                disabled={!activeMap || !t.combat?.combatants?.length}
                title="One token per non-PC combatant, linked for HP + turn glow"
              >
                + Foes (combat)
              </button>
              {t.groups.map((g) => (
                <button
                  key={g}
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem", color: "var(--gold)" }}
                  title={`Every hostile token tagged "${g}" stops fighting — rings go grey`}
                  onClick={() => t.standDown(g)}
                >
                  ✋ Stand down: {g}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
              {(state?.tokens ?? []).map((tok) => (
                <div key={tok.id} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "0.72rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: tok.kind === "pc" ? "#d6af36" : tok.kind === "monster" ? "#b0472f" : "#8a8fa3", flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tok.label}</span>
                  <button className="btn btn-ghost" style={{ padding: "0 0.35rem", color: "var(--danger, #ef5350)" }} onClick={() => t.removeToken(tok.id)}>✕</button>
                </div>
              ))}
            </div>
            <div style={{ fontSize: "0.64rem", color: "var(--muted)", marginTop: 4 }}>
              Drag tokens on the preview to move them. The active combatant glows automatically.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
