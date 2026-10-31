import { useEffect, useState } from "react";

import Dice3D from "./Dice3D";
import { ROLL_HOLD_MS, ROLL_TUMBLE_MS } from "./diceTiming";
import { rollLabel } from "./rollText";

/**
 * DiceCinematic (Plan 66) — the whole table watches the same die land.
 *
 * A `table.roll` event mounts one of these: the die tumbles for a beat of
 * shared suspense, lands, turns its face to the room, and a plate beside it
 * shows the result big with the roller's name. Pointer-transparent and
 * self-dismissing.
 *
 * Plan 128 — it no longer sits in the middle of the board, where it covered
 * the party's tokens: `dock="top"` (the map views) keeps it in the upper part
 * of the screen, and `dock="side"` (the turn-order view) lands it over the
 * rolls column. The result stays up longer, and the plate's number is the
 * biggest thing on it.
 */

export interface TableRoll {
  key: string;
  roller: string;
  die: string;
  rolls: number[];
  modifier: number;
  total: number;
  label?: string | null;
}

const CSS = `
.ql-dicecine {
  position: fixed; inset: 0; z-index: 70; pointer-events: none;
  display: flex; align-items: flex-start; justify-content: center;
  padding-top: 4vh;
}
.ql-dicecine.clear-right { padding-right: calc(min(31vw, 460px) + 3vw); }
.ql-dicecine.side {
  left: auto; width: 36vw; top: var(--tv-head, 0px);
  align-items: center; padding: 0 2vw;
  background: var(--bg); border-left: 1px solid var(--border);
  animation: qlDiceIn 0.25s ease, qlDiceOut 0.5s ease ${(ROLL_HOLD_MS - 500) / 1000}s forwards;
}
.ql-dicecine.side .ql-dicecine-stage { animation: none; }
.ql-dicecine-stage {
  display: flex; flex-direction: column; align-items: center; gap: 0.6rem;
  animation: qlDiceOut 0.5s ease ${(ROLL_HOLD_MS - 500) / 1000}s forwards;
}
.ql-dicecine-row { display: flex; align-items: center; gap: 1.2rem; }
.ql-dicecine.side .ql-dicecine-row { flex-direction: column; gap: 0.4rem; }
.ql-dicecine-arena {
  position: relative; width: min(38vw, 66vh); height: min(42vh, 420px);
}
.ql-dicecine.side .ql-dicecine-arena { width: 32vw; height: min(40vh, 400px); }
.ql-dicecine-name {
  font-family: var(--font-ui); color: var(--text);
  font-size: clamp(1.125rem, 2.9vh, 1.9rem);
  background: rgba(17, 21, 19, 0.88); padding: 0.2em 0.9em; border-radius: 999px;
  border: 1px solid var(--border2); max-width: 90vw; text-align: center;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ql-dicecine.side .ql-dicecine-name { max-width: 34vw; }
.ql-dicecine-name .who { font-family: var(--font-story); font-weight: 700; }
.ql-dicecine-plate {
  min-width: 8.5em; display: flex; flex-direction: column; align-items: center; gap: 0.1em;
  padding: 0.3em 0.8em 0.45em; border-radius: 14px; font-size: clamp(1.125rem, 2.9vh, 1.9rem);
  background: rgba(17, 21, 19, 0.92); border: 1px solid var(--accent-edge);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  opacity: 0; transition: opacity 0.35s ease;
}
.ql-dicecine-plate.landed { opacity: 1; }
.ql-dicecine-total {
  font-family: var(--font-mono); font-weight: 600; font-variant-numeric: tabular-nums;
  font-size: clamp(3.5rem, 15vh, 9.5rem); line-height: 1; color: var(--text);
}
.ql-dicecine-plate.landed .ql-dicecine-total { animation: qlDiceStamp 0.32s cubic-bezier(0.2, 1.6, 0.4, 1); }
.ql-dicecine-detail { font-family: var(--font-mono); color: var(--text2); white-space: nowrap; }
.ql-dicecine-callout { font-family: var(--font-ui); font-weight: 600; padding: 0.05em 0.6em; border-radius: 999px; }
.ql-dicecine-callout.crit { color: var(--teal-text); background: var(--teal-soft); }
.ql-dicecine-callout.fumble { color: var(--danger-text); background: var(--danger-soft); }
@keyframes qlDiceStamp { 0% { transform: scale(1.6); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
@keyframes qlDiceOut { to { opacity: 0; transform: translateY(-2vh); } }
@keyframes qlDiceIn { from { opacity: 0; } to { opacity: 1; } }
@media (max-width: 640px) {
  .ql-dicecine .ql-dicecine-row { flex-direction: column; gap: 0.4rem; }
  .ql-dicecine-arena, .ql-dicecine.side .ql-dicecine-arena { width: 86vw; height: 30vh; }
  .ql-dicecine.side { left: 0; width: auto; top: 0; }
  .ql-dicecine.clear-right { padding-right: 0; }
  .ql-dicecine .ql-dicecine-name, .ql-dicecine.side .ql-dicecine-name { max-width: 90vw; white-space: normal; }
}
@media (prefers-reduced-motion: reduce) {
  .ql-dicecine-stage, .ql-dicecine-plate.landed .ql-dicecine-total { animation-duration: 0.01s; }
}
`;

