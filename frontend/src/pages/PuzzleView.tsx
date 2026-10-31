import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { GLYPH_SHAPES, puzzlesApi, type PuzzleProjection } from "../api/puzzles";
import { useEventStream } from "../hooks/useEventStream";

/**
 * PuzzleView — the player-facing puzzle display (Plan 55), /puzzle/:puzzleId.
 *
 * A capability URL like the Table View: no login, no answers in the
 * payload. Big enough for a projector, legible on a phone. Updates live
 * over SSE as the DM (or the table, if enabled) assigns letters.
 * Lamplit tokens and thumb-sized letter keys: Plan 123.
 */

const CSS = `
.pz-root {
  min-height: 100vh; min-height: 100dvh; color: var(--text);
  background: var(--bg);
  font-family: var(--font-ui);
  display: flex; flex-direction: column; align-items: center;
  padding: 2.5rem 1rem 3rem;
}
.pz-title {
  font-family: var(--font-story); font-weight: 700; letter-spacing: 0;
  font-size: clamp(1.6rem, 3.4vw, 2.4rem); color: var(--text); margin: 0 0 1.6rem;
  text-align: center; line-height: 1.2;
}
.pz-glyphs {
  display: flex; flex-wrap: wrap; gap: clamp(6px, 1.2vw, 16px);
  justify-content: center; max-width: 1200px;
}
.pz-cell {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  background: none; border: none; padding: 4px 2px; font: inherit; color: inherit; border-radius: 8px;
}
button.pz-cell { cursor: pointer; }
.pz-cell.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-line); }
.pz-glyph {
  font-size: clamp(2rem, 5vw, 3.6rem); line-height: 1; color: var(--text2);
  width: clamp(2.6rem, 6vw, 4.4rem); text-align: center;
  transition: color 0.4s ease;
}
.pz-solved .pz-glyph { color: var(--accent-text); }
.pz-letter {
  font-family: var(--font-story); font-size: clamp(1.3rem, 3vw, 2.2rem);
  color: var(--text); border-bottom: 2px solid var(--border2);
  width: clamp(2.2rem, 5vw, 3.6rem); text-align: center; min-height: 1.4em;
}
.pz-cell.sel .pz-letter { border-bottom-color: var(--accent); }
.pz-letter.blank { color: var(--muted); opacity: 0.6; }
.pz-hum { animation: pz-hum 1.1s ease-in-out; }
@keyframes pz-hum {
  0%, 100% { filter: none; transform: none; }
  30% { filter: blur(1.4px) brightness(1.15); transform: translateX(-2px); }
  60% { filter: blur(1.1px); transform: translateX(2px); }
}
.pz-resolved {
  margin-top: 2.4rem; font-family: var(--font-story); font-weight: 700; text-align: center;
  font-size: clamp(1.6rem, 4vw, 2.8rem); letter-spacing: 0.04em; color: var(--accent-text);
  animation: pz-fade 2.6s ease;
}
@keyframes pz-fade { from { opacity: 0; } to { opacity: 1; } }
.pz-cipher {
  max-width: 900px; font-family: var(--font-mono);
  font-size: clamp(0.95rem, 1.9vw, 1.35rem); line-height: 2.1; white-space: pre-wrap;
  word-break: break-word; text-align: center; color: var(--text);
}
.pz-ch { padding: 0 1px; }
.pz-ch.warded { animation: pz-swim 3.4s ease-in-out infinite; color: var(--muted); }
@keyframes pz-swim {
  0%, 100% { transform: translateY(0) skewX(0deg); opacity: 0.72; }
  25% { transform: translateY(-2px) skewX(6deg); opacity: 0.5; }
  50% { transform: translateY(1px) skewX(-5deg); opacity: 0.85; }
  75% { transform: translateY(2px) skewX(3deg); opacity: 0.6; }
}
.pz-ch.locked { color: var(--teal-text); }
.pz-ch.sel { background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent-edge); border-radius: 3px; }
.pz-intro {
  font-family: var(--font-story); color: var(--story-text); font-style: italic; font-size: 1.15rem;
  margin-bottom: 1.4rem; text-align: center; max-width: 640px;
}
.pz-note { color: var(--muted); font-size: 0.875rem; margin-top: 1.6rem; text-align: center; }
.pz-picker { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 1.2rem auto 0; max-width: 640px; }
.pz-key {
  background: var(--surface2); border: 1px solid var(--border2);
  color: var(--text); border-radius: 8px; padding: 6px 11px; font-family: var(--font-ui);
  font-size: 1rem; cursor: pointer; min-width: 40px; min-height: 40px;
}
.pz-key:hover { border-color: var(--accent-edge); color: var(--text); }
.pz-key.wide { padding: 6px 16px; color: var(--text2); }
.pz-wait { color: var(--muted); margin-top: 25vh; font-family: var(--font-story); font-style: italic; font-size: 1.2rem; }
@media (max-width: 640px) {
  .pz-root { padding: 1.5rem 12px 6rem; }
  .pz-title { margin-bottom: 1.2rem; }
  /* Thumb-sized letter keys: seven to a row at 390 px. */
  .pz-key { min-width: 44px; min-height: 44px; font-size: 1.05rem; }
  /* The picker rides the bottom of the screen, so a tap far down a long page still reaches it. */
  .pz-picker {
    position: sticky; bottom: 0; z-index: 2; width: 100%; max-width: none;
    background: var(--bg); border-top: 1px solid var(--border);
    padding: 10px 0 calc(10px + env(safe-area-inset-bottom, 0px));
  }
}
@media (prefers-reduced-motion: reduce) {
  .pz-ch.warded, .pz-hum { animation: none; }
}
`;

