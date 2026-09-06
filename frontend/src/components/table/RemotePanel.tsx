import type { InitiativeEntry, TableProjection } from "../../api/types";
import type { TableRoll } from "./DiceCinematic";

/**
 * RemotePanel (Plan 83) — the side panel that turns the projector page into a
 * remote-player window: initiative order with whose turn it is, the party's HP
 * (never a foe's), condition chips, and the last few rolls. Opened by
 * ``?pc=<id>`` from the phone's Table link, or ``?panel=1`` for anyone.
 */
interface Props {
  projection: TableProjection;
  rolls: TableRoll[];
  pcId: string | null;
  open: boolean;
  onToggle: () => void;
  canDrag: boolean;
}

const CSS = `
.ql-remote { position: absolute; top: 0; right: 0; bottom: 0; width: min(300px, 86vw); z-index: 30;
  background: linear-gradient(180deg, rgba(14,12,22,0.96), rgba(8,7,14,0.97)); color: #e6ddc8;
  border-left: 1px solid rgba(214,175,54,0.25); box-shadow: -14px 0 30px rgba(0,0,0,0.5);
  font-family: Georgia, 'Palatino Linotype', serif; display: flex; flex-direction: column;
  transform: translateX(0); transition: transform 0.22s ease; }
.ql-remote.closed { transform: translateX(100%); }
.ql-remote-tab { position: absolute; top: 12px; right: 12px; z-index: 31; border: 1px solid rgba(214,175,54,0.5);
  background: rgba(8,7,14,0.85); color: #f0e6c8; border-radius: 999px; padding: 6px 12px; font-size: 0.8rem;
  cursor: pointer; font-family: Cinzel, Georgia, serif; letter-spacing: 0.06em; }
.ql-remote.open ~ .ql-remote-tab { right: calc(min(300px, 86vw) + 12px); }
.ql-remote h3 { margin: 0; font-family: Cinzel, Georgia, serif; font-size: 0.72rem; letter-spacing: 0.12em;
  text-transform: uppercase; color: #d6af36; }
.ql-remote-head { padding: 14px 14px 8px; display: flex; justify-content: space-between; align-items: baseline; }
.ql-remote-round { font-size: 0.8rem; color: #b3a789; }
.ql-remote-list { overflow-y: auto; padding: 0 10px 10px; display: flex; flex-direction: column; gap: 6px; }
.ql-init { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center;
  border: 1px solid rgba(240,230,200,0.12); border-radius: 10px; padding: 7px 10px; background: rgba(20,16,30,0.6); }
.ql-init.active { border-color: #d6af36; background: rgba(214,175,54,0.12); box-shadow: 0 0 0 1px rgba(214,175,54,0.35) inset; }
.ql-init.down { opacity: 0.45; }
.ql-init.down .ql-init-name { text-decoration: line-through; }
.ql-init-name { font-size: 0.95rem; color: #f0e6c8; }
.ql-init.me .ql-init-name::after { content: " · you"; color: #d6af36; font-size: 0.72rem; }
.ql-init-hp { font-variant-numeric: tabular-nums; font-size: 0.85rem; color: #e6ddc8; }
.ql-init-bar { grid-column: 1 / -1; height: 4px; border-radius: 2px; background: rgba(255,255,255,0.08); overflow: hidden; }
.ql-init-bar i { display: block; height: 100%; background: #6fbf73; }
.ql-init-bar i.low { background: #e0a030; }
.ql-init-bar i.crit { background: #ef5350; }
.ql-init-conds { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 4px; }
.ql-init-conds span { font-size: 0.66rem; letter-spacing: 0.04em; text-transform: uppercase; color: #c8a2ff;
  border: 1px solid rgba(200,162,255,0.4); border-radius: 999px; padding: 1px 7px; }
.ql-remote-empty { padding: 10px 14px 14px; color: #8f8670; font-style: italic; font-size: 0.85rem; }
.ql-roll { display: grid; grid-template-columns: 1fr auto; gap: 0 8px; padding: 5px 10px; border-top: 1px solid rgba(240,230,200,0.08); }
.ql-roll-who { font-size: 0.82rem; color: #f0e6c8; }
.ql-roll-what { font-size: 0.7rem; color: #9a9078; }
.ql-roll-total { grid-row: 1 / span 2; align-self: center; font-family: Cinzel, Georgia, serif; font-size: 1.25rem; color: #d6af36; font-variant-numeric: tabular-nums; }
.ql-roll-total.nat20 { color: #6fbf73; } .ql-roll-total.nat1 { color: #ef5350; }
.ql-remote-foot { margin-top: auto; padding: 8px 14px 12px; font-size: 0.72rem; color: #8f8670; border-top: 1px solid rgba(240,230,200,0.08); }
`;

