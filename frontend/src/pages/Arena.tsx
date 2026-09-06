import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiBase } from "../api/client";

/**
 * Arena (Plan 84) — the Practice Arena on the player's phone. A one-on-one
 * sparring match against a catalog foe, refereed by the server's rules engine
 * with the player's real sheet: their weapons, cantrips, spells, slots and a
 * few modeled features. Nothing here writes to the character; the whole fight
 * is one JSON document this page holds (and keeps in localStorage so a
 * pocket-refresh doesn't lose it). Free: no AI anywhere in the loop.
 */

interface ArenaAttack {
  key: string;
  name: string;
  kind: "weapon" | "unarmed" | "cantrip" | "spell";
  hit_bonus: number | null;
  save_ability: string | null;
  save_dc: number | null;
  damage: string;
  damage_type: string;
  spell_level: number;
  melee: boolean;
  note: string;
}
interface ArenaFeature {
  key: string;
  name: string;
  uses_left: number;
  cost: "action" | "bonus" | "free";
  blurb: string;
}
interface ArenaSide {
  name: string;
  ac: number;
  hp: number;
  hp_max: number;
}
interface ArenaPc extends ArenaSide {
  level: number;
  character_class: string;
  attacks: ArenaAttack[];
  features: ArenaFeature[];
  slots: Record<string, number>;
  raging: boolean;
}
interface ArenaFoe extends ArenaSide {
  monster_id: string | null;
  cr: string;
  creature_type: string;
  image_url: string | null;
  attacks: { name: string; hit_bonus: number; damage: string; damage_type: string; count: number }[];
}
interface LogLine {
  round: number;
  who: "you" | "foe" | "ref";
  text: string;
  dice: string | null;
  hit: boolean | null;
  crit: boolean;
}
interface ArenaState {
  pc_id: string;
  round: number;
  phase: "your_turn" | "over";
  action_used: boolean;
  bonus_used: boolean;
  extra_action: boolean;
  dodging: boolean;
  result: "won" | "lost" | "fled" | null;
  pc: ArenaPc;
  foe: ArenaFoe;
  log: LogLine[];
  stats: { dealt: number; taken: number; hits: number; misses: number; crits: number; rounds: number; slots_spent: number; healed: number };
  tips: string[];
}
interface FoeOption {
  id: string;
  name: string;
  cr: string;
  ac: number;
  hp_average: number;
  creature_type: string;
  suggested: boolean;
}

