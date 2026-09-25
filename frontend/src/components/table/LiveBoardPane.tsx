import { useState } from "react";

import type { PlayerCharacter } from "../../api/types";
import { EXITS } from "../../engine/passages";
import CrowdPanel from "./CrowdPanel";
import MapCanvas from "./MapCanvas";
import { useTableController } from "./useTableController";

/**
 * LiveBoardPane — the projected table, driven inline from the HUD (Plan 75).
 *
 * Until now moving a token meant leaving the HUD for the 3D Board page or
 * opening the Table console modal over the party panel — either way the DM
 * lost their notes and their party's HP. This pane sits in the HUD's center
 * column: drag tokens, ping, drop markers, dim the world, stand a faction
 * down, all while the party tracker and the combat column stay on screen.
 * Players' views follow live over SSE.
 */

interface Props {
  sessionId: string;
  campaignId: string;
  party: PlayerCharacter[];
}

const DOT: Record<string, string> = {
  pc: "#d6af36",
  monster: "#b0472f",
  custom: "#8a8fa3",
  light: "#f2c14e",
};

export default function LiveBoardPane({ sessionId, campaignId, party }: Props) {
  const t = useTableController(sessionId, campaignId, party);
  // Open by default: the roll call is how a token leaves the board (or right-click it).
  const [showTokens, setShowTokens] = useState(true);
  const [titleDraft, setTitleDraft] = useState("");
  const btn: React.CSSProperties = { fontSize: "0.7rem", padding: "0.18rem 0.5rem" };

  if (!t.activeMap) {
    return (
      <div style={{ color: "var(--muted)", padding: "1.5rem", textAlign: "center" }}>
        <p style={{ margin: 0 }}>No map on the table yet.</p>
        <p style={{ fontSize: "0.8rem", marginTop: 6 }}>
          Stage one from the 🗺 Maps tab and it shows up here, live.
        </p>
      </div>
    );
  }

  const tokens = t.state?.tokens ?? [];
  // Plan 112 — a hidden way out on this map: reveal it when they find it, then take them through.
  const exits = EXITS.filter((e) => e.from === t.activeMap?.id);
  const found = (key: string) => (t.state?.revealed_region_ids ?? []).includes("exit:" + key);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, height: "100%", minHeight: 0 }}>
      {/* Toolbar — everything the Table console offers, one row. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
        <button className={t.mode === "ping" ? "btn" : "btn btn-ghost"} style={btn} onClick={() => t.setMode("ping")} title="Tap the map to ping the players' screens">
          ◎ Ping
        </button>
        <button className={t.mode === "place" ? "btn" : "btn btn-ghost"} style={btn} onClick={() => t.setMode("place")} title="Tap the map to drop a marker">
          ＋ Marker
        </button>
        <button className={t.mode === "reveal" ? "btn" : "btn btn-ghost"} style={btn} onClick={() => t.setMode("reveal")} title="Tap the map to reveal a circle of it — turns fog on">
          👁 Reveal
        </button>
        <span style={{ width: 1, height: 18, background: "var(--border)", margin: "0 2px" }} />
        <button className="btn btn-ghost" style={btn} onClick={t.addPartyTokens} title="One token per attending PC">
          + Party
        </button>
        <button className="btn btn-ghost" style={btn} onClick={() => t.addToken("monster")}>
          + Foe
        </button>
        <button
          className="btn btn-ghost"
          style={btn}
          onClick={() => void t.addFoesFromCombat()}
          title="One token per non-PC combatant, linked for HP + turn glow"
        >
          + Foes (combat)
        </button>
        {t.groups.map((g) => (
          <button
            key={g}
            className="btn btn-ghost"
            style={{ ...btn, color: "var(--gold)" }}
            title={`Every hostile token tagged "${g}" stops fighting — rings go grey`}
            onClick={() => t.standDown(g)}
          >
            ✋ Stand down: {g}
          </button>
        ))}
        <label
          style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: "0.66rem", color: "var(--muted)" }}
          title="Darkness — the lantern clock"
        >
          🌙 {Math.round((t.state?.darkness ?? 0) * 100)}%
          <input
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={t.state?.darkness ?? 0}
            onChange={(e) => t.setDarknessLive(Number(e.target.value))}
            style={{ width: 90 }}
          />
        </label>
      </div>

      {/* Plan 114 — the festival crowd, when there is one on the board. */}
      <CrowdPanel
        sessionId={sessionId}
        tokens={tokens}
        lost={tokens.reduce((n, k) => n + (k.dead ?? 0), 0)}
        onChanged={t.refresh}
      />

      {/* The board itself — same canvas the projector renders. */}
      <div
        style={{
          background: "#06060b",
          flex: 1,
          minHeight: 280,
          display: "flex",
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <MapCanvas
          map={t.activeMap}
          fogOn={t.state?.fog_on ?? false}
          revealedRegions={t.revealedPolygons}
          brushReveals={t.state?.brush_reveals ?? []}
          tokens={tokens}
          darkness={t.state?.darkness ?? 0}
          activeTokenRef={t.activeTokenRef}
          editable
          onCanvasPointerDown={(x, y) => {
            // Plan 83 — a board click drops focus from the notes so N / hotkeys work.
            (document.activeElement as HTMLElement | null)?.blur?.();
            t.onCanvasDown(x, y);
          }}
          onTokenMove={t.moveTokenLocal}
          onTokenDragEnd={() => t.commitTokens()}
          onTokenRemove={t.removeToken}
        />
      </div>

      {/* Fog: always offered. Regions when the map has them; the Reveal brush always. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
        <label style={{ fontSize: "0.68rem", color: "var(--muted)", display: "flex", gap: 4, alignItems: "center" }} title="Everything the party can't see goes dark on the players' screens">
          <input
            type="checkbox"
            checked={t.state?.fog_on ?? false}
            onChange={(e) => t.patchNow({ fog_on: e.target.checked })}
          />
          Fog
        </label>
        {exits.map((e) => (
          <span key={e.key} style={{ display: "inline-flex", gap: 4 }}>
            <button className={found(e.key) ? "btn" : "btn btn-ghost"} style={btn} onClick={() => t.revealExit(e.key, !found(e.key))} title={found(e.key) ? "Hide it again" : "They found it — show it on the table"}>
              {found(e.key) ? "🚪 Found: " : "🚪 Reveal "}{e.label}
            </button>
            {found(e.key) && (
              <button className="btn btn-ghost" style={{ ...btn, color: "var(--gold)" }} onClick={() => t.descend(e.to, e.landing[0], e.landing[1])} title="Switch the table to the far map and stand the party at the landing">
                ⬇ Take the party to {e.arrive}
              </button>
            )}
          </span>
        ))}
        {(t.state?.brush_reveals?.length ?? 0) > 0 && (
          <button className="btn btn-ghost" style={btn} onClick={t.clearReveals} title="Hide everything again">
            🌫 Hide all ({t.state?.brush_reveals?.length})
          </button>
        )}
        {t.state?.fog_on && !(t.state?.brush_reveals?.length || t.state?.revealed_region_ids?.length) && (
          <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>Nothing revealed yet — pick 👁 Reveal and tap the map.</span>
        )}
        <label style={{ marginLeft: "auto", display: "flex", gap: 4, alignItems: "center", fontSize: "0.68rem", color: "var(--muted)" }} title="A title card lands over the players' screens">
          🎬
          <input
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && titleDraft.trim()) {
                t.patchNow({ title: titleDraft.trim() });
                setTitleDraft("");
              }
            }}
            placeholder={t.state?.title ? `"${t.state.title}" — type a new title…` : "Scene title, Enter to show…"}
            style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem", width: 190 }}
          />
          {t.state?.title && (
            <button className="btn btn-ghost" style={btn} onClick={() => t.patchNow({ title: "" })} title="Take the title down">
              ✕
            </button>
          )}
        </label>
      </div>
      {t.activeMap.regions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          {t.activeMap.regions.map((r) => {
            const on = (t.state?.revealed_region_ids ?? []).includes(r.id);
            return (
              <button
                key={r.id}
                onClick={() => t.toggleRegion(r.id)}
                className={on ? "btn" : "btn btn-ghost"}
                style={btn}
                title={on ? "Revealed — tap to hide" : "Hidden — tap to reveal"}
              >
                {on ? "👁 " : "🌫 "}
                {r.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Token roll call — collapsed by default so the board keeps the room. */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center", fontSize: "0.68rem", color: "var(--muted)" }}>
        <button className="btn btn-ghost" style={btn} onClick={() => setShowTokens((v) => !v)}>
          {showTokens ? "▾" : "▸"} {tokens.length} token{tokens.length === 1 ? "" : "s"}
        </button>
        {showTokens &&
          tokens.map((tok) => (
            <span
              key={tok.id}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "1px 7px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--text)",
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT[tok.kind] ?? DOT.custom }} />
              {tok.label}
              <button
                onClick={() => t.removeToken(tok.id)}
                aria-label={`Remove ${tok.label}`}
                style={{ background: "none", border: 0, color: "var(--danger, #ef5350)", cursor: "pointer", padding: 0, lineHeight: 1 }}
              >
                ✕
              </button>
            </span>
          ))}
        <span style={{ marginLeft: "auto" }}>
          Drag tokens · right-click to remove · {t.mode === "ping" ? "tap to ping" : t.mode === "reveal" ? "tap to reveal" : "tap to drop a marker"} · players follow live
        </span>
      </div>
    </div>
  );
}
