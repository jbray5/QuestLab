import type { RollContext } from "./RollHelper";

interface Props {
  /** Map of ability label ("STR".."CHA") to total save bonus. */
  saves: Record<string, number>;
  /** Ability labels the PC is proficient in (for the * indicator). */
  proficient?: string[];
  onRoll?: (ctx: RollContext) => void;
  readOnly?: boolean;
}

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;

/** Spelled out on screen — the column has room (usability pass, Plan 121). */
const ABILITY_NAME: Record<(typeof ABILITIES)[number], string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

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
          fontSize: "0.9375rem",
          fontWeight: 600,
          margin: "0 0 0.5rem",
          color: "var(--text)",
        }}
        title="A d20 roll to resist something; ● = trained (proficient)"
      >
        Saving throws
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "0.2rem 0.8rem",
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
                  mod: bonus,
                  breakdown: `${ab} save (${fmt(bonus)})${isProf ? " · proficient" : ""}`,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                padding: "0.2rem 0.3rem",
                cursor: clickable ? "pointer" : "default",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                minWidth: 0,
              }}
              title={
                clickable
                  ? `Roll a ${ABILITY_NAME[ab]} saving throw${isProf ? " (proficient)" : ""}`
                  : `${ABILITY_NAME[ab]} saving throw${isProf ? " (proficient)" : ""}`
              }
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  borderRadius: "50%",
                  background: isProf ? "var(--text)" : "transparent",
                  border: isProf ? "none" : "1.5px solid var(--muted)",
                }}
              />
              <span
                style={{
                  color: isProf ? "var(--text)" : "var(--text2)",
                  fontWeight: isProf ? 500 : 400,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {ABILITY_NAME[ab]}
              </span>
              <span className="num" style={{ marginLeft: "auto", fontWeight: 600, color: "var(--text)" }}>
                {fmt(bonus)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
