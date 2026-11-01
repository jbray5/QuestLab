import type { DifficultyPreview } from "../../api/encounters";
import { rulesetOf } from "../../lib/ruleset";
import InfoTip from "../character-sheet/InfoTip";
import {
  DIFFICULTY_TONE,
  difficultyHelp,
  difficultyHow,
  difficultyLabel,
} from "./difficultyHelp";

interface Props {
  preview: DifficultyPreview | undefined;
  isLoading?: boolean;
}

/** One stretch of the bar, with the label and number shown under it. */
interface Band {
  key: string;
  from: number;
  to: number;
  label: string;
  num: string;
  soft: string;
  help?: string;
}

/**
 * The bar for one edition: the XP the marker shows, where the bar ends, and its bands.
 *
 * 2024: raw XP; Low / Moderate / High, then the informal Deadly line at 1.5 × High,
 * where the bar ends. 2014 (Plan 131): adjusted XP (raw × the monster-count
 * multiplier); each band starts at its own threshold — Easy, Medium, Hard, and a real
 * Deadly line — and the bar runs a quarter past Deadly. Under Easy is a trivial fight.
 */
function barFor(preview: DifficultyPreview): { xp: number; bands: Band[]; end: number; note: string } {
  const r = rulesetOf(preview.ruleset);
  const { low_threshold: low, moderate_threshold: mod, high_threshold: high } = preview;
  const help = (band: string) => difficultyHelp(band, r);
  if (r === "2014") {
    const deadly = preview.deadly_threshold;
    const end = Math.max(1, Math.round(deadly * 1.25));
    return {
      xp: preview.adjusted_xp,
      end,
      note: "The bar runs from no XP to past the Deadly line. The marker is this encounter's adjusted XP.",
      bands: [
        { key: "Trivial", from: 0, to: low, label: "", num: "", soft: "transparent" },
        { key: "Low", from: low, to: mod, label: "Easy", num: `${low}+`, soft: DIFFICULTY_TONE.Low.soft, help: help("Low") },
        { key: "Moderate", from: mod, to: high, label: "Medium", num: `${mod}+`, soft: DIFFICULTY_TONE.Moderate.soft, help: help("Moderate") },
        { key: "High", from: high, to: deadly, label: "Hard", num: `${high}+`, soft: DIFFICULTY_TONE.High.soft, help: help("High") },
        { key: "Deadly", from: deadly, to: end, label: "Deadly", num: `${deadly}+`, soft: DIFFICULTY_TONE.Deadly.soft, help: help("Deadly") },
      ],
    };
  }
  // Bar spans 0 → 1.5 × high (the informal Deadly line; not 2024 RAW).
  const deadly = Math.max(1, Math.round(high * 1.5));
  return {
    xp: preview.raw_xp,
    end: deadly,
    note: "The bar runs from no XP to the informal Deadly line (1.5 × High). The marker is this encounter.",
    bands: [
      { key: "Low", from: 0, to: low, label: "Low", num: `${low}`, soft: DIFFICULTY_TONE.Low.soft, help: help("Low") },
      { key: "Moderate", from: low, to: mod, label: "Moderate", num: `${mod}`, soft: DIFFICULTY_TONE.Moderate.soft, help: help("Moderate") },
      { key: "High", from: mod, to: high, label: "High", num: `${high}`, soft: DIFFICULTY_TONE.High.soft, help: help("High") },
      { key: "Deadly", from: high, to: deadly, label: "Deadly", num: `${deadly}+`, soft: DIFFICULTY_TONE.Deadly.soft, help: help("Deadly") },
    ],
  };
}

/**
 * Live difficulty meter (Plan 00031).
 *
 * Visual gauge of the encounter's adjusted XP against the party's three
 * thresholds (Low / Moderate / High / Deadly = 1.5 × High). The marker
 * slides along the bar as the DM tunes the roster. Plan 131: a 2014 campaign's
 * meter shows Easy / Medium / Hard / Deadly and the adjusted XP.
 */
export default function DifficultyMeter({ preview, isLoading = false }: Props) {
  if (!preview || preview.party_levels.length === 0) {
    return (
      <div style={emptyStyle}>
        Add characters to the campaign to see how hard this fight is for them.
      </div>
    );
  }

  const r = rulesetOf(preview.ruleset);
  const { difficulty } = preview;
  const { xp, bands, end, note } = barFor(preview);
  const pct = Math.min(100, Math.max(0, (xp / end) * 100));
  const at = (v: number) => Math.min(100, Math.max(0, (v / end) * 100));

  const label = difficulty ? (preview.difficulty_label ?? difficultyLabel(difficulty, r)) : null;
  const trivial = label === "Trivial";
  const help = trivial
    ? "Trivial: under the Easy line — hardly a fight."
    : difficulty
      ? difficultyHelp(difficulty, r)
      : undefined;
  const tone = difficulty && !trivial ? DIFFICULTY_TONE[difficulty] : null;
  const markerColor = tone?.strong ?? "var(--muted)";
  const how = difficultyHow(r);

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
        {label && (
          <span
            title={help}
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              color: tone?.text ?? "var(--text)",
              transition: "color 200ms ease",
            }}
          >
            {label}
          </span>
        )}
        <InfoTip title="How difficulty works">
          {help ? `${help}\n\n` : ""}
          {how}
          {"\n\n"}
          {note}
        </InfoTip>
        <span className="num" style={{ fontSize: "0.875rem", color: "var(--muted)", marginLeft: "auto" }}>
          {xp.toLocaleString()} XP
          {r === "2014" && preview.multiplier !== 1 && (
            <span title="The monsters' XP times the multiplier for how many there are">
              {" "}
              ({preview.raw_xp.toLocaleString()} × {preview.multiplier})
            </span>
          )}
          {isLoading && <span style={{ marginLeft: "0.4rem", opacity: 0.7 }}>updating…</span>}
        </span>
      </div>

      {/* The bar */}
      <div style={barOuterStyle} title={how}>
        {/* Threshold bands */}
        {bands.map((b) => (
          <div
            key={b.key}
            style={{
              ...bandStyle,
              left: `${at(b.from)}%`,
              width: `${at(b.to) - at(b.from)}%`,
              background: b.soft,
            }}
          />
        ))}

        {/* Section dividers */}
        {bands.slice(1).map((b) => (
          <div
            key={b.key}
            style={{
              position: "absolute",
              left: `${at(b.from)}%`,
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
        {bands.map((b) => (
          <span key={b.key} style={{ flex: at(b.to) - at(b.from) }} title={b.help}>
            {b.label}
            {b.num && (
              <>
                <br />
                <span className="num" style={{ color: "var(--text2)" }}>{b.num}</span>
              </>
            )}
          </span>
        ))}
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
