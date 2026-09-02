import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { playApi } from "../../api/play";

/**
 * PlayerDice (Plan 66) — throw dice from the phone onto the table.
 *
 * Tap 🎲 → pick a die and modifier → SHAKE the phone to roll (or tap
 * the fallback button). The server rolls (authoritative RNG) and the
 * projector plays the landing for the whole table. iOS asks for motion
 * permission on the first arm; desktops just use the button.
 */

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const;
const SHAKE_THRESHOLD = 17; // m/s² beyond gravity-ish baseline
const SHAKE_DEBOUNCE_MS = 1600;

interface RollResult {
  die: string;
  rolls: number[];
  modifier: number;
  total: number;
}

const CSS = `
.qd-fab {
  position: fixed; right: 16px; bottom: 84px; z-index: 55;
  width: 54px; height: 54px; border-radius: 50%;
  border: 1px solid rgba(240,230,200,0.3); background: rgba(24,18,36,0.92);
  color: #f0e6c8; font-size: 1.5rem; cursor: pointer;
  box-shadow: 0 6px 22px rgba(0,0,0,0.55); backdrop-filter: blur(4px);
}
.qd-scrim { position: fixed; inset: 0; z-index: 56; background: rgba(6,5,10,0.75); backdrop-filter: blur(3px); }
.qd-sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 57;
  border-radius: 18px 18px 0 0; padding: 18px 16px calc(20px + env(safe-area-inset-bottom));
  background: linear-gradient(180deg, #221a33 0%, #14101f 100%);
  border-top: 1px solid rgba(240,230,200,0.22);
  font-family: Georgia, serif; color: #cfc2a4;
  animation: qdUp 0.22s cubic-bezier(0.16,1,0.3,1);
}
@keyframes qdUp { from { transform: translateY(30%); opacity: 0.4; } to { transform: none; opacity: 1; } }
.qd-title { font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: 1rem; letter-spacing: 0.08em; margin: 0 0 10px; }
.qd-dice { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.qd-die {
  flex: 1 1 auto; min-width: 56px; padding: 10px 0; text-align: center;
  border-radius: 10px; border: 1px solid rgba(240,230,200,0.25);
  background: rgba(10,8,16,0.6); color: #e6ddc8; cursor: pointer;
  font-family: Cinzel, Georgia, serif; font-weight: 700;
}
.qd-die.sel { border-color: #d6af36; color: #ffd76a; background: rgba(214,175,54,0.12); }
.qd-mod { display: flex; align-items: center; gap: 12px; justify-content: center; margin-bottom: 14px; }
.qd-mod button {
  width: 40px; height: 40px; border-radius: 50%; font-size: 1.2rem; cursor: pointer;
  border: 1px solid rgba(240,230,200,0.25); background: rgba(10,8,16,0.6); color: #e6ddc8;
}
.qd-mod .val { font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: 1.2rem; min-width: 52px; text-align: center; }
.qd-shake {
  text-align: center; padding: 14px; border-radius: 12px; margin-bottom: 10px;
  border: 1px dashed rgba(240,230,200,0.35); color: #d6c9a6; font-style: italic;
}
.qd-shake.armed { border-color: #d6af36; color: #ffd76a; animation: qdPulse 1.1s ease-in-out infinite; }
@keyframes qdPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.55; } }
.qd-roll {
  width: 100%; padding: 13px 0; border-radius: 12px; cursor: pointer;
  font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 1.05rem;
  border: 1px solid #d6af36; background: linear-gradient(160deg, #6b5316, #3d2f0c);
  color: #ffe9a8;
}
.qd-result { text-align: center; margin-top: 12px; }
.qd-result .big { font-family: Cinzel, Georgia, serif; font-size: 2.6rem; color: #f2e3ae; }
.qd-result .sub { font-size: 0.85rem; color: #9a9078; font-style: italic; }
`;

/** Detects a shake gesture while `armed`, calling `onShake` (debounced). */
function useShake(armed: boolean, onShake: () => void) {
  const last = useRef(0);
  useEffect(() => {
    if (!armed || typeof window === "undefined") return;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      const now = Date.now();
      if (mag > SHAKE_THRESHOLD && now - last.current > SHAKE_DEBOUNCE_MS) {
        last.current = now;
        onShake();
      }
    };
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [armed, onShake]);
}

export default function PlayerDice({ pcId }: { pcId: string }) {
  const [open, setOpen] = useState(false);
  const [die, setDie] = useState<(typeof DICE)[number]>("d20");
  const [modifier, setModifier] = useState(0);
  const [motionOk, setMotionOk] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);

  const rollMut = useMutation({
    mutationFn: () => playApi.throwDice(pcId, die, modifier),
    onSuccess: (r: RollResult) => {
      setResult(r);
      try {
        navigator.vibrate?.([40, 30, 80]);
      } catch {
        /* fine */
      }
    },
  });

  const doRoll = useCallback(() => {
    if (!rollMut.isPending) rollMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollMut.isPending, die, modifier]);

  useShake(open && motionOk, doRoll);

  // Arm the accelerometer. iOS gates DeviceMotion behind a permission that
  // must be requested inside a user gesture; Android just works.
  async function armMotion() {
    try {
      const dme = DeviceMotionEvent as unknown as {
        requestPermission?: () => Promise<"granted" | "denied">;
      };
      if (typeof dme.requestPermission === "function") {
        setMotionOk((await dme.requestPermission()) === "granted");
      } else {
        setMotionOk(true);
      }
    } catch {
      setMotionOk(false);
    }
  }

  function openSheet() {
    setResult(null);
    setOpen(true);
    void armMotion();
  }

  return (
    <>
      <style>{CSS}</style>
      <button className="qd-fab" title="Roll dice on the table" onClick={openSheet}>
        🎲
      </button>
      {open && (
        <>
          <div className="qd-scrim" onClick={() => setOpen(false)} />
          <div className="qd-sheet">
            <h3 className="qd-title">Throw a die onto the table</h3>
            <div className="qd-dice">
              {DICE.map((d) => (
                <button
                  key={d}
                  className={`qd-die${d === die ? " sel" : ""}`}
                  onClick={() => {
                    setDie(d);
                    setResult(null);
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="qd-mod">
              <button onClick={() => setModifier((m) => Math.max(-20, m - 1))}>−</button>
              <span className="val">{modifier >= 0 ? `+${modifier}` : modifier}</span>
              <button onClick={() => setModifier((m) => Math.min(20, m + 1))}>+</button>
            </div>
            <div className={`qd-shake${motionOk ? " armed" : ""}`}>
              {motionOk
                ? `🤝 Shake your phone to roll the ${die}!`
                : "Shake-to-roll needs motion access — or just tap below."}
            </div>
            <button className="qd-roll" disabled={rollMut.isPending} onClick={doRoll}>
              {rollMut.isPending ? "Rolling…" : `Roll ${die}${modifier ? (modifier > 0 ? `+${modifier}` : modifier) : ""}`}
            </button>
            {result && (
              <div className="qd-result">
                <div className="big">{result.total}</div>
                <div className="sub">
                  {result.rolls.join(" + ")}
                  {result.modifier ? ` ${result.modifier > 0 ? "+" : "−"} ${Math.abs(result.modifier)}` : ""} — it landed on the table ✨
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
