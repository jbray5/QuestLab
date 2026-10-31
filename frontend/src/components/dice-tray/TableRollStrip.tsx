import { useState } from "react";
import { Megaphone } from "lucide-react";

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
        padding: "0.65rem 0.75rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface2)",
      }}
    >
      <div
        style={{
          fontSize: "0.875rem",
          fontWeight: 600,
          color: "var(--text)",
          marginBottom: "0.4rem",
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          flexWrap: "wrap",
        }}
      >
        <Megaphone size={15} aria-hidden style={{ color: "var(--muted)" }} />
        Roll for the table
        <span style={{ color: "var(--muted)", fontWeight: 400, fontSize: "0.8125rem" }}>
          — every player&rsquo;s phone shows the result
        </span>
      </div>

      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", marginBottom: "0.5rem" }}>
        <label style={miniLabel} htmlFor="ql-table-roll-count">How many</label>
        <input
          id="ql-table-roll-count"
          type="number"
          min={1}
          max={20}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          className="num"
          style={miniInput}
        />
        <label style={{ ...miniLabel, marginLeft: "0.4rem" }} htmlFor="ql-table-roll-mod">Bonus</label>
        <input
          id="ql-table-roll-mod"
          type="number"
          value={modifier}
          onChange={(e) => setModifier(Number(e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
          className="num"
          style={miniInput}
        />
        {busy && <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>Sending…</span>}
      </div>

      <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
        {DICE.map((sides) => (
          <button
            key={sides}
            onClick={() => roll(sides)}
            disabled={busy}
            style={dieBtn}
            className="btn btn-secondary"
            title={`Roll ${Math.max(1, count)}d${sides} and broadcast to players`}
          >
            d{sides}
          </button>
        ))}
      </div>

      {error && (
        <div style={{ fontSize: "0.75rem", color: "var(--danger-text)", marginTop: "0.35rem" }}>
          {error}
        </div>
      )}

      {log.length > 0 && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {log.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "baseline",
                fontSize: "0.8125rem",
              }}
            >
              <span className="num" style={{ color: "var(--text2)" }}>{r.label}</span>
              <span className="num" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                {r.detail}
              </span>
              {(r.crit || r.fumble) && (
                <span style={{ fontSize: "0.75rem", color: r.crit ? "var(--teal-text)" : "var(--danger-text)" }}>
                  {r.crit ? "natural 20" : "natural 1"}
                </span>
              )}
              <span
                className="num"
                style={{
                  marginLeft: "auto",
                  fontWeight: 600,
                  fontSize: "0.95rem",
                  color: r.crit
                    ? "var(--teal-text)"
                    : r.fumble
                      ? "var(--danger-text)"
                      : "var(--text)",
                }}
              >
                {r.total}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const miniLabel: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--muted)",
  margin: 0,
  display: "inline",
};

const miniInput: React.CSSProperties = {
  width: 48,
  fontSize: "0.8125rem",
  padding: "0.2rem 0.3rem",
  textAlign: "center",
};

const dieBtn: React.CSSProperties = {
  flex: "1 0 auto",
  minWidth: 42,
  minHeight: 32,
  padding: "0.25rem 0.35rem",
  background: "transparent",
  border: "1px solid var(--border2)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: "0.8125rem",
  fontWeight: 500,
  fontFamily: "var(--font-mono)",
  cursor: "pointer",
};
