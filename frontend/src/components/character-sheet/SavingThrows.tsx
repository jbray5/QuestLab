import { rollD20 } from "./RollToast";
import type { RollResult } from "./RollToast";

interface Props {
  /** Map of ability label ("STR".."CHA") to total save bonus. */
  saves: Record<string, number>;
  /** Ability labels the PC is proficient in (for the * indicator). */
  proficient?: string[];
  onRoll?: (roll: RollResult) => void;
  readOnly?: boolean;
}

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export default function SavingThrows({
  saves,
  proficient = [],
  onRoll,
  readOnly = false,
}: Props) {
  const profSet = new Set(proficient.map((p) => p.toUpperCase()));
  const clickable = !readOnly && !!onRoll;

  return (
    <div>
      <h4
        style={{
          fontSize: "0.7rem",
          margin: "0 0 0.4rem",
          color: "var(--muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Saving Throws
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "0.25rem 0.7rem",
        }}
      >
        {ABILITIES.map((ab) => {
          const bonus = saves[ab] ?? 0;
          const isProf = profSet.has(ab);
          return (
            <button
              key={ab}
              disabled={!clickable}
              onClick={() =>
                onRoll?.({
                  label: `${ab} save`,
                  d20: rollD20(),
                  mod: bonus,
                  breakdown: `${ab} save (${fmt(bonus)})${isProf ? " · proficient" : ""}`,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "transparent",
                border: "none",
                padding: "0.15rem 0.25rem",
                cursor: clickable ? "pointer" : "default",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: "0.82rem",
              }}
              title={clickable ? `Roll ${ab} save` : ""}
            >
              <span
                style={{
                  fontSize: "0.65rem",
                  color: isProf ? "var(--gold)" : "var(--muted)",
                }}
              >
                {isProf ? "●" : "○"}
              </span>
              <span style={{ minWidth: 30, color: isProf ? "var(--gold)" : undefined }}>
                {ab}
              </span>
              <span style={{ marginLeft: "auto", fontFamily: "monospace", fontWeight: 600 }}>
                {fmt(bonus)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
