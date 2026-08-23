/**
 * Restwater Companion styles (Plan 59).
 *
 * Warm cedar-and-lantern palette — the bathhouse's own — over the same
 * cockpit skeleton as the Temple Companion (Plan 58). The `@media print`
 * block is load-bearing: paper is the session's backstop.
 */
export const RESTWATER_CSS = `
.rw-root {
  --rw-ground: #170f08;
  --rw-panel: #221507;
  --rw-edge: #4d3a20;
  --rw-parch: #ecd9a0;
  --rw-text: #d9c9ab;
  --rw-muted: #9c8a68;
  --rw-warn: #b0563f;
  --rw-water: #5fa8a0;
  position: fixed; inset: 0; z-index: 200;
  display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 420px);
  background: var(--rw-ground); color: var(--rw-text);
  font-family: Georgia, "IM Fell English", "Palatino Linotype", serif;
  overflow: hidden;
}
.rw-col { overflow-y: auto; padding: 0.9rem 1.1rem 3rem; min-width: 0; }
.rw-col.side { border-left: 1px solid var(--rw-edge); background: var(--rw-panel); }
.rw-bar {
  grid-column: 1 / -1; display: flex; align-items: center; gap: 0.7rem;
  padding: 0.5rem 0.9rem; border-bottom: 1px solid var(--rw-edge);
  background: #1c1206; flex-wrap: wrap;
}
.rw-root { grid-template-rows: auto minmax(0, 1fr); }
.rw-bar h1 { font-size: 1.05rem; margin: 0; color: var(--rw-parch); font-weight: 400; letter-spacing: 0.04em; }
.rw-warnpill {
  font-size: 0.62rem; letter-spacing: 0.16em; font-weight: 700; color: var(--rw-warn);
  border: 1px solid var(--rw-warn); border-radius: 3px; padding: 0.1rem 0.4rem;
}
.rw-ghost {
  background: none; border: 1px solid var(--rw-edge); border-radius: 4px;
  color: inherit; cursor: pointer; font: inherit; font-size: 0.76rem; padding: 0.2rem 0.6rem;
}
.rw-ghost:hover, .rw-ghost.on { border-color: var(--rw-parch); color: var(--rw-parch); }

/* ── Pools switch: the fight's engine ── */
.rw-pools {
  display: flex; align-items: center; gap: 0.8rem; margin: 0.4rem 0 0.8rem;
  border: 1px solid var(--rw-edge); border-radius: 6px; padding: 0.6rem 0.8rem;
}
.rw-pools.full { border-color: var(--rw-water); box-shadow: inset 0 0 18px rgba(95,168,160,0.12); }
.rw-pools.drained { border-color: var(--rw-warn); }
.rw-pools-state { font-size: 1.05rem; letter-spacing: 0.12em; font-weight: 700; }
.rw-pools.full .rw-pools-state { color: var(--rw-water); }
.rw-pools.drained .rw-pools-state { color: var(--rw-warn); }
.rw-pools-note { font-size: 0.72rem; color: var(--rw-muted); flex: 1; }

.rw-boss-head h2 { margin: 0.2rem 0 0; color: var(--rw-parch); font-size: 1.3rem; letter-spacing: 0.06em; }
.rw-statline { font-size: 0.82rem; color: var(--rw-muted); margin: 0.15rem 0 0.5rem; }

/* Ticker (same skeleton as tc-) */
.rw-ticker-row { display: flex; align-items: center; gap: 0.35rem; }
.rw-tick {
  background: none; border: 1px solid var(--rw-edge); border-radius: 4px; color: inherit;
  cursor: pointer; font: inherit; font-size: 0.78rem; padding: 0.25rem 0.5rem;
}
.rw-tick:hover { border-color: var(--rw-parch); color: var(--rw-parch); }
.rw-tick.dmg { border-color: #6e3d2e; }
.rw-tick.dmg:hover { border-color: var(--rw-warn); color: #e6b3a5; }
.rw-hp { display: flex; align-items: baseline; gap: 0.25rem; margin: 0 0.3rem; }
.rw-hp-input {
  width: 3.2em; background: none; border: none; border-bottom: 1px solid var(--rw-edge);
  color: var(--rw-parch); font: inherit; font-size: 1.3rem; text-align: right;
}
.rw-hp-max { color: var(--rw-muted); font-size: 0.85rem; }
.rw-hp-bar { height: 5px; background: #120b04; border-radius: 3px; margin-top: 0.35rem; overflow: hidden; }
.rw-hp-fill { height: 100%; background: linear-gradient(90deg, var(--rw-warn), var(--rw-parch)); transition: width 0.2s; }
.rw-dealt { font-size: 0.8rem; margin: 0.35rem 0; }
.rw-dealt b { color: var(--rw-parch); font-size: 1rem; }
.rw-floor-hint { color: var(--rw-warn); font-size: 0.74rem; }

/* Phases */
.rw-phases { display: flex; flex-direction: column; gap: 0.3rem; margin: 0.6rem 0; }
.rw-phase {
  display: flex; gap: 0.5rem; align-items: baseline; border: 1px solid var(--rw-edge);
  border-radius: 5px; padding: 0.35rem 0.55rem; font-size: 0.8rem; opacity: 0.45;
}
.rw-phase.lit { opacity: 1; border-color: var(--rw-parch); }
.rw-phase.lit.end { border-color: var(--rw-warn); background: rgba(176,86,63,0.10); }
.rw-phase-at { font-weight: 700; color: var(--rw-parch); min-width: 1.6em; text-align: right; }
.rw-phase-note { font-size: 0.7rem; color: var(--rw-muted); }

/* House actions */
.rw-section-label {
  margin: 0.9rem 0 0.35rem; font-size: 0.68rem; letter-spacing: 0.14em;
  color: var(--rw-muted); text-transform: uppercase;
}
.rw-house { display: flex; flex-direction: column; gap: 0.3rem; }
.rw-house-btn {
  text-align: left; background: none; border: 1px solid var(--rw-edge); border-radius: 5px;
  color: inherit; cursor: pointer; font: inherit; padding: 0.4rem 0.6rem;
  display: flex; flex-direction: column; gap: 0.15rem;
}
.rw-house-btn b { color: var(--rw-parch); font-size: 0.84rem; }
.rw-house-btn span { font-size: 0.74rem; color: var(--rw-muted); }
.rw-house-btn:hover { border-color: var(--rw-parch); }
.rw-house-btn.used { opacity: 0.4; border-style: dashed; }
.rw-house-btn.offline { opacity: 0.3; pointer-events: none; }

.rw-round { display: flex; align-items: center; gap: 0.7rem; margin: 0.7rem 0; font-size: 0.9rem; }
.rw-round b { color: var(--rw-parch); }

.rw-toggle { display: flex; gap: 0.5rem; align-items: baseline; margin: 0.3rem 0; font-size: 0.82rem; cursor: pointer; }
.rw-toggle input { accent-color: #caa64c; }

/* Objective + ally cards */
.rw-card {
  border: 1px solid var(--rw-edge); border-radius: 6px; padding: 0.55rem 0.7rem;
  margin: 0.45rem 0; font-size: 0.8rem;
}
.rw-card b { color: var(--rw-parch); }
.rw-card .rw-sub { color: var(--rw-muted); font-size: 0.75rem; margin-top: 0.2rem; }
.rw-card.compromised { border-color: var(--rw-warn); background: rgba(176,86,63,0.08); }

/* Comfort tally */
.rw-tally-row { display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem 0; }
.rw-tally-name { flex: 1; font-size: 0.86rem; }
.rw-tally-name input {
  width: 100%; background: none; border: none; border-bottom: 1px dashed var(--rw-edge);
  color: inherit; font: inherit; font-size: 0.86rem;
}
.rw-tally-pips { display: flex; gap: 0.25rem; }
.rw-pip {
  width: 16px; height: 16px; border-radius: 50%; border: 1px solid var(--rw-edge);
  background: none; cursor: pointer; padding: 0;
}
.rw-pip.on { background: var(--rw-parch); border-color: var(--rw-parch); }
.rw-tally-num { font-size: 0.95rem; color: var(--rw-parch); width: 1.2em; text-align: center; }

.rw-flavor { font-size: 0.74rem; color: var(--rw-muted); font-style: italic; margin-top: 1rem; }
.rw-reset { margin-top: 1.2rem; opacity: 0.7; }

/* ── Print: the paper backstop ── */
.rw-print { display: none; }
@media print {
  .rw-root { position: static; display: block; background: #fff; color: #111; overflow: visible; }
  .rw-bar, .rw-col { display: none !important; }
  .rw-print { display: block; font-size: 11px; color: #111; padding: 0.2in; }
  .rw-print h1 { font-size: 15px; margin: 0 0 4px; }
  .rw-print h2 { font-size: 12px; margin: 8px 0 2px; }
  .rw-print .box { border: 1px solid #333; padding: 4px 6px; margin: 4px 0; }
}
.rw-root.printing .rw-col, .rw-root.printing .rw-bar { display: none; }
.rw-root.printing { display: block; overflow-y: auto; background: #fff; color: #111; }
.rw-root.printing .rw-print { display: block; font-size: 12px; padding: 1rem; }
.rw-root.printing .rw-print h1 { color: #111; }
.rw-print .box { border: 1px solid #333; padding: 4px 6px; margin: 4px 0; }
`;
