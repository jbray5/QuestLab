import type { DifficultyPreview } from "../../api/encounters";
import InfoTip from "../character-sheet/InfoTip";
import { DIFFICULTY_HELP, DIFFICULTY_HOW, DIFFICULTY_TONE } from "./difficultyHelp";

interface Props {
  preview: DifficultyPreview | undefined;
  isLoading?: boolean;
}

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
        Add characters to the campaign to see how hard this fight is for them.
      </div>
    );
  }

  const { raw_xp, low_threshold, moderate_threshold, high_threshold, difficulty } =
    preview;

  // Bar spans 0 → 1.5 × high (the informal Deadly line; not 2024 RAW).
  const deadly = Math.max(1, Math.round(high_threshold * 1.5));
  const pct = Math.min(100, Math.max(0, (raw_xp / deadly) * 100));

  // Section boundaries as percentages of the bar.
  const easyPct = (low_threshold / deadly) * 100;
  const modPct = (moderate_threshold / deadly) * 100;
  const hardPct = (high_threshold / deadly) * 100;

  const tone = difficulty ? DIFFICULTY_TONE[difficulty] : null;
  const markerColor = tone?.strong ?? "var(--muted)";

  return (
    <div style={wrapperStyle}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "0.5rem",
          flexWrap: "wrap",
        }}
      >
        <strong style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--muted)" }}>
          Difficulty
        </strong>
        {difficulty && (
          <span
            title={DIFFICULTY_HELP[difficulty]}
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: tone?.text ?? "var(--text)",
              transition: "color 200ms ease",
            }}
          >
            {difficulty}
          </span>
        )}
        <InfoTip title="How difficulty works">
          {difficulty ? `${DIFFICULTY_HELP[difficulty]}\n\n` : ""}
          {DIFFICULTY_HOW}
          {"\n\n"}The bar runs from no XP to the informal Deadly line (1.5 × High). The marker is
          this encounter.
        </InfoTip>
        <span className="num" style={{ fontSize: "0.875rem", color: "var(--muted)", marginLeft: "auto" }}>
          {raw_xp.toLocaleString()} XP
          {isLoading && <span style={{ marginLeft: "0.4rem", opacity: 0.7 }}>updating…</span>}
        </span>
      </div>

      {/* The bar */}
      <div style={barOuterStyle} title={DIFFICULTY_HOW}>
        {/* Threshold bands */}
        <div
          style={{
            ...bandStyle,
            left: 0,
            width: `${easyPct}%`,
            background: DIFFICULTY_TONE.Low.soft,
          }}
        />
        <div
          style={{
            ...bandStyle,
            left: `${easyPct}%`,
            width: `${modPct - easyPct}%`,
            background: DIFFICULTY_TONE.Moderate.soft,
          }}
        />
        <div
          style={{
            ...bandStyle,
            left: `${modPct}%`,
            width: `${hardPct - modPct}%`,
            background: DIFFICULTY_TONE.High.soft,
          }}
        />
        <div
          style={{
            ...bandStyle,
            left: `${hardPct}%`,
            right: 0,
            width: `${100 - hardPct}%`,
            background: DIFFICULTY_TONE.Deadly.soft,
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
              background: "var(--bg)",
            }}
          />
        ))}

        {/* Marker */}
        <div
          style={{
            position: "absolute",
            left: `calc(${pct}% - 3px)`,
            top: 0,
            width: 6,
            height: "100%",
            background: markerColor,
            borderRadius: 3,
            boxShadow: "0 0 0 2px var(--surface2)",
            transition: "left 250ms ease, background 200ms ease",
          }}
        />
      </div>

      {/* Threshold labels */}
      <div style={labelsRowStyle}>
        <span style={{ flex: easyPct }} title={DIFFICULTY_HELP.Low}>
          Low
          <br />
          <span className="num" style={{ color: "var(--text2)" }}>{low_threshold}</span>
        </span>
        <span style={{ flex: modPct - easyPct }} title={DIFFICULTY_HELP.Moderate}>
          Moderate
          <br />
          <span className="num" style={{ color: "var(--text2)" }}>{moderate_threshold}</span>
        </span>
        <span style={{ flex: hardPct - modPct }} title={DIFFICULTY_HELP.High}>
          High
          <br />
          <span className="num" style={{ color: "var(--text2)" }}>{high_threshold}</span>
        </span>
        <span style={{ flex: 100 - hardPct }} title={DIFFICULTY_HELP.Deadly}>
          Deadly
          <br />
          <span className="num" style={{ color: "var(--text2)" }}>{deadly}+</span>
        </span>
      </div>
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "0.75rem 0.9rem",
};

const barOuterStyle: React.CSSProperties = {
  position: "relative",
  height: 12,
  background: "var(--surface)",
  borderRadius: 6,
  overflow: "hidden",
};

const bandStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  bottom: 0,
};

const labelsRowStyle: React.CSSProperties = {
  display: "flex",
  marginTop: "0.35rem",
  fontSize: "0.75rem",
  color: "var(--muted)",
  textAlign: "center",
  lineHeight: 1.35,
};

const emptyStyle: React.CSSProperties = {
  padding: "0.7rem 0.85rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: "0.875rem",
  color: "var(--muted)",
};
