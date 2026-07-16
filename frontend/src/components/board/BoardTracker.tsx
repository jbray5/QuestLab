import { useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import type { SessionCombatant, SessionCombatStateRead } from "../../api/types";

/**
 * BoardTracker — the slim live combat tracker docked beside the 3D board
 * (Plan 44). Reads the same combat state the Session HUD writes; the tracker
 * stays the source of truth — the board only visualizes it.
 */

interface Props {
  sessionId: string;
  combat: SessionCombatStateRead | undefined;
}

export default function BoardTracker({ sessionId, combat }: Props) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["board-combat", sessionId] });

  async function nudgeHp(c: SessionCombatant, delta: number) {
    const hp = Math.max(0, Math.min(c.hp_max, c.hp_current + delta));
    await sessionsApi.patchCombatant(sessionId, c.id, { hp_current: hp });
    refresh();
  }
  async function toggleDefeated(c: SessionCombatant) {
    await sessionsApi.patchCombatant(sessionId, c.id, { defeated: !c.defeated });
    refresh();
  }
  async function nextTurn() {
    await sessionsApi.advanceCombatTurn(sessionId);
    refresh();
  }

  const running = combat?.combat_state === "running";
  const combatants = [...(combat?.combatants ?? [])].sort((a, b) => a.sort_index - b.sort_index);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", minHeight: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontFamily: "Cinzel, serif", color: "var(--gold)", fontSize: "0.85rem" }}>
          Combat {running ? `· Round ${combat?.round ?? 1}` : combat?.combat_state === "ended" ? "· ended" : "· idle"}
        </strong>
        <button className="btn" style={{ fontSize: "0.72rem", padding: "0.2rem 0.55rem" }} onClick={nextTurn} disabled={!running}>
          Next turn ▶
        </button>
      </div>

      {combatants.length === 0 && (
        <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          No combatants — build the roster and start combat from the Session HUD.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto", minHeight: 0 }}>
        {combatants.map((c) => {
          const active = running && combat?.active_combatant_id === c.id;
          const pct = Math.max(0, Math.min(1, c.hp_current / c.hp_max));
          return (
            <div
              key={c.id}
              style={{
                border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
                background: active ? "rgba(214,175,54,0.08)" : "rgba(255,255,255,0.02)",
                borderRadius: 8,
                padding: "0.35rem 0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: 3,
                opacity: c.defeated ? 0.55 : 1,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {active && <span style={{ color: "var(--gold)" }}>▶</span>}
                <span
                  style={{
                    flex: 1,
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    color: "var(--text)",
                    textDecoration: c.defeated ? "line-through" : "none",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.name}
                </span>
                <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>
                  {c.initiative_roll} init{c.ac != null ? ` · AC ${c.ac}` : ""}
                </span>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem", padding: "0 0.3rem" }}
                  title={c.defeated ? "Restore" : "Mark defeated"}
                  onClick={() => void toggleDefeated(c)}
                >
                  {c.defeated ? "↻" : "☠"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0 0.35rem" }} onClick={(e) => void nudgeHp(c, e.shiftKey ? -5 : -1)} title="−1 (shift: −5)">
                  −
                </button>
                <div style={{ flex: 1, height: 8, background: "rgba(0,0,0,0.6)", borderRadius: 4, overflow: "hidden", border: "1px solid rgba(255,255,255,0.15)" }}>
                  <div
                    style={{
                      width: `${pct * 100}%`,
                      height: "100%",
                      background: pct > 0.5 ? "#5cb85c" : pct > 0.25 ? "#e0a83c" : "#d9534f",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <button className="btn btn-ghost" style={{ fontSize: "0.72rem", padding: "0 0.35rem" }} onClick={(e) => void nudgeHp(c, e.shiftKey ? 5 : 1)} title="+1 (shift: +5)">
                  +
                </button>
                <span style={{ fontSize: "0.7rem", color: "var(--muted)", minWidth: 52, textAlign: "right" }}>
                  {c.hp_current}/{c.hp_max}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