const CSS = `
.ar-root { min-height: 100vh; padding: 1rem 0.9rem 4rem; color: #e6ddc8; font-family: Georgia, 'Palatino Linotype', serif;
  background: radial-gradient(ellipse at 50% -10%, #2a1d1d 0%, #120c10 55%, #07050a 100%); }
.ar-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 0.6rem; }
.ar-title { font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: 1.25rem; letter-spacing: 0.08em; margin: 0; }
.ar-back { color: #d6af36; text-decoration: none; font-size: 0.78rem; letter-spacing: 0.06em; border: 1px solid rgba(214,175,54,0.5); border-radius: 999px; padding: 3px 10px; }
.ar-sub { color: #b3a789; font-style: italic; margin: 0 0 1rem; font-size: 0.9rem; }
.ar-big { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid #d6af36; background: rgba(214,175,54,0.12); color: #f0e6c8;
  font-family: Cinzel, Georgia, serif; font-size: 1rem; letter-spacing: 0.06em; cursor: pointer; }
.ar-h { font-family: Cinzel, Georgia, serif; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: #d6af36; margin: 1rem 0 0.4rem; }
.ar-foe-list { display: grid; gap: 6px; }
.ar-foe { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; text-align: left; padding: 8px 12px; border-radius: 10px;
  border: 1px solid rgba(240,230,200,0.14); background: rgba(20,16,30,0.7); color: #e6ddc8; cursor: pointer; font-family: inherit; }
.ar-foe b { font-size: 0.95rem; color: #f0e6c8; font-weight: 600; }
.ar-foe small { color: #9a9078; font-size: 0.72rem; }
.ar-foe .cr { font-family: Cinzel, Georgia, serif; color: #d6af36; font-size: 0.8rem; grid-row: 1 / span 2; align-self: center; }
.ar-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ar-card { border: 1px solid rgba(240,230,200,0.14); border-radius: 12px; padding: 10px 12px; background: rgba(20,16,30,0.72); }
.ar-card.foe { border-color: rgba(200,80,80,0.45); }
.ar-card.you { border-color: rgba(214,175,54,0.45); }
.ar-card .nm { font-family: Cinzel, Georgia, serif; font-size: 0.9rem; color: #f0e6c8; margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ar-card .meta { font-size: 0.7rem; color: #9a9078; letter-spacing: 0.04em; }
.ar-bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden; margin: 6px 0 3px; }
.ar-bar i { display: block; height: 100%; background: #6fbf73; transition: width 0.35s ease; }
.ar-bar i.low { background: #e0a030; } .ar-bar i.crit { background: #ef5350; }
.ar-hp { font-variant-numeric: tabular-nums; font-size: 0.9rem; color: #e6ddc8; }
.ar-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.ar-chips span { font-size: 0.64rem; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid rgba(214,175,54,0.4); color: #d6af36; border-radius: 999px; padding: 1px 7px; }
.ar-chips span.cond { border-color: rgba(200,162,255,0.5); color: #c8a2ff; }
.ar-turn { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 6px; font-size: 0.8rem; color: #b3a789; }
.ar-turn b { color: #f0e6c8; font-family: Cinzel, Georgia, serif; font-weight: 600; }
.ar-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #d6af36; margin-left: 4px; vertical-align: middle; }
.ar-dot.on { background: #d6af36; }
.ar-tips { border-left: 3px solid #d6af36; background: rgba(214,175,54,0.08); padding: 8px 10px; border-radius: 0 10px 10px 0; font-size: 0.84rem; line-height: 1.4; margin-bottom: 8px; }
.ar-tips p { margin: 0 0 4px; } .ar-tips p:last-child { margin: 0; }
.ar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ar-btn { text-align: left; padding: 9px 11px; border-radius: 10px; border: 1px solid rgba(240,230,200,0.18); background: rgba(30,24,40,0.85); color: #e6ddc8; cursor: pointer; font-family: inherit; display: grid; gap: 2px; }
.ar-btn b { font-size: 0.92rem; color: #f0e6c8; font-weight: 600; }
.ar-btn small { font-size: 0.7rem; color: #9a9078; font-variant-numeric: tabular-nums; }
.ar-btn:disabled { opacity: 0.38; cursor: not-allowed; }
.ar-btn.primary { grid-column: 1 / -1; border-color: #d6af36; background: rgba(214,175,54,0.14); text-align: center; }
.ar-btn.primary b { font-family: Cinzel, Georgia, serif; letter-spacing: 0.06em; }
.ar-btn.ghost { background: transparent; }
.ar-err { color: #ef8b80; font-size: 0.84rem; margin: 6px 0; }
.ar-log { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
.ar-line { border-left: 3px solid rgba(240,230,200,0.2); padding: 4px 8px; font-size: 0.86rem; line-height: 1.35; }
.ar-line.you { border-color: #d6af36; } .ar-line.foe { border-color: #c85050; } .ar-line.ref { border-color: #6c6480; color: #b3a789; font-style: italic; }
.ar-line.crit { background: rgba(214,175,54,0.1); }
.ar-line small { display: block; color: #8f8670; font-size: 0.68rem; font-variant-numeric: tabular-nums; margin-top: 1px; }
.ar-over { text-align: center; padding: 14px 10px; border-radius: 14px; border: 1px solid rgba(214,175,54,0.5); background: rgba(20,16,30,0.8); margin-bottom: 10px; }
.ar-over h2 { font-family: Cinzel, Georgia, serif; margin: 0 0 4px; color: #f0e6c8; letter-spacing: 0.08em; }
.ar-over p { margin: 0; color: #b3a789; font-size: 0.85rem; }
`;

function hpClass(hp: number, max: number): string {
  const f = max > 0 ? hp / max : 1;
  return f <= 0.25 ? "crit" : f <= 0.5 ? "low" : "";
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${apiBase()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!r.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail;
    throw new Error(typeof detail === "string" ? detail : `Request failed (${r.status})`);
  }
  return data as T;
}

