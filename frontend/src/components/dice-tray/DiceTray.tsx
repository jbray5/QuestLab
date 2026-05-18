import { useEffect, useRef, useState } from "react";

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
            background: "var(--surface, #1f1f1f)",
            border: "1px solid var(--gold)",
            borderRadius: 10,
            padding: "0.85rem",
            boxShadow: "0 12px 36px rgba(0, 0, 0, 0.6), 0 0 24px rgba(201, 168, 76, 0.15)",
          }}
        >
          {/* Header */}
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
                color: "var(--gold)",
                fontFamily: "Cinzel Decorative, serif",
                fontSize: "0.95rem",
                letterSpacing: "0.04em",
              }}
            >
              🎲 Dice Tray
            </strong>
            <button
              onClick={() => setPrefs({ soundEnabled: !prefs.soundEnabled })}
              title={prefs.soundEnabled ? "Mute sound" : "Enable sound"}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: prefs.soundEnabled ? "var(--gold)" : "var(--muted)",
                padding: "0.2rem 0.45rem",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {prefs.soundEnabled ? "🔊 On" : "🔇 Off"}
            </button>
          </div>

          {/* History strip */}
          {history.length > 0 && (
            <div style={historyStripStyle}>
              {history.map((r) => (
                <div key={r.id} style={historyRowStyle}>
                  <span style={{ color: "var(--muted)" }}>{r.label}</span>
                  <span style={{ fontFamily: "monospace", color: "var(--muted)", fontSize: "0.7rem" }}>
                    [{r.rolls.join(",")}]
                  </span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: r.isCrit
                        ? "var(--green2, #4caf50)"
                        : r.isFumble
                          ? "var(--red, #ef5350)"
                          : "var(--gold)",
                      fontFamily: "monospace",
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
              marginBottom: "0.55rem",
              alignItems: "center",
            }}
          >
            <label style={labelStyle}>Count</label>
            <input
              type="number"
              min={1}
              max={20}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              onFocus={(e) => e.currentTarget.select()}
              style={numberInputStyle}
            />
            <label style={{ ...labelStyle, marginLeft: "0.5rem" }}>Mod</label>
            <input
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
                onClick={() => roll(sides)}
                style={dieButtonStyle}
              >
                d{sides}
              </button>
            ))}
            <button
              onClick={() => setHistory([])}
              disabled={history.length === 0}
              style={{ ...dieButtonStyle, fontSize: "0.7rem", color: "var(--muted)" }}
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
        title="Open dice tray"
        aria-expanded={open}
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: open ? "var(--gold)" : "var(--surface, #1f1f1f)",
          color: open ? "var(--bg, #1a1a1a)" : "var(--gold)",
          border: "2px solid var(--gold)",
          fontSize: "1.4rem",
          cursor: "pointer",
          boxShadow:
            "0 8px 22px rgba(0,0,0,0.5), 0 0 18px rgba(201, 168, 76, 0.25)",
          transition: "transform 200ms ease, background 200ms ease",
          transform: open ? "rotate(20deg)" : "rotate(0deg)",
        }}
      >
        🎲
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
  alignItems: "center",
  fontSize: "0.78rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  color: "var(--muted)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const numberInputStyle: React.CSSProperties = {
  width: 50,
  padding: "0.25rem 0.4rem",
  fontFamily: "monospace",
  fontSize: "0.85rem",
  textAlign: "center",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
};

const dieButtonStyle: React.CSSProperties = {
  padding: "0.55rem 0.4rem",
  background: "var(--surface2)",
  border: "1px solid var(--gold)",
  borderRadius: 6,
  color: "var(--gold)",
  fontSize: "0.95rem",
  fontWeight: 700,
  fontFamily: "Cinzel Decorative, serif",
  cursor: "pointer",
  transition: "background 150ms ease, transform 150ms ease",
};
