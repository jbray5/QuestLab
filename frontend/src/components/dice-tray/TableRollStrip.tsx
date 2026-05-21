import { useState } from "react";

import { sessionsApi } from "../../api/sessions";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

interface LocalRoll {
  id: number;
  label: string;
  detail: string;
  total: number;
  crit: boolean;
  fumble: boolean;
}

/**
 * "Roll for the Table" strip (Plan 39).
 *
 * A public dice roller embedded in the SessionHud. Every roll here is
 * broadcast to the attending players' phones via
 * POST /sessions/{id}/dice-roll. Distinct from the floating DiceTray,
 * which stays private to the DM — the DM picks visibility by choosing
 * which roller to use.
 */
export default function TableRollStrip({ sessionId }: { sessionId: string }) {
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [log, setLog] = useState<LocalRoll[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function roll(sides: number) {
    const n = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const m = Math.floor(modifier) || 0;
    const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * sides) + 1);
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + m;
    const label = `${n}d${sides}${m === 0 ? "" : m > 0 ? `+${m}` : m}`;
    const detail = `[${rolls.join(", ")}]${m !== 0 ? ` ${m > 0 ? "+" : ""}${m}` : ""}`;
    const crit = sides === 20 && n === 1 && rolls[0] === 20;
    const fumble = sides === 20 && n === 1 && rolls[0] === 1;

    const local: LocalRoll = { id: Date.now() + Math.random(), label, detail, total, crit, fumble };
    setLog((l) => [local, ...l].slice(0, 6));

    setBusy(true);
    setError(null);
    try {
      await sessionsApi.broadcastDiceRoll(sessionId, {
        label,
        detail,
        total,
        crit,
        fumble,
        roller: "DM",
      });
    } catch (e) {
      setError((e as Error)?.message ?? "Broadcast failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      style={{
        padding: "0.5rem 0.75rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface2)",
      }}
    >
      <div
        style={{
          fontSize: "0.62rem",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "0.35rem",
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
        }}
      >
        🎲 Roll for the Table
        <span style={{ color: "var(--gold)", textTransform: "none", letterSpacing: 0 }}>
          — players see these
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", marginBottom: "0.4rem" }}>
        <label style={miniLabel}>×</label>
        <input
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          style={miniInput}
        />
        <label style={{ ...miniLabel, marginLeft: "0.3rem" }}>mod</label>
        <input
          type="number"
          value={modifier}
          onChange={(e) => setModifier(Number(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          style={miniInput}
        />
        {busy && <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>broadcasting…</span>}
      </div>

      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
        {DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => roll(sides)}
            disabled={busy}
            style={dieBtn}
            title={`Roll ${Math.max(1, count)}d${sides} and broadcast to players`}
          >
            d{sides}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ fontSize: "0.65rem", color: "var(--red, #ef5350)", marginTop: "0.3rem" }}>
          {error}
        </div>
      )}

      {log.length > 0 && (
        <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
          {log.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                gap: "0.4rem",
                alignItems: "center",
                fontSize: "0.72rem",
              }}
            >
              <span style={{ color: "var(--muted)" }}>{r.label}</span>
              <span style={{ color: "var(--muted)", fontSize: "0.65rem", fontFamily: "monospace" }}>
                {r.detail}
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontWeight: 700,
                  fontFamily: "monospace",
                  color: r.crit
                    ? "var(--green2, #4caf50)"
                    : r.fumble
                      ? "var(--red, #ef5350)"
                      : "var(--gold)",
                }}
              >
                {r.total}
                {r.crit ? " ✦" : r.fumble ? " ✦" : ""}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const miniLabel: React.CSSProperties = {
  fontSize: "0.6rem",
  color: "var(--muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
};

const miniInput: React.CSSProperties = {
  width: 42,
  fontSize: "0.72rem",
  padding: "0.15rem 0.3rem",
  textAlign: "center",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
};

const dieBtn: React.CSSProperties = {
  flex: "1 0 auto",
  minWidth: 38,
  padding: "0.3rem 0.35rem",
  background: "var(--surface)",
  border: "1px solid var(--gold)",
  borderRadius: 5,
  color: "var(--gold)",
  fontSize: "0.78rem",
  fontWeight: 700,
  fontFamily: "Cinzel Decorative, serif",
  cursor: "pointer",
};
