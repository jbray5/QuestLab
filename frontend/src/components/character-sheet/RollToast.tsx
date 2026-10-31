import { useEffect } from "react";

export interface RollResult {
  /** Display label, e.g. "Athletics", "STR Save", "Longbow attack". */
  label: string;
  /** Raw d20 roll (1–20). */
  d20: number;
  /** Modifier added to the d20. */
  mod: number;
  /** Optional formula breakdown for the body: "DEX (+3) + Prof (+2)". */
  breakdown?: string;
  /** Optional damage roll string for attack rolls. */
  damage?: string;
}

interface Props {
  roll: RollResult | null;
  onClose: () => void;
}

/**
 * Auto-dismissing roll preview (Plan 00022).
 *
 * Plan 23 will replace this with a persistent combat log; for now the toast
 * lives in the top-right of the viewport for 4 seconds.
 */
export default function RollToast({ roll, onClose }: Props) {
  useEffect(() => {
    if (!roll) return;
    const t = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(t);
  }, [roll, onClose]);

  if (!roll) return null;

  const total = roll.d20 + roll.mod;
  const isCrit = roll.d20 === 20;
  const isFumble = roll.d20 === 1;
  const accent = isCrit ? "var(--teal)" : isFumble ? "var(--danger)" : "var(--border2)";
  const accentText = isCrit ? "var(--teal-text)" : isFumble ? "var(--danger-text)" : "var(--text)";

  return (
    <div
      style={{
        position: "fixed",
        top: "1rem",
        right: "1rem",
        background: "var(--surface)",
        border: `1px solid ${accent}`,
        borderRadius: 10,
        padding: "0.75rem 1rem",
        zIndex: 9999,
        minWidth: 240,
        boxShadow: "0 10px 28px rgba(0,0,0,0.55)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", marginBottom: "0.3rem" }}
      >
        <strong style={{ color: "var(--text)", fontSize: "0.9375rem", fontWeight: 600 }}>{roll.label}</strong>
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: "1rem",
            padding: 0,
            lineHeight: 1,
          }}
          title="Dismiss"
        >
          ×
        </button>
      </div>
      <div className="num" style={{ fontSize: "1.4rem", fontWeight: 600 }}>
        <span style={{ color: accentText }}>{total}</span>
        <span style={{ color: "var(--muted)", fontSize: "0.875rem", marginLeft: "0.4rem" }}>
          = d20 ({roll.d20}) {roll.mod >= 0 ? "+" : "−"} {Math.abs(roll.mod)}
        </span>
      </div>
      {roll.breakdown && (
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: "0.15rem 0 0" }}>
          {roll.breakdown}
        </p>
      )}
      {roll.damage && (
        <p style={{ fontSize: "0.875rem", margin: "0.4rem 0 0" }}>
          <span style={{ color: "var(--muted)" }}>Damage</span>{" "}
          <span className="num">{roll.damage}</span>
        </p>
      )}
      {isCrit && (
        <p style={{ fontSize: "0.875rem", color: accentText, margin: "0.25rem 0 0", fontWeight: 600 }}>
          Critical!
        </p>
      )}
      {isFumble && (
        <p style={{ fontSize: "0.875rem", color: accentText, margin: "0.25rem 0 0", fontWeight: 600 }}>
          Critical miss
        </p>
      )}
    </div>
  );
}

/** Shared client-side d20 roller. Plan 23 will replace with a server call. */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}
