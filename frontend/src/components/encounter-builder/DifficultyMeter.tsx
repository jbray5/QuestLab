import type { DifficultyPreview, EncounterDifficulty } from "../../api/encounters";

interface Props {
  preview: DifficultyPreview | undefined;
  isLoading?: boolean;
}

const DIFFICULTY_COLOR: Record<EncounterDifficulty, string> = {
  Low: "#4caf50",
  Moderate: "#f9a825",
  High: "#ff5722",
  Deadly: "#c62828",
};

/**
 * Live difficulty meter (Plan 00031).
 *
 * Visual gauge of the encounter's adjusted XP against the party's three
 * thresholds (Low / Moderate / High / Deadly = 1.5 × High). The marker
 * slides along the bar as the DM tunes the roster.
 */
export default function DifficultyMeter({ preview, isLoading = false }: Props) {
  if (!preview || preview.party_levels.length === 0) {
    return (
      <div style={emptyStyle}>
        Add characters to the campaign to see live difficulty.
      </div>
    );
  }

  const { adjusted_xp, easy_threshold, moderate_threshold, high_threshold, difficulty } =
    preview;

  // Bar spans 0 → 1.5 × high (the Deadly line).
  const deadly = Math.max(1, Math.round(high_threshold * 1.5));
  const pct = Math.min(100, Math.max(0, (adjusted_xp / deadly) * 100));

  // Section boundaries as percentages of the bar.
  const easyPct = (easy_threshold / deadly) * 100;
  const modPct = (moderate_threshold / deadly) * 100;
  const hardPct = (high_threshold / deadly) * 100;

  const color = difficulty ? DIFFICULTY_COLOR[difficulty] : "var(--muted)";

  return (
    <div style={wrapperStyle}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.6rem",
          marginBottom: "0.4rem",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "0.75rem", color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Difficulty
        </strong>
        {difficulty && (
          <span
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              fontFamily: "Cinzel Decorative, serif",
              color,
              transition: "color 200ms ease",
            }}
          >
            {difficulty}
          </span>
        )}
        <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--muted)", marginLeft: "auto" }}>
          {adjusted_xp.toLocaleString()} XP{" "}
          <span style={{ opacity: 0.6 }}>(adj.)</span>
          {isLoading && <span style={{ marginLeft: "0.4rem", opacity: 0.6 }}>updating…</span>}
        </span>
      </div>

      {/* The bar */}
      <div style={barOuterStyle}>
        {/* Threshold bands */}
        <div
          style={{
            ...bandStyle,
            left: 0,
            width: `${easyPct}%`,
            background: "rgba(76, 175, 80, 0.18)",
          }}
        />
        <div
          style={{
            ...bandStyle,
            left: `${easyPct}%`,
            width: `${modPct - easyPct}%`,
            background: "rgba(249, 168, 37, 0.18)",
          }}
        />
        <div
          style={{
            ...bandStyle,
            left: `${modPct}%`,
            width: `${hardPct - modPct}%`,
            background: "rgba(255, 87, 34, 0.20)",
          }}
        />
        <div
          style={{
            ...bandStyle,
            left: `${hardPct}%`,
            right: 0,
            width: `${100 - hardPct}%`,
            background: "rgba(198, 40, 40, 0.25)",
          }}
        />

        {/* Marker */}
        <div
          style={{
            position: "absolute",
            left: `calc(${pct}% - 6px)`,
            top: -4,
            width: 12,
            height: 24,
            background: color,
            borderRadius: 3,
            boxShadow: `0 0 8px ${color}`,
            transition: "left 250ms ease, background 200ms ease",
          }}
        />

        {/* Section dividers */}
        {[easyPct, modPct, hardPct].map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${p}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "var(--border)",
              opacity: 0.5,
            }}
          />
        ))}
      </div>

      {/* Threshold labels */}
      <div style={labelsRowStyle}>
        <span style={{ flex: easyPct, color: "#4caf50" }}>
          Low<br />
          <strong style={{ fontFamily: "monospace" }}>{easy_threshold}</strong>
        </span>
        <span style={{ flex: modPct - easyPct, color: "#f9a825" }}>
          Moderate<br />
          <strong style={{ fontFamily: "monospace" }}>{moderate_threshold}</strong>
        </span>
        <span style={{ flex: hardPct - modPct, color: "#ff5722" }}>
          High<br />
          <strong style={{ fontFamily: "monospace" }}>{high_threshold}</strong>
        </span>
        <span style={{ flex: 100 - hardPct, color: "#c62828" }}>
          Deadly<br />
          <strong style={{ fontFamily: "monospace" }}>{deadly}+</strong>
        </span>
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.7rem 0.85rem",
};

const barOuterStyle: React.CSSProperties = {
  position: "relative",
  height: 16,
  background: "var(--surface)",
  borderRadius: 8,
  overflow: "hidden",
};

const bandStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
};

const labelsRowStyle: React.CSSProperties = {
  display: "flex",
  marginTop: "0.3rem",
  fontSize: "0.62rem",
  textAlign: "center",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const emptyStyle: React.CSSProperties = {
  padding: "0.7rem 0.85rem",
  background: "var(--surface2)",
  border: "1px dashed var(--border)",
  borderRadius: 8,
  fontSize: "0.78rem",
  color: "var(--muted)",
  fontStyle: "italic",
};