function hpClass(e: InitiativeEntry): string {
  if (e.hp_current == null || !e.hp_max) return "";
  const f = e.hp_current / e.hp_max;
  return f <= 0.25 ? "crit" : f <= 0.5 ? "low" : "";
}

export default function RemotePanel({ projection, rolls, pcId, open, onToggle, canDrag }: Props) {
  const rows = projection.initiative;
  return (
    <>
      <style>{CSS}</style>
      <aside className={`ql-remote ${open ? "open" : "closed"}`} aria-label="Table panel">
        <div className="ql-remote-head">
          <h3>{projection.combat_running ? "Initiative" : "The table"}</h3>
          {projection.combat_running && <span className="ql-remote-round">Round {projection.round}</span>}
        </div>
        {projection.combat_running && rows.length > 0 ? (
          <div className="ql-remote-list">
            {rows.map((e) => (
              <div
                key={e.ref}
                className={`ql-init${e.active ? " active" : ""}${e.defeated ? " down" : ""}${pcId && e.ref === pcId ? " me" : ""}`}
              >
                <span className="ql-init-name">
                  {e.active ? "▶ " : ""}
                  {e.name}
                </span>
                {e.hp_current != null && e.hp_max != null ? (
                  <span className="ql-init-hp">
                    {e.hp_current}/{e.hp_max}
                  </span>
                ) : (
                  <span className="ql-init-hp" style={{ color: "#8f8670", fontSize: "0.72rem" }}>
                    {e.defeated ? "down" : "foe"}
                  </span>
                )}
                {e.hp_current != null && e.hp_max != null && e.hp_max > 0 && (
                  <span className="ql-init-bar">
                    <i className={hpClass(e)} style={{ width: `${Math.max(0, Math.min(100, (100 * e.hp_current) / e.hp_max))}%` }} />
                  </span>
                )}
                {e.conditions.length > 0 && (
                  <span className="ql-init-conds">
                    {e.conditions.map((c) => (
                      <span key={c}>{c}</span>
                    ))}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="ql-remote-empty">
            {projection.map ? "No fight right now. When one starts, the order shows here." : "Waiting for the DM to set the scene…"}
          </div>
        )}
        <div className="ql-remote-head" style={{ paddingTop: 6 }}>
          <h3>Rolls</h3>
        </div>
        {rolls.length === 0 ? (
          <div className="ql-remote-empty">Rolls land here as they happen.</div>
        ) : (
          <div style={{ overflowY: "auto", maxHeight: "38%" }}>
            {rolls.map((r) => {
              const single = r.rolls.length === 1 && r.die === "d20";
              const cls = single && r.rolls[0] === 20 ? " nat20" : single && r.rolls[0] === 1 ? " nat1" : "";
              return (
                <div key={r.key} className="ql-roll">
                  <span className="ql-roll-who">{r.roller}</span>
                  <span className={`ql-roll-total${cls}`}>{r.total}</span>
                  <span className="ql-roll-what">
                    {r.label ? `${r.label} · ` : ""}
                    {r.rolls.length}
                    {r.die} [{r.rolls.join(", ")}]{r.modifier ? ` ${r.modifier > 0 ? "+" : "−"} ${Math.abs(r.modifier)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div className="ql-remote-foot">
          {canDrag ? "Drag your own token to move. Only yours moves." : pcId ? "Your token isn't on the map yet — ask your DM to place the party." : "Open this from your sheet's 🗺 Table link to move your token."}
        </div>
      </aside>
      <button className="ql-remote-tab" onClick={onToggle} title={open ? "Hide the panel" : "Show initiative and rolls"}>
        {open ? "Map ▸" : "◂ Order"}
      </button>
    </>
  );
}
