import { useMutation, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";

interface Props {
  pc: PlayerCharacter;
  /** Die size for the PC's class — e.g. 8 for Cleric, 10 for Fighter. */
  dieSize: number;
  readOnly?: boolean;
}

/**
 * Hit Dice tracker (Plan 00024).
 *
 * Visual chain of pips — one per total HD = level. Filled pip = available,
 * empty pip = spent. Clicking an available pip spends one HD; clicking a
 * spent pip is a no-op. Healing itself is applied separately via the
 * Damage/Heal controls after the player rolls their HD plus CON mod.
 */
export default function HitDiceTracker({ pc, dieSize, readOnly = false }: Props) {
  const qc = useQueryClient();
  const total = pc.level;
  const spent = pc.hit_dice_spent ?? 0;
  const available = Math.max(0, total - spent);

  const spend = useMutation({
    mutationFn: (count: number) => charactersApi.spendHitDice(pc.id, count),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character", pc.id] });
      qc.invalidateQueries({ queryKey: ["characters"] });
    },
  });

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
            fontSize: "0.7rem",
            margin: 0,
            color: "var(--muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Hit Dice
        </h4>
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
          <strong style={{ color: "var(--gold)" }}>
            {available}
          </strong>
          /{total} · d{dieSize}
        </span>
      </div>
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        {Array.from({ length: total }).map((_, i) => {
          const isFilled = i < available;
          const clickable = !readOnly && isFilled && !spend.isPending;
          return (
            <button
              key={i}
              disabled={!clickable}
              onClick={() => spend.mutate(1)}
              title={
                isFilled
                  ? "Spend one Hit Die (roll d" + dieSize + " + CON, then Heal)"
                  : "Spent"
              }
              style={{
                width: 22,
                height: 22,
                padding: 0,
                borderRadius: 4,
                border: "1px solid var(--gold)",
                background: isFilled ? "var(--gold)" : "transparent",
                cursor: clickable ? "pointer" : "default",
                color: "var(--bg, #1a1a1a)",
                fontSize: "0.65rem",
                fontWeight: 700,
                fontFamily: "monospace",
                lineHeight: 1,
              }}
            >
              {isFilled ? `d${dieSize}` : ""}
            </button>
          );
        })}
      </div>
      <p
        style={{
          fontSize: "0.7rem",
          color: "var(--muted)",
          margin: "0.4rem 0 0",
        }}
      >
        Short rest: spend HD → roll d{dieSize} + CON mod → apply with Heal above.
        Long rest restores half (min 1).
      </p>
      {spend.isError && (
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--red, #ef5350)",
            margin: "0.3rem 0 0",
          }}
        >
          {(spend.error as Error)?.message ?? "Failed to spend HD"}
        </p>
      )}
    </div>
  );
}
