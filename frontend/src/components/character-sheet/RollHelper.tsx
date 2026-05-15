import { useEffect, useRef, useState } from "react";

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

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Real-die roll helper for in-person play (Plan 22 enhancement).
 *
 * When the DM/player clicks a roll button (skill, save, attack, etc.) this
 * helper appears in the top-right corner with:
 *
 *   1. Big modifier display ("+5")
 *   2. Input for "what did your real d20 show?" (autofocus, accepts 1–20)
 *   3. Live-updating total as they type
 *   4. Crit / fumble color hints when the d20 is 1 or 20
 *   5. "🎲 Roll digital" fallback button for when no real die is handy
 *   6. Optional pass/fail hint if a DC was provided
 *   7. Optional damage formula for attacks (real damage dice rolled by hand)
 *
 * Closes on ESC, click-outside, or the ✕ button.
 */
export default function RollHelper({ context, onClose }: Props) {
  const [d20, setD20] = useState<number | "">("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset on context change + focus the input
  useEffect(() => {
    if (context) {
      setD20("");
      // microtask so the input is mounted
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

  const value = d20 === "" ? null : Number(d20);
  const isValid = value !== null && value >= 1 && value <= 20;
  const total = isValid ? value + context.mod : null;
  const isCrit = value === 20;
  const isFumble = value === 1;
  const accent = isCrit
    ? "var(--green2, #4caf50)"
    : isFumble
      ? "var(--red, #ef5350)"
      : "var(--gold)";

  function rollDigital() {
    setD20(Math.floor(Math.random() * 20) + 1);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "") {
      setD20("");
      return;
    }
    const n = Math.max(1, Math.min(20, Math.floor(Number(v))));
    setD20(n);
  }

  return (
    <>
      {/* Click-outside backdrop (transparent — doesn't darken; the helper is supplementary) */}
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
          minWidth: 280,
          maxWidth: 360,
          boxShadow: "0 6px 28px rgba(0,0,0,0.65)",
          fontFamily: "inherit",
        }}
        role="dialog"
        aria-label={`Roll helper: ${context.label}`}
      >
        {/* Header */}
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

        {/* Modifier (always visible) */}
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
            marginBottom: "0.7rem",
            lineHeight: 1,
          }}
        >
          {fmt(context.mod)}
        </div>

        {/* Roll input */}
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
          Your real d20 result
        </label>
        <div className="flex" style={{ gap: "0.4rem", alignItems: "center" }}>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={20}
            value={d20}
            onChange={handleChange}
            placeholder="?"
            style={{
              width: 70,
              fontSize: "1.4rem",
              fontFamily: "monospace",
              fontWeight: 700,
              textAlign: "center",
              padding: "0.25rem 0.4rem",
              background: "var(--surface2)",
              border: `1px solid ${accent}`,
              borderRadius: 4,
              color: "var(--text)",
            }}
          />
          <button
            onClick={rollDigital}
            className="btn btn-ghost"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
            title="Roll a digital d20 instead"
          >
            🎲 Digital
          </button>
        </div>

        {/* Live total */}
        <div
          style={{
            marginTop: "0.75rem",
            paddingTop: "0.5rem",
            borderTop: `1px solid ${isValid ? accent : "var(--border)"}`,
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
          {isValid && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--muted)",
                marginTop: "0.2rem",
                fontFamily: "monospace",
              }}
            >
              {value} (d20) {context.mod >= 0 ? "+" : "−"} {Math.abs(context.mod)}
            </div>
          )}

          {/* Pass/fail hint if a DC was supplied */}
          {isValid && context.dc !== undefined && total !== null && (
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
            <div style={{ marginTop: "0.4rem", color: accent, fontWeight: 700, fontSize: "0.85rem" }}>
              ✨ Natural 20 — critical!
            </div>
          )}
          {isFumble && (
            <div style={{ marginTop: "0.4rem", color: accent, fontWeight: 700, fontSize: "0.85rem" }}>
              💀 Natural 1 — critical miss
            </div>
          )}
        </div>

        {/* Damage formula for attacks */}
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
