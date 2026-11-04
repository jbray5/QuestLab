import { useState } from "react";
import { Crosshair, ExternalLink, Eye, EyeOff, Hand, Map as MapIcon, Plus, X } from "lucide-react";

import type { PlayerCharacter } from "../../api/types";
import { useIsCompact } from "../../hooks/useIsCompact";
import FogAreaChips from "./FogAreaChips";
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
 * Live pane and this modal drive the very same state.
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
        <MapIcon size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Table
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

/** The console on its own, for a launcher that lives elsewhere (the HUD's Player display menu). */
export function TableConsoleModal({
  sessionId,
  campaignId,
  party,
  onClose,
}: Props & { onClose: () => void }) {
  const compact = useIsCompact(720);
  const [titleDraft, setTitleDraft] = useState("");
  const t = useTableController(sessionId, campaignId, party);
  const [npcPickerOpen, setNpcPickerOpen] = useState(false);
  // Plan 133 — a tall strip (a chase map) can fill the preview's width and scroll.
  const [fitWidth, setFitWidth] = useState(false);
  const { state, maps, activeMap } = t;
  const tall = !!activeMap && activeMap.height > activeMap.width * 1.2;
  const scrolling = tall && fitWidth;
  const revealedCount = (state?.brush_reveals?.length ?? 0) + (state?.revealed_region_ids?.length ?? 0);
  const overlayBtn: React.CSSProperties = { fontSize: "0.72rem", padding: "0.2rem 0.5rem" };
  // Plan 128 — the preview wears the same class crests the TV does.
  const classOf = new Map(party.map((pc) => [pc.id, pc.character_class as string]));
  const canvasTokens = (state?.tokens ?? []).map((tok) =>
    tok.kind === "pc" && tok.ref_id && classOf.has(tok.ref_id) ? { ...tok, class_name: classOf.get(tok.ref_id) } : tok,
  );
  const canvas = (
    <MapCanvas
      map={activeMap}
      fogOn={state?.fog_on ?? false}
      revealedRegions={t.revealedPolygons}
      brushReveals={state?.brush_reveals ?? []}
      tokens={canvasTokens}
      darkness={state?.darkness ?? 0}
      activeTokenRef={t.activeTokenRef}
      editable
      onCanvasPointerDown={t.onCanvasDown}
      onTokenMove={t.moveTokenLocal}
      onTokenDragEnd={() => t.commitTokens()}
      onTokenRemove={t.removeToken}
    />
  );

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
          {scrolling && activeMap ? (
            // An absolute layer, so the long map scrolls inside the preview instead of growing the dialog.
            <div style={{ position: "absolute", inset: 0, overflowX: "hidden", overflowY: "auto" }}>
              <div style={{ width: "100%", aspectRatio: `${activeMap.width} / ${activeMap.height}` }}>{canvas}</div>
            </div>
          ) : (
            canvas
          )}
          <div
            style={{
              position: "absolute",
              top: 10,
              left: 10,
              right: 10,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              width: "fit-content",
              background: "rgba(6,6,12,0.6)",
              padding: "4px 6px",
              borderRadius: 8,
            }}
          >
            <button
              className={t.mode === "ping" ? "btn" : "btn btn-ghost"}
              style={overlayBtn}
              onClick={() => t.setMode("ping")}
            >
              <Crosshair size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Ping
            </button>
            <button
              className={t.mode === "place" ? "btn" : "btn btn-ghost"}
              style={overlayBtn}
              onClick={() => t.setMode("place")}
            >
              <Plus size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Marker
            </button>
            {activeMap && (
              <>
                <button
                  className={t.mode === "reveal" ? "btn" : "btn btn-ghost"}
                  style={overlayBtn}
                  onClick={() => t.setMode("reveal")}
                  title="Tap the map to reveal a circle of it — turns fog on"
                >
                  <Eye size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Reveal
                </button>
                <button
                  className={t.mode === "hide" ? "btn" : "btn btn-ghost"}
                  style={overlayBtn}
                  onClick={() => t.setMode("hide")}
                  title="Tap a revealed spot on the map to cover it with fog again"
                >
                  <EyeOff size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Hide
                </button>
              </>
            )}
            {tall && (
              <button
                className="btn btn-ghost"
                style={overlayBtn}
                onClick={() => setFitWidth((v) => !v)}
                aria-pressed={scrolling}
                title={scrolling ? "Fit the whole map in the preview" : "Fill the preview's width and scroll down the map"}
              >
                {scrolling ? "Whole map" : "Fit width"}
              </button>
            )}
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
            <strong style={{ fontFamily: "var(--font-story)", color: "var(--gold)" }}>Table</strong>
            <button className="btn btn-ghost" style={{ padding: "0 0.4rem" }} onClick={onClose} aria-label="Close">
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <a href={tableUrl} target="_blank" rel="noreferrer" className="btn" style={{ textAlign: "center" }}>
            Open Table View <ExternalLink size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} />
          </a>
          <a
            href={`${tableUrl}/3d`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            style={{ textAlign: "center", fontSize: "0.8rem" }}
          >
            Open 3D Table View <ExternalLink size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} />
          </a>
          <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: -4 }}>
            Put the Table View on the TV or projector: the turn order and rolls, plus the map when you
            stage one.
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

          {activeMap && (
            <div>
              <label style={{ fontSize: "0.72rem", color: "var(--muted)", display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={state?.fog_on ?? false}
                  onChange={(e) => t.patchNow({ fog_on: e.target.checked })}
                />
                Fog of war
              </label>
              {revealedCount > 0 && (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.68rem", padding: "0 0.4rem", marginTop: 4 }}
                  onClick={t.clearReveals}
                  title="Cover the whole map with fog again"
                >
                  Hide all ({revealedCount})
                </button>
              )}
              <div style={{ marginTop: 6 }}>
                <FogAreaChips
                  regions={activeMap.regions}
                  revealedIds={state?.revealed_region_ids ?? []}
                  fogOn={state?.fog_on ?? false}
                  onToggle={t.toggleRegion}
                  btnStyle={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                />
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
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.7rem" }}
                onClick={t.regroupParty}
                disabled={!activeMap}
                title="Line the party up again on this map — use it after switching boards"
              >
                Regroup
              </button>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={() => t.addToken("monster")} disabled={!activeMap}>
                + Foe
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.7rem" }}
                onClick={() => setNpcPickerOpen((v) => !v)}
                disabled={!activeMap}
                title="Stand an NPC up on the board using their standee"
              >
                + NPC
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.7rem" }}
                onClick={() => void t.addFoesFromCombat()}
                disabled={!activeMap}
                title="One token per non-PC combatant, linked for HP + turn glow"
              >
                + Foes (combat)
              </button>
              {npcPickerOpen &&
                /* Every NPC, art or not — a slot whose art hasn't arrived yet
                   places as a neutral labelled token rather than nothing. */
                t.npcs.map((n) => (
                    <button
                      key={n.id}
                      className="btn btn-ghost"
                      style={{ fontSize: "0.7rem", display: "flex", alignItems: "center", gap: 4 }}
                      onClick={() => {
                        t.addNpcToken(n);
                        setNpcPickerOpen(false);
                      }}
                      title={n.figure_url ? "Standee" : n.portrait_url ? "Portrait — no standee yet" : "No art yet — places as a labelled token"}
                    >
                      {n.figure_url ?? n.portrait_url ? (
                        <img
                          src={(n.figure_url ?? n.portrait_url) as string}
                          alt=""
                          style={{ width: 18, height: 18, objectFit: "cover", borderRadius: 3 }}
                        />
                      ) : (
                        <span
                          aria-hidden
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 3,
                            border: "1px dashed var(--border)",
                            display: "inline-block",
                          }}
                        />
                      )}
                      {n.name}
                    </button>
                  ))}
              {npcPickerOpen && t.npcs.length === 0 && (
                <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                  No NPCs in this campaign yet.
                </span>
              )}
              {t.groups.map((g) => (
                <button
                  key={g}
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem", color: "var(--gold)" }}
                  title={`Every hostile token tagged "${g}" stops fighting — rings go grey`}
                  onClick={() => t.standDown(g)}
                >
                  <Hand size={14} aria-hidden="true" style={{ verticalAlign: "-2px" }} /> Stand down: {g}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
              {(state?.tokens ?? []).map((tok) => (
                <div key={tok.id} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "0.72rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: tok.kind === "pc" ? "#d6af36" : tok.kind === "monster" ? "#b0472f" : "#8a8fa3", flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tok.label}</span>
                  <button className="btn btn-ghost" style={{ padding: "0 0.35rem", color: "var(--danger, #ef5350)" }} onClick={() => t.removeToken(tok.id)} aria-label={`Remove ${tok.label}`}>
                  <X size={14} aria-hidden="true" />
                </button>
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
