import { useEffect, useRef, useState } from "react";
import { Dices, Volume2, VolumeX } from "lucide-react";

import { playDiceClatter } from "../../lib/dice-sound";
import { useDicePrefs } from "../../hooks/useDicePrefs";

interface RollResult {
  id: number;
  label: string;     // e.g. "2d6+3"
  rolls: number[];   // individual die results
  modifier: number;  // flat bonus
  total: number;
  isCrit?: boolean;
  isFumble?: boolean;
}

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

/**
 * Floating dice tray (Plan 00030).
 *
 * A small 🎲 button in the bottom-right corner of the DM-side app.
 * Click to open a tray; click a die to roll. Supports count (2d6) and
 * modifier (+3). Last 8 rolls shown above. Sound effects gated by the
 * user's persisted preference.
 */
export default function DiceTray() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [history, setHistory] = useState<RollResult[]>([]);
  const [prefs, setPrefs] = useDicePrefs();
  const trayRef = useRef<HTMLDivElement | null>(null);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (trayRef.current && !trayRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Defer one tick so the click that opened the tray doesn't immediately close it.
    const t = setTimeout(() => {
      window.addEventListener("mousedown", onClick);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function roll(sides: number) {
    const n = Math.max(1, Math.min(20, Math.floor(count) || 1));
    const m = Math.floor(modifier) || 0;
    const rolls = Array.from({ length: n }, () => Math.floor(Math.random() * sides) + 1);
    const sum = rolls.reduce((a, b) => a + b, 0);
    const total = sum + m;

    const label = `${n}d${sides}${m === 0 ? "" : m > 0 ? `+${m}` : m}`;
    const result: RollResult = {
      id: Date.now() + Math.random(),
      label,
      rolls,
      modifier: m,
      total,
      isCrit: sides === 20 && n === 1 && rolls[0] === 20,
      isFumble: sides === 20 && n === 1 && rolls[0] === 1,
    };

    setHistory((h) => [result, ...h].slice(0, 8));
    if (prefs.soundEnabled) {
      try {
        playDiceClatter();
      } catch {
        /* AudioContext blocked; ignore */
      }
    }
  }

  return (
    <div
      ref={trayRef}
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 8000,
        fontFamily: "inherit",
      }}
    >
      {open && (
        <div
          className="ql-modal-in"
          style={{
            marginBottom: "0.5rem",
            width: 320,
            maxWidth: "calc(100vw - 32px)",
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            padding: "0.85rem",
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.5rem",
              marginBottom: "0.6rem",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong style={{ display: "block", color: "var(--text)", fontSize: "0.9375rem", fontWeight: 600 }}>
                Dice tray
              </strong>
              <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)" }}>
                Private — only you see these rolls
              </span>
            </div>
            <button
              onClick={() => setPrefs({ soundEnabled: !prefs.soundEnabled })}
              title={prefs.soundEnabled ? "Mute sound" : "Enable sound"}
              aria-pressed={prefs.soundEnabled}
              className="btn btn-ghost"
              style={{ minHeight: 28, padding: "0.15rem 0.5rem", fontSize: "0.8125rem", gap: "0.3rem", flex: "none" }}
            >
              {prefs.soundEnabled ? <Volume2 size={14} aria-hidden /> : <VolumeX size={14} aria-hidden />}
              {prefs.soundEnabled ? "Sound on" : "Sound off"}
            </button>
          </div>

          {/* History strip */}
          {history.length > 0 && (
            <div style={historyStripStyle}>
              {history.map((r) => (
                <div key={r.id} style={historyRowStyle}>
                  <span className="num" style={{ color: "var(--text2)" }}>{r.label}</span>
                  <span className="num" style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                    [{r.rolls.join(",")}]
                  </span>
                  {(r.isCrit || r.isFumble) && (
                    <span style={{ fontSize: "0.75rem", color: r.isCrit ? "var(--teal-text)" : "var(--danger-text)" }}>
                      {r.isCrit ? "natural 20" : "natural 1"}
                    </span>
                  )}
                  <span
                    className="num"
                    style={{
                      fontWeight: 600,
                      fontSize: "0.95rem",
                      color: r.isCrit
                        ? "var(--teal-text)"
                        : r.isFumble
                          ? "var(--danger-text)"
                          : "var(--text)",
                      marginLeft: "auto",
                    }}
                  >
                    {r.total}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Count + modifier */}
          <div
            style={{
              display: "flex",
              gap: "0.45rem",
              marginBottom: "0.6rem",
              alignItems: "center",
            }}
          >
            <label style={labelStyle} htmlFor="ql-dice-count">How many</label>
            <input
              id="ql-dice-count"
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              style={numberInputStyle}
            />
            <label style={{ ...labelStyle, marginLeft: "0.5rem" }} htmlFor="ql-dice-mod">Bonus</label>
            <input
              id="ql-dice-mod"
              type="number"
              value={modifier}
              onChange={(e) => setModifier(Number(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              style={numberInputStyle}
            />
          </div>

          {/* Die buttons */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "0.4rem",
            }}
          >
            {DICE.map((sides) => (
              <button
                key={sides}
                className="btn btn-secondary"
                onClick={() => roll(sides)}
                style={dieButtonStyle}
              >
                d{sides}
              </button>
            ))}
            <button
              className="btn btn-ghost"
              onClick={() => setHistory([])}
              disabled={history.length === 0}
              style={{ ...dieButtonStyle, fontFamily: "var(--font-ui)", fontSize: "0.8125rem", color: "var(--muted)" }}
              title="Clear history"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <button
        data-tour-id="dice-tray"
        onClick={() => setOpen(!open)}
        title={open ? "Close dice tray" : "Open dice tray"}
        aria-label="Dice tray"
        aria-expanded={open}
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: open ? "var(--accent-active)" : "var(--surface)",
          color: open ? "var(--accent-active-text)" : "var(--text)",
          border: `1px solid ${open ? "var(--accent-line)" : "var(--border2)"}`,
          cursor: "pointer",
          boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          transition: "background 150ms ease, border-color 150ms ease",
        }}
      >
        <Dices size={22} aria-hidden />
      </button>
    </div>
  );
}

const historyStripStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.15rem",
  marginBottom: "0.65rem",
  maxHeight: 140,
  overflowY: "auto",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "0.35rem 0.5rem",
};

const historyRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  alignItems: "baseline",
  fontSize: "0.8125rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--muted)",
  margin: 0,
  display: "inline",
};

const numberInputStyle: React.CSSProperties = {
  width: 52,
  padding: "0.25rem 0.4rem",
  fontFamily: "var(--font-mono)",
  fontSize: "0.875rem",
  textAlign: "center",
};

const dieButtonStyle: React.CSSProperties = {
  minHeight: 38,
  padding: "0.4rem 0.3rem",
  fontSize: "0.9375rem",
  fontWeight: 500,
  fontFamily: "var(--font-mono)",
};
