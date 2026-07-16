import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import { tableApi } from "../../api/table";
import type { BattleMap, PlayerCharacter, TableStateRead, TableToken } from "../../api/types";
import { useIsCompact } from "../../hooks/useIsCompact";
import MapCanvas from "./MapCanvas";

/**
 * TableConsole — the DM's control surface for the projected Table View (Plan 42).
 *
 * A launcher button that opens a modal with a live, editable preview of exactly
 * what the remote table sees. The DM picks a map, reveals fog regions one tap at
 * a time, drags tokens, dims the world with the darkness dial (the lantern
 * clock), drops scene title cards, and pings. Edits apply optimistically to the
 * preview and PATCH the server, which pushes to the projector over SSE.
 */

interface Props {
  sessionId: string;
  campaignId: string;
  party: PlayerCharacter[];
}

type CanvasMode = "ping" | "place";

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
  const qc = useQueryClient();
  const compact = useIsCompact(720);
  const key = ["table-state", sessionId];
  const [mode, setMode] = useState<CanvasMode>("ping");
  const [titleDraft, setTitleDraft] = useState("");
  const darkTimer = useRef<number | undefined>(undefined);
  const idc = useRef(0);
  const genId = (prefix: string) => `${prefix}-${(idc.current += 1)}`;

  const { data: state } = useQuery({
    queryKey: key,
    queryFn: () => tableApi.getState(sessionId),
  });
  const { data: maps = [] } = useQuery({
    queryKey: ["battle-maps", campaignId],
    queryFn: () => tableApi.listMaps(campaignId),
  });
  const { data: combat } = useQuery({
    queryKey: ["board-combat", sessionId],
    queryFn: () => sessionsApi.getCombatState(sessionId),
  });

  const activeMap: BattleMap | null = maps.find((m) => m.id === state?.active_map_id) ?? null;

  function applyLocal(partial: Partial<TableStateRead>) {
    qc.setQueryData<TableStateRead>(key, (prev) => (prev ? { ...prev, ...partial } : prev));
  }
  function patchNow(partial: Partial<TableStateRead>) {
    applyLocal(partial);
    void tableApi.updateState(sessionId, partial);
  }
  function setDarknessLive(v: number) {
    applyLocal({ darkness: v });
    window.clearTimeout(darkTimer.current);
    darkTimer.current = window.setTimeout(() => void tableApi.updateState(sessionId, { darkness: v }), 180);
  }

  function toggleRegion(id: string) {
    const cur = state?.revealed_region_ids ?? [];
    patchNow({
      revealed_region_ids: cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id],
    });
  }

  function addPartyTokens() {
    if (!activeMap || !state) return;
    const existingRefs = new Set(state.tokens.map((t) => t.ref_id).filter(Boolean));
    const fresh: TableToken[] = party
      .filter((pc) => !existingRefs.has(pc.id))
      .map((pc, i) => ({
        id: `pc-${pc.id}`,
        kind: "pc" as const,
        ref_id: pc.id,
        label: pc.character_name,
        image_url: pc.portrait_url ?? null,
        x: activeMap.width * (0.28 + 0.11 * i),
        y: activeMap.height * 0.72,
        size: 1,
      }));
    if (fresh.length) patchNow({ tokens: [...state.tokens, ...fresh] });
  }

  function addToken(kind: "monster" | "custom") {
    if (!activeMap || !state) return;
    const t: TableToken = {
      id: genId(kind),
      kind,
      ref_id: null,
      label: kind === "monster" ? "Foe" : "Marker",
      image_url: null,
      x: activeMap.width * 0.5,
      y: activeMap.height * 0.4,
      size: 1,
    };
    patchNow({ tokens: [...state.tokens, t] });
  }
  function addFoesFromCombat() {
    if (!activeMap || !state || !combat) return;
    const existingRefs = new Set(state.tokens.map((t) => t.ref_id).filter(Boolean));
    // ref_id = SessionCombatant.id so HP bars + turn glow track monsters too (Plan 44).
    const fresh: TableToken[] = combat.combatants
      .filter((c) => !c.character_id && !existingRefs.has(c.id))
      .map((c, i) => ({
        id: `foe-${c.id}`,
        kind: "monster" as const,
        ref_id: c.id,
        label: c.name,
        image_url: null,
        x: activeMap.width * (0.3 + 0.1 * (i % 5)),
        y: activeMap.height * (0.22 + 0.12 * Math.floor(i / 5)),
        size: 1,
      }));
    if (fresh.length) patchNow({ tokens: [...state.tokens, ...fresh] });
  }
  function removeToken(id: string) {
    if (!state) return;
    patchNow({ tokens: state.tokens.filter((t) => t.id !== id) });
  }
  function moveTokenLocal(id: string, x: number, y: number) {
    applyLocal({ tokens: (state?.tokens ?? []).map((t) => (t.id === id ? { ...t, x, y } : t)) });
  }
  function commitTokens() {
    if (state) void tableApi.updateState(sessionId, { tokens: state.tokens });
  }

  function onCanvasDown(x: number, y: number) {
    if (mode === "ping") {
      void tableApi.ping(sessionId, x, y);
    } else if (mode === "place") {
      if (!state) return;
      const t: TableToken = {
        id: genId("mk"),
        kind: "custom",
        ref_id: null,
        label: "Marker",
        image_url: null,
        x,
        y,
        size: 1,
      };
      patchNow({ tokens: [...state.tokens, t] });
    }
  }

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
            revealedRegions={
              activeMap
                ? (state?.revealed_region_ids ?? [])
                    .map((id) => activeMap.regions.find((r) => r.id === id)?.points)
                    .filter((p): p is number[][] => Array.isArray(p))
                : []
            }
            brushReveals={state?.brush_reveals ?? []}
            tokens={state?.tokens ?? []}
            darkness={state?.darkness ?? 0}
            editable
            onCanvasPointerDown={onCanvasDown}
            onTokenMove={moveTokenLocal}
            onTokenDragEnd={() => commitTokens()}
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
              className={mode === "ping" ? "btn" : "btn btn-ghost"}
              style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
              onClick={() => setMode("ping")}
            >
              ◎ Ping
            </button>
            <button
              className={mode === "place" ? "btn" : "btn btn-ghost"}
              style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
              onClick={() => setMode("place")}
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
          <div style={{ fontSize: "0.66rem", color: "var(--muted)", marginTop: -4 }}>
            Share this on the players&rsquo; screen / projector.
          </div>

          <label style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
            Active map
            <select
              value={state?.active_map_id ?? ""}
              onChange={(e) => patchNow({ active_map_id: e.target.value || null })}
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
                  onChange={(e) => patchNow({ fog_on: e.target.checked })}
                />
                Fog of war
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 6 }}>
                {activeMap.regions.map((r) => {
                  const on = (state?.revealed_region_ids ?? []).includes(r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRegion(r.id)}
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
              onChange={(e) => setDarknessLive(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>Scene title card</div>
            <div style={{ display: "flex", gap: 5 }}>
              <input
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && patchNow({ title: titleDraft })}
                placeholder="e.g. Hold the Hearth"
                style={{ flex: 1, fontSize: "0.75rem" }}
              />
              <button className="btn" style={{ padding: "0 0.5rem" }} onClick={() => patchNow({ title: titleDraft })}>
                Show
              </button>
            </div>
            {state?.title && (
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.68rem", marginTop: 4 }}
                onClick={() => patchNow({ title: "" })}
              >
                Clear &ldquo;{state.title}&rdquo;
              </button>
            )}
          </div>

          <div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>Tokens</div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={addPartyTokens} disabled={!activeMap}>
                + Party
              </button>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={() => addToken("monster")} disabled={!activeMap}>
                + Foe
              </button>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.7rem" }}
                onClick={addFoesFromCombat}
                disabled={!activeMap || !combat?.combatants?.length}
                title="One token per non-PC combatant, linked for HP + turn glow"
              >
                + Foes (combat)
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 6, maxHeight: 160, overflowY: "auto" }}>
              {(state?.tokens ?? []).map((t) => (
                <div key={t.id} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "0.72rem" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.kind === "pc" ? "#d6af36" : t.kind === "monster" ? "#b0472f" : "#8a8fa3", flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.label}</span>
                  <button className="btn btn-ghost" style={{ padding: "0 0.35rem", color: "var(--danger, #ef5350)" }} onClick={() => removeToken(t.id)}>✕</button>
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
