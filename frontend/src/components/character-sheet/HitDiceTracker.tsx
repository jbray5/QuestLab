import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";
import InfoTip from "./InfoTip";

interface Props {
  pc: PlayerCharacter;
  /** Die size for the PC's class — e.g. 8 for Cleric, 10 for Fighter. */
  dieSize: number;
  readOnly?: boolean;
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Hit Dice tracker (Plan 00024 + real-die polish).
 *
 * Visual pip chain — one per total HD = level. Filled = available, empty
 * = spent. Click an available pip to open the spend flow:
 *
 *   1. Reminds the player to roll a real dN (or 🎲 digital fallback)
 *   2. Enter the die result; total = result + CON mod is computed live
 *   3. "Apply" spends 1 HD AND applies the healing in two atomic calls
 *
 * Long rest restores half (min 1) — handled server-side.
 */
export default function HitDiceTracker({ pc, dieSize, readOnly = false }: Props) {
  const qc = useQueryClient();
  const total = pc.level;
  const spent = pc.hit_dice_spent ?? 0;
  const available = Math.max(0, total - spent);
  const conMod = mod(pc.score_con);

  // Open spend flow when truthy (acts as a flag — single pip at a time).
  const [flowOpen, setFlowOpen] = useState(false);
  const [dieResult, setDieResult] = useState<number | "">("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (flowOpen) {
      setDieResult("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [flowOpen]);

  const spend = useMutation({
    mutationFn: async (heal: number) => {
      await charactersApi.spendHitDice(pc.id, 1);
      return charactersApi.applyHealing(pc.id, heal);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character", pc.id] });
      qc.invalidateQueries({ queryKey: ["characters"] });
      setFlowOpen(false);
      setDieResult("");
    },
  });

  // Plan 38/39 P2-5 — DM-only restore for a misclicked Spend HD.
  // Clicking a SPENT pip while !readOnly triggers a confirm + restore.
  const restore = useMutation({
    mutationFn: () => charactersApi.restoreHitDice(pc.id, 1),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["character", pc.id] });
      qc.invalidateQueries({ queryKey: ["characters"] });
    },
  });

  const value = dieResult === "" ? null : Number(dieResult);
  const valid = value !== null && value >= 1 && value <= dieSize;
  const totalHeal = valid ? Math.max(1, (value as number) + conMod) : null;

  function rollDigital() {
    setDieResult(Math.floor(Math.random() * dieSize) + 1);
  }

  function handleApply() {
    if (totalHeal === null) return;
    spend.mutate(totalHeal);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (v === "") {
      setDieResult("");
      return;
    }
    const n = Math.max(1, Math.min(dieSize, Math.floor(Number(v))));
    setDieResult(n);
  }

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
        <InfoTip title="Hit Dice (short-rest healing)">
          Each PC has one Hit Die per level (this PC: d{dieSize}).{"\n\n"}
          During a short rest (1 hour), the player can spend any number of
          HD. For each: roll the die, add the PC's CON mod
          ({fmt(conMod)}), and heal that much.{"\n\n"}
          Half (min 1) recover on a long rest. Click an available pip
          below to roll one now.
        </InfoTip>
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
          <strong style={{ color: "var(--gold)" }}>{available}</strong>
          /{total} · d{dieSize}
        </span>
      </div>
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        {Array.from({ length: total }).map((_, i) => {
          const isFilled = i < available;
          const spendClickable =
            !readOnly && isFilled && !flowOpen && !spend.isPending;
          // DM-only restore: clicking an empty pip while !readOnly
          // reverses a Spend HD (misclick undo).
          const restoreClickable =
            !readOnly && !isFilled && !flowOpen && !restore.isPending;
          const clickable = spendClickable || restoreClickable;
          return (
            <button
              key={i}
              disabled={!clickable}
              onClick={() => {
                if (spendClickable) {
                  setFlowOpen(true);
                } else if (restoreClickable) {
                  if (window.confirm("Restore 1 spent Hit Die? (DM override)")) {
                    restore.mutate();
                  }
                }
              }}
              title={
                isFilled
                  ? `Spend one Hit Die (roll d${dieSize} + CON ${fmt(conMod)})`
                  : readOnly
                    ? "Spent"
                    : "Spent — click to restore (DM override)"
              }
              style={{
                width: 24,
                height: 24,
                padding: 0,
                borderRadius: 4,
                border: isFilled
                  ? "1px solid var(--gold)"
                  : restoreClickable
                    ? "1px dashed var(--gold)"
                    : "1px solid var(--gold)",
                background: isFilled ? "var(--gold)" : "transparent",
                cursor: clickable ? "pointer" : "default",
                color: "var(--bg, #1a1a1a)",
                fontSize: "0.65rem",
                fontWeight: 700,
                fontFamily: "monospace",
                lineHeight: 1,
                opacity: !isFilled && !restoreClickable ? 0.55 : 1,
              }}
            >
              {isFilled ? `d${dieSize}` : restoreClickable ? "↺" : ""}
            </button>
          );
        })}
      </div>

