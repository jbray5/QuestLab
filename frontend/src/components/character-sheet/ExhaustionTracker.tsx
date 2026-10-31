import { useMutation, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";
import InfoTip from "./InfoTip";

interface Props {
  pc: PlayerCharacter;
  readOnly?: boolean;
}

/**
 * Exhaustion tracker (Plan 00024, 2024 RAW).
 *
 * 0–6 dot chain. 2024 rules: each level applies a cumulative −2 penalty
 * to D20 Tests (attack rolls, ability checks, saving throws). Level 6 = dead.
 * Long rest reduces by 1. Players adjust the level themselves via clicks.
 */
export default function ExhaustionTracker({ pc, readOnly = false }: Props) {
  const qc = useQueryClient();
  const level = Math.max(0, Math.min(6, pc.exhaustion ?? 0));

  const set = useMutation({
    mutationFn: (newLevel: number) =>
      charactersApi.update(pc.id, { exhaustion: newLevel }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character", pc.id] });
      qc.invalidateQueries({ queryKey: ["characters"] });
    },
  });

  const penalty = level * -2;
  const dead = level >= 6;
  // Lamplit: a condition reads amber; level 6 is death, red.
  const accent = dead
    ? "var(--danger)"
    : level > 0
      ? "var(--amber)"
      : "var(--border2)";
  const textAccent = dead ? "var(--danger-text)" : level > 0 ? "var(--amber-text)" : "var(--muted)";

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "0.5rem",
          marginBottom: "0.35rem",
        }}
      >
        <h4
          style={{
            fontSize: "0.9375rem",
            fontWeight: 600,
            margin: 0,
            color: "var(--text)",
          }}
        >
          Exhaustion
        </h4>
        <InfoTip title="Exhaustion (2024 rules)">
          0–6 scale. Each level applies a cumulative −2 penalty to all
          D20 Tests (attack rolls, ability checks, saving throws).
          Level 6 = death.{"\n\n"}
          When to apply: forced march without rest, going hungry/thirsty
          for too long, failing a CON save vs a harmful effect (e.g.
          extreme cold), the Ray of Sickness spell, certain monster
          attacks.{"\n\n"}
          Long rest reduces by 1. Click a dot to set the level.
        </InfoTip>
        <span
          style={{
            fontSize: "0.875rem",
            color: textAccent,
            fontWeight: 500,
          }}
        >
          Level <span className="num">{level}</span>
          {level > 0 && !dead && (
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
              {" "}
              · <span className="num">{penalty}</span> to every d20 roll
            </span>
          )}
          {dead && <span> · dead</span>}
        </span>
      </div>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => {
          const filled = i <= level;
          return (
            <button
              key={i}
              disabled={readOnly || set.isPending}
              onClick={() => {
                // Click the highest filled to drop it, otherwise raise to i
                const target = i === level ? level - 1 : i;
                set.mutate(target);
              }}
              title={`Set exhaustion to ${i === level ? level - 1 : i}`}
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                border: `2px solid ${i === 6 ? "var(--danger-line)" : accent}`,
                background: filled ? accent : "transparent",
                cursor: readOnly ? "default" : "pointer",
                padding: 0,
              }}
              aria-label={`Exhaustion level ${i}`}
            />
          );
        })}
      </div>
    </div>
  );
}
