import { useEffect, useRef, useState } from "react";
import { Dices, X } from "lucide-react";

import Confetti from "../Confetti";
import { useGatedSfx } from "../../hooks/useDicePrefs";
import { playCritFanfare, playFumbleTrombone } from "../../lib/dice-sound";

export interface RollContext {
  /** Display label, e.g. "Insight (WIS)", "STR save", "Mace of Disruption attack". */
  label: string;
  /** Modifier to add to the d20 (after any advantage decision). */
  mod: number;
  /** Optional breakdown text shown under the label. */
  breakdown?: string;
  /** Optional damage roll string for attacks ("1d8+3 piercing"). */
  damage?: string;
  /** Optional target DC or AC for pass/fail hinting. */
  dc?: number;
}

interface Props {
  context: RollContext | null;
  onClose: () => void;
}

type RollMode = "normal" | "adv" | "dis";

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Real-die roll helper for in-person play (Plan 22 + Plan 23 adv/dis).
 *
 * When the DM/player clicks a roll button (skill, save, attack, etc.) this
 * helper appears in the top-right corner with:
 *
 *   1. Big modifier display ("+5")
 *   2. NORMAL / ADV / DIS toggle (Plan 00023)
 *      - normal: one d20 input
 *      - adv: two d20 inputs; total uses the higher
 *      - dis: two d20 inputs; total uses the lower
 *   3. Live-updating total as they type
 *   4. Crit / fumble color hints when the selected d20 is 1 or 20
 *   5. "Roll digital" (dice icon) fallback button(s)
 *   6. Optional pass/fail hint if a DC was provided
 *   7. Optional damage formula for attacks (real damage dice rolled by hand)
 *
 * Closes on ESC, click-outside, or the close button.
 */
export default function RollHelper({ context, onClose }: Props) {
  // Guard OUTSIDE the hook-bearing component so hook order is always stable.
  // Plan 41 — the early return used to sit *between* hooks (useGatedSfx + two
  // effects ran only when context was non-null), so opening the helper changed
  // the hook count and crashed the whole HUD with "rendered more hooks than
  // during the previous render". Splitting the guard fixes it structurally.
  if (!context) return null;
  return <RollHelperInner context={context} onClose={onClose} />;
}