      {flowOpen && (
        <div
          style={{
            marginTop: "0.6rem",
            padding: "0.6rem 0.75rem",
            background: "var(--surface2)",
            border: "1px solid var(--gold)",
            borderRadius: 6,
          }}
        >
          <div
            style={{
              fontSize: "0.72rem",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.4rem",
            }}
          >
            🎲 Roll 1d{dieSize} + CON {fmt(conMod)}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              ref={inputRef}
              type="number"
              min={1}
              max={dieSize}
              value={dieResult}
              onChange={handleChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && totalHeal !== null) handleApply();
                if (e.key === "Escape") setFlowOpen(false);
              }}
              placeholder="?"
              style={{
                width: 70,
                fontSize: "1.2rem",
                fontFamily: "monospace",
                fontWeight: 700,
                textAlign: "center",
                padding: "0.25rem 0.4rem",
                background: "var(--surface)",
                border: "1px solid var(--gold)",
                borderRadius: 4,
                color: "var(--text)",
              }}
            />
            <button
              onClick={rollDigital}
              className="btn btn-ghost"
              style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
              title="Roll a digital die instead"
            >
              🎲 Digital
            </button>
            <span
              style={{
                fontFamily: "monospace",
                fontSize: "0.95rem",
                color: totalHeal !== null ? "var(--green2, #4caf50)" : "var(--muted)",
                fontWeight: 700,
              }}
            >
              Heal {totalHeal !== null ? `+${totalHeal}` : "—"}
            </span>
            {valid && (
              <span style={{ fontFamily: "monospace", fontSize: "0.72rem", color: "var(--muted)" }}>
                ({value} + {fmt(conMod)})
              </span>
            )}
            <span style={{ flex: 1 }} />
            <button
              onClick={handleApply}
              disabled={totalHeal === null || spend.isPending}
              className="btn btn-primary"
              style={{ fontSize: "0.78rem", padding: "0.3rem 0.7rem" }}
            >
              Apply heal &amp; spend 1 HD
            </button>
            <button
              onClick={() => {
                setFlowOpen(false);
                setDieResult("");
              }}
              className="btn btn-ghost"
              style={{ fontSize: "0.72rem", padding: "0.3rem 0.55rem" }}
            >
              Cancel
            </button>
          </div>
          {spend.isError && (
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--red, #ef5350)",
                marginTop: "0.3rem",
              }}
            >
              {(spend.error as Error)?.message ?? "Failed to spend HD"}
            </div>
          )}
        </div>
      )}

      {!flowOpen && (
        <p
          style={{
            fontSize: "0.7rem",
            color: "var(--muted)",
            margin: "0.4rem 0 0",
          }}
        >
          Short rest: click an available pip → roll d{dieSize} + CON {fmt(conMod)} → apply heal.
          Long rest restores half (min 1).
        </p>
      )}
    </div>
  );
}
