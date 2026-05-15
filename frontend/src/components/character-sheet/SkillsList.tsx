import { rollD20 } from "./RollToast";
import type { RollResult } from "./RollToast";

interface Props {
  /** Map of skill name (lowercased) to total bonus. */
  bonuses: Record<string, number>;
  /** Optional map skill → 1=proficient, 2=expertise. */
  proficiencies?: Record<string, number>;
  onRoll?: (roll: RollResult) => void;
  readOnly?: boolean;
}

// The 18 D&D 5e skills, in PHB order, with their tied ability.
const SKILLS: { name: string; label: string; ability: string }[] = [
  { name: "acrobatics", label: "Acrobatics", ability: "DEX" },
  { name: "animal_handling", label: "Animal Handling", ability: "WIS" },
  { name: "arcana", label: "Arcana", ability: "INT" },
  { name: "athletics", label: "Athletics", ability: "STR" },
  { name: "deception", label: "Deception", ability: "CHA" },
  { name: "history", label: "History", ability: "INT" },
  { name: "insight", label: "Insight", ability: "WIS" },
  { name: "intimidation", label: "Intimidation", ability: "CHA" },
  { name: "investigation", label: "Investigation", ability: "INT" },
  { name: "medicine", label: "Medicine", ability: "WIS" },
  { name: "nature", label: "Nature", ability: "INT" },
  { name: "perception", label: "Perception", ability: "WIS" },
  { name: "performance", label: "Performance", ability: "CHA" },
  { name: "persuasion", label: "Persuasion", ability: "CHA" },
  { name: "religion", label: "Religion", ability: "INT" },
  { name: "sleight_of_hand", label: "Sleight of Hand", ability: "DEX" },
  { name: "stealth", label: "Stealth", ability: "DEX" },
  { name: "survival", label: "Survival", ability: "WIS" },
];

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export default function SkillsList({
  bonuses,
  proficiencies = {},
  onRoll,
  readOnly = false,
}: Props) {
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
        Skills
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "0.2rem 0.6rem",
        }}
      >
        {SKILLS.map((s) => {
          const bonus = bonuses[s.name] ?? 0;
          const profLevel = proficiencies[s.name] ?? 0;
          const dot = profLevel === 2 ? "◆" : profLevel === 1 ? "●" : "○";
          const dotColor =
            profLevel === 2 ? "var(--gold)" : profLevel === 1 ? "var(--gold)" : "var(--muted)";
          return (
            <button
              key={s.name}
              disabled={!clickable}
              onClick={() =>
                onRoll?.({
                  label: `${s.label} (${s.ability})`,
                  d20: rollD20(),
                  mod: bonus,
                  breakdown:
                    profLevel === 2
                      ? `${s.ability} mod + 2× prof bonus (expertise) = ${fmt(bonus)}`
                      : profLevel === 1
                        ? `${s.ability} mod + prof bonus = ${fmt(bonus)}`
                        : `${s.ability} mod = ${fmt(bonus)}`,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "transparent",
                border: "none",
                padding: "0.1rem 0.25rem",
                cursor: clickable ? "pointer" : "default",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: "0.78rem",
              }}
              title={clickable ? `Roll ${s.label}` : ""}
            >
              <span style={{ fontSize: "0.65rem", color: dotColor, minWidth: 10 }}>
                {dot}
              </span>
              <span
                style={{
                  flex: 1,
                  color: profLevel > 0 ? "var(--gold)" : undefined,
                  textAlign: "left",
                }}
              >
                {s.label}{" "}
                <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                  ({s.ability})
                </span>
              </span>
              <span style={{ fontFamily: "monospace", fontWeight: 600 }}>{fmt(bonus)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
