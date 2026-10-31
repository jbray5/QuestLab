import { ChevronRight } from "lucide-react";

import type { InitiativeEntry, TableProjection } from "../../api/types";
import { CLASS_GLYPHS } from "../../lib/classGlyphs";
import type { TableRoll } from "./DiceCinematic";
import { JoinQrCode } from "./JoinQr";
import { rollLabel } from "./rollText";

/**
 * TableTracker (Plan 128) — what the TV or projector shows when no battle
 * map is staged, which is most tables: the round, the turn order with whose
 * turn it is lit, the party's HP and the last roll, big enough to read from
 * the back of a room at 720p (names 28 px and up, nothing under 18 px).
 * Before the fight it shows the campaign's join QR instead of the order.
 *
 * TurnCorner is the same order in a corner of the map, for when a map is up.
 *
 * Both read only the player-safe projection: the party's HP, never a foe's,
 * and no DM notes (services/table_service.get_projection decides that).
 */

/** An order row as the projection sends it; Plan 128 adds a PC's picture and class. */
export type TrackerEntry = InitiativeEntry & { class_name?: string | null; image_url?: string | null };

const CSS = `
.qtv { position: fixed; inset: 0; display: flex; flex-direction: column; background: var(--bg);
  color: var(--text); font-family: var(--font-ui); }
.qtv-head { height: 13vh; flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  gap: 2vw; padding: 0 3vw; border-bottom: 1px solid var(--border); }
.qtv-title { font-family: var(--font-story); font-weight: 700; font-size: clamp(1.75rem, 5.6vh, 3.8rem);
  line-height: 1.1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qtv-round { font-size: clamp(1.25rem, 4.2vh, 2.8rem); color: var(--text2); white-space: nowrap; }
.qtv-round .num { color: var(--text); font-weight: 600; }
.qtv-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 64fr) minmax(0, 36fr); }
.qtv-main { min-height: 0; overflow: hidden; padding: 3vh 3vw; }
.qtv-side { min-height: 0; overflow: hidden; padding: 3vh 2.5vw; border-left: 1px solid var(--border);
  display: flex; flex-direction: column; gap: 2vh; }
.qtv-list { display: grid; gap: 1.3vh 1.6vw; grid-auto-flow: column; align-content: start;
  font-size: calc(var(--qtv-scale, 1) * clamp(1.75rem, 4.3vh, 3.4rem)); }
.qtv-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0 0.45em;
  padding: 0.26em 0.5em; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); }
.qtv-row.active { border-color: var(--accent-edge); background: var(--accent-soft); animation: qtvLit 0.7s ease; }
.qtv-row.down { opacity: 0.5; }
.qtv-row.down .qtv-name { text-decoration: line-through; }
.qtv-who { min-width: 0; display: flex; flex-direction: column; }
.qtv-name { font-family: var(--font-story); font-weight: 700; line-height: 1.15; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis; }
.qtv-you { font-family: var(--font-ui); font-weight: 600; font-size: max(18px, 0.6em); color: var(--accent-text); }
.qtv-meta { display: flex; flex-wrap: wrap; gap: 0.3em; align-items: center; font-size: max(18px, 0.62em);
  color: var(--muted); line-height: 1.3; }
.qtv-meta .now { color: var(--accent-text); font-weight: 600; display: inline-flex; align-items: center; }
.qtv-meta .cond { color: var(--amber-text); background: var(--amber-soft); border-radius: 999px; padding: 0 0.5em; }
.qtv-meta .foe { color: var(--danger-text); }
.qtv-hp { display: flex; flex-direction: column; align-items: flex-end; gap: 0.12em; }
.qtv-hp .num { font-size: max(18px, 0.74em); color: var(--text); }
.qtv-hp .num small { font-size: 0.8em; color: var(--muted); }
.qtv-bar { width: 3.2em; height: max(5px, 0.16em); border-radius: 99px; background: var(--surface3); overflow: hidden; }
.qtv-bar i { display: block; height: 100%; background: var(--teal); }
.qtv-bar i.low { background: var(--amber); }
.qtv-bar i.crit { background: var(--danger); }
.qtv-av { width: 1.75em; height: 1.75em; border-radius: 50%; flex-shrink: 0; display: inline-flex;
  align-items: center; justify-content: center; overflow: hidden; background: var(--surface2);
  box-shadow: inset 0 0 0 1px var(--border2); }
.qtv-av img { width: 100%; height: 100%; object-fit: cover; display: block; }
.qtv-av svg { width: 60%; height: 60%; display: block; }
.qtv-av .ini { font-family: var(--font-story); font-weight: 700; font-size: 0.8em; color: var(--text2); }
.qtv-av.foe { box-shadow: inset 0 0 0 2px var(--danger-line); background: var(--danger-soft); }
.qtv-av.foe .ini { color: var(--danger-text); }
.qtv-quiet { font-size: clamp(1.25rem, 3.6vh, 2.2rem); color: var(--text2); line-height: 1.4; max-width: 30em; }
.qtv-join { height: 100%; display: flex; align-items: center; gap: 3vw; }
.qtv-qr { width: min(58vh, 32vw); height: min(58vh, 32vw); border-radius: 16px; flex-shrink: 0; background: var(--surface2); }
.qtv-join h2 { margin: 0 0 1.5vh; font-family: var(--font-ui); font-weight: 600; font-size: clamp(1.75rem, 5.4vh, 3.6rem); line-height: 1.15; }
.qtv-join p { margin: 0 0 1.5vh; font-size: clamp(1.25rem, 3.3vh, 2.1rem); color: var(--text2); line-height: 1.4; }
.qtv-join p.later { color: var(--muted); font-size: clamp(1.125rem, 2.8vh, 1.8rem); }
.qtv-side h3 { margin: 0; font-family: var(--font-ui); font-weight: 600; font-size: clamp(1.125rem, 3vh, 1.9rem); color: var(--muted); }
.qtv-roll { display: flex; flex-direction: column; gap: 0.6vh; }
.qtv-roll-who { font-family: var(--font-story); font-weight: 700; font-size: clamp(1.75rem, 4.6vh, 3.2rem); line-height: 1.15;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qtv-roll-what { font-size: clamp(1.125rem, 3vh, 2rem); color: var(--text2); }
.qtv-roll-total { font-family: var(--font-mono); font-weight: 600; font-variant-numeric: tabular-nums;
  font-size: clamp(4rem, 19vh, 12rem); line-height: 1; color: var(--text); }
.qtv-roll-detail { font-family: var(--font-mono); font-size: clamp(1.125rem, 3vh, 2rem); color: var(--text2); }
.qtv-tag { align-self: flex-start; font-weight: 600; font-size: clamp(1.125rem, 3vh, 2rem); border-radius: 999px; padding: 0 0.6em; }
.qtv-tag.crit { color: var(--teal-text); background: var(--teal-soft); }
.qtv-tag.fumble { color: var(--danger-text); background: var(--danger-soft); }
.qtv-earlier { display: flex; flex-direction: column; gap: 0.8vh; margin-top: 1vh; padding-top: 1.6vh; border-top: 1px solid var(--border); }
.qtv-earlier div { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.6em; align-items: baseline;
  font-size: clamp(1.125rem, 2.8vh, 1.8rem); color: var(--text2); }
.qtv-earlier span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qtv-earlier .num { color: var(--text); font-weight: 600; }
@keyframes qtvLit { 0% { transform: scale(1.03); box-shadow: 0 0 0 3px var(--accent-line); } 100% { transform: none; box-shadow: none; } }
@media (prefers-reduced-motion: reduce) { .qtv-row.active { animation: none; } }
@media (max-width: 640px) {
  .qtv { position: absolute; overflow-y: auto; }
  .qtv-head { height: auto; padding: 14px 16px; }
  .qtv-title { font-size: 1.5rem; }
  .qtv-round { font-size: 1.15rem; }
  .qtv-body { display: flex; flex-direction: column; flex: none; }
  .qtv-main { padding: 14px 16px; overflow: visible; }
  .qtv-side { padding: 14px 16px; border-left: 0; border-top: 1px solid var(--border); overflow: visible; }
  .qtv-list { font-size: 1.25rem; grid-auto-flow: row; grid-template-columns: 1fr !important; grid-template-rows: none !important; }
  .qtv-roll-total { font-size: 4rem; }
}

.qtv-corner { position: absolute; top: 2.5vh; right: 1.5vw; z-index: 30; width: min(31vw, 460px);
  background: rgba(17, 21, 19, 0.9); border: 1px solid var(--border2); border-radius: 14px;
  padding: 1.2vh 1vw 1.4vh; font-family: var(--font-ui); color: var(--text);
  font-size: clamp(1.25rem, 3.9vh, 2.6rem); }
.qtv-corner-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5em;
  font-size: max(18px, 0.62em); color: var(--muted); margin: 0 0.2em 0.5vh; }
.qtv-corner-head .num { color: var(--text); font-weight: 600; }
.qtv-corner ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.6vh; }
.qtv-corner li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 0 0.4em;
  padding: 0.16em 0.35em; border-radius: 10px; border: 1px solid transparent; }
.qtv-corner li.active { border-color: var(--accent-edge); background: var(--accent-soft); }
.qtv-corner li .qtv-av { width: 1.45em; height: 1.45em; }
.qtv-corner li .qtv-name { font-size: 1em; }
.qtv-corner li.later .qtv-name { color: var(--text2); }
.qtv-corner li .num { font-family: var(--font-mono); font-size: max(18px, 0.66em); color: var(--text2); }
.qtv-corner .more { font-size: max(18px, 0.6em); color: var(--muted); margin: 0.4vh 0.3em 0; }
`;

