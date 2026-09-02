import { useEffect, useState } from "react";

import Dice3D from "./Dice3D";

/**
 * DiceCinematic (Plan 66) — the whole table watches the same die land.
 *
 * A `table.roll` event mounts one of these: the die tumbles (number
 * cycling under a spinning glyph) for a beat of shared suspense, then
 * slams the true result with the roller's name. Nat 20 flares gold,
 * nat 1 gutters ash. Pointer-transparent, self-dismissing.
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

const TUMBLE_MS = 2100;
const HOLD_MS = 5400;

const CSS = `
.ql-dicecine {
  position: fixed; inset: 0; z-index: 70; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.ql-dicecine-stage {
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  animation: qlDiceOut 0.5s ease ${(HOLD_MS - 500) / 1000}s forwards;
}
.ql-dicecine-arena {
  position: relative; width: min(74vw, 120vh); height: min(46vh, 420px);
}
.ql-dicecine-num {
  position: absolute; left: 50%; top: 54%; transform: translate(-50%, -50%);
  font-family: Cinzel, Georgia, serif; font-weight: 700;
  font-size: clamp(2.8rem, 10vh, 5.8rem); color: #f2e3ae;
  text-shadow: 0 3px 20px rgba(0,0,0,0.95), 0 0 30px rgba(214,175,54,0.4);
  animation: qlDiceStamp 0.3s cubic-bezier(0.2,1.7,0.4,1);
  pointer-events: none;
}
.ql-dicecine-num.crit { color: #ffe9a8; text-shadow: 0 3px 20px rgba(0,0,0,0.95), 0 0 60px rgba(255,205,90,0.9); }
.ql-dicecine-num.fumble { color: #d8938a; text-shadow: 0 3px 20px rgba(0,0,0,0.95), 0 0 34px rgba(190,70,50,0.6); }
@keyframes qlDiceStamp { 0% { transform: translate(-50%, -50%) scale(1.9); opacity: 0; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
.ql-dicecine-name {
  font-family: Georgia, serif; font-style: italic; color: #cfc2a4;
  font-size: clamp(0.9rem, 2vh, 1.3rem); text-shadow: 0 2px 12px rgba(0,0,0,0.9);
}
.ql-dicecine-total {
  font-family: Cinzel, Georgia, serif; color: #f2e3ae;
  font-size: clamp(1.1rem, 2.6vh, 1.7rem); letter-spacing: 0.08em;
  text-shadow: 0 2px 12px rgba(0,0,0,0.9);
  opacity: 0; animation: qlDiceTotal 0.4s ease 0.12s forwards; /* mounts at landing */
}
.ql-dicecine-callout {
  font-family: Cinzel, Georgia, serif; font-weight: 700; letter-spacing: 0.3em;
  font-size: clamp(0.8rem, 2vh, 1.2rem); padding-left: 0.3em;
  opacity: 0; animation: qlDiceTotal 0.4s ease 0.28s forwards; /* mounts at landing */
}
.ql-dicecine-callout.crit { color: #ffd76a; text-shadow: 0 0 18px rgba(255,205,90,0.8); }
.ql-dicecine-callout.fumble { color: #c96a5c; }
@keyframes qlDiceTotal { to { opacity: 1; } }
@keyframes qlDiceOut { to { opacity: 0; transform: translateY(-2vh); } }
@media (prefers-reduced-motion: reduce) {
  .ql-dicecine-stage, .ql-dicecine-num { animation-duration: 0.01s; }
}
`;

/** Renders one cinematic per `roll.key`; self-dismissing. */
export default function DiceCinematic({ roll }: { roll: TableRoll | null }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  // Landing is keyed to the roll, so a new roll starts un-landed without a
  // synchronous state reset in the effect.
  const [landedKey, setLandedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!roll) return;
    const landTimer = window.setTimeout(() => setLandedKey(roll.key), TUMBLE_MS);
    const byeTimer = window.setTimeout(() => setDismissedKey(roll.key), HOLD_MS);
    return () => {
      window.clearTimeout(landTimer);
      window.clearTimeout(byeTimer);
    };
  }, [roll]);

  const visible = roll && roll.key !== dismissedKey ? roll : null;
  if (!visible) return null;
  const landed = landedKey === visible.key;

  const isCrit = visible.die === "d20" && visible.rolls.length === 1 && visible.rolls[0] === 20;
  const isFumble = visible.die === "d20" && visible.rolls.length === 1 && visible.rolls[0] === 1;
  const detail =
    visible.rolls.length > 1 || visible.modifier !== 0
      ? `${visible.rolls.join(" + ")}${visible.modifier ? ` ${visible.modifier > 0 ? "+" : "−"} ${Math.abs(visible.modifier)}` : ""} = ${visible.total}`
      : null;

  return (
    <div className="ql-dicecine" key={visible.key} aria-live="polite">
      <style>{CSS}</style>
      <div className="ql-dicecine-stage">
        <div className="ql-dicecine-name">
          {visible.roller} rolls {visible.rolls.length > 1 ? `${visible.rolls.length}` : ""}
          {visible.die}
          {visible.label ? ` — ${visible.label}` : ""}
        </div>
        <div className="ql-dicecine-arena">
          <Dice3D die={visible.die} rollKey={visible.key} durationMs={TUMBLE_MS} />
          {landed && (
            <div
              className={["ql-dicecine-num", isCrit ? "crit" : "", isFumble ? "fumble" : ""].join(" ")}
            >
              {visible.rolls[0]}
            </div>
          )}
        </div>
        {detail && landed && <div className="ql-dicecine-total">{detail}</div>}
        {landed && isCrit && <div className="ql-dicecine-callout crit">CRITICAL</div>}
        {landed && isFumble && <div className="ql-dicecine-callout fumble">FUMBLE</div>}
      </div>
    </div>
  );
}
