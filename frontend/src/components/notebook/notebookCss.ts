/**
 * Notebook stylesheet (Plan 57). One string, injected by the page —
 * includes the print stylesheet that makes read mode the paper fallback:
 * printing hides the whole app (#root) and prints ONLY the read overlay,
 * which ReadMode portals directly under <body>.
 */
export const NOTEBOOK_CSS = `
.nb-root {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr) 250px;
  gap: 1rem;
  min-height: 70vh;
}
.nb-dim { color: var(--muted, #8b8b95); }
.nb-pad { padding: 1rem; }
.nb-ghost {
  background: none; border: 1px solid var(--border, #2a2a33); border-radius: 4px;
  color: inherit; cursor: pointer; font: inherit; font-size: 0.78rem;
  padding: 0.2rem 0.55rem;
}
.nb-ghost:hover { border-color: var(--gold, #e0a94d); }
.nb-ghost:disabled { opacity: 0.45; cursor: default; }
.nb-ghost.nb-on { border-color: var(--gold, #e0a94d); color: var(--gold, #e0a94d); }

/* ── Sidebar ── */
.nb-sidebar { border-right: 1px solid var(--border, #2a2a33); padding-right: 0.8rem; }
.nb-side-head {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--muted, #8b8b95); margin: 0.9rem 0 0.4rem;
}
.nb-search {
  width: 100%; box-sizing: border-box; background: var(--surface, #14141a);
  border: 1px solid var(--border, #2a2a33); border-radius: 4px; color: inherit;
  font: inherit; font-size: 0.82rem; padding: 0.35rem 0.5rem; margin-bottom: 0.4rem;
}
.nb-nblist, .nb-pagelist { display: flex; flex-direction: column; gap: 2px; }
.nb-nb, .nb-pg {
  background: none; border: none; color: inherit; cursor: pointer; font: inherit;
  font-size: 0.85rem; text-align: left; padding: 0.28rem 0.45rem; border-radius: 4px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nb-nb:hover, .nb-pg:hover { background: var(--surface, #14141a); }
.nb-nb.on { color: var(--gold, #e0a94d); }
.nb-pg.on { background: var(--surface, #14141a); color: var(--gold, #e0a94d); }
.nb-hit {
  display: block; width: 100%; background: none; border: none; border-bottom: 1px solid var(--border, #2a2a33);
  color: inherit; cursor: pointer; font: inherit; text-align: left; padding: 0.45rem 0.2rem;
}
.nb-hit:hover { background: var(--surface, #14141a); }
.nb-hit-title { font-size: 0.84rem; }
.nb-hit-snippet { font-size: 0.74rem; color: var(--muted, #8b8b95); margin-top: 2px; }

/* ── Editor ── */
.nb-main { min-width: 0; }
.nb-toolbar { display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.8rem; flex-wrap: wrap; }
.nb-title {
  flex: 1; min-width: 200px; background: none; border: none; border-bottom: 1px solid transparent;
  color: inherit; font: inherit; font-size: 1.45rem; font-weight: 600; padding: 0.1rem 0;
}
.nb-title:focus { outline: none; border-bottom-color: var(--gold, #e0a94d); }
.nb-saved { font-size: 0.72rem; color: var(--muted, #8b8b95); white-space: nowrap; }
.nb-saved-error { color: #d9836f; }
.nb-editor { position: relative; }
.nb-block { display: flex; gap: 0.35rem; position: relative; }
.nb-block-gutter {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  opacity: 0; transition: opacity 0.15s; padding-top: 0.4rem; width: 22px; flex-shrink: 0;
}
.nb-block:hover .nb-block-gutter { opacity: 1; }
.nb-drag { cursor: grab; color: var(--muted, #8b8b95); font-size: 0.7rem; user-select: none; }
.nb-gutter-btn {
  background: none; border: none; color: var(--muted, #8b8b95); cursor: pointer;
  font-size: 0.7rem; padding: 1px 3px; border-radius: 3px;
}
.nb-gutter-btn:hover { color: var(--gold, #e0a94d); }
.nb-block-body { flex: 1; min-width: 0; position: relative; }

.nb-ta {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none;
  color: inherit; font: inherit; line-height: 1.6; resize: none; overflow: hidden;
  padding: 0.3rem 0.2rem;
}
.nb-ta:focus { outline: none; }
.nb-verbatim {
  border-left: 3px solid var(--gold, #e0a94d); padding-left: 0.8rem;
  background: rgba(224, 169, 77, 0.06); font-style: italic;
}
.nb-prompt { font-weight: 600; color: #b9cfe8; }
.nb-key { color: var(--muted, #8b8b95); font-size: 0.84rem; }
.nb-divider { border: none; border-top: 1px dashed var(--border, #2a2a33); margin: 1rem 0; }

.nb-card-block {
  border: 1px solid var(--border, #2a2a33); border-radius: 6px;
  background: var(--surface, #14141a); padding: 0.7rem 0.9rem; margin: 0.3rem 0;
}
.nb-card-title {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none;
  color: inherit; font: inherit; font-weight: 700; margin-bottom: 0.3rem;
}
.nb-card-title:focus, .nb-card-beat:focus { outline: none; }
.nb-card-beat {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none;
  border-top: 1px dotted var(--border, #2a2a33); color: inherit; font: inherit;
  font-size: 0.88rem; padding: 0.22rem 0;
}

.nb-image { margin: 0.4rem 0; position: relative; }
.nb-image img { max-width: 100%; border-radius: 6px; display: block; }
.nb-image-caption {
  display: block; width: 100%; box-sizing: border-box; background: none; border: none;
  color: var(--muted, #8b8b95); font: inherit; font-size: 0.78rem; font-style: italic;
  padding: 0.2rem 0;
}
.nb-image-clear { position: absolute; top: 6px; right: 6px; }
.nb-image-empty {
  border: 1px dashed var(--border, #2a2a33); border-radius: 6px; padding: 1rem;
  text-align: center; font-size: 0.85rem;
}
.nb-image-empty:focus { outline: 1px solid var(--gold, #e0a94d); }
.nb-image-pick { text-align: left; }

/* ── Sketch ── */
.nb-sketch { border: 1px solid var(--border, #2a2a33); border-radius: 6px; overflow: hidden; margin: 0.3rem 0; }
.nb-sketch-tools {
  display: flex; align-items: center; gap: 4px; padding: 4px 8px;
  border-bottom: 1px solid var(--border, #2a2a33); background: var(--surface, #14141a);
}
.nb-ink { width: 18px; height: 18px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; padding: 0; }
.nb-ink.on { border-color: #fff; }
.nb-weight, .nb-tool {
  background: none; border: 1px solid transparent; border-radius: 4px; color: inherit;
  cursor: pointer; font-size: 0.85rem; padding: 2px 6px; display: inline-flex; align-items: center;
}
.nb-weight.on, .nb-tool.on { border-color: var(--gold, #e0a94d); color: var(--gold, #e0a94d); }
.nb-tool-gap { width: 10px; }
.nb-sketch-canvas { display: block; width: 100%; background: #0d0d13; }
.nb-sketch-resize {
  text-align: center; cursor: ns-resize; color: var(--muted, #8b8b95);
  font-size: 0.6rem; line-height: 1; padding: 2px; user-select: none;
}

/* ── Pickers ── */
.nb-picker {
  position: absolute; z-index: 30; min-width: 260px; max-width: 340px;
  background: var(--surface, #16161d); border: 1px solid var(--border, #2a2a33);
  border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); overflow: hidden;
}
.nb-picker-empty { padding: 0.5rem 0.8rem; font-size: 0.78rem; color: var(--muted, #8b8b95); }
.nb-picker-row {
  display: flex; align-items: center; gap: 0.55rem; width: 100%;
  background: none; border: none; color: inherit; cursor: pointer; font: inherit;
  font-size: 0.85rem; padding: 0.35rem 0.6rem; text-align: left;
}
.nb-picker-row.on { background: rgba(224, 169, 77, 0.12); }
.nb-picker-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-picker-kind { font-size: 0.68rem; color: var(--muted, #8b8b95); text-transform: uppercase; }
.nb-picker-search {
  width: 100%; box-sizing: border-box; background: var(--surface, #14141a);
  border: 1px solid var(--border, #2a2a33); border-radius: 4px; color: inherit;
  font: inherit; font-size: 0.82rem; padding: 0.35rem 0.5rem; margin-bottom: 0.3rem;
}
.nb-thumb {
  width: 26px; height: 26px; border-radius: 50%; object-fit: cover; flex-shrink: 0;
}
.nb-mono {
  display: inline-flex; align-items: center; justify-content: center;
  background: #2c2c38; color: #cfcfda; font-size: 0.62rem; font-weight: 700;
}
.nb-slash {
  position: absolute; z-index: 30; background: var(--surface, #16161d);
  border: 1px solid var(--border, #2a2a33); border-radius: 6px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5); min-width: 280px;
}
.nb-slash-row {
  display: flex; align-items: center; gap: 0.6rem; width: 100%; background: none;
  border: none; color: inherit; cursor: pointer; font: inherit; font-size: 0.85rem;
  padding: 0.4rem 0.7rem; text-align: left;
}
.nb-slash-row:hover { background: rgba(224, 169, 77, 0.12); }
.nb-slash-icon { width: 1.4em; text-align: center; }

/* ── Mentions in text (edit mode shows raw token; these style read mode) ── */
.nb-mention { color: var(--gold, #e0a94d); cursor: pointer; font-weight: 600; }
.nb-pagelink { color: #9fc4d4; cursor: pointer; text-decoration: underline dotted; }
.nb-code { background: #26262e; border-radius: 3px; padding: 0 4px; font-size: 0.85em; }

/* ── Margin rail ── */
.nb-rail { position: relative; border-left: 1px solid var(--border, #2a2a33); padding-left: 0.8rem; }
.nb-ai-controls { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.5rem; }
.nb-ask-input {
  width: 100%; box-sizing: border-box; background: var(--surface, #14141a);
  border: 1px solid var(--border, #2a2a33); border-radius: 4px; color: inherit;
  font: inherit; font-size: 0.78rem; padding: 0.3rem 0.5rem;
}
.nb-rail-add { margin-bottom: 0.4rem; }
.nb-rail-adder { position: relative; margin-bottom: 0.5rem; }
.nb-rail-adder .nb-picker { position: static; }
.nb-rail-pins { position: relative; min-height: 400px; }
.nb-rail-slot { position: absolute; left: 0; right: 0; transition: top 0.2s; }
.nb-pin {
  position: relative; border: 1px solid var(--border, #2a2a33); border-radius: 6px;
  background: var(--surface, #14141a); padding: 0.45rem 0.55rem; margin-bottom: 0.4rem;
  font-size: 0.78rem;
}
.nb-pin-ai {
  background: rgba(143, 134, 201, 0.10); border-color: rgba(143, 134, 201, 0.45);
}
.nb-pin-x {
  position: absolute; top: 2px; right: 4px; background: none; border: none;
  color: var(--muted, #8b8b95); cursor: pointer; font-size: 0.65rem; padding: 2px;
}
.nb-pin-x:hover { color: #d9836f; }
.nb-pin-entity { display: flex; align-items: center; gap: 0.5rem; color: inherit; text-decoration: none; }
.nb-pin-face { width: 34px; height: 34px; border-radius: 50%; object-fit: cover; flex-shrink: 0; font-size: 0.7rem; }
.nb-pin-name { flex: 1; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-pin-kind { font-size: 0.62rem; color: var(--muted, #8b8b95); text-transform: uppercase; }
.nb-pin-image { max-width: 100%; border-radius: 4px; display: block; }
.nb-pin-note { font-style: italic; }
.nb-pin-ai-text { line-height: 1.45; }
.nb-pin-provenance {
  margin-top: 0.35rem; font-size: 0.62rem; color: rgba(180, 172, 224, 0.8);
  border-top: 1px dotted rgba(143, 134, 201, 0.4); padding-top: 0.25rem;
}
.nb-pin-mini {
  display: inline-flex; background: none; border: 1px solid var(--border, #2a2a33);
  border-radius: 50%; cursor: pointer; padding: 0; overflow: hidden; width: 30px; height: 30px;
  align-items: center; justify-content: center; margin: 2px;
}
.nb-pin-mini-img { width: 100%; height: 100%; object-fit: cover; }
.nb-pin-mini-mono { font-size: 0.7rem; }
.nb-pin-collapse {
  background: none; border: none; color: var(--muted, #8b8b95); cursor: pointer;
  font-size: 0.65rem; padding: 2px 0 0;
}

/* ── Read mode ── */
.nb-read-overlay {
  position: fixed; inset: 0; z-index: 300; overflow-y: auto;
  background: #101014; color: #e8e6df;
}
.nbr-chrome {
  position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 0.7rem;
  padding: 0.55rem 1rem; background: #16161d; border-bottom: 1px solid #2a2a33;
}
.nbr-chrome-title { font-weight: 600; }
.nbr-page {
  max-width: 46rem; margin: 0 auto; padding: 1.4rem 1.2rem 5rem;
  font-size: 1.02rem; line-height: 1.65;
}
.nbr-title { font-size: 1.9rem; margin: 0 0 1rem; }
.nbr-row { position: relative; }
.nbr-row-pins { position: absolute; top: 0; right: -44px; display: flex; flex-direction: column; }
.nbr-text { margin: 0.55rem 0; }
.nbr-badge {
  display: inline-block; font-size: 0.62rem; letter-spacing: 0.14em; font-weight: 700;
  margin-right: 0.5rem; opacity: 0.75; vertical-align: 0.12em;
}
.nbr-verbatim {
  margin: 0.8rem 0; padding: 0.7rem 1rem; border-left: 4px solid #e0a94d;
  background: rgba(224, 169, 77, 0.07); font-style: italic; font-size: 1.06rem;
}
.nbr-prompt { margin: 0.8rem 0; font-weight: 700; font-size: 1.05rem; color: #b9cfe8; }
.nbr-key { margin: 0.5rem 0; color: #8b8b95; font-size: 0.85rem; }
.nbr-card {
  border: 1px solid #2a2a33; border-radius: 8px; background: #16161d;
  padding: 0.8rem 1.1rem; margin: 0.8rem 0;
}
.nbr-card-title { font-weight: 700; margin-bottom: 0.35rem; }
.nbr-card ul { margin: 0; padding-left: 1.2rem; }
.nbr-sticky-card { position: sticky; top: 3rem; z-index: 1; margin-bottom: 1rem; }
.nbr-sticky-card .nbr-card { box-shadow: 0 8px 24px rgba(0,0,0,0.5); background: #1a1a22; }
.nbr-image { margin: 1rem 0; }
.nbr-image img { max-width: 100%; border-radius: 6px; }
.nbr-image figcaption { font-size: 0.78rem; color: #8b8b95; font-style: italic; margin-top: 0.25rem; }
.nbr-divider { border: none; border-top: 1px dashed #2a2a33; margin: 1.4rem 0; }

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
  .nbr-verbatim { background: #f5eede; border-left-color: #a97b23; color: #222; break-inside: avoid; }
  .nbr-prompt { color: #1d4a7a; }
  .nbr-key { color: #666; }
  .nbr-row-pins { display: none; }
  .nb-sketch { border-color: #999; break-inside: avoid; }
  .nb-sketch-canvas { background: #fff; }
  .nb-sketch-canvas path { stroke: #222 !important; }
  .nbr-divider { border-top-color: #999; }
  .nb-mention { color: #7a5210; }
  .nb-pagelink { color: #1d4a7a; }
}
`;
