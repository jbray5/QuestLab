import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  encountersApi,
  type EncounterDifficulty,
  type ThemedMonsterSuggestion,
} from "../../api/encounters";

interface Props {
  adventureId: string;
  /** Called when the DM clicks "Add" on a suggestion card. */
  onAdd: (suggestion: ThemedMonsterSuggestion) => void;
  /** Called when the DM clicks "Add all". */
  onAddAll?: (suggestions: ThemedMonsterSuggestion[]) => void;
}

const DIFFICULTIES: EncounterDifficulty[] = ["Low", "Moderate", "High", "Deadly"];

/**
 * Themed-suggestion panel (Plan 00031).
 *
 * A button + selectable difficulty + on-demand AI call. Renders the
 * resulting suggestion cards with an "Add" CTA each.
 */
export default function SuggestionsPanel({ adventureId, onAdd, onAddAll }: Props) {
  const [target, setTarget] = useState<EncounterDifficulty>("Moderate");

  const suggest = useMutation({
    mutationFn: () => encountersApi.suggestMonsters(adventureId, target),
  });

  return (
    <div style={wrapperStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          flexWrap: "wrap",
          marginBottom: suggest.data ? "0.65rem" : 0,
        }}
      >
        <strong
          style={{
            fontSize: "0.75rem",
            color: "var(--gold)",
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            fontFamily: "Cinzel Decorative, serif",
          }}
        >
          ✨ Themed suggestions
        </strong>

        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>Target</span>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value as EncounterDifficulty)}
          style={{
            fontSize: "0.78rem",
            padding: "0.2rem 0.4rem",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text)",
          }}
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <button
          className="btn btn-primary"
          style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem", marginLeft: "auto" }}
          onClick={() => suggest.mutate()}
          disabled={suggest.isPending}
        >
          {suggest.isPending ? "Asking the AI…" : "Suggest"}
        </button>
      </div>

      {suggest.isError && (
        <p style={{ color: "var(--crimson2)", fontSize: "0.78rem", margin: 0 }}>
          {(suggest.error as Error)?.message ?? "Suggestion request failed."}
        </p>
      )}

      {suggest.data && (
        <>
          {suggest.data.encounter_concept && (
            <p
              style={{
                fontStyle: "italic",
                fontSize: "0.85rem",
                color: "var(--text)",
                marginTop: 0,
                marginBottom: "0.6rem",
                padding: "0.5rem 0.7rem",
                background: "var(--surface)",
                borderLeft: "3px solid var(--gold)",
                borderRadius: 4,
              }}
            >
              {suggest.data.encounter_concept}
            </p>
          )}

          {suggest.data.suggestions.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: "0.78rem", margin: 0 }}>
              No suggestions came back. Try again — or pick a different difficulty.
            </p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {suggest.data.suggestions.map((s) => (
                  <div key={s.monster_id + s.monster_name} style={cardStyle}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--gold)",
                          fontSize: "0.88rem",
                        }}
                      >
                        ×{s.count} {s.monster_name}{" "}
                        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.7rem" }}>
                          CR {s.challenge_rating} · {s.xp} XP each
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--muted)",
                          marginTop: "0.15rem",
                          fontStyle: "italic",
                        }}
                      >
                        {s.rationale}
                      </div>
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: "0.75rem", padding: "0.25rem 0.55rem", flexShrink: 0 }}
                      onClick={() => onAdd(s)}
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>

              {onAddAll && suggest.data.suggestions.length > 1 && (
                <button
                  className="btn btn-ghost"
                  style={{
                    fontSize: "0.75rem",
                    padding: "0.3rem 0.7rem",
                    marginTop: "0.6rem",
                  }}
                  onClick={() => onAddAll(suggest.data!.suggestions)}
                >
                  + Add all
                </button>
              )}
            </>
          )}
        </>
      )}

      {!suggest.data && !suggest.isPending && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--muted)",
            margin: "0.5rem 0 0",
          }}
        >
          Reads the adventure's title, synopsis, and location notes; picks
          4–6 monsters from your catalog that fit the theme.
        </p>
      )}
    </div>
  );
}

const wrapperStyle: React.CSSProperties = {
  background: "var(--surface2)",
  border: "1px solid var(--gold)",
  borderRadius: 8,
  padding: "0.7rem 0.85rem",
  marginBottom: "0.75rem",
};

const cardStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.75rem",
  padding: "0.5rem 0.7rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 6,
};
