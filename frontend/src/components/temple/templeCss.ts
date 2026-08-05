/**
 * Temple Companion styles (Plan 58).
 *
 * Palette is the blueprint's own (sea-slate ground, parchment gold, the
 * six room colours) so the cockpit and the printed page read as one
 * document.
 *
 * The `@media print` block is load-bearing: if the app misbehaves on
 * Saturday, the DM prints this page and runs the session from paper. It
 * collapses the cockpit to the one-page legend — every room, the boss
 * card, and the cut order, in ink-on-white.
 */
export const TEMPLE_CSS = `
.tc-root {
  --tc-ground: #04121c;
  --tc-panel: #0a1a24;
  --tc-edge: #2c4650;
  --tc-parch: #e8d9a8;
  --tc-text: #c5d6d2;
  --tc-muted: #7f9aa2;
  --tc-warn: #b0563f;
  position: fixed; inset: 0; z-index: 200;
  display: grid; grid-template-columns: minmax(0, 1fr) 420px;
  background: var(--tc-ground); color: var(--tc-text);
  font-family: Georgia, "IM Fell English", "Palatino Linotype", serif;
  overflow: hidden;
}
.tc-left { position: relative; display: flex; flex-direction: column; min-width: 0; }
.tc-bar {
  display: flex; align-items: center; gap: 0.7rem; padding: 0.5rem 0.9rem;
  border-bottom: 1px solid var(--tc-edge); background: #061722; flex-wrap: wrap;
}
.tc-bar h1 { font-size: 1.05rem; margin: 0; color: var(--tc-parch); font-weight: 400; letter-spacing: 0.04em; }
.tc-warnpill {
  font-size: 0.62rem; letter-spacing: 0.16em; font-weight: 700; color: var(--tc-warn);
  border: 1px solid var(--tc-warn); border-radius: 3px; padding: 0.1rem 0.4rem;
}
.tc-keys { margin-left: auto; font-size: 0.68rem; color: var(--tc-muted); }
.tc-ghost {
  background: none; border: 1px solid var(--tc-edge); border-radius: 4px;
  color: inherit; cursor: pointer; font: inherit; font-size: 0.76rem; padding: 0.2rem 0.6rem;
}
.tc-ghost:hover { border-color: var(--tc-parch); color: var(--tc-parch); }
.tc-ghost.on { border-color: var(--tc-parch); color: var(--tc-parch); }

/* Screen order, always visible — the DM should never wonder what's on the
   projector right now. */
.tc-order {
  display: flex; gap: 0.3rem; align-items: center; overflow-x: auto;
  padding: 0.3rem 0.9rem; border-bottom: 1px solid var(--tc-edge);
  background: #050f17; font-size: 0.62rem; white-space: nowrap;
}
.tc-order-step {
  color: var(--tc-muted); border: 1px solid var(--tc-edge); border-radius: 3px;
  padding: 0.1rem 0.4rem; flex-shrink: 0;
}
.tc-order-step + .tc-order-step::before {
  content: "→"; margin-right: 0.4rem; margin-left: -0.15rem; color: var(--tc-edge);
}
.tc-order-step.last { color: #e6b3a5; border-color: var(--tc-warn); }

.tc-canvas { flex: 1; width: 100%; height: auto; min-height: 0; display: block; }
.tc-pin { cursor: pointer; }
.tc-pin circle { transition: r 0.15s; }
.tc-pin:hover circle:last-of-type { r: 18; }
.tc-pin:focus-visible { outline: 2px solid var(--tc-parch); }
.tc-pulse { animation: tcPulse 2.6s ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes tcPulse { 0%,100% { opacity: .22; } 50% { opacity: .5; } }
.tc-marker { cursor: grab; }
.tc-marker:active { cursor: grabbing; }
@media (prefers-reduced-motion: reduce) { .tc-pulse { animation: none; } }

/* ── Drawer ── */
.tc-drawer {
  border-left: 1px solid var(--tc-edge); background: var(--tc-panel);
  overflow-y: auto; padding: 0.9rem 1.1rem 3rem;
}
.tc-room-head { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.2rem; }
.tc-room-numeral { font-size: 1.5rem; }
.tc-room-title { font-size: 1.25rem; color: var(--tc-parch); }
.tc-room-kind {
  margin-left: auto; font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase;
}
.tc-player {
  border: 1px solid #7fd4c8; border-radius: 5px; background: rgba(127, 212, 200, 0.07);
  padding: 0.5rem 0.7rem; margin: 0.6rem 0 0.2rem; font-size: 0.8rem; line-height: 1.5;
  color: #a9dcd4;
}
.tc-player-badge {
  display: block; font-size: 0.6rem; letter-spacing: 0.2em; color: #7fd4c8;
  margin-bottom: 0.25rem; font-weight: 700;
}
.tc-read {
  border-left: 4px solid var(--tc-parch); background: rgba(232, 217, 168, 0.07);
  padding: 0.7rem 0.9rem; margin: 0.7rem 0 1rem; font-style: italic; line-height: 1.55;
  color: #e6efe9; font-size: 1.02rem;
}
.tc-read-badge {
  display: block; font-size: 0.6rem; letter-spacing: 0.2em; font-style: normal;
  color: var(--tc-parch); margin-bottom: 0.3rem;
}
.tc-beat { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.45rem 0; line-height: 1.5; }
.tc-beat input { margin-top: 0.28rem; accent-color: #c9a25a; flex-shrink: 0; }
.tc-beat.tone-roll { color: #b9cfe8; }
.tc-beat.tone-dm {
  color: var(--tc-parch); font-weight: 700; border: 1px dashed rgba(232,217,168,.45);
  border-radius: 4px; padding: 0.45rem 0.6rem; background: rgba(232,217,168,.05);
}
.tc-beat.done { opacity: 0.5; text-decoration: line-through; }
.tc-link {
  display: inline-block; margin: 0.3rem 0.4rem 0.3rem 0; padding: 0.35rem 0.7rem;
  border: 1px solid #7fd4c8; border-radius: 4px; color: #7fd4c8; text-decoration: none;
  font-size: 0.82rem;
}
.tc-link:hover { background: rgba(127, 212, 200, 0.12); }
.tc-statcard {
  border: 1px solid var(--tc-edge); border-radius: 6px; padding: 0.55rem 0.7rem; margin: 0.5rem 0;
  background: #08151d;
}
.tc-statcard b { color: var(--tc-parch); }
.tc-statline { font-size: 0.82rem; color: var(--tc-muted); margin: 0.15rem 0 0.4rem; }
.tc-section-label {
  font-size: 0.62rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--tc-muted); margin: 1.1rem 0 0.4rem;
}

/* ── Boss ── */
.tc-boss-head h2 { margin: 0; font-size: 1.3rem; color: #7fd4c8; font-weight: 400; }
.tc-boss-line { font-size: 0.84rem; color: var(--tc-muted); margin-bottom: 0.7rem; }
.tc-ticker { margin: 0.4rem 0; }
.tc-ticker-row { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.tc-tick {
  background: none; border: 1px solid var(--tc-edge); border-radius: 4px; color: inherit;
  cursor: pointer; font: inherit; font-size: 0.76rem; padding: 0.18rem 0.4rem; min-width: 34px;
}
.tc-tick:hover { border-color: var(--tc-warn); color: #e6b3a5; }
.tc-hp { display: flex; align-items: baseline; gap: 3px; margin: 0 4px; }
.tc-hp-input {
  width: 62px; background: #08151d; border: 1px solid var(--tc-edge); border-radius: 4px;
  color: var(--tc-parch); font: inherit; font-size: 1.15rem; text-align: center; padding: 0.1rem;
}
.tc-hp-max { font-size: 0.8rem; color: var(--tc-muted); }
.tc-hp-bar { height: 6px; background: #08151d; border-radius: 3px; margin-top: 6px; overflow: hidden; }
.tc-hp-fill { height: 100%; background: linear-gradient(90deg, #6e4550, #b0563f); transition: width 0.2s; }
.tc-dealt { font-size: 0.8rem; color: var(--tc-muted); margin: 0.3rem 0 0.8rem; }
.tc-phases { display: flex; flex-direction: column; gap: 4px; }
.tc-phase {
  display: flex; align-items: center; gap: 0.55rem; padding: 0.4rem 0.6rem;
  border: 1px solid var(--tc-edge); border-radius: 5px; font-size: 0.84rem;
  color: var(--tc-muted); opacity: 0.55;
}
.tc-phase-at {
  font-size: 0.7rem; min-width: 22px; text-align: center; border-radius: 3px;
  background: #08151d; padding: 0.05rem 0.25rem;
}
.tc-phase.lit {
  opacity: 1; color: var(--tc-parch); border-color: var(--tc-parch);
  background: rgba(232, 217, 168, 0.08); font-weight: 700;
}
.tc-phase.end { color: #e6b3a5; border-color: var(--tc-warn); background: rgba(176, 86, 63, 0.14); }
.tc-lair { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; }
.tc-lair-btn {
  display: flex; flex-direction: column; gap: 2px; text-align: left; background: #08151d;
  border: 1px solid var(--tc-edge); border-radius: 5px; color: inherit; cursor: pointer;
  font: inherit; font-size: 0.75rem; padding: 0.45rem 0.55rem;
}
.tc-lair-btn b { color: var(--tc-parch); font-size: 0.82rem; }
.tc-lair-btn span { color: var(--tc-muted); }
.tc-lair-btn:hover { border-color: #7fd4c8; }
.tc-lair-btn.used { opacity: 0.4; text-decoration: line-through; }
.tc-round {
  display: flex; align-items: center; gap: 0.6rem; margin: 0.7rem 0;
  font-size: 0.88rem; color: var(--tc-text);
}
.tc-round b { color: var(--tc-parch); font-size: 1.05rem; }
.tc-toggle { display: flex; align-items: center; gap: 0.45rem; margin: 0.45rem 0; font-size: 0.86rem; cursor: pointer; }
.tc-toggle input { accent-color: #c9a25a; }
.tc-ally {
  border: 1px solid var(--tc-edge); border-left: 3px solid #7fd4c8; border-radius: 5px;
  padding: 0.5rem 0.65rem; margin: 0.3rem 0 0.6rem; font-size: 0.84rem; background: #08151d;
}
.tc-ally b { color: #7fd4c8; }
.tc-ally-note { font-size: 0.74rem; color: var(--tc-muted); margin-top: 0.2rem; }
.tc-flavor {
  font-style: italic; color: var(--tc-muted); font-size: 0.8rem; line-height: 1.5;
  border-top: 1px dotted var(--tc-edge); padding-top: 0.6rem; margin-top: 1rem;
}
.tc-reset { margin-top: 0.6rem; }
.tc-cut {
  margin-top: 1.2rem; padding: 0.55rem 0.7rem; border: 1px solid var(--tc-edge);
  border-radius: 5px; background: #08151d; font-size: 0.78rem; color: var(--tc-muted);
}
.tc-cut b { color: var(--tc-parch); }

/* ── Print view: the paper fallback ── */
.tc-print { display: none; }
@media print {
  body > #root { display: none !important; }
  .tc-root {
    position: static; display: block; background: #fff; color: #111;
    overflow: visible;
  }
  .tc-left, .tc-drawer, .tc-bar, .tc-canvas { display: none !important; }
  .tc-print { display: block; padding: 0; font-size: 10.5pt; line-height: 1.45; }
  .tc-print h1 { font-size: 18pt; margin: 0 0 0.15rem; }
  .tc-print .tc-warnpill { color: #8c2f1c; border-color: #8c2f1c; }
  .tc-print-room { break-inside: avoid; margin: 0.5rem 0 0.65rem; }
  .tc-print-room h2 { font-size: 11.5pt; margin: 0 0 0.15rem; }
  .tc-print-read { font-style: italic; margin: 0.15rem 0; padding-left: 0.6rem; border-left: 2px solid #999; }
  .tc-print-beat { margin: 0.08rem 0 0.08rem 0.6rem; }
  .tc-print-beat.dm { font-weight: 700; }
  .tc-print-box { border: 1px solid #999; border-radius: 4px; padding: 0.4rem 0.6rem; margin: 0.5rem 0; break-inside: avoid; }
  .tc-print-cut { border-top: 1px solid #999; margin-top: 0.6rem; padding-top: 0.35rem; font-size: 9.5pt; }
  a { color: #1d4a7a; text-decoration: none; }
}
/* On-screen preview of the print sheet (P). */
.tc-root.printing { grid-template-columns: minmax(0, 1fr); }
.tc-root.printing .tc-left, .tc-root.printing .tc-drawer { display: none; }
.tc-root.printing .tc-print {
  display: block; overflow-y: auto; background: #fff; color: #111;
  padding: 1.4rem 1.8rem 4rem; height: 100%;
}
.tc-root.printing .tc-print h1 { font-size: 1.5rem; margin: 0 0 0.2rem; }
.tc-root.printing .tc-print-room { margin: 0.7rem 0; }
.tc-root.printing .tc-print-read {
  font-style: italic; padding-left: 0.7rem; border-left: 3px solid #bbb; margin: 0.25rem 0;
}
.tc-root.printing .tc-print-box { border: 1px solid #bbb; border-radius: 5px; padding: 0.6rem 0.8rem; margin: 0.7rem 0; }
.tc-root.printing .tc-print-cut { border-top: 1px solid #bbb; margin-top: 0.9rem; padding-top: 0.5rem; }
.tc-print-back { position: fixed; top: 0.8rem; right: 1.2rem; }
`;