function RollHelperInner({ context, onClose }: { context: RollContext; onClose: () => void }) {
  const [mode, setMode] = useState<RollMode>("normal");
  const [d20a, setD20a] = useState<number | "">("");
  const [d20b, setD20b] = useState<number | "">("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset on context change + focus the input
  useEffect(() => {
    setMode("normal");
    setD20a("");
    setD20b("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [context]);

  // ESC dismisses
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const a = d20a === "" ? null : Number(d20a);
  const b = d20b === "" ? null : Number(d20b);
  const aValid = a !== null && a >= 1 && a <= 20;
  const bValid = b !== null && b >= 1 && b <= 20;

  // Pick the effective d20 according to mode.
  let selected: number | null = null;
  if (mode === "normal") {
    selected = aValid ? a : null;
  } else if (aValid && bValid) {
    selected = mode === "adv" ? Math.max(a as number, b as number) : Math.min(a as number, b as number);
  }
  const total = selected !== null ? selected + context.mod : null;
  const isCrit = selected === 20;
  const isFumble = selected === 1;
  // Lamplit: neutral until the die lands; a nat 20 reads teal, a nat 1 red.
  const accent = isCrit
    ? "var(--teal)"
    : isFumble
      ? "var(--danger)"
      : "var(--border2)";
  const accentText = isCrit ? "var(--teal-text)" : isFumble ? "var(--danger-text)" : "var(--text)";

  // Plan 29 — fire confetti exactly once per nat-20, and shake the dialog
  // once per nat-1. Keying on `selected` triggers when the user lands on
  // a 20 or 1; navigating away from it cancels.
  const critKey = isCrit ? `crit-${context.label}-${selected}` : null;
  const shakeKey = isFumble ? `fumble-${context.label}-${selected}` : null;

  // Plan 30 — play sound effects on landing a nat 20 / nat 1, gated by
  // the persisted sound preference.
  const playSfx = useGatedSfx();
  useEffect(() => {
    if (critKey) playSfx(playCritFanfare);
  }, [critKey, playSfx]);
  useEffect(() => {
    if (shakeKey) playSfx(playFumbleTrombone);
  }, [shakeKey, playSfx]);

  function rollDigitalA() {
    setD20a(Math.floor(Math.random() * 20) + 1);
  }
  function rollDigitalB() {
    setD20b(Math.floor(Math.random() * 20) + 1);
  }

  function clamp(v: string): number | "" {
    if (v === "") return "";
    return Math.max(1, Math.min(20, Math.floor(Number(v))));
  }

  return (
    <>
      <Confetti trigger={critKey} />
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "transparent",
        }}
      />
      <div
        key={shakeKey ?? "stable"}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "1rem",
          right: "1rem",
          background: "var(--surface)",
          border: `1px solid ${accent}`,
          borderRadius: 10,
          padding: "0.85rem 1.1rem",
          zIndex: 9999,
          minWidth: 300,
          maxWidth: "min(380px, calc(100vw - 2rem))",
          boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
          fontFamily: "inherit",
          animation: isFumble ? "ql-shake 500ms ease-in-out 1 both" : undefined,
        }}
        role="dialog"
        aria-label={`Roll helper: ${context.label}`}
      >
        <div
          className="flex items-center"
          style={{ justifyContent: "space-between", marginBottom: "0.35rem", flexWrap: "nowrap" }}
        >
          <strong style={{ color: "var(--text)", fontSize: "1rem", fontWeight: 600 }}>{context.label}</strong>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={{ border: "none", padding: "0.2rem", minHeight: 0, color: "var(--muted)" }}
            title="Close (Esc)"
            aria-label="Close roll helper"
          >
            <X size={16} />
          </button>
        </div>

        {context.breakdown && (
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--muted)",
              margin: "0 0 0.5rem",
            }}
          >
            {context.breakdown}
          </p>
        )}

        <div
          style={{
            fontSize: "0.8125rem",
            color: "var(--muted)",
            marginBottom: "0.3rem",
          }}
        >
          Modifier
        </div>
        <div
          className="num"
          style={{
            fontSize: "1.6rem",
            fontWeight: 600,
            color: "var(--text)",
            marginBottom: "0.55rem",
            lineHeight: 1,
          }}
        >
          {fmt(context.mod)}
        </div>

        {/* Mode toggle */}
        <div
          role="tablist"
          aria-label="Roll mode"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "0.25rem",
            marginBottom: "0.55rem",
          }}
        >
          {(["normal", "adv", "dis"] as RollMode[]).map((m) => {
            const isActive = mode === m;
            return (
              <button
                key={m}
                role="tab"
                aria-selected={isActive}
                onClick={() => {
                  setMode(m);
                  if (m === "normal") setD20b("");
                }}
                title={
                  m === "normal"
                    ? "One d20"
                    : m === "adv"
                      ? "Advantage: roll two d20s, keep the higher"
                      : "Disadvantage: roll two d20s, keep the lower"
                }
                style={{
                  fontSize: "0.8125rem",
                  padding: "0.3rem 0.25rem",
                  background: isActive ? "var(--accent-active)" : "transparent",
                  color: isActive ? "var(--accent-active-text)" : "var(--text2)",
                  border: `1px solid ${isActive ? "var(--accent-line)" : "var(--border2)"}`,
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                  fontFamily: "inherit",
                }}
              >
                {m === "normal" ? "Normal" : m === "adv" ? "Advantage" : "Disadvantage"}
              </button>
            );
          })}
        </div>

        <label
          style={{
            display: "block",
            fontSize: "0.8125rem",
            color: "var(--text2)",
            marginBottom: "0.25rem",
          }}
        >
          {mode === "normal" ? "Your real d20 result" : "Your two real d20 results"}
        </label>

        <div className="flex" style={{ gap: "0.4rem", alignItems: "center", flexWrap: "nowrap" }}>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={20}
            value={d20a}
            onChange={(e) => setD20a(clamp(e.target.value))}
            placeholder="?"
            aria-label="d20 result"
            className="num"
            style={dieInputStyle(accent)}
          />
          <button
            onClick={rollDigitalA}
            className="btn btn-ghost"
            style={{ padding: "0.3rem 0.45rem", minHeight: 0 }}
            title="Roll a digital d20 instead"
            aria-label="Roll a digital d20"
          >
            <Dices size={16} />
          </button>
          {mode !== "normal" && (
            <>
              <span style={{ color: "var(--muted)", fontWeight: 700 }} aria-hidden="true">
                {mode === "adv" ? "▲" : "▼"}
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={d20b}
                onChange={(e) => setD20b(clamp(e.target.value))}
                placeholder="?"
                aria-label="Second d20 result"
                className="num"
                style={dieInputStyle(accent)}
              />
              <button
                onClick={rollDigitalB}
                className="btn btn-ghost"
                style={{ padding: "0.3rem 0.45rem", minHeight: 0 }}
                title="Roll a digital d20 instead"
                aria-label="Roll a second digital d20"
              >
                <Dices size={16} />
              </button>
            </>
          )}
        </div>

        {/* Live total */}
        <div
          style={{
            marginTop: "0.75rem",
            paddingTop: "0.5rem",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--muted)",
              marginBottom: "0.2rem",
            }}
          >
            Total
            {mode !== "normal" && (
              <span style={{ marginLeft: 6, color: "var(--text2)" }}>
                (keeps the {mode === "adv" ? "higher" : "lower"} die)
              </span>
            )}
          </div>
          <div
            className="num"
            style={{
              fontSize: "2.2rem",
              fontWeight: 600,
              color: total !== null ? accentText : "var(--muted)",
              lineHeight: 1,
            }}
          >
            {total !== null ? total : "—"}
          </div>
          {selected !== null && (
            <div
              className="num"
              style={{
                fontSize: "0.8125rem",
                color: "var(--muted)",
                marginTop: "0.25rem",
              }}
            >
              {selected} (d20) {context.mod >= 0 ? "+" : "−"} {Math.abs(context.mod)}
            </div>
          )}

          {selected !== null && context.dc !== undefined && total !== null && (
            <div
              style={{
                marginTop: "0.4rem",
                fontSize: "0.875rem",
                fontWeight: 600,
                color: total >= context.dc ? "var(--teal-text)" : "var(--danger-text)",
              }}
            >
              {total >= context.dc ? `Meets DC ${context.dc}` : `Below DC ${context.dc}`}
            </div>
          )}

          {isCrit && (
            <div
              style={{
                marginTop: "0.5rem",
                textAlign: "center",
                color: "var(--teal-text)",
                background: "var(--teal-soft)",
                border: "1px solid var(--teal)",
                fontWeight: 700,
                fontSize: "1rem",
                padding: "0.35rem 0.5rem",
                borderRadius: 8,
                // A crit is a moment: the one place this panel moves. (ql-crit-pulse
                // ends at opacity 0, which hid the banner after 0.9 s.)
                animation: "ql-modal-in 260ms cubic-bezier(0.22, 0.61, 0.36, 1) both",
              }}
            >
              Natural 20 — critical!
            </div>
          )}
          {isFumble && (
            <div
              style={{
                marginTop: "0.5rem",
                textAlign: "center",
                color: "var(--danger-text)",
                background: "var(--danger-soft)",
                border: "1px solid var(--danger-line)",
                fontWeight: 700,
                fontSize: "0.9375rem",
                padding: "0.35rem 0.5rem",
                borderRadius: 8,
              }}
            >
              Natural 1 — critical miss
            </div>
          )}
        </div>

        {context.damage && (
          <div
            style={{
              marginTop: "0.6rem",
              padding: "0.5rem 0.65rem",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: "0.875rem",
            }}
          >
            <span style={{ color: "var(--muted)" }}>Damage</span>{" "}
            <span className="num" style={{ color: "var(--text)" }}>{context.damage}</span>
            <div style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: "0.2rem" }}>
              Roll real damage dice and add the modifier shown.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function dieInputStyle(accent: string): React.CSSProperties {
  return {
    width: 60,
    fontSize: "1.2rem",
    fontWeight: 600,
    textAlign: "center",
    padding: "0.25rem 0.4rem",
    border: `1px solid ${accent}`,
    color: "var(--text)",
  };
}
