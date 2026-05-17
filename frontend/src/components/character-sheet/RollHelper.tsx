import { useEffect, useRef, useState } from "react";

import Confetti from "../Confetti";

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
 *   5. "🎲 Roll digital" fallback button(s)
 *   6. Optional pass/fail hint if a DC was provided
 *   7. Optional damage formula for attacks (real damage dice rolled by hand)
 *
 * Closes on ESC, click-outside, or the ✕ button.
 */
export default function RollHelper({ context, onClose }: Props) {
  const [mode, setMode] = useState<RollMode>("normal");
  const [d20a, setD20a] = useState<number | "">("");
  const [d20b, setD20b] = useState<number | "">("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset on context change + focus the input
  useEffect(() => {
    if (context) {
      setMode("normal");
      setD20a("");
      setD20b("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [context]);

  // ESC dismisses
  useEffect(() => {
    if (!context) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [context, onClose]);

  if (!context) return null;

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
  const accent = isCrit
    ? "var(--green2, #4caf50)"
    : isFumble
      ? "var(--red, #ef5350)"
      : "var(--gold)";

  // Plan 29 — fire confetti exactly once per nat-20, and shake the dialog
  // once per nat-1. Keying on `selected` triggers when the user lands on
  // a 20 or 1; navigating away from it cancels.
  const critKey = isCrit ? `crit-${context.label}-${selected}` : null;
  const shakeKey = isFumble ? `fumble-${context.label}-${selected}` : null;

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
          background: "var(--surface, #1f1f1f)",
          border: `2px solid ${accent}`,
          borderRadius: 8,
          padding: "0.85rem 1.1rem",
          zIndex: 9999,
          minWidth: 300,
          maxWidth: 380,
          boxShadow: isCrit
            ? "0 0 28px rgba(76, 175, 80, 0.55), 0 6px 28px rgba(0,0,0,0.65)"
            : "0 6px 28px rgba(0,0,0,0.65)",
          fontFamily: "inherit",
          animation: isFumble ? "ql-shake 500ms ease-in-out 1 both" : undefined,
        }}
        role="dialog"
        aria-label={`Roll helper: ${context.label}`}
      >
        <div
          className="flex items-center"
          style={{ justifyContent: "space-between", marginBottom: "0.35rem" }}
        >
          <strong style={{ color: accent, fontSize: "0.95rem" }}>{context.label}</strong>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "1.1rem",
              padding: 0,
              lineHeight: 1,
            }}
            title="Close (Esc)"
          >
            ×
          </button>
        </div>

        {context.breakdown && (
          <p
            style={{
              fontSize: "0.72rem",
              color: "var(--muted)",
              margin: "0 0 0.5rem",
            }}
          >
            {context.breakdown}
          </p>
        )}

        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--muted)",
            marginBottom: "0.3rem",
          }}
        >
          Modifier
        </div>
        <div
          style={{
            fontSize: "1.6rem",
            fontWeight: 700,
            color: "var(--gold)",
            fontFamily: "monospace",
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
                style={{
                  fontSize: "0.7rem",
                  padding: "0.3rem 0.4rem",
                  background: isActive ? "var(--gold)" : "var(--surface2)",
                  color: isActive ? "var(--bg, #1a1a1a)" : "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  cursor: "pointer",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                {m === "normal" ? "Normal" : m === "adv" ? "Adv" : "Dis"}
              </button>
            );
          })}
        </div>

        <label
          style={{
            display: "block",
            fontSize: "0.7rem",
            color: "var(--muted)",
            marginBottom: "0.2rem",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          {mode === "normal" ? "Your real d20 result" : "Your two real d20 results"}
        </label>

        <div className="flex" style={{ gap: "0.4rem", alignItems: "center" }}>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={20}
            value={d20a}
            onChange={(e) => setD20a(clamp(e.target.value))}
            placeholder="?"
            style={dieInputStyle(accent)}
          />
          <button
            onClick={rollDigitalA}
            className="btn btn-ghost"
            style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
            title="Roll a digital d20 instead"
          >
            🎲
          </button>
          {mode !== "normal" && (
            <>
              <span style={{ color: "var(--muted)", fontWeight: 700 }}>
                {mode === "adv" ? "▲" : "▼"}
              </span>
              <input
                type="number"
                min={1}
                max={20}
                value={d20b}
                onChange={(e) => setD20b(clamp(e.target.value))}
                placeholder="?"
                style={dieInputStyle(accent)}
              />
              <button
                onClick={rollDigitalB}
                className="btn btn-ghost"
                style={{ fontSize: "0.72rem", padding: "0.25rem 0.5rem" }}
                title="Roll a digital d20 instead"
              >
                🎲
              </button>
            </>
          )}
        </div>

        {/* Live total */}
        <div
          style={{
            marginTop: "0.75rem",
            paddingTop: "0.5rem",
            borderTop: `1px solid ${selected !== null ? accent : "var(--border)"}`,
          }}
        >
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--muted)",
              marginBottom: "0.15rem",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Total
            {mode !== "normal" && (
              <span style={{ marginLeft: 6, color: accent, fontWeight: 700 }}>
                ({mode === "adv" ? "higher" : "lower"})
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: "2.2rem",
              fontWeight: 700,
              color: total !== null ? accent : "var(--muted)",
              fontFamily: "monospace",
              lineHeight: 1,
            }}
          >
            {total !== null ? total : "—"}
          </div>
          {selected !== null && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--muted)",
                marginTop: "0.2rem",
                fontFamily: "monospace",
              }}
            >
              {selected} (d20) {context.mod >= 0 ? "+" : "−"} {Math.abs(context.mod)}
            </div>
          )}

          {selected !== null && context.dc !== undefined && total !== null && (
            <div
              style={{
                marginTop: "0.4rem",
                fontSize: "0.8rem",
                fontWeight: 700,
                color: total >= context.dc ? "var(--green2, #4caf50)" : "var(--red, #ef5350)",
              }}
            >
              {total >= context.dc ? `✓ Meets DC ${context.dc}` : `✗ Below DC ${context.dc}`}
            </div>
          )}

          {isCrit && (
            <div
              style={{
                marginTop: "0.5rem",
                textAlign: "center",
                color: "var(--bg, #1a1a1a)",
                background: "linear-gradient(90deg, var(--gold), #f4d068, var(--gold))",
                fontWeight: 700,
                fontSize: "0.95rem",
                padding: "0.35rem 0.5rem",
                borderRadius: 6,
                letterSpacing: "0.08em",
                fontFamily: "Cinzel Decorative, serif",
                animation: "ql-crit-pulse 900ms ease-out both",
                boxShadow: "0 0 16px rgba(214, 175, 54, 0.7)",
              }}
            >
              ✨ CRITICAL! ✨
            </div>
          )}
          {isFumble && (
            <div
              style={{
                marginTop: "0.5rem",
                textAlign: "center",
                color: "#fff",
                background: "linear-gradient(90deg, #6a0d0d, var(--red), #6a0d0d)",
                fontWeight: 700,
                fontSize: "0.9rem",
                padding: "0.35rem 0.5rem",
                borderRadius: 6,
                letterSpacing: "0.08em",
                fontFamily: "Cinzel Decorative, serif",
              }}
            >
              💀 Natural 1 — critical miss
            </div>
          )}
        </div>

        {context.damage && (
          <div
            style={{
              marginTop: "0.6rem",
              padding: "0.45rem 0.6rem",
              background: "rgba(139,26,26,0.18)",
              borderLeft: "3px solid var(--crimson2, #8b1a1a)",
              borderRadius: 4,
              fontSize: "0.82rem",
            }}
          >
            <strong style={{ color: "var(--gold)" }}>Damage:</strong>{" "}
            <span style={{ fontFamily: "monospace" }}>{context.damage}</span>
            <div style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.15rem" }}>
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
    fontFamily: "monospace",
    fontWeight: 700,
    textAlign: "center",
    padding: "0.25rem 0.4rem",
    background: "var(--surface2)",
    border: `1px solid ${accent}`,
    borderRadius: 4,
    color: "var(--text)",
  };
}