/** Renders one cinematic per `roll.key`; self-dismissing. */
export default function DiceCinematic({
  roll,
  dock = "top",
  clearRight = false,
}: {
  roll: TableRoll | null;
  /** Where the die lands: the upper part of the screen, or over the rolls column. */
  dock?: "top" | "side";
  /** Keep clear of the turn order in the top-right corner of the map. */
  clearRight?: boolean;
}) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // Landing is keyed to the roll, so a new roll starts un-landed without a
  // synchronous state reset in the effect.
  const [landedKey, setLandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!roll) return;
    const landTimer = window.setTimeout(() => setLandedKey(roll.key), ROLL_TUMBLE_MS);
    const byeTimer = window.setTimeout(() => setDismissedKey(roll.key), ROLL_HOLD_MS);
    return () => {
      window.clearTimeout(landTimer);
      window.clearTimeout(byeTimer);
    };
  }, [roll]);

  const visible = roll && roll.key !== dismissedKey ? roll : null;
  if (!visible) return null;
  const landed = landedKey === visible.key;

  const single = visible.die === "d20" && visible.rolls.length === 1;
  const isCrit = single && visible.rolls[0] === 20;
  const isFumble = single && visible.rolls[0] === 1;
  const dieLabel = visible.rolls.length > 1 ? `${visible.rolls.length}${visible.die}` : visible.die;
  const mod = visible.modifier ? ` ${visible.modifier > 0 ? "+" : "−"} ${Math.abs(visible.modifier)}` : "";
  const detail =
    visible.rolls.length > 1 || visible.modifier !== 0
      ? `${dieLabel}: ${visible.rolls.join(" + ")}${mod}`
      : dieLabel;

  return (
    <div
      className={`ql-dicecine${dock === "side" ? " side" : clearRight ? " clear-right" : ""}`}
      key={visible.key}
      aria-live="polite"
    >
      <style>{CSS}</style>
      <div className="ql-dicecine-stage">
        <div className="ql-dicecine-name">
          <span className="who">{visible.roller}</span> rolls {dieLabel}
          {rollLabel(visible.label) ? ` · ${rollLabel(visible.label)}` : ""}
        </div>
        <div className="ql-dicecine-row">
          <div className="ql-dicecine-arena">
            {/* The rolled face lands up, then turns to the camera (Plan 128). */}
            <Dice3D die={visible.die} rollKey={visible.key} durationMs={ROLL_TUMBLE_MS} result={visible.rolls[0]} />
          </div>
          <div className={`ql-dicecine-plate${landed ? " landed" : ""}`} aria-hidden={!landed}>
            <span className="ql-dicecine-total">{landed ? visible.total : ""}</span>
            <span className="ql-dicecine-detail">{detail}</span>
            {landed && isCrit && <span className="ql-dicecine-callout crit">Natural 20</span>}
            {landed && isFumble && <span className="ql-dicecine-callout fumble">Natural 1</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
