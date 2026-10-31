import type { RollContext } from "./RollHelper";

interface Props {
  /** Map of skill key (PascalCase, matching backend) to total bonus. */
  bonuses: Record<string, number>;
  /** Optional map skill → 1=proficient, 2=expertise. */
  proficiencies?: Record<string, number>;
  onRoll?: (ctx: RollContext) => void;
  readOnly?: boolean;
}

// The 18 D&D 5e skills, in PHB order, with their tied ability.
// ``key`` MUST match the backend's SKILLS dict in services/character_service.py
// (PascalCase with spaces — "Animal Handling", "Sleight of Hand"). ``label``
// is what we display; on most skills they're identical.
const SKILLS: { key: string; label: string; ability: string }[] = [
  { key: "Acrobatics", label: "Acrobatics", ability: "DEX" },
  { key: "Animal Handling", label: "Animal Handling", ability: "WIS" },
  { key: "Arcana", label: "Arcana", ability: "INT" },
  { key: "Athletics", label: "Athletics", ability: "STR" },
  { key: "Deception", label: "Deception", ability: "CHA" },
  { key: "History", label: "History", ability: "INT" },
  { key: "Insight", label: "Insight", ability: "WIS" },
  { key: "Intimidation", label: "Intimidation", ability: "CHA" },
  { key: "Investigation", label: "Investigation", ability: "INT" },
  { key: "Medicine", label: "Medicine", ability: "WIS" },
  { key: "Nature", label: "Nature", ability: "INT" },
  { key: "Perception", label: "Perception", ability: "WIS" },
  { key: "Performance", label: "Performance", ability: "CHA" },
  { key: "Persuasion", label: "Persuasion", ability: "CHA" },
  { key: "Religion", label: "Religion", ability: "INT" },
  { key: "Sleight of Hand", label: "Sleight of Hand", ability: "DEX" },
  { key: "Stealth", label: "Stealth", ability: "DEX" },
  { key: "Survival", label: "Survival", ability: "WIS" },
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
          fontSize: "0.9375rem",
          fontWeight: 600,
          margin: "0 0 0.5rem",
          color: "var(--text)",
        }}
        title="● = trained (proficient) · ◆ = expertise (double proficiency)"
      >
        Skills
      </h4>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 190px), 1fr))",
          gap: "0.1rem 0.8rem",
        }}
      >
        {SKILLS.map((s) => {
          const bonus = bonuses[s.key] ?? 0;
          const profLevel = proficiencies[s.key] ?? 0;
          const dotColor = profLevel > 0 ? "var(--text)" : "var(--muted)";
          return (
            <button
              key={s.key}
              disabled={!clickable}
              onClick={() =>
                onRoll?.({
                  label: `${s.label} (${s.ability})`,
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
                borderRadius: 6,
                padding: "0.15rem 0.3rem",
                cursor: clickable ? "pointer" : "default",
                color: "inherit",
                fontFamily: "inherit",
                fontSize: "0.875rem",
                minWidth: 0,
              }}
              title={
                (clickable ? `Roll ${s.label}` : s.label) +
                (profLevel === 2 ? " (expertise)" : profLevel === 1 ? " (proficient)" : "")
              }
            >
              <span
                aria-hidden="true"
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  flexShrink: 0,
                  margin: "0 1px",
                  // ◆ expertise = a diamond, ● proficient = a dot, ○ = a ring.
                  borderRadius: profLevel === 2 ? 1 : "50%",
                  transform: profLevel === 2 ? "rotate(45deg)" : undefined,
                  background: profLevel > 0 ? dotColor : "transparent",
                  border: profLevel > 0 ? "none" : `1.5px solid ${dotColor}`,
                }}
              />
              <span
                style={{
                  flex: 1,
                  color: profLevel > 0 ? "var(--text)" : "var(--text2)",
                  fontWeight: profLevel > 0 ? 500 : 400,
                  textAlign: "left",
                }}
              >
                {s.label}{" "}
                <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                  {s.ability}
                </span>
              </span>
              <span className="num" style={{ fontWeight: 600, color: "var(--text)" }}>{fmt(bonus)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
