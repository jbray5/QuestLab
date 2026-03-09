import type { Monster } from "../api/types";

interface Props {
  monster: Monster;
  onClose: () => void;
}

function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatSpeed(speed: Record<string, number> | null): string {
  if (!speed || Object.keys(speed).length === 0) return "—";
  return Object.entries(speed)
    .map(([type, val]) => {
      if (type === "walk") return `${val} ft.`;
      return `${type} ${val} ft.`;
    })
    .join(", ");
}

function formatSignedNumber(val: number): string {
  return val >= 0 ? `+${val}` : `${val}`;
}

function capitalized(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function Divider() {
  return (
    <div
      style={{
        height: "2px",
        background: "var(--crimson)",
        margin: "0.75rem 0",
        borderRadius: "1px",
      }}
    />
  );
}

interface SectionProps {
  title: string;
  entries: Array<{ name: string; desc: string }> | null;
}

function ActionSection({ title, entries }: SectionProps) {
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{ marginTop: "0.75rem" }}>
      <h3
        style={{
          fontFamily: "var(--font-serif)",
          color: "var(--crimson)",
          fontSize: "1.1rem",
          borderBottom: "1px solid var(--crimson)",
          paddingBottom: "0.2rem",
          marginBottom: "0.5rem",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </h3>
      {entries.map((entry, i) => (
        <p key={i} style={{ marginBottom: "0.5rem", lineHeight: 1.5 }}>
          <strong style={{ color: "var(--text)" }}>{entry.name}.</strong>{" "}
          <span style={{ color: "var(--text-muted)" }}>{entry.desc}</span>
        </p>
      ))}
    </div>
  );
}

export default function MonsterStatBlock({ monster, onClose }: Props) {
  const scores: Array<{ label: string; value: number }> = [
    { label: "STR", value: monster.score_str },
    { label: "DEX", value: monster.score_dex },
    { label: "CON", value: monster.score_con },
    { label: "INT", value: monster.score_int },
    { label: "WIS", value: monster.score_wis },
    { label: "CHA", value: monster.score_cha },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        className="card fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          overflowY: "auto",
          background: "var(--surface)",
          borderColor: "var(--gold)",
          padding: "1.5rem",
        }}
      >
        {/* Close button */}
        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            padding: "0.25rem 0.6rem",
            lineHeight: 1,
            fontSize: "1.1rem",
            zIndex: 1,
          }}
          aria-label="Close"
        >
          ✕
        </button>

        {/* Header */}
        <div style={{ paddingRight: "2rem" }}>
          <h2
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--gold)",
              fontSize: "1.6rem",
              marginBottom: "0.2rem",
              lineHeight: 1.2,
            }}
          >
            {monster.name}
          </h2>
          <p style={{ fontStyle: "italic", color: "var(--text-muted)", fontSize: "0.9rem" }}>
            {monster.size} {monster.creature_type}
            {monster.alignment ? `, ${monster.alignment}` : ""}
          </p>
        </div>

        <Divider />

        {/* AC / HP / Speed */}
        <div style={{ marginBottom: "0.5rem" }}>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong style={{ color: "var(--crimson)" }}>Armor Class</strong>{" "}
            <span style={{ color: "var(--text)" }}>
              {monster.ac}
              {monster.ac_notes ? ` (${monster.ac_notes})` : ""}
            </span>
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong style={{ color: "var(--crimson)" }}>Hit Points</strong>{" "}
            <span style={{ color: "var(--text)" }}>
              {monster.hp_average} ({monster.hp_formula})
            </span>
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong style={{ color: "var(--crimson)" }}>Speed</strong>{" "}
            <span style={{ color: "var(--text)" }}>{formatSpeed(monster.speed)}</span>
          </p>
        </div>

        <Divider />

        {/* Ability Scores */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(6, 1fr)",
            gap: "0.25rem",
            textAlign: "center",
            margin: "0.5rem 0",
          }}
        >
          {scores.map(({ label, value }) => (
            <div key={label}>
              <div
                style={{
                  fontWeight: "bold",
                  color: "var(--crimson)",
                  fontSize: "0.8rem",
                  letterSpacing: "0.05em",
                }}
              >
                {label}
              </div>
              <div style={{ color: "var(--text)", fontSize: "0.9rem" }}>
                {value}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>
                ({abilityModifier(value)})
              </div>
            </div>
          ))}
        </div>

        <Divider />

        {/* Properties */}
        <div style={{ fontSize: "0.9rem" }}>
          {monster.saving_throws && Object.keys(monster.saving_throws).length > 0 && (
            <p style={{ marginBottom: "0.25rem" }}>
              <strong style={{ color: "var(--crimson)" }}>Saving Throws</strong>{" "}
              <span style={{ color: "var(--text)" }}>
                {Object.entries(monster.saving_throws)
                  .map(([k, v]) => `${capitalized(k)} ${formatSignedNumber(v)}`)
                  .join(", ")}
              </span>
            </p>
          )}
          {monster.skills && Object.keys(monster.skills).length > 0 && (
            <p style={{ marginBottom: "0.25rem" }}>
              <strong style={{ color: "var(--crimson)" }}>Skills</strong>{" "}
              <span style={{ color: "var(--text)" }}>
                {Object.entries(monster.skills)
                  .map(([k, v]) => `${capitalized(k)} ${formatSignedNumber(v)}`)
                  .join(", ")}
              </span>
            </p>
          )}
          {monster.damage_resistances.length > 0 && (
            <p style={{ marginBottom: "0.25rem" }}>
              <strong style={{ color: "var(--crimson)" }}>Damage Resistances</strong>{" "}
              <span style={{ color: "var(--text)" }}>{monster.damage_resistances.join(", ")}</span>
            </p>
          )}
          {monster.damage_immunities.length > 0 && (
            <p style={{ marginBottom: "0.25rem" }}>
              <strong style={{ color: "var(--crimson)" }}>Damage Immunities</strong>{" "}
              <span style={{ color: "var(--text)" }}>{monster.damage_immunities.join(", ")}</span>
            </p>
          )}
          {monster.condition_immunities && monster.condition_immunities.length > 0 && (
            <p style={{ marginBottom: "0.25rem" }}>
              <strong style={{ color: "var(--crimson)" }}>Condition Immunities</strong>{" "}
              <span style={{ color: "var(--text)" }}>
                {monster.condition_immunities.join(", ")}
              </span>
            </p>
          )}
          {monster.senses && Object.keys(monster.senses).length > 0 && (
            <p style={{ marginBottom: "0.25rem" }}>
              <strong style={{ color: "var(--crimson)" }}>Senses</strong>{" "}
              <span style={{ color: "var(--text)" }}>
                {Object.entries(monster.senses)
                  .map(([k, v]) =>
                    typeof v === "number" ? `${capitalized(k)} ${v} ft.` : `${capitalized(k)} ${v}`
                  )
                  .join(", ")}
              </span>
            </p>
          )}
          <p style={{ marginBottom: "0.25rem" }}>
            <strong style={{ color: "var(--crimson)" }}>Languages</strong>{" "}
            <span style={{ color: "var(--text)" }}>{monster.languages || "—"}</span>
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong style={{ color: "var(--crimson)" }}>Challenge</strong>{" "}
            <span style={{ color: "var(--text)" }}>
              {monster.challenge_rating} ({monster.xp.toLocaleString()} XP)
            </span>
          </p>
          <p style={{ marginBottom: "0.25rem" }}>
            <strong style={{ color: "var(--crimson)" }}>Proficiency Bonus</strong>{" "}
            <span style={{ color: "var(--text)" }}>
              {formatSignedNumber(monster.proficiency_bonus)}
            </span>
          </p>
        </div>

        <Divider />

        {/* Traits */}
        {monster.traits && monster.traits.length > 0 && (
          <div style={{ marginBottom: "0.5rem" }}>
            {monster.traits.map((trait, i) => (
              <p key={i} style={{ marginBottom: "0.5rem", fontSize: "0.9rem", lineHeight: 1.5 }}>
                <strong style={{ color: "var(--text)" }}>{trait.name}.</strong>{" "}
                <span style={{ color: "var(--text-muted)" }}>{trait.desc}</span>
              </p>
            ))}
          </div>
        )}

        {/* Action Sections */}
        <ActionSection title="Actions" entries={monster.actions} />
        <ActionSection title="Bonus Actions" entries={monster.bonus_actions} />
        <ActionSection title="Reactions" entries={monster.reactions} />
        <ActionSection title="Legendary Actions" entries={monster.legendary_actions} />
        <ActionSection title="Lair Actions" entries={monster.lair_actions} />

        {/* Source badge */}
        <div style={{ marginTop: "1rem", textAlign: "right" }}>
          <span className="badge" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
            {monster.source}
          </span>
        </div>
      </div>
    </div>
  );
}
