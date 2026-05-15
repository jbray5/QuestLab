import type { RollContext } from "./RollHelper";

interface AbilityRow {
  label: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
  score: number;
}

interface Props {
  abilities: AbilityRow[];
  /** Called when an ability is clicked. The parent surfaces the RollHelper
   *  so players can enter their real-die result; or click 🎲 Digital. */
  onRoll?: (ctx: RollContext) => void;
  readOnly?: boolean;
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Six-ability grid (Plan 00022).
 *
 * Each card shows the raw score + modifier. Click → roll a d20 + mod and
 * fire ``onRoll``. The card is the click target so it works on touch.
 */
export default function AbilityBlock({ abilities, onRoll, readOnly = false }: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, minmax(70px, 1fr))",
        gap: "0.4rem",
      }}
    >
      {abilities.map((a) => {
        const m = mod(a.score);
        const clickable = !readOnly && !!onRoll;
        return (
          <button
            key={a.label}
            disabled={!clickable}
            onClick={() =>
              onRoll?.({
                label: `${a.label} check`,
                mod: m,
                breakdown: `${a.label} mod (${fmt(m)})`,
              })
            }
            style={{
              padding: "0.45rem 0.4rem",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              textAlign: "center",
              cursor: clickable ? "pointer" : "default",
              fontFamily: "inherit",
              transition: "border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (clickable) (e.currentTarget.style.borderColor = "var(--gold)");
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
            title={clickable ? `Roll ${a.label} check` : ""}
          >
            <div style={{ fontSize: "0.65rem", color: "var(--muted)", letterSpacing: "0.05em" }}>
              {a.label}
            </div>
            <div
              style={{
                fontSize: "1.4rem",
                fontWeight: 700,
                color: "var(--gold)",
                lineHeight: 1,
                margin: "0.2rem 0",
              }}
            >
              {fmt(m)}
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{a.score}</div>
          </button>
        );
      })}
    </div>
  );
}
