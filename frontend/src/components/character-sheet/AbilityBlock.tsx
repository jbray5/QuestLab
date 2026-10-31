import type { RollContext } from "./RollHelper";

interface AbilityRow {
  label: "STR" | "DEX" | "CON" | "INT" | "WIS" | "CHA";
  score: number;
}

interface Props {
  abilities: AbilityRow[];
  /** Called when an ability is clicked. The parent surfaces the RollHelper
   *  so players can enter their real-die result; or roll a digital die. */
  onRoll?: (ctx: RollContext) => void;
  readOnly?: boolean;
}

/** Full names for the dense tiles' tooltips (usability pass, Plan 121). */
const ABILITY_NAME: Record<AbilityRow["label"], string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

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
        gridTemplateColumns: "repeat(auto-fit, minmax(64px, 1fr))",
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
              borderRadius: 8,
              textAlign: "center",
              cursor: clickable ? "pointer" : "default",
              fontFamily: "inherit",
              color: "inherit",
              transition: "border-color 0.1s",
            }}
            onMouseEnter={(e) => {
              if (clickable) (e.currentTarget.style.borderColor = "var(--border2)");
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
            }}
            title={
              clickable
                ? `Roll a ${ABILITY_NAME[a.label]} check (score ${a.score}, modifier ${fmt(m)})`
                : `${ABILITY_NAME[a.label]} ${a.score} (modifier ${fmt(m)})`
            }
          >
            <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{a.label}</div>
            <div
              className="num"
              style={{
                fontSize: "1.4rem",
                fontWeight: 600,
                color: "var(--text)",
                lineHeight: 1,
                margin: "0.25rem 0",
              }}
            >
              {fmt(m)}
            </div>
            <div className="num" style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{a.score}</div>
          </button>
        );
      })}
    </div>
  );
}
