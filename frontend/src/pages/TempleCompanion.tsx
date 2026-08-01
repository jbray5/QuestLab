import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import BossMode, { INITIAL_BOSS, type BossState } from "../components/temple/BossMode";
import TempleCanvas from "../components/temple/TempleCanvas";
import { TEMPLE_CSS } from "../components/temple/templeCss";
import {
  CUT_ORDER,
  DM_WARNING,
  EDRIK,
  LAIR_ACTIONS,
  MIRA,
  NEREA,
  PHASES,
  ROOMS,
  type Room,
} from "../components/temple/templeContent";

/**
 * The Temple Companion (Plan 58) — campaigns/:campaignId/temple.
 *
 * A DM cockpit for the drowned-temple crawl: the blueprint cutaway with
 * live room pins, a drawer holding exactly one room's run-content, a
 * draggable party marker, and the Nerea boss tracker.
 *
 * DM-only and entirely client-side — content is static and never player
 * visible, so state (checkboxes, marker, boss) lives in localStorage per
 * campaign. Nothing here touches a session-critical path.
 *
 * Keys: 1–5 rooms · T gallery · B boss · ← → walk the route · P print.
 */

interface Persisted {
  checks: Record<string, boolean>;
  marker: { x: number; y: number };
  currentId: string;
  boss: BossState;
}

/** Swap in the DM's painted cutaway when it lands — pins keep their coords. */
const ART_URL: string | null = null;

const SHIP = { x: 470, y: 130 };

function storageKey(campaignId: string) {
  return `ql-temple-${campaignId}`;
}

function load(campaignId: string): Persisted {
  const base: Persisted = {
    checks: {},
    marker: SHIP,
    currentId: ROOMS[0].id,
    boss: INITIAL_BOSS,
  };
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      checks: parsed.checks ?? base.checks,
      marker: parsed.marker ?? base.marker,
      currentId: parsed.currentId ?? base.currentId,
      boss: { ...INITIAL_BOSS, ...(parsed.boss ?? {}) },
    };
  } catch {
    return base;
  }
}

