import { useEffect, useRef, useState } from "react";

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

const TUMBLE_MS = 1400;
const HOLD_MS = 4200;

const CSS = `
.ql-dicecine {
  position: fixed; inset: 0; z-index: 70; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
}
.ql-dicecine-stage {
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  animation: qlDiceOut 0.5s ease ${(HOLD_MS - 500) / 1000}s forwards;
}
.ql-dicecine-die {
  width: clamp(120px, 22vh, 220px); height: clamp(120px, 22vh, 220px);
  display: flex; align-items: center; justify-content: center;
  font-family: Cinzel, Georgia, serif; font-weight: 700;
  font-size: clamp(2.6rem, 9vh, 5.2rem); color: #f2e3ae;
  background:
    radial-gradient(circle at 35% 30%, rgba(255,255,255,0.14), transparent 55%),
    linear-gradient(150deg, #2a2338 0%, #171224 60%, #0d0a16 100%);
  border: 2px solid rgba(240,230,200,0.35); border-radius: 26%;
  box-shadow: 0 12px 50px rgba(0,0,0,0.75), 0 0 34px rgba(214,175,54,0.18);
  transform: rotate(-8deg);
}
.ql-dicecine-die.tumbling { animation: qlDiceTumble 0.32s linear infinite; }
.ql-dicecine-die.landed { animation: qlDiceLand 0.34s cubic-bezier(0.2,1.6,0.4,1) forwards; }
.ql-dicecine-die.crit {
  border-color: #ffd76a; color: #ffe9a8;
  box-shadow: 0 12px 50px rgba(0,0,0,0.75), 0 0 70px rgba(255,205,90,0.55);
}
.ql-dicecine-die.fumble {
  border-color: #7a3a34; color: #d8938a; filter: saturate(0.7);
  box-shadow: 0 12px 50px rgba(0,0,0,0.85), 0 0 40px rgba(190,70,50,0.35);
}
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
@keyframes qlDiceTumble {
  0% { transform: rotate(-14deg) translateY(0); }
  25% { transform: rotate(4deg) translateY(-6px); }
  50% { transform: rotate(14deg) translateY(0); }
  75% { transform: rotate(-4deg) translateY(-4px); }
  100% { transform: rotate(-14deg) translateY(0); }
}
@keyframes qlDiceLand {
  0% { transform: rotate(6deg) scale(1.25); }
  100% { transform: rotate(0deg) scale(1); }
}
@keyframes qlDiceTotal { to { opacity: 1; } }
@keyframes qlDiceOut { to { opacity: 0; transform: translateY(-2vh); } }
@media (prefers-reduced-motion: reduce) {
  .ql-dicecine-die.tumbling { animation: none; }
  .ql-dicecine-stage, .ql-dicecine-die.landed { animation-duration: 0.01s; }
}
`;

/** Renders one cinematic per `roll.key`; self-dismissing. */
export default function DiceCinematic({ roll }: { roll: TableRoll | null }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);
  const [landed, setLanded] = useState(false);
  const [face, setFace] = useState(1);
  const cycler = useRef<number | null>(null);

  useEffect(() => {
    if (!roll) return;
    setLanded(false);
    const sides = parseInt(roll.die.slice(1), 10) || 20;
    cycler.current = window.setInterval(
      () => setFace(1 + Math.floor(Math.random() * sides)),
      90,
    );
    const landTimer = window.setTimeout(() => {
      if (cycler.current) window.clearInterval(cycler.current);
      setLanded(true);
    }, TUMBLE_MS);
    const byeTimer = window.setTimeout(() => setDismissedKey(roll.key), HOLD_MS);
    return () => {
      if (cycler.current) window.clearInterval(cycler.current);
      window.clearTimeout(landTimer);
      window.clearTimeout(byeTimer);
    };
  }, [roll]);

  const visible = roll && roll.key !== dismissedKey ? roll : null;
  if (!visible) return null;

  const sides = parseInt(visible.die.slice(1), 10) || 20;
  const isCrit = visible.die === "d20" && visible.rolls.length === 1 && visible.rolls[0] === 20;
  const isFumble = visible.die === "d20" && visible.rolls.length === 1 && visible.rolls[0] === 1;
  const shown = landed ? visible.rolls[0] : Math.min(face, sides);
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
        <div
          className={[
            "ql-dicecine-die",
            landed ? "landed" : "tumbling",
            landed && isCrit ? "crit" : "",
            landed && isFumble ? "fumble" : "",
          ].join(" ")}
        >
          {shown}
        </div>
        {detail && landed && <div className="ql-dicecine-total">{detail}</div>}
        {landed && isCrit && <div className="ql-dicecine-callout crit">CRITICAL</div>}
        {landed && isFumble && <div className="ql-dicecine-callout fumble">FUMBLE</div>}
      </div>
    </div>
  );
}
