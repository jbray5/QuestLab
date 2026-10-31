/**
 * Notebook stylesheet (Plan 57). One string, injected by the page —
 * includes the print stylesheet that makes read mode the paper fallback:
 * printing hides the whole app (#root) and prints ONLY the read overlay,
 * which ReadMode portals directly under <body>.
 *
 * Lamplit tokens throughout (Plan 121); the phone rules at the end (Plan 123)
 * turn the three columns into one, with the sidebar and margin in sheets.
 */
export const NOTEBOOK_CSS = `
.nb-root {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 250px;
  gap: 1rem;
  min-height: 70vh;
}
.nb-dim { color: var(--muted); }
.nb-pad { padding: 1rem; }
.nb-ghost {
  display: inline-flex; align-items: center; gap: 0.35rem;
  background: none; border: 1px solid var(--border2); border-radius: 8px;
  color: var(--text2); cursor: pointer; font: inherit; font-size: 0.8125rem; font-weight: 500;
  padding: 0.25rem 0.6rem; line-height: 1.3;
}
.nb-ghost:hover { background: var(--surface3); color: var(--text); }
.nb-ghost:disabled { opacity: 0.45; cursor: default; background: none; }
.nb-ghost.nb-on { background: var(--accent-active); border-color: var(--accent-edge); color: var(--accent-active-text); }

/* ── Sidebar ── */
.nb-sidebar { border-right: 1px solid var(--border); padding-right: 0.8rem; min-width: 0; }
.nb-side-head {
  display: flex; justify-content: space-between; align-items: center; gap: 0.5rem;
  font-size: 0.8125rem; font-weight: 500; color: var(--muted); margin: 0.9rem 0 0.4rem;
}
.nb-side-title { display: inline-flex; align-items: center; gap: 0.4rem; }
.nb-search {
  width: 100%; box-sizing: border-box; background: var(--bg);
  border: 1px solid var(--border2); border-radius: 8px; color: inherit;
  font: inherit; font-size: 0.875rem; padding: 0.35rem 0.6rem; margin-bottom: 0.4rem;
}
.nb-nblist, .nb-pagelist { display: flex; flex-direction: column; gap: 2px; }
.nb-nb, .nb-pg {
  background: none; border: none; color: var(--text2); cursor: pointer; font: inherit;
  font-size: 0.875rem; text-align: left; padding: 0.3rem 0.5rem; border-radius: 7px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nb-nb:hover, .nb-pg:hover { background: var(--surface2); color: var(--text); }
.nb-nb.on { color: var(--text); font-weight: 600; }
.nb-pg.on { background: var(--accent-active); color: var(--accent-active-text); font-weight: 500; }
.nb-hit {
  display: block; width: 100%; background: none; border: none; border-bottom: 1px solid var(--border);
  color: inherit; cursor: pointer; font: inherit; text-align: left; padding: 0.45rem 0.2rem;
}
.nb-hit:hover { background: var(--surface2); }
.nb-hit-title { font-size: 0.875rem; }
.nb-hit-snippet { font-size: 0.8125rem; color: var(--muted); margin-top: 2px; }

/* ── Editor ── */
.nb-main { min-width: 0; }
.nb-toolbar { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
.nb-title {
  flex: 1; min-width: 200px; background: none; border: none; border-bottom: 1px solid transparent;
  border-radius: 0; color: var(--text); font: inherit; font-family: var(--font-story);
  font-size: 1.6rem; font-weight: 700; padding: 0.1rem 0;
}
.nb-title:focus { outline: none; box-shadow: none; border-bottom-color: var(--accent); }
.nb-saved { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.8125rem; color: var(--muted); white-space: nowrap; }
.nb-saved-error { color: var(--danger-text); white-space: normal; }
.nb-editor { position: relative; }
.nb-block { display: flex; gap: 0.35rem; position: relative; }
.nb-block-gutter {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  opacity: 0; transition: opacity 0.15s; padding-top: 0.4rem; width: 22px; flex-shrink: 0;
}
.nb-block:hover .nb-block-gutter, .nb-block:focus-within .nb-block-gutter { opacity: 1; }
.nb-drag { cursor: grab; color: var(--muted); user-select: none; display: inline-flex; }
.nb-gutter-btn {
  background: none; border: none; color: var(--muted); cursor: pointer;
  padding: 2px; border-radius: 4px; display: inline-flex;
}
.nb-gutter-btn:hover { color: var(--accent-text); }
.nb-block-body { flex: 1; min-width: 0; position: relative; }
.nb-block-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 0.25rem 0 0.75rem; }

.nb-ta {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none;
  color: inherit; font: inherit; line-height: 1.6; resize: none; overflow: hidden;
  padding: 0.3rem 0.2rem; border-radius: 0;
}
.nb-ta:focus { outline: none; box-shadow: none; }
/* Read-aloud: the story panel, as everywhere else in the app. */
.nb-ta.nb-verbatim {
  background: var(--story-bg); border: 1px solid var(--story-line); border-radius: 10px;
  padding: 0.5rem 0.8rem; margin: 0.25rem 0;
  font-family: var(--font-story); font-style: italic; font-size: 1.1rem; color: var(--story-text);
}
.nb-prompt { font-weight: 600; color: var(--text); }
.nb-key { color: var(--muted); font-size: 0.875rem; }
.nb-divider { border: none; border-top: 1px dashed var(--border2); margin: 1rem 0; }

.nb-card-block {
  border: 1px solid var(--border); border-radius: 10px;
  background: var(--surface); padding: 0.7rem 0.9rem; margin: 0.3rem 0;
}
.nb-card-title {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none; border-radius: 0;
  color: var(--text); font: inherit; font-family: var(--font-story); font-size: 1.15rem; font-weight: 700;
  margin-bottom: 0.3rem; padding: 0.15rem 0;
}
.nb-card-title:focus, .nb-card-beat:focus { outline: none; box-shadow: none; }
.nb-card-beat {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none; border-radius: 0;
  border-top: 1px dotted var(--border2); color: inherit; font: inherit;
  font-size: 0.9375rem; padding: 0.25rem 0;
}

.nb-image { margin: 0.4rem 0; position: relative; }
.nb-image img { max-width: 100%; border-radius: 8px; display: block; }
.nb-image-caption {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none; border-radius: 0;
  color: var(--muted); font: inherit; font-size: 0.8125rem; font-style: italic;
  padding: 0.2rem 0;
}
.nb-image-clear { position: absolute; top: 6px; right: 6px; background: var(--surface); }
.nb-image-empty {
  border: 1px dashed var(--border2); border-radius: 8px; padding: 1rem;
  text-align: center; font-size: 0.875rem;
}
.nb-image-empty:focus { outline: 1px solid var(--accent); }
.nb-image-pick { text-align: left; }

/* ── Sketch ── */
.nb-sketch { border: 1px solid var(--border); border-radius: 10px; overflow: hidden; margin: 0.3rem 0; }
.nb-sketch-tools {
  display: flex; align-items: center; flex-wrap: wrap; gap: 4px; padding: 4px 8px;
  border-bottom: 1px solid var(--border); background: var(--surface2);
}
.nb-ink { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.nb-ink.on { border-color: var(--text); }
.nb-weight, .nb-tool {
  background: none; border: 1px solid transparent; border-radius: 6px; color: var(--text2);
  cursor: pointer; font-size: 0.875rem; padding: 3px 6px; display: inline-flex; align-items: center; justify-content: center;
}
.nb-weight:hover, .nb-tool:hover { color: var(--text); background: var(--surface3); }
.nb-weight.on, .nb-tool.on { background: var(--accent-active); border-color: var(--accent-edge); color: var(--accent-active-text); }
.nb-tool-gap { width: 10px; }
.nb-sketch-canvas { display: block; width: 100%; background: var(--bg); }
.nb-sketch-resize {
  display: flex; justify-content: center; cursor: ns-resize; color: var(--muted);
  padding: 2px; user-select: none; touch-action: none;
}

/* ── Pickers ── */
.nb-picker {
  position: absolute; z-index: 30; min-width: 260px; max-width: 340px;
  background: var(--surface); border: 1px solid var(--border2);
  border-radius: 8px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden;
}
.nb-picker-empty { padding: 0.5rem 0.8rem; font-size: 0.8125rem; color: var(--muted); }
.nb-picker-row {
  display: flex; align-items: center; gap: 0.55rem; width: 100%;
  background: none; border: none; color: inherit; cursor: pointer; font: inherit;
  font-size: 0.875rem; padding: 0.35rem 0.6rem; text-align: left;
}
.nb-picker-row.on { background: var(--surface3); }
.nb-picker-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-picker-kind { font-size: 0.75rem; color: var(--muted); }
.nb-picker-search {
  width: 100%; box-sizing: border-box; background: var(--bg);
  border: 1px solid var(--border2); border-radius: 8px; color: inherit;
  font: inherit; font-size: 0.875rem; padding: 0.35rem 0.6rem; margin-bottom: 0.3rem;
}
.nb-thumb {
  width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
}
.nb-mono {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface3); color: var(--text2); font-size: 0.75rem; font-weight: 600;
}
.nb-slash {
  position: absolute; z-index: 30; background: var(--surface);
  border: 1px solid var(--border2); border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5); min-width: 280px; overflow: hidden;
}
.nb-slash-row {
  display: flex; align-items: center; gap: 0.6rem; width: 100%; background: none;
  border: none; color: inherit; cursor: pointer; font: inherit; font-size: 0.875rem;
  padding: 0.4rem 0.7rem; text-align: left;
}
.nb-slash-row:hover { background: var(--surface3); }
.nb-slash-icon { width: 1.4em; display: inline-flex; justify-content: center; color: var(--muted); }

/* ── Mentions in text (edit mode shows raw token; these style read mode) ── */
.nb-mention { color: var(--accent-text); cursor: pointer; font-weight: 600; }
.nb-pagelink { color: var(--accent-text); cursor: pointer; text-decoration: underline dotted; }
.nb-code { background: var(--surface2); border-radius: 4px; padding: 0 4px; font-family: var(--font-mono); font-size: 0.85em; }

/* ── Margin rail ── */
.nb-rail { position: relative; border-left: 1px solid var(--border); padding-left: 0.8rem; min-width: 0; }
.nb-rail-add { margin-bottom: 0.4rem; }
.nb-rail-adder { position: relative; margin-bottom: 0.5rem; }
.nb-rail-adder .nb-picker { position: static; }
.nb-rail-pins { position: relative; min-height: 400px; }
.nb-rail-slot { position: absolute; left: 0; right: 0; transition: top 0.2s; }
.nb-pin {
  position: relative; border: 1px solid var(--border); border-radius: 8px;
  background: var(--surface); padding: 0.45rem 1.6rem 0.45rem 0.55rem; margin-bottom: 0.4rem;
  font-size: 0.8125rem;
}
/* Legacy suggestion pins (kind "ai") keep their own tint, so they never pass for the DM's writing. */
.nb-pin-ai {
  background: rgba(143, 134, 201, 0.10); border-color: rgba(143, 134, 201, 0.45);
}
.nb-pin-x {
  position: absolute; top: 3px; right: 3px; background: none; border: none; border-radius: 4px;
  color: var(--muted); cursor: pointer; padding: 3px; display: inline-flex;
}
.nb-pin-x:hover { color: var(--danger-text); }
.nb-pin-entity { display: flex; align-items: center; gap: 0.5rem; color: inherit; text-decoration: none; }
.nb-pin-entity:hover { color: inherit; text-decoration: none; }
.nb-pin-face { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0; font-size: 0.75rem; }
.nb-pin-name {
  flex: 1; min-width: 0; font-family: var(--font-story); font-weight: 700; font-size: 0.9375rem; color: var(--text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nb-pin-kind { font-size: 0.75rem; color: var(--muted); }
.nb-pin-image { max-width: 100%; border-radius: 6px; display: block; }
.nb-pin-note { font-style: italic; }
.nb-pin-ai-text { line-height: 1.45; }
.nb-pin-provenance {
  display: flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;
  margin-top: 0.35rem; font-size: 0.75rem; color: rgba(180, 172, 224, 0.85);
  border-top: 1px dotted rgba(143, 134, 201, 0.4); padding-top: 0.25rem;
}
.nb-pin-mini {
  display: inline-flex; background: var(--surface); border: 1px solid var(--border2);
  border-radius: 50%; cursor: pointer; padding: 0; overflow: hidden; width: 30px; height: 30px;
  align-items: center; justify-content: center; margin: 2px; color: var(--text2);
}
.nb-pin-mini-img { width: 100%; height: 100%; object-fit: cover; }
.nb-pin-mini-mono { font-size: 0.75rem; display: inline-flex; }
.nb-pin-collapse {
  background: none; border: none; color: var(--muted); cursor: pointer;
  font-size: 0.75rem; padding: 2px 0 0;
}

/* Phone-only pieces (rendered only below 640 px). */
.nb-phonebar { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.nb-phonebar-where { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.875rem; }
.nb-count {
  min-width: 1.4em; padding: 0 0.35em; border-radius: 999px; background: var(--surface3);
  color: var(--text); font-size: 0.75rem; text-align: center;
}
.nb-sheet .nb-side-head:first-child { margin-top: 0; }
.nb-sheet-pins { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }
.nb-sheet-pins .nb-pin { margin-bottom: 0; }

/* ── Read mode ── */
.nb-read-overlay {
  position: fixed; inset: 0; z-index: 300; overflow-y: auto;
  background: var(--bg); color: var(--text);
}
.nbr-chrome {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 0.7rem;
  padding: 0.55rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border);
}
.nbr-chrome-title { font-family: var(--font-story); font-weight: 700; }
.nbr-page {
  max-width: 46rem; margin: 0 auto; padding: 1.4rem 1.2rem 5rem;
  font-size: 1.02rem; line-height: 1.65;
}
.nbr-title { font-family: var(--font-story); font-weight: 700; font-size: 2rem; margin: 0 0 1rem; }
.nbr-row { position: relative; }
.nbr-row-pins { position: absolute; top: 0; right: -44px; display: flex; flex-direction: column; }
.nbr-text { margin: 0.55rem 0; }
.nbr-badge {
  display: flex; align-items: center; gap: 0.35rem; margin-bottom: 0.25rem;
  font-family: var(--font-ui); font-style: normal; font-size: 0.75rem; font-weight: 600; color: var(--muted);
}
.nbr-verbatim {
  margin: 0.8rem 0; padding: 0.75rem 1rem; border: 1px solid var(--story-line); border-radius: 10px;
  background: var(--story-bg); color: var(--story-text);
  font-family: var(--font-story); font-style: italic; font-size: 1.15rem; line-height: 1.55;
}
.nbr-prompt { margin: 0.8rem 0; font-weight: 700; font-size: 1.05rem; color: var(--text); }
.nbr-prompt .nbr-badge { font-weight: 600; }
.nbr-key { margin: 0.5rem 0; color: var(--muted); font-size: 0.875rem; }
.nbr-card {
  border: 1px solid var(--border); border-radius: 10px; background: var(--surface);
  padding: 0.8rem 1.1rem; margin: 0.8rem 0;
}
.nbr-card-title { font-family: var(--font-story); font-weight: 700; font-size: 1.15rem; margin-bottom: 0.35rem; }
.nbr-card ul { margin: 0; padding-left: 1.2rem; }
.nbr-sticky-card { position: sticky; top: 3rem; z-index: 1; margin-bottom: 1rem; }
.nbr-sticky-card .nbr-card { box-shadow: 0 8px 24px rgba(0,0,0,0.5); background: var(--surface2); }
.nbr-image { margin: 1rem 0; }
.nbr-image img { max-width: 100%; border-radius: 8px; }
.nbr-image figcaption { font-size: 0.8125rem; color: var(--muted); font-style: italic; margin-top: 0.25rem; }
.nbr-divider { border: none; border-top: 1px dashed var(--border2); margin: 1.4rem 0; }

/* ── Phones (Plan 123): one column, thumb-sized controls ── */
@media (max-width: 640px) {
  .nb-root { grid-template-columns: minmax(0, 1fr); gap: 0.75rem; min-height: 0; }
  /* The hover gutter becomes the focused block's toolbar (NotebookPage). */
  .nb-block-gutter { display: none; }
  .nb-block.nb-active > .nb-block-body { box-shadow: -8px 0 0 -6px var(--accent-line); }
  .nb-title { flex-basis: 100%; min-width: 0; font-size: 1.5rem; }
  .nb-toolbar { gap: 0.5rem; }
  .nb-ghost { min-height: 44px; padding: 0.4rem 0.8rem; font-size: 0.875rem; }
  .nb-block-tools .nb-ghost { min-width: 44px; justify-content: center; }
  .nb-nb, .nb-pg { min-height: 44px; display: flex; align-items: center; font-size: 1rem; }
  .nb-hit { padding: 0.7rem 0.2rem; }
  .nb-search, .nb-picker-search { font-size: 16px; min-height: 44px; }
  .nb-picker-row, .nb-slash-row { min-height: 44px; font-size: 0.9375rem; }
  .nb-picker, .nb-slash { left: 0; right: 0; min-width: 0; max-width: none; }
  .nb-sketch-tools { gap: 6px; padding: 6px 8px; }
  .nb-ink { width: 30px; height: 30px; margin: 5px 2px; }
  .nb-weight, .nb-tool { min-width: 40px; min-height: 40px; }
  .nb-tool-gap { width: 2px; }
  .nb-sketch-resize { padding: 10px; }
  .nb-image-clear { min-width: 40px; min-height: 40px; }
  .nb-pin { font-size: 0.9375rem; padding: 0.6rem 2.75rem 0.6rem 0.7rem; }
  .nb-pin-x { top: 0; right: 0; width: 44px; height: 44px; justify-content: center; align-items: center; }
  .nb-pin-collapse { min-height: 36px; }
  .nb-pin-mini { width: 40px; height: 40px; }
  .nbr-chrome { flex-wrap: wrap; gap: 0.5rem; padding: 0.5rem 0.75rem; }
  .nbr-chrome-title, .nbr-chrome > span:empty { display: none; }
  .nbr-page { padding: 1rem 16px 5rem; }
  .nbr-title { font-size: 1.6rem; }
  .nbr-sticky-card { position: static; }
  /* Pins sit under their block instead of in a margin the phone doesn't have. */
  .nbr-row-pins { position: static; flex-direction: row; flex-wrap: wrap; margin: -0.25rem 0 0.5rem; }
}

/* ── Print: read mode IS the paper fallback ── */
@media print {
  body > #root { display: none !important; }
  .nb-read-overlay { position: static; overflow: visible; background: #fff; color: #111; }
  .nbr-chrome { display: none; }
  .nbr-page { max-width: 100%; padding: 0; font-size: 11pt; line-height: 1.5; }
  .nbr-title { font-size: 20pt; }
  .nbr-sticky-card { position: static; }
  .nbr-sticky-card .nbr-card { box-shadow: none; }
  .nbr-card { background: #fff; border-color: #999; break-inside: avoid; }
  .nbr-verbatim { background: #f5eede; border-color: #a97b23; color: #222; break-inside: avoid; }
  .nbr-prompt { color: #1d4a7a; }
  .nbr-key { color: #666; }
  .nbr-badge { color: #666; }
  .nbr-row-pins { display: none; }
  .nb-sketch { border-color: #999; break-inside: avoid; }
  .nb-sketch-canvas { background: #fff; }
  .nb-sketch-canvas path { stroke: #222 !important; }
  .nbr-divider { border-top-color: #999; }
  .nb-mention { color: #7a5210; }
  .nb-pagelink { color: #1d4a7a; }
}
`;
