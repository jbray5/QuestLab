/**
 * The roll sheet (Plan 122): tap any number and roll it — on the phone, where
 * the result also shows on the TV, or with a real die typed in. Explains the
 * bonus at the player's help level, offers advantage, and chains an attack to
 * its damage (crits double the dice; a rogue can add Sneak Attack).
 */
import { useState, type ReactNode } from "react";
import { Dices, Info, X } from "lucide-react";

import { playApi, type RollResult } from "../../api/play";
import { friendlyApiError } from "../../api/errors";
import type { HelpLevel } from "../../stores/usePlayerPrefs";
import { fmt, parseDice } from "./rules";
import { RollCtx, type Die, type RollSpec } from "./rollContext";

export function RollProvider({ pcId, help, children }: { pcId: string; help: HelpLevel; children: ReactNode }) {
  const [spec, setSpec] = useState<RollSpec | null>(null);
  // Re-keyed per spec so the sheet starts fresh for each roll.
  const [n, setN] = useState(0);
  const open = (s: RollSpec) => {
    setSpec(s);
    setN((x) => x + 1);
  };
  return (
    <RollCtx.Provider value={{ open }}>
      {children}
      {spec && <Sheet key={n} pcId={pcId} help={help} spec={spec} onClose={() => setSpec(null)} onNext={open} />}
    </RollCtx.Provider>
  );
}

