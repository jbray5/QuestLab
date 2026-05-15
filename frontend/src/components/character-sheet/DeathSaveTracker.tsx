import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";
import InfoTip from "./InfoTip";

interface Props {
  pc: PlayerCharacter;
  readOnly?: boolean;
}

/**
 * Death-save tracker (Plan 00023).
 *
 * Auto-renders only when ``hp_current == 0``. Three success and three
 * failure pips reflect ``death_save_successes`` / ``death_save_failures``.
 * The "Roll death save" button prompts the player for their real d20 result
 * and applies it server-side per 2024 RAW: nat 20 revives to 1 HP, nat 1
 * counts as two failures, ≥10 success, <10 failure.
 */
export default function DeathSaveTracker({ pc, readOnly = false }: Props) {
  const qc = useQueryClient();
  const [pendingD20, setPendingD20] = useState<number | "">("");
  const [showInput, setShowInput] = useState(false);

  const mutate = useMutation({
    mutationFn: (d20: number) => charactersApi.resolveDeathSave(pc.id, d20),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character", pc.id] });
      qc.invalidateQueries({ queryKey: ["characters"] });
      setPendingD20("");
      setShowInput(false);
    },
  });

  const successes = pc.death_save_successes;
  const failures = pc.death_save_failures;
  const stable = successes >= 3;
  const dead = failures >= 3;

  const stateLabel = dead
    ? "💀 DEAD — 3 failures"
    : stable
      ? "💤 STABLE — 3 successes"
      : "💀 DYING — Make death saves";

  const stateColor = dead
    ? "var(--red, #ef5350)"
    : stable
      ? "var(--muted)"
      : "var(--gold)";

  function handleRoll() {
    if (pendingD20 === "") return;
    const v = Math.max(1, Math.min(20, Math.floor(Number(pendingD20))));
    mutate.mutate(v);
  }

  function rollDigital() {
    const v = Math.floor(Math.random() * 20) + 1;
    mutate.mutate(v);
  }

  return (
    <section
      style={{
        background: "var(--surface)",
        border: `2px solid ${stateColor}`,
        borderRadius: 8,
        padding: "0.85rem 1rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <strong
          style={{
            color: stateColor,
            fontSize: "0.95rem",
            fontFamily: "Cinzel Decorative, serif",
            letterSpacing: "0.04em",
          }}
        >
          {stateLabel}
        </strong>
        <InfoTip title="Death Saves">
          When a PC drops to 0 HP they are dying. At the start of each of
          their turns they roll a d20 (no modifier){"—"}this is a
          death save.{"\n\n"}
          ≥10 = success · &lt;10 = failure · nat 1 = 2 failures ·
          nat 20 = revive at 1 HP{"\n\n"}
          3 successes = stable (unconscious but no longer dying).
          3 failures = dead.{"\n\n"}
          Any healing brings them to that many HP and clears the tracks.
        </InfoTip>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0.75rem",
          marginBottom: "0.7rem",
        }}
      >
        <PipRow label="Successes" filled={successes} color="var(--green2, #4caf50)" />
        <PipRow label="Failures" filled={failures} color="var(--red, #ef5350)" />
      </div>

      {!readOnly && !stable && !dead && (
        <>
          {!showInput && (
            <button
              onClick={() => setShowInput(true)}
              className="btn btn-primary"
              style={{ width: "100%", fontSize: "0.85rem" }}
            >
              Roll death save
            </button>
          )}
          {showInput && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              <label
                style={{
                  fontSize: "0.7rem",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Your real d20 result (1–20)
              </label>
              <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
                <input
                  type="number"
                  min={1}
                  max={20}
                  autoFocus
                  value={pendingD20}
                  onChange={(e) =>
                    setPendingD20(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRoll();
                    if (e.key === "Escape") {
                      setShowInput(false);
                      setPendingD20("");
                    }
                  }}
                  placeholder="?"
                  style={{
                    width: 70,
                    fontSize: "1.2rem",
                    fontFamily: "monospace",
                    fontWeight: 700,
                    textAlign: "center",
                    padding: "0.25rem 0.4rem",
                    background: "var(--surface2)",
                    border: "1px solid var(--gold)",
                    borderRadius: 4,
                    color: "var(--text)",
                  }}
                />
                <button
                  onClick={handleRoll}
                  disabled={pendingD20 === "" || mutate.isPending}
                  className="btn btn-primary"
                  style={{ fontSize: "0.8rem", padding: "0.3rem 0.7rem" }}
                >
                  Apply
                </button>
                <button
                  onClick={rollDigital}
                  disabled={mutate.isPending}
                  className="btn btn-ghost"
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                  title="Roll a digital d20 instead"
                >
                  🎲 Digital
                </button>
                <button
                  onClick={() => {
                    setShowInput(false);
                    setPendingD20("");
                  }}
                  className="btn btn-ghost"
                  style={{ fontSize: "0.75rem", padding: "0.3rem 0.65rem" }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                ≥10 success · &lt;10 failure · nat 1 = 2 failures · nat 20 = revive at 1 HP
              </div>
            </div>
          )}
          {mutate.isError && (
            <div
              style={{
                marginTop: "0.4rem",
                fontSize: "0.75rem",
                color: "var(--red, #ef5350)",
              }}
            >
              {(mutate.error as Error)?.message ?? "Failed to apply death save"}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PipRow({ label, filled, color }: { label: string; filled: number; color: string }) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.65rem",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "0.2rem",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", gap: "0.4rem" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              display: "inline-block",
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              background: i < filled ? color : "transparent",
            }}
            aria-label={i < filled ? "filled" : "empty"}
          />
        ))}
      </div>
    </div>
  );
}