export default function Arena() {
  const { pcId } = useParams<{ pcId: string }>();
  const storeKey = `arena-${pcId}`;
  const [foes, setFoes] = useState<FoeOption[] | null>(null);
  const [state, setState] = useState<ArenaState | null>(() => {
    try {
      const raw = localStorage.getItem(`arena-${pcId}`);
      return raw ? (JSON.parse(raw) as ArenaState) : null;
    } catch {
      return null;
    }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!pcId) return;
    fetch(`${apiBase()}/play/${pcId}/arena/foes`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: FoeOption[]) => setFoes(rows))
      .catch(() => setFoes([]));
  }, [pcId]);

  useEffect(() => {
    try {
      if (state) localStorage.setItem(storeKey, JSON.stringify(state));
      else localStorage.removeItem(storeKey);
    } catch {
      /* storage blocked — the fight just won't survive a refresh */
    }
  }, [state, storeKey]);

  async function start(monsterId: string | null) {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      setState(await post<ArenaState>(`/play/${pcId}/arena/start`, { monster_id: monsterId }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function act(kind: string, key?: string) {
    if (!pcId || !state) return;
    setBusy(true);
    setErr(null);
    try {
      setState(await post<ArenaState>(`/play/${pcId}/arena/act`, { state, action: { kind, key: key ?? null } }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const suggested = useMemo(() => (foes ?? []).filter((f) => f.suggested), [foes]);
  const others = useMemo(() => (foes ?? []).filter((f) => !f.suggested), [foes]);

  const logNewestFirst = useMemo(() => (state ? [...state.log].reverse() : []), [state]);

  return (
    <div className="ar-root">
      <style>{CSS}</style>
      <div className="ar-top">
        <h1 className="ar-title">⚔️ Practice Arena</h1>
        <Link className="ar-back" to={`/play/${pcId}`}>
          ← Sheet
        </Link>
      </div>

      {!state && (
        <>
          <p className="ar-sub">
            Spar with a foe using your real sheet — your weapons, spells and features. Nothing here touches your
            character. Learn the turn: one action, one bonus action, and when to Dodge.
          </p>
          <button className="ar-big" disabled={busy || !pcId} onClick={() => void start(null)}>
            🎲 Surprise me — a foe that fits my level
          </button>
          {err && <p className="ar-err">{err}</p>}
          {foes === null && <p className="ar-sub" style={{ marginTop: "1rem" }}>Sizing up the catalog…</p>}
          {suggested.length > 0 && (
            <>
              <div className="ar-h">Fits your level</div>
              <div className="ar-foe-list">
                {suggested.map((f) => (
                  <button key={f.id} className="ar-foe" disabled={busy} onClick={() => void start(f.id)}>
                    <b>{f.name}</b>
                    <span className="cr">CR {f.cr}</span>
                    <small>
                      {f.creature_type} · AC {f.ac} · {f.hp_average} HP
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
          {others.length > 0 && (
            <>
              <div className="ar-h" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Everything else</span>
                <button className="ar-back" style={{ fontSize: "0.7rem" }} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "hide" : `show ${others.length}`}
                </button>
              </div>
              {showAll && (
                <div className="ar-foe-list">
                  {others.map((f) => (
                    <button key={f.id} className="ar-foe" disabled={busy} onClick={() => void start(f.id)}>
                      <b>{f.name}</b>
                      <span className="cr">CR {f.cr}</span>
                      <small>
                        {f.creature_type} · AC {f.ac} · {f.hp_average} HP
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
          {foes !== null && foes.length === 0 && (
            <p className="ar-sub" style={{ marginTop: "1rem" }}>
              The monster catalog is empty — ask your DM to open the app once so it seeds.
            </p>
          )}
        </>
      )}

      {state && (
        <>
          <div className="ar-cards">
            <div className="ar-card foe">
              <p className="nm">{state.foe.name}</p>
              <div className="meta">
                CR {state.foe.cr} · AC {state.foe.ac}
              </div>
              <div className="ar-bar">
                <i className={hpClass(state.foe.hp, state.foe.hp_max)} style={{ width: `${(100 * state.foe.hp) / Math.max(1, state.foe.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {state.foe.hp}/{state.foe.hp_max}
              </div>
              <div className="ar-chips">
                {state.foe.attacks.map((a) => (
                  <span key={a.name}>
                    {a.name} +{a.hit_bonus} · {a.damage}
                    {a.count > 1 ? ` ×${a.count}` : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="ar-card you">
              <p className="nm">{state.pc.name}</p>
              <div className="meta">
                Lv {state.pc.level} {state.pc.character_class} · AC {state.pc.ac}
              </div>
              <div className="ar-bar">
                <i className={hpClass(state.pc.hp, state.pc.hp_max)} style={{ width: `${(100 * state.pc.hp) / Math.max(1, state.pc.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {state.pc.hp}/{state.pc.hp_max}
              </div>
              <div className="ar-chips">
                {Object.entries(state.pc.slots).map(([lvl, n]) => (
                  <span key={lvl}>
                    L{lvl} slots ×{n}
                  </span>
                ))}
                {state.pc.raging && <span className="cond">Raging</span>}
                {state.dodging && <span className="cond">Dodging</span>}
              </div>
            </div>
          </div>

          {state.phase === "over" ? (
            <div className="ar-over" style={{ marginTop: 12 }}>
              <h2>{state.result === "won" ? "🏆 You win" : state.result === "lost" ? "💀 You're down" : "🏃 You fled"}</h2>
              {state.tips.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
              <div className="ar-grid" style={{ marginTop: 10 }}>
                <button className="ar-btn primary" disabled={busy} onClick={() => void start(state.foe.monster_id ?? null)}>
                  <b>Again — same foe</b>
                </button>
                <button className="ar-btn" disabled={busy} onClick={() => setState(null)}>
                  <b>Pick another foe</b>
                </button>
                <Link className="ar-btn ghost" to={`/play/${pcId}`} style={{ textDecoration: "none", textAlign: "center" }}>
                  <b>Back to my sheet</b>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <div className="ar-turn">
                <b>Round {state.round} · your turn</b>
                <span>
                  Action
                  <i className={`ar-dot ${state.action_used && !state.extra_action ? "" : "on"}`} />
                  {state.extra_action && <i className="ar-dot on" />}
                  &nbsp; Bonus
                  <i className={`ar-dot ${state.bonus_used ? "" : "on"}`} />
                </span>
              </div>
              {state.tips.length > 0 && (
                <div className="ar-tips">
                  {state.tips.map((t, i) => (
                    <p key={i}>💡 {t}</p>
                  ))}
                </div>
              )}
              {err && <p className="ar-err">{err}</p>}
              <div className="ar-grid">
                {state.pc.attacks.map((a) => {
                  const actionFree = !state.action_used || state.extra_action;
                  const slotsOk = a.spell_level === 0 || (state.pc.slots[String(a.spell_level)] ?? 0) > 0;
                  const why = !actionFree ? "Action already used this turn" : !slotsOk ? `No level-${a.spell_level} slots left` : "";
                  return (
                    <button
                      key={a.key}
                      className="ar-btn"
                      disabled={busy || !actionFree || !slotsOk}
                      title={why || a.note}
                      onClick={() => void act(a.kind === "weapon" || a.kind === "unarmed" ? "attack" : "cast", a.key)}
                    >
                      <b>
                        {a.kind === "cantrip" ? "✨ " : a.kind === "spell" ? `✨L${a.spell_level} ` : "🗡 "}
                        {a.name}
                      </b>
                      <small>
                        {a.hit_bonus != null ? `+${a.hit_bonus} to hit · ` : a.save_dc ? `DC ${a.save_dc} ${a.save_ability?.toUpperCase()} · ` : ""}
                        {a.damage} {a.damage_type}
                      </small>
                    </button>
                  );
                })}
                <button
                  className="ar-btn"
                  disabled={busy || (state.action_used && !state.extra_action)}
                  title="Attacks against you have disadvantage until your next turn"
                  onClick={() => void act("dodge")}
                >
                  <b>🛡 Dodge</b>
                  <small>action · foe attacks at disadvantage</small>
                </button>
                {state.pc.features.map((f) => {
                  const blocked =
                    f.uses_left <= 0 ? "No uses left" : f.cost === "bonus" && state.bonus_used ? "Bonus action already used" : f.cost === "action" && state.action_used && !state.extra_action ? "Action already used" : "";
                  return (
                    <button key={f.key} className="ar-btn" disabled={busy || !!blocked} title={blocked || f.blurb} onClick={() => void act("feature", f.key)}>
                      <b>
                        {f.cost === "bonus" ? "⚡ " : f.cost === "free" ? "✦ " : "✚ "}
                        {f.name}
                      </b>
                      <small>
                        {f.cost} · {f.uses_left >= 99 ? "at will" : `${f.uses_left} left`} · {f.blurb}
                      </small>
                    </button>
                  );
                })}
                <button className="ar-btn primary" disabled={busy} onClick={() => void act("end_turn")}>
                  <b>End turn → {state.foe.name} acts</b>
                </button>
                <button className="ar-btn ghost" disabled={busy} onClick={() => void act("flee")} style={{ gridColumn: "1 / -1", textAlign: "center" }}>
                  <small>Leave the ring</small>
                </button>
              </div>
            </>
          )}

          <div className="ar-log" aria-live="polite">
            {logNewestFirst.map((l, i) => (
              <div key={`${l.round}-${i}`} className={`ar-line ${l.who}${l.crit ? " crit" : ""}`}>
                {l.text}
                {l.dice && <small>{l.dice}</small>}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