export default function TempleCompanion() {
  const { campaignId = "" } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<Persisted>(() => load(campaignId));
  const [bossOpen, setBossOpen] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Persist on every change — the DM should never lose ticks mid-session.
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(campaignId), JSON.stringify(state));
    } catch {
      // storage blocked — the session still runs, ticks just don't survive reload
    }
  }, [campaignId, state]);

  const current = useMemo(
    () => ROOMS.find((r) => r.id === state.currentId) ?? ROOMS[0],
    [state.currentId],
  );

  const goToRoom = useCallback((room: Room) => {
    setState((s) => ({ ...s, currentId: room.id, marker: { x: room.x, y: room.y } }));
    setBossOpen(room.kind === "boss" ? true : false);
  }, []);

  const step = useCallback((delta: number) => {
    setState((s) => {
      const idx = ROOMS.findIndex((r) => r.id === s.currentId);
      const next = ROOMS[Math.max(0, Math.min(ROOMS.length - 1, idx + delta))];
      return { ...s, currentId: next.id, marker: { x: next.x, y: next.y } };
    });
  }, []);

  // Keyboard cockpit.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "escape" && printing) return setPrinting(false);
      if (k === "p") {
        e.preventDefault();
        return setPrinting((v) => !v);
      }
      if (k === "b") {
        e.preventDefault();
        return setBossOpen((v) => !v);
      }
      if (k === "arrowright") {
        e.preventDefault();
        return step(1);
      }
      if (k === "arrowleft") {
        e.preventDefault();
        return step(-1);
      }
      const room = ROOMS.find((r) => r.key === k);
      if (room) {
        e.preventDefault();
        goToRoom(room);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goToRoom, step, printing]);

  function toggleCheck(id: string) {
    setState((s) => ({ ...s, checks: { ...s.checks, [id]: !s.checks[id] } }));
  }

  /** Drag: move the token freely, and adopt the nearest pin as current. */
  function onMarkerMove(pt: { x: number; y: number }) {
    setState((s) => {
      let nearest = ROOMS[0];
      let best = Infinity;
      for (const r of ROOMS) {
        const d = (r.x - pt.x) ** 2 + (r.y - pt.y) ** 2;
        if (d < best) {
          best = d;
          nearest = r;
        }
      }
      return { ...s, marker: pt, currentId: nearest.id };
    });
  }

  const dealt = NEREA.maxHp - state.boss.hp;

  return (
    <div className={`tc-root${printing ? " printing" : ""}`}>
      <style>{TEMPLE_CSS}</style>

      {/* ── Cockpit ── */}
      <div className="tc-left">
        <div className="tc-bar">
          {/* The cockpit is full-bleed and covers the nav — this is the way out. */}
          <button className="tc-ghost" title="Leave the cockpit" onClick={() => navigate(-1)}>
            ← back
          </button>
          <h1>The Drowned Temple — Companion</h1>
          <span className="tc-warnpill">{DM_WARNING}</span>
          <button className={`tc-ghost${bossOpen ? " on" : ""}`} onClick={() => setBossOpen((v) => !v)}>
            ☠ Boss mode
          </button>
          <button className="tc-ghost" onClick={() => setPrinting(true)}>
            🖨 Print sheet
          </button>
          <span className="tc-keys">1–5 rooms · T gallery · B boss · ← → walk · P print</span>
        </div>
        <TempleCanvas
          currentId={state.currentId}
          marker={state.marker}
          artUrl={ART_URL}
          onPick={goToRoom}
          onMarkerMove={onMarkerMove}
        />
      </div>

      {/* ── Drawer ── */}
      <aside className="tc-drawer">
        {bossOpen ? (
          <BossMode state={state.boss} onChange={(boss) => setState((s) => ({ ...s, boss }))} />
        ) : (
          <>
            <div className="tc-room-head">
              <span className="tc-room-numeral" style={{ color: current.color }}>
                {current.numeral}
              </span>
              <span className="tc-room-title">{current.title}</span>
              <span className="tc-room-kind" style={{ color: current.color }}>
                {current.kind}
              </span>
            </div>

            {current.player && (
              <div className="tc-player">
                <span className="tc-player-badge">🖥 ON THE PLAYERS' SCREEN</span>
                {current.player.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            )}

            <div className="tc-read">
              <span className="tc-read-badge">📖 READ ALOUD</span>
              {current.readAloud}
            </div>

            {current.beats.map((beat, i) => {
              const id = beat.check ? `${current.id}:${beat.check}` : "";
              const done = id ? !!state.checks[id] : false;
              return (
                <div
                  key={i}
                  className={`tc-beat tone-${beat.tone ?? "plain"}${done ? " done" : ""}`}
                >
                  {beat.check && (
                    <input type="checkbox" checked={done} onChange={() => toggleCheck(id)} />
                  )}
                  <span>{beat.text}</span>
                </div>
              );
            })}

            {current.stats?.map((s) => (
              <div key={s.name} className="tc-statcard">
                <b>
                  {s.count && s.count > 1 ? `${s.count}× ` : ""}
                  {s.name}
                </b>
                <div className="tc-statline">{s.line}</div>
                {s.hp !== undefined &&
                  Array.from({ length: s.count ?? 1 }).map((_, i) => {
                    const id = `${current.id}:${s.name}:${i}`;
                    return (
                      <ReacherHp
                        key={id}
                        label={`#${i + 1}`}
                        max={s.hp!}
                        onDown={() =>
                          setState((st) => ({
                            ...st,
                            checks: { ...st.checks, [`${id}:down`]: !st.checks[`${id}:down`] },
                          }))
                        }
                        down={!!state.checks[`${id}:down`]}
                      />
                    );
                  })}
              </div>
            ))}

            {current.links?.map((l) => (
              <a key={l.href} className="tc-link" href={l.href} target="_blank" rel="noreferrer">
                {l.label}
              </a>
            ))}

            {current.kind === "boss" && (
              <button className="tc-ghost" style={{ marginTop: "0.8rem" }} onClick={() => setBossOpen(true)}>
                ☠ open boss mode
              </button>
            )}

            <div className="tc-cut">
              <b>CUT ORDER:</b> {CUT_ORDER}
            </div>
          </>
        )}
      </aside>

      {/* ── Print sheet: the paper fallback ── */}
      <div className="tc-print">
        {printing && (
          <button className="tc-ghost tc-print-back" onClick={() => setPrinting(false)}>
            ← back to the cockpit
          </button>
        )}
        <h1>THE DROWNED TEMPLE — DM BLUEPRINT</h1>
        <div className="tc-warnpill">{DM_WARNING}</div>

        {ROOMS.map((room) => (
          <div key={room.id} className="tc-print-room">
            <h2>
              {room.numeral} {room.title.toUpperCase()} — {room.kind}
            </h2>
            <div className="tc-print-read">{room.readAloud}</div>
            {room.beats.map((b, i) => (
              <div key={i} className={`tc-print-beat${b.tone === "dm" ? " dm" : ""}`}>
                • {b.text}
              </div>
            ))}
            {room.stats?.map((s) => (
              <div key={s.name} className="tc-print-beat">
                • {s.count && s.count > 1 ? `${s.count}× ` : ""}
                {s.name}: HP {s.hp} · {s.line}
              </div>
            ))}
          </div>
        ))}

        <div className="tc-print-box">
          <b>{NEREA.name}</b> — HP {NEREA.maxHp} · {NEREA.line}
          <div>
            Phases (damage dealt):{" "}
            {PHASES.map((p) => `${p.at} → ${p.label}`).join(" · ")}
          </div>
          <div>
            Lair actions (init 20, pick one):{" "}
            {LAIR_ACTIONS.map((a) => `${a.name} (${a.detail})`).join(" · ")}
          </div>
          <div>
            Edrik {EDRIK.freeing} → fights: {EDRIK.allyLine} · removes Chains Tighten
          </div>
          <div>
            {MIRA.label}: HP {MIRA.maxHp} · {MIRA.line}
          </div>
        </div>

        <div className="tc-print-cut">
          <b>CUT ORDER:</b> {CUT_ORDER}
        </div>
        {dealt > 0 && (
          <div className="tc-print-cut">
            (tracker at print time: Nerea {state.boss.hp}/{NEREA.maxHp}, round {state.boss.round})
          </div>
        )}
      </div>
    </div>
  );
}

/** One reacher's down/up toggle — three of them, tracked at a glance. */
function ReacherHp({
  label,
  max,
  down,
  onDown,
}: {
  label: string;
  max: number;
  down: boolean;
  onDown: () => void;
}) {
  return (
    <label className="tc-toggle" style={{ fontSize: "0.8rem" }}>
      <input type="checkbox" checked={down} onChange={onDown} />
      <span style={{ textDecoration: down ? "line-through" : "none", opacity: down ? 0.5 : 1 }}>
        {label} · HP {max} {down ? "· down" : ""}
      </span>
    </label>
  );
}