function Sheet({ pcId, help, spec, onClose, onNext }: { pcId: string; help: HelpLevel; spec: RollSpec; onClose: () => void; onNext: (s: RollSpec) => void }) {
  const [mode, setMode] = useState<"normal" | "advantage" | "disadvantage">("normal");
  const [real, setReal] = useState("");
  const [real2, setReal2] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RollResult | null>(null);
  const [after, setAfter] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sneak, setSneak] = useState(true);

  const count = spec.count ?? 1;
  const sides = Number(spec.die.slice(1));
  const single = count === 1;
  const d20 = spec.die === "d20" && single;
  const canAdv = d20 && spec.kind !== "death" && spec.kind !== "free";
  const realOk = single;
  const want = mode === "normal" ? 1 : 2;
  const realVals = (mode === "normal" ? [real] : [real, real2]).map((v) => Number(v));
  const realValid = real !== "" && (want === 1 || real2 !== "") && realVals.every((v) => Number.isInteger(v) && v >= 1 && v <= sides);

  async function go(useReal: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await playApi.roll(pcId, {
        die: spec.die,
        count,
        modifier: Math.max(-20, Math.min(20, spec.modifier)),
        label: spec.title.slice(0, 60),
        mode: canAdv ? mode : "normal",
        real: useReal ? realVals.slice(0, canAdv ? want : 1) : undefined,
      });
      setResult(r);
      if (spec.onResult) {
        const note = await spec.onResult(r);
        if (note) setAfter(note);
      }
    } catch (e) {
      setErr(friendlyApiError((e as Error).message, "That roll didn't go through."));
    } finally {
      setBusy(false);
    }
  }

  const kept = result ? (result.kept.length === 1 ? result.kept[0] : null) : null;
  const crit = spec.kind === "attack" && kept === 20;
  const fumble = spec.kind === "attack" && kept === 1;
  const dmg = spec.damage ? parseDice(spec.damage.dice) : null;

  function rollDamage() {
    if (!spec.damage || !dmg) return;
    const extra = sneak && spec.damage.sneakDice ? spec.damage.sneakDice : 0;
    const same = extra && dmg.sides === 6;
    const dice = (dmg.count + (same ? extra : 0)) * (crit ? 2 : 1);
    onNext({
      title: `${spec.title.replace(/ attack$/i, "")} damage`,
      kind: "damage",
      die: `d${dmg.sides}` as Die,
      count: Math.min(10, dice),
      modifier: dmg.plus,
      why: crit ? "A critical hit doubles the dice, not the bonus." : undefined,
      onResult:
        extra && !same
          ? async (first) => {
              const s = await playApi.roll(pcId, { die: "d6", count: extra * (crit ? 2 : 1), label: "Sneak Attack" });
              return `Sneak Attack adds ${s.total}: ${first.total + s.total} in all.`;
            }
          : undefined,
    });
  }

  const showWhy = help !== "numbers" && spec.why;
  return (
    <div role="dialog" aria-modal="true" aria-label={spec.title} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
      <button type="button" aria-label="Close" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(5, 8, 7, 0.6)", border: "none", cursor: "default" }} />
      <section className="ql-modal-in" style={{ position: "relative", maxWidth: 560, width: "100%", margin: "0 auto", borderRadius: "22px 22px 0 0", background: "var(--surface)", borderTop: "1px solid var(--border2)", padding: "10px 18px calc(20px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 14, maxHeight: "88dvh", overflowY: "auto" }}>
        <div aria-hidden style={{ alignSelf: "center", width: 38, height: 4, borderRadius: 2, background: "var(--border2)" }} />
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontWeight: 600, fontSize: 19 }}>{spec.title}</span>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              <span className="num">{count}{spec.die}{spec.modifier ? ` ${fmt(spec.modifier)}` : ""}</span> · shows on the TV
            </span>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 44, height: 44, margin: "-6px -10px 0 0", border: "none", background: "transparent", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {result ? (
          <div style={{ borderRadius: 14, background: "var(--surface2)", border: "1px solid var(--border)", padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span className="num" style={{ fontWeight: 600, fontSize: 60, lineHeight: 1, color: crit ? "var(--accent-text)" : fumble ? "var(--danger-text)" : "var(--text)" }}>{result.total}</span>
              <div className="num" style={{ display: "flex", flexDirection: "column", fontSize: 14, color: "var(--text2)" }}>
                <span>
                  {result.real ? "You rolled " : "Rolled "}
                  {result.rolls.join(", ")}
                  {result.mode !== "normal" ? ` (kept ${result.kept[0]})` : ""}
                </span>
                {result.modifier !== 0 && <span>{fmt(result.modifier)}</span>}
              </div>
            </div>
            {crit && <span style={{ fontWeight: 600, color: "var(--accent-text)" }}>A natural 20: a critical hit. Your damage dice are doubled.</span>}
            {fumble && <span style={{ color: "var(--danger-text)" }}>A natural 1: that attack misses.</span>}
            {spec.kind === "attack" && !crit && !fumble && help !== "numbers" && (
              <span style={{ fontSize: 14, color: "var(--text2)" }}>The DM will tell you whether {result.total} hits.</span>
            )}
            {(spec.kind === "check" || spec.kind === "save") && help === "teach" && (
              <span style={{ fontSize: 14, color: "var(--text2)" }}>Tell the DM your total; they'll say how it goes.</span>
            )}
            {after && <span style={{ fontSize: 15, fontWeight: 500 }}>{after}</span>}
          </div>
        ) : (
          <>
            {showWhy && (
              <div style={{ fontSize: 14, color: "var(--text2)", display: "flex", gap: 8 }}>
                <Info size={16} color="var(--muted)" style={{ marginTop: 2 }} />
                <span>{spec.why}</span>
              </div>
            )}
            {canAdv && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div role="group" aria-label="Advantage" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 4, padding: 4, borderRadius: 10, background: "var(--bg)", border: "1px solid var(--border)" }}>
                  {(["disadvantage", "normal", "advantage"] as const).map((m) => (
                    <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)} style={{ minHeight: 40, borderRadius: 8, border: "none", background: mode === m ? "var(--surface3)" : "transparent", color: mode === m ? "var(--text)" : "var(--text2)", font: "500 14px var(--font-ui)", cursor: "pointer", textTransform: "capitalize" }}>
                      {m}
                    </button>
                  ))}
                </div>
                {help === "teach" && (
                  <span style={{ fontSize: 13, color: "var(--muted)" }}>Advantage: roll twice, keep the higher. The DM says when you have it.</span>
                )}
              </div>
            )}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void go(false)} style={{ minHeight: 54, fontSize: 17, borderRadius: 12 }}>
              <Dices size={20} /> {busy ? "Rolling…" : "Roll it"}
            </button>
            {realOk ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <label htmlFor="ql-real" style={{ flex: "1 1 160px", fontSize: 14, color: "var(--text2)", margin: 0 }}>
                  Rolled a real {spec.die}{want === 2 ? " twice" : ""}?
                </label>
                <input id="ql-real" inputMode="numeric" value={real} onChange={(e) => setReal(e.target.value.replace(/\D/g, ""))} placeholder={spec.die} className="num" style={{ width: 64, minHeight: 44, textAlign: "center", fontWeight: 600 }} aria-label={`Your ${spec.die}`} />
                {want === 2 && (
                  <input inputMode="numeric" value={real2} onChange={(e) => setReal2(e.target.value.replace(/\D/g, ""))} placeholder={spec.die} className="num" style={{ width: 64, minHeight: 44, textAlign: "center", fontWeight: 600 }} aria-label={`Your second ${spec.die}`} />
                )}
                <button type="button" className="btn btn-secondary" disabled={!realValid || busy} onClick={() => void go(true)} style={{ minHeight: 44 }}>
                  Use mine
                </button>
              </div>
            ) : (
              help !== "numbers" && <span style={{ fontSize: 13, color: "var(--muted)" }}>Rolling real dice? Add them up and tell the DM your total.</span>
            )}
          </>
        )}

        {err && <span role="alert" style={{ color: "var(--danger-text)", fontSize: 14 }}>{err}</span>}

        {result && spec.kind === "attack" && spec.damage && dmg && !fumble && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {spec.damage.sneakDice ? (
              <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, fontSize: 15, margin: 0, color: "var(--text)" }}>
                <input type="checkbox" checked={sneak} onChange={(e) => setSneak(e.target.checked)} style={{ width: 20, height: 20 }} />
                Add Sneak Attack <span className="num" style={{ color: "var(--text2)" }}>+{spec.damage.sneakDice}d6</span>
              </label>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={rollDamage} style={{ minHeight: 54, fontSize: 16, borderRadius: 12 }}>
              Roll damage <span className="num">{spec.damage.dice}{sneak && spec.damage.sneakDice ? ` + ${spec.damage.sneakDice}d6` : ""}</span>
            </button>
          </div>
        )}
        {result && !(spec.kind === "attack" && spec.damage && !fumble) && (
          <button type="button" className="btn btn-secondary" onClick={onClose} style={{ minHeight: 48 }}>
            Done
          </button>
        )}
      </section>
    </div>
  );
}