function hpTone(e: TrackerEntry): string {
  if (e.hp_current == null || !e.hp_max) return "";
  const f = e.hp_current / e.hp_max;
  return f <= 0.25 ? "crit" : f <= 0.5 ? "low" : "";
}

function sentence(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Who is up after the active combatant: the next one still standing. */
function nextRef(rows: TrackerEntry[]): string | null {
  const i = rows.findIndex((r) => r.active);
  if (i < 0) return null;
  for (let k = 1; k < rows.length; k++) {
    const r = rows[(i + k) % rows.length];
    if (!r.defeated) return r.ref;
  }
  return null;
}

/** A PC's picture, else its class crest, else an initial; foes get a red-ringed initial. */
function Avatar({ entry }: { entry: TrackerEntry }) {
  const isPc = entry.kind === "pc";
  const key = (entry.class_name ?? "").trim().toLowerCase();
  const glyph = isPc ? CLASS_GLYPHS[key] : undefined;
  if (isPc && entry.image_url) {
    return (
      <span className="qtv-av">
        <img src={entry.image_url} alt="" />
      </span>
    );
  }
  if (glyph) {
    const tint = `var(--class-${key})`;
    return (
      <span
        className="qtv-av"
        title={entry.class_name ?? undefined}
        style={{
          background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${tint} 46%, var(--surface2)) 0%, color-mix(in srgb, ${tint} 16%, var(--surface2)) 70%)`,
          boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 55%, var(--border2))`,
        }}
      >
        <svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">
          <path d={glyph.d} fill="var(--text)" fillOpacity={0.94} />
        </svg>
      </span>
    );
  }
  return (
    <span className={`qtv-av${isPc ? "" : " foe"}`}>
      <span className="ini">{(entry.name || "?").slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

function Hp({ entry }: { entry: TrackerEntry }) {
  if (entry.hp_current == null || entry.hp_max == null) return <span />;
  const pct = entry.hp_max > 0 ? Math.max(0, Math.min(100, (100 * entry.hp_current) / entry.hp_max)) : 0;
  return (
    <span className="qtv-hp" aria-label={`${entry.hp_current} of ${entry.hp_max} hit points`}>
      <span className="num">
        {entry.hp_current}
        <small> / {entry.hp_max}</small>
      </span>
      <span className="qtv-bar">
        <i className={hpTone(entry)} style={{ width: `${pct}%` }} />
      </span>
    </span>
  );
}

function RollCard({ rolls }: { rolls: TableRoll[] }) {
  const last = rolls[0];
  if (!last) {
    return (
      <>
        <h3>Rolls</h3>
        <p className="qtv-quiet" style={{ margin: 0 }}>
          Rolls from the players&rsquo; phones and the DM show up here.
        </p>
      </>
    );
  }
  const single = last.die === "d20" && last.rolls.length === 1;
  const dieLabel = last.rolls.length > 1 ? `${last.rolls.length}${last.die}` : last.die;
  const mod = last.modifier ? ` ${last.modifier > 0 ? "+" : "−"} ${Math.abs(last.modifier)}` : "";
  return (
    <>
      <h3>Last roll</h3>
      <div className="qtv-roll" aria-live="polite">
        <span className="qtv-roll-who">{last.roller}</span>
        <span className="qtv-roll-what">
          {rollLabel(last.label) ? `${rollLabel(last.label)} · ` : ""}
          {dieLabel}
        </span>
        <span className="qtv-roll-total">{last.total}</span>
        {(last.rolls.length > 1 || last.modifier !== 0) && (
          <span className="qtv-roll-detail">
            {last.rolls.join(" + ")}
            {mod}
          </span>
        )}
        {single && last.rolls[0] === 20 && <span className="qtv-tag crit">Natural 20</span>}
        {single && last.rolls[0] === 1 && <span className="qtv-tag fumble">Natural 1</span>}
      </div>
      {rolls.length > 1 && (
        <div className="qtv-earlier">
          {rolls.slice(1, 4).map((r) => (
            <div key={r.key}>
              <span>
                <span className="story" style={{ fontWeight: 700, color: "var(--text)" }}>
                  {r.roller}
                </span>
                {` · ${rollLabel(r.label) ?? r.die}`}
              </span>
              <span className="num">{r.total}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export default function TableTracker({
  projection,
  rolls,
  meRef = null,
  showJoin,
}: {
  projection: TableProjection;
  /** Newest first, already held back until the die has landed. */
  rolls: TableRoll[];
  /** A remote player's own character, marked "you". */
  meRef?: string | null;
  /** The room TV shows the join QR before the fight; a player's own window doesn't. */
  showJoin: boolean;
}) {
  const rows = projection.initiative as TrackerEntry[];
  const fighting = projection.combat_running && rows.length > 0;
  const upNext = fighting ? nextRef(rows) : null;
  const cols = rows.length > 7 ? 2 : 1;
  const perCol = Math.ceil(rows.length / cols);
  const scale = perCol > 8 ? Math.max(0.7, 8 / perCol) : 1;
  const title = projection.title || (fighting ? "Turn order" : "Before the fight");

  return (
    <div className="qtv">
      <style>{CSS}</style>
      <header className="qtv-head">
        <div className="qtv-title">{title}</div>
        {fighting && (
          <div className="qtv-round">
            Round <span className="num">{projection.round}</span>
          </div>
        )}
      </header>
      <div className="qtv-body">
        <section className="qtv-main">
          {fighting ? (
            <div
              className="qtv-list"
              style={
                {
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gridTemplateRows: `repeat(${perCol}, auto)`,
                  "--qtv-scale": scale,
                } as React.CSSProperties
              }
            >
              {rows.map((e) => {
                const isMe = !!meRef && e.ref === meRef;
                const isFoe = e.kind !== "pc";
                return (
                  <div
                    key={e.ref}
                    className={`qtv-row${e.active ? " active" : ""}${e.defeated ? " down" : ""}`}
                    aria-current={e.active ? "true" : undefined}
                  >
                    <Avatar entry={e} />
                    <span className="qtv-who">
                      <span className="qtv-name">
                        {e.name}
                        {isMe && <span className="qtv-you"> · you</span>}
                      </span>
                      {(e.active || e.ref === upNext || e.conditions.length > 0 || isFoe || e.defeated) && (
                        <span className="qtv-meta">
                          {e.active && (
                            <span className="now">
                              <ChevronRight size="1em" aria-hidden="true" />
                              {isMe ? "Your turn" : "Their turn"}
                            </span>
                          )}
                          {!e.active && e.ref === upNext && <span>Up next</span>}
                          {e.defeated && <span>Down</span>}
                          {isFoe && !e.defeated && !e.active && e.ref !== upNext && <span className="foe">Foe</span>}
                          {e.conditions.map((c) => (
                            <span key={c} className="cond">
                              {sentence(c)}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                    <Hp entry={e} />
                  </div>
                );
              })}
            </div>
          ) : showJoin && projection.campaign_id ? (
            <div className="qtv-join">
              <JoinQrCode campaignId={projection.campaign_id} className="qtv-qr" />
              <div>
                <h2>Scan to open your character</h2>
                <p>Point your phone camera at the code, then tap your character.</p>
                <p className="later">The turn order shows here when the fight starts.</p>
              </div>
            </div>
          ) : (
            <p className="qtv-quiet">No fight right now. When one starts, the turn order shows here.</p>
          )}
        </section>
        <aside className="qtv-side">
          <RollCard rolls={rolls} />
        </aside>
      </div>
    </div>
  );
}

/** The turn order in a corner of the battle map: who is up, then the next few. */
export function TurnCorner({ projection, max = 4 }: { projection: TableProjection; max?: number }) {
  const rows = projection.initiative as TrackerEntry[];
  if (!projection.combat_running || rows.length === 0) return null;
  const start = Math.max(0, rows.findIndex((r) => r.active));
  const ordered = [...rows.slice(start), ...rows.slice(0, start)].filter((r, i) => i === 0 || !r.defeated);
  const shown = ordered.slice(0, max);
  const more = ordered.length - shown.length;
  return (
    <aside className="qtv-corner" aria-label="Turn order">
      <style>{CSS}</style>
      <div className="qtv-corner-head">
        <span>Turn order</span>
        <span>
          Round <span className="num">{projection.round}</span>
        </span>
      </div>
      <ol>
        {shown.map((e, i) => (
          <li key={e.ref} className={e.active ? "active" : i > 0 ? "later" : ""}>
            <Avatar entry={e} />
            <span className="qtv-name">{e.name}</span>
            {e.hp_current != null && e.hp_max != null ? (
              <span className="num">
                {e.hp_current}/{e.hp_max}
              </span>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ol>
      {more > 0 && <div className="more">and {more} more</div>}
    </aside>
  );
}