function GlyphBoard({ p, onAssign }: { p: PuzzleProjection; onAssign: (g: string, l: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const line = p.tokens.map((t) => p.assignments[t] ?? "");
  const resolved = line.every(Boolean) ? line.join("") : null;

  return (
    <div className={p.solved ? "pz-solved" : ""}>
      <div className={`pz-glyphs ${p.hum > 0 ? "pz-hum" : ""}`} key={`hum-${p.hum}`}>
        {p.tokens.map((t, i) => (
          p.allow_player_input ? (
            <button
              type="button"
              className={`pz-cell${sel === t ? " sel" : ""}`}
              key={i}
              aria-label={`Mark ${i + 1}${p.assignments[t] ? `, reads ${p.assignments[t]}` : ", blank"}`}
              aria-pressed={sel === t}
              onClick={() => setSel(sel === t ? null : t)}
            >
              <span className="pz-glyph">{GLYPH_SHAPES[t] ?? "?"}</span>
              <span className={`pz-letter ${p.assignments[t] ? "" : "blank"}`}>
                {p.assignments[t] ?? "_"}
              </span>
            </button>
          ) : (
            <div className="pz-cell" key={i}>
              <span className="pz-glyph">{GLYPH_SHAPES[t] ?? "?"}</span>
              <span className={`pz-letter ${p.assignments[t] ? "" : "blank"}`}>
                {p.assignments[t] ?? "_"}
              </span>
            </div>
          )
        ))}
      </div>

      {p.allow_player_input && sel && (
        <div className="pz-picker">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) => (
            <button key={L} className="pz-key" onClick={() => { onAssign(sel, L); setSel(null); }}>
              {L}
            </button>
          ))}
          <button className="pz-key wide" onClick={() => { onAssign(sel, ""); setSel(null); }}>
            Clear
          </button>
        </div>
      )}

      {resolved && p.solved && (
        <div className="pz-resolved">{resolved.replace(/(.{4})(.{4})(.*)/, "$1 $2, $3")}</div>
      )}
    </div>
  );
}

function CipherPage({
  p,
  onDecode,
}: {
  p: PuzzleProjection;
  onDecode: (i: number, l: string) => void;
}) {
  const [sel, setSel] = useState<number | null>(null);
  const warded = p.phase === "warded";
  return (
    <div>
      {p.intro && <div className="pz-intro">{p.intro}</div>}
      <div className="pz-cipher">
        {p.ciphertext.split("").map((ch, i) => {
          const locked = p.locked[String(i)];
          const cls = locked ? "locked" : warded ? "warded" : "";
          return (
            <span
              key={i}
              className={`pz-ch ${cls} ${sel === i ? "sel" : ""}`}
              style={{
                animationDelay: warded ? `${(i % 7) * 0.21}s` : undefined,
                cursor: !warded && !locked && ch.trim() ? "pointer" : "default",
              }}
              onClick={() => !warded && !locked && ch.trim() && setSel(sel === i ? null : i)}
            >
              {locked ?? ch}
            </span>
          );
        })}
      </div>
      {sel !== null && (
        <div className="pz-picker">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) => (
            <button key={L} className="pz-key" onClick={() => { onDecode(sel, L); setSel(null); }}>
              {L}
            </button>
          ))}
        </div>
      )}
      <div className="pz-note">
        {warded
          ? "The marks will not hold still. The page wants a word."
          : "Tap a letter, then choose what it becomes. Correct letters lock."}
      </div>
    </div>
  );
}

export default function PuzzleView() {
  const { puzzleId } = useParams<{ puzzleId: string }>();
  const qc = useQueryClient();
  const key = ["puzzle", puzzleId];
  const { data: p } = useQuery({
    queryKey: key,
    queryFn: () => puzzlesApi.projection(puzzleId as string),
    enabled: !!puzzleId,
    refetchInterval: 15000,
  });

  useEventStream("puzzle", puzzleId, () => {
    void qc.invalidateQueries({ queryKey: key });
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  if (!p) {
    return (
      <div className="pz-root">
        <style>{CSS}</style>
        <div className="pz-wait">The page is turning…</div>
      </div>
    );
  }

  return (
    <div className="pz-root">
      <style>{CSS}</style>
      <h1 className="pz-title">{p.title}</h1>
      {p.kind === "glyph" ? (
        <GlyphBoard
          p={p}
          onAssign={async (g, l) => {
            await puzzlesApi.assign(p.id, g, l).catch(() => undefined);
            refresh();
          }}
        />
      ) : (
        <CipherPage
          p={p}
          onDecode={async (i, l) => {
            await puzzlesApi.decode(p.id, i, l).catch(() => undefined);
            refresh();
          }}
        />
      )}
    </div>
  );
}
