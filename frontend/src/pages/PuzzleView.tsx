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
 */

const CSS = `
.pz-root {
  min-height: 100vh; color: #e6ddc8;
  background: radial-gradient(ellipse at 50% -10%, #1b1730 0%, #0b0a14 55%, #05050a 100%);
  font-family: Georgia, 'Times New Roman', serif;
  display: flex; flex-direction: column; align-items: center;
  padding: 2.5rem 1rem 3rem;
}
.pz-title {
  font-family: Cinzel, Georgia, serif; letter-spacing: 0.16em;
  font-size: clamp(1.1rem, 2.6vw, 1.7rem); color: #d6c390; margin: 0 0 1.6rem;
  text-transform: uppercase;
}
.pz-glyphs {
  display: flex; flex-wrap: wrap; gap: clamp(6px, 1.2vw, 16px);
  justify-content: center; max-width: 1200px;
}
.pz-cell { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.pz-glyph {
  font-size: clamp(2rem, 5vw, 3.6rem); line-height: 1; color: #cfc4a9;
  width: clamp(2.6rem, 6vw, 4.4rem); text-align: center;
  transition: color 0.4s ease, text-shadow 0.4s ease;
}
.pz-solved .pz-glyph { color: #f0e6c8; text-shadow: 0 0 18px rgba(214,175,54,0.75); }
.pz-letter {
  font-family: Cinzel, Georgia, serif; font-size: clamp(1.3rem, 3vw, 2.2rem);
  color: #f0e6c8; border-bottom: 2px solid rgba(240,230,200,0.35);
  width: clamp(2.2rem, 5vw, 3.6rem); text-align: center; min-height: 1.4em;
}
.pz-letter.blank { color: #4a4560; }
.pz-hum { animation: pz-hum 1.1s ease-in-out; }
@keyframes pz-hum {
  0%, 100% { filter: none; transform: none; }
  30% { filter: blur(1.4px) brightness(1.15); transform: translateX(-2px); }
  60% { filter: blur(1.1px); transform: translateX(2px); }
}
.pz-resolved {
  margin-top: 2.4rem; font-family: Cinzel, Georgia, serif;
  font-size: clamp(1.4rem, 4vw, 2.6rem); letter-spacing: 0.14em; color: #f0e6c8;
  text-shadow: 0 0 30px rgba(214,175,54,0.5); animation: pz-fade 2.6s ease;
}
@keyframes pz-fade { from { opacity: 0; } to { opacity: 1; } }
.pz-cipher {
  max-width: 900px; font-family: 'Courier New', monospace;
  font-size: clamp(0.95rem, 1.9vw, 1.35rem); line-height: 2.1; white-space: pre-wrap;
  word-break: break-word; text-align: center;
}
.pz-ch { padding: 0 1px; }
.pz-ch.warded { animation: pz-swim 3.4s ease-in-out infinite; color: #8d84a8; }
@keyframes pz-swim {
  0%, 100% { transform: translateY(0) skewX(0deg); opacity: 0.72; }
  25% { transform: translateY(-2px) skewX(6deg); opacity: 0.5; }
  50% { transform: translateY(1px) skewX(-5deg); opacity: 0.85; }
  75% { transform: translateY(2px) skewX(3deg); opacity: 0.6; }
}
.pz-ch.locked { color: #7fd48a; text-shadow: 0 0 10px rgba(127,212,138,0.4); }
.pz-ch.sel { background: rgba(214,175,54,0.28); border-radius: 3px; }
.pz-intro { color: #b3a789; font-style: italic; margin-bottom: 1.4rem; text-align: center; }
.pz-note { color: #8f8672; font-size: 0.82rem; margin-top: 1.6rem; text-align: center; }
.pz-picker { display: flex; flex-wrap: wrap; gap: 5px; justify-content: center; margin-top: 1.2rem; max-width: 640px; }
.pz-key {
  background: rgba(240,230,200,0.07); border: 1px solid rgba(240,230,200,0.25);
  color: #e6ddc8; border-radius: 7px; padding: 6px 11px; font-family: inherit;
  font-size: 0.95rem; cursor: pointer;
}
.pz-key:hover { border-color: #d6af36; color: #f0e6c8; }
`;

function GlyphBoard({ p, onAssign }: { p: PuzzleProjection; onAssign: (g: string, l: string) => void }) {
  const [sel, setSel] = useState<string | null>(null);
  const line = p.tokens.map((t) => p.assignments[t] ?? "");
  const resolved = line.every(Boolean) ? line.join("") : null;

  return (
    <div className={p.solved ? "pz-solved" : ""}>
      <div className={`pz-glyphs ${p.hum > 0 ? "pz-hum" : ""}`} key={`hum-${p.hum}`}>
        {p.tokens.map((t, i) => (
          <div
            className="pz-cell"
            key={i}
            onClick={() => p.allow_player_input && setSel(sel === t ? null : t)}
            style={{ cursor: p.allow_player_input ? "pointer" : "default" }}
          >
            <span className="pz-glyph">{GLYPH_SHAPES[t] ?? "?"}</span>
            <span className={`pz-letter ${p.assignments[t] ? "" : "blank"}`}>
              {p.assignments[t] ?? "_"}
            </span>
          </div>
        ))}
      </div>

      {p.allow_player_input && sel && (
        <div className="pz-picker">
          {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((L) => (
            <button key={L} className="pz-key" onClick={() => { onAssign(sel, L); setSel(null); }}>
              {L}
            </button>
          ))}
          <button className="pz-key" onClick={() => { onAssign(sel, ""); setSel(null); }}>
            clear
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
        <div style={{ color: "#6b6b7a", marginTop: "25vh" }}>The page is turning…</div>
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
