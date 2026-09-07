import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiBase } from "../api/client";

/**
 * Arena (Plans 84/85/87) — the Practice Arena on the player's phone. A
 * one-on-one sparring match against a catalog foe, refereed by the server's
 * rules engine with the player's real sheet: weapons, cantrips, spells, slots,
 * and each class's level 1–5 kit as a real action economy (action, bonus
 * action, reactions, riders like Divine Smite and Sneak Attack). Nothing here
 * writes to the character; the fight is one sealed JSON document this page
 * holds (and keeps in localStorage). Free: no AI anywhere in the loop.
 */

type Cost = "action" | "bonus" | "reaction" | "free";
interface ArenaAttack {
  key: string;
  name: string;
  kind: "weapon" | "unarmed" | "cantrip" | "spell" | "heal" | "buff" | "feature";
  cost: Cost;
  hit_bonus: number | null;
  save_ability: string | null;
  save_dc: number | null;
  damage: string;
  damage_type: string;
  spell_level: number;
  melee: boolean;
  effect: string | null;
  after_melee_hit: boolean;
  note: string;
  upcast: string;
}
interface ArenaFeature {
  key: string;
  name: string;
  uses_left: number;
  cost: Cost;
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
  subclass: string;
  attacks: ArenaAttack[];
  features: ArenaFeature[];
  slots: Record<string, number>;
  slots_max: Record<string, number>;
  raging: boolean;
  attacks_per_action: number;
  focus: number;
  sorcery: number;
  sorcery_max: number;
  sneak_dice: number;
  temp_hp: number;
  spell_dc: number | null;
  beast: { name: string; ac: number; temp_hp: number } | null;
  metamagic: string[];
  wild_magic: boolean;
  starry_form: string | null;
}
interface ArenaFoe extends ArenaSide {
  monster_id: string | null;
  cr: string;
  creature_type: string;
  image_url: string | null;
  conditions: string[];
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
  reaction_used: boolean;
  dodging: boolean;
  attacks_left: number;
  hit_this_turn: boolean;
  melee_hit_this_turn: boolean;
  reckless: boolean;
  adv_next: boolean;
  concentration: string | null;
  marks: string[];
  blessed: boolean;
  faith: boolean;
  innate_sorcery: number;
  spiritual_weapon: boolean;
  auto_reactions: boolean;
  effects: Record<string, number>;
  tides_primed: boolean;
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
  tier: "easy" | "fits" | "tough" | "deadly";
}

const CSS = `
.ar-root { min-height: 100vh; padding: 1rem 0.9rem 4rem; color: #e6ddc8; font-family: Georgia, 'Palatino Linotype', serif;
  background: radial-gradient(ellipse at 50% -10%, #2a1d1d 0%, #120c10 55%, #07050a 100%); }
.ar-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 0.6rem; }
.ar-title { font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: 1.25rem; letter-spacing: 0.08em; margin: 0; }
.ar-back { color: #e2c257; text-decoration: none; font-size: 0.8rem; letter-spacing: 0.06em; border: 1px solid rgba(214,175,54,0.5); border-radius: 999px; padding: 3px 10px; background: none; cursor: pointer; font-family: inherit; }
.ar-sub { color: #c2b89f; font-style: italic; margin: 0 0 1rem; font-size: 0.9rem; }
.ar-big { width: 100%; padding: 14px; border-radius: 14px; border: 1px solid #d6af36; background: rgba(214,175,54,0.12); color: #f0e6c8;
  font-family: Cinzel, Georgia, serif; font-size: 1rem; letter-spacing: 0.06em; cursor: pointer; }
.ar-h { font-family: Cinzel, Georgia, serif; font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase; color: #d6af36; margin: 1rem 0 0.4rem; }
.ar-foe-list { display: grid; gap: 6px; }
.ar-foe { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; text-align: left; padding: 8px 12px; border-radius: 10px;
  border: 1px solid rgba(240,230,200,0.14); background: rgba(20,16,30,0.7); color: #e6ddc8; cursor: pointer; font-family: inherit; }
.ar-foe b { font-size: 0.95rem; color: #f0e6c8; font-weight: 600; }
.ar-foe small { color: #b3a789; font-size: 0.72rem; }
.ar-foe.tough small em { color: #e0a030; font-style: normal; }
.ar-foe.deadly small em { color: #ef5350; font-style: normal; }
.ar-foe .cr { font-family: Cinzel, Georgia, serif; color: #d6af36; font-size: 0.8rem; grid-row: 1 / span 2; align-self: center; }
.ar-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ar-card { border: 1px solid rgba(240,230,200,0.14); border-radius: 12px; padding: 10px 12px; background: rgba(20,16,30,0.72); }
.ar-card.foe { border-color: rgba(200,80,80,0.45); }
.ar-card.you { border-color: rgba(214,175,54,0.45); }
.ar-card .nm { font-family: Cinzel, Georgia, serif; font-size: 0.9rem; color: #f0e6c8; margin: 0 0 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ar-card .meta { font-size: 0.7rem; color: #b3a789; letter-spacing: 0.04em; }
.ar-bar { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.08); overflow: hidden; margin: 6px 0 3px; }
.ar-bar i { display: block; height: 100%; background: #6fbf73; transition: width 0.35s ease; }
.ar-bar i.low { background: #e0a030; } .ar-bar i.crit { background: #ef5350; }
.ar-hp { font-variant-numeric: tabular-nums; font-size: 0.9rem; color: #e6ddc8; }
.ar-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 5px; }
.ar-chips span { font-size: 0.64rem; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid rgba(214,175,54,0.4); color: #d6af36; border-radius: 999px; padding: 1px 7px; }
.ar-chips span.cond { border-color: rgba(200,162,255,0.5); color: #c8a2ff; }
.ar-chips span.bad { border-color: rgba(239,83,80,0.5); color: #ef8b80; }
.ar-turn { display: flex; justify-content: space-between; align-items: center; margin: 12px 0 6px; font-size: 0.8rem; color: #b3a789; }
.ar-turn b { color: #f0e6c8; font-family: Cinzel, Georgia, serif; font-weight: 600; }
.ar-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #d6af36; margin-left: 4px; vertical-align: middle; }
.ar-dot.on { background: #d6af36; }
.ar-tips { border-left: 3px solid #d6af36; background: rgba(214,175,54,0.08); padding: 8px 10px; border-radius: 0 10px 10px 0; font-size: 0.84rem; line-height: 1.4; margin-bottom: 8px; }
.ar-tips p { margin: 0 0 4px; } .ar-tips p:last-child { margin: 0; }
.ar-sec { font-family: Cinzel, Georgia, serif; font-size: 0.64rem; letter-spacing: 0.12em; text-transform: uppercase; color: #b3a789; margin: 10px 0 4px; }
.ar-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
.ar-btn { text-align: left; padding: 9px 11px; border-radius: 10px; border: 1px solid rgba(240,230,200,0.18); background: rgba(30,24,40,0.85); color: #e6ddc8; cursor: pointer; font-family: inherit; display: grid; gap: 2px; }
.ar-btn b { font-size: 0.92rem; color: #f0e6c8; font-weight: 600; }
.ar-btn small { font-size: 0.7rem; color: #b3a789; font-variant-numeric: tabular-nums; }
.ar-btn .ar-why { color: #e0a030; font-size: 0.68rem; }
.ar-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ar-btn.primary { grid-column: 1 / -1; border-color: #d6af36; background: rgba(214,175,54,0.14); text-align: center; }
.ar-btn.primary b { font-family: Cinzel, Georgia, serif; letter-spacing: 0.06em; }
.ar-btn.ghost { background: transparent; }
.ar-btn.wide { grid-column: 1 / -1; }
.ar-slots { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.ar-slots button { border: 1px solid rgba(214,175,54,0.6); background: rgba(214,175,54,0.12); color: #f0e6c8; border-radius: 999px; padding: 2px 10px; font-size: 0.72rem; cursor: pointer; font-family: inherit; }
.ar-slots button:disabled { opacity: 0.4; cursor: not-allowed; }
.ar-err { color: #ef8b80; font-size: 0.84rem; margin: 6px 0; }
.ar-log { margin-top: 12px; display: flex; flex-direction: column; gap: 5px; }
.ar-line { border-left: 3px solid rgba(240,230,200,0.2); padding: 4px 8px; font-size: 0.86rem; line-height: 1.35; }
.ar-line.you { border-color: #d6af36; } .ar-line.foe { border-color: #c85050; } .ar-line.ref { border-color: #6c6480; color: #c2b89f; font-style: italic; }
.ar-line.crit { background: rgba(214,175,54,0.1); }
.ar-line small { display: block; color: #a39a86; font-size: 0.68rem; font-variant-numeric: tabular-nums; margin-top: 1px; }
.ar-over { text-align: center; padding: 14px 10px; border-radius: 14px; border: 1px solid rgba(214,175,54,0.5); background: rgba(20,16,30,0.8); margin-bottom: 10px; }
.ar-over h2 { font-family: Cinzel, Georgia, serif; margin: 0 0 4px; color: #f0e6c8; letter-spacing: 0.08em; }
.ar-over p { margin: 0; color: #c2b89f; font-size: 0.85rem; }
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

// Font of Magic (2024): points per created slot, and the sorcerer level it needs.
const FONT_COST: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 6, 5: 7 };
const FONT_MIN_LEVEL: Record<number, number> = { 1: 2, 2: 3, 3: 5, 4: 7, 5: 9 };
const upcastHint = (a: ArenaAttack, levels: number[]) =>
  a.upcast && levels.length > 1 ? (a.upcast === "count" ? " · one more per slot level" : ` · +${a.upcast} per slot level`) : "";

const KIND_ICON: Record<ArenaAttack["kind"], string> = {
  weapon: "🗡",
  unarmed: "👊",
  cantrip: "✨",
  spell: "✨",
  heal: "💚",
  buff: "🔆",
  feature: "✦",
};

export default function Arena() {
  const { pcId } = useParams<{ pcId: string }>();
  const storeKey = `arena-${pcId}`;
  const [foes, setFoes] = useState<FoeOption[] | null>(null);
  const [beasts, setBeasts] = useState<FoeOption[] | null>(null);
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

  const hasWildShape = !!state?.pc.features.some((f) => f.key === "wild_shape");
  useEffect(() => {
    if (!pcId || !hasWildShape || beasts !== null) return;
    fetch(`${apiBase()}/play/${pcId}/arena/beasts`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((rows: FoeOption[]) => setBeasts(rows))
      .catch(() => setBeasts([]));
  }, [pcId, hasWildShape, beasts]);

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
  async function act(kind: string, key?: string, slotLevel?: number) {
    if (!pcId || !state) return;
    setBusy(true);
    setErr(null);
    try {
      setState(
        await post<ArenaState>(`/play/${pcId}/arena/act`, {
          state,
          action: { kind, key: key ?? null, slot_level: slotLevel ?? null },
        }),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  // Ending the fight must always work, even when the referee no longer trusts the
  // record (a deploy rotated the seal) — fall back to closing it locally.
  async function endFight() {
    if (!pcId || !state) return;
    setBusy(true);
    setErr(null);
    try {
      setState(
        await post<ArenaState>(`/play/${pcId}/arena/act`, {
          state,
          action: { kind: "flee", key: null, slot_level: null },
        }),
      );
    } catch {
      setState(null);
    } finally {
      setBusy(false);
    }
  }
  const sealExpired = !!err && /altered or expired/i.test(err);

  const suggested = useMemo(() => (foes ?? []).filter((f) => f.suggested), [foes]);
  const others = useMemo(() => (foes ?? []).filter((f) => !f.suggested), [foes]);
  const logNewestFirst = useMemo(() => (state ? [...state.log].reverse() : []), [state]);

  // Why an attack button is greyed, or "" when it's live.
  function whyNot(a: ArenaAttack): string {
    if (!state) return "";
    const actionFree = !state.action_used || state.extra_action;
    const bonusFree = !state.bonus_used;
    const isSwing = (a.kind === "weapon" || a.kind === "unarmed") && a.cost === "action";
    const slotsOk =
      a.spell_level === 0 ||
      Object.entries(state.pc.slots).some(([l, n]) => Number(l) >= a.spell_level && n > 0);
    if (a.after_melee_hit) {
      if (!state.melee_hit_this_turn) return "Needs a melee hit first this turn";
      if (a.cost === "bonus" && !bonusFree) return "Bonus action already used";
      if (a.effect === "divine_smite" && !slotsOk) return "No slots left";
      if (a.effect === "stunning_strike" && state.pc.focus <= 0) return "No Focus Points left";
      return "";
    }
    if (a.cost === "bonus") {
      if (!bonusFree) return "Bonus action already used";
      if (a.effect === "offhand_blade" && !state.action_used) return "Use the first blade first";
      if (!slotsOk) return `No level-${a.spell_level} slots left`;
      return "";
    }
    if (!(actionFree || (isSwing && state.attacks_left > 0))) return "Action already used";
    if (!slotsOk) return `No level-${a.spell_level} slots left`;
    return "";
  }

  function slotLevels(minLevel: number): number[] {
    if (!state) return [];
    return Object.entries(state.pc.slots)
      .filter(([l, n]) => Number(l) >= minLevel && n > 0)
      .map(([l]) => Number(l))
      .sort((x, y) => x - y);
  }

  const you = state?.pc;
  const foe = state?.foe;
  const yourChips: { label: string; cls?: string }[] = [];
  if (state && you) {
    Object.entries(you.slots).forEach(([lvl, n]) =>
      yourChips.push({ label: you.slots_max?.[lvl] ? `L${lvl} slots ${n}/${you.slots_max[lvl]}` : `L${lvl} slots ×${n}` }),
    );
    if (you.focus > 0) yourChips.push({ label: `Focus ×${you.focus}` });
    if (you.sorcery > 0 || you.sorcery_max > 0) yourChips.push({ label: `Sorcery ${you.sorcery}/${Math.max(you.sorcery_max, you.sorcery)}` });
    if (you.sneak_dice > 0) yourChips.push({ label: `Sneak Attack ${you.sneak_dice}d6` });
    if (you.attacks_per_action > 1) yourChips.push({ label: `${you.attacks_per_action} attacks` });
    if (you.beast) yourChips.push({ label: `${you.beast.name} form +${you.beast.temp_hp}`, cls: "cond" });
    if (you.raging) yourChips.push({ label: "Raging", cls: "cond" });
    if (state.dodging) yourChips.push({ label: "Dodging", cls: "cond" });
    if (state.reckless) yourChips.push({ label: "Reckless", cls: "cond" });
    if (state.adv_next) yourChips.push({ label: "Advantage next", cls: "cond" });
    if (state.blessed) yourChips.push({ label: "Blessed +1d4", cls: "cond" });
    if (state.faith) yourChips.push({ label: "Shield of Faith +2", cls: "cond" });
    if (state.innate_sorcery > 0) yourChips.push({ label: `Innate Sorcery ${state.innate_sorcery}`, cls: "cond" });
    if (state.spiritual_weapon) yourChips.push({ label: "Spiritual Weapon", cls: "cond" });
    state.marks.filter((m) => m !== "quicken").forEach((m) => yourChips.push({ label: m, cls: "cond" }));
    if (state.marks.includes("quicken")) yourChips.push({ label: "Quickened", cls: "cond" });
    if (state.concentration) yourChips.push({ label: `Concentrating: ${state.concentration}`, cls: "cond" });
    if (you.starry_form) yourChips.push({ label: `Starry Form: ${you.starry_form}`, cls: "cond" });
    if (state.tides_primed) yourChips.push({ label: "Tides primed: next spell surges", cls: "bad" });
    if (you.wild_magic) yourChips.push({ label: "Wild Magic", cls: "cond" });
    Object.entries(state.effects ?? {}).forEach(([k, n]) =>
      yourChips.push({ label: `${k.replace(/_/g, " ")} (${n})`, cls: ["plant", "frightened", "poisoned", "fog", "vuln piercing"].includes(k.replace(/_/g, " ")) ? "bad" : "cond" }),
    );
  }
  const cls = you?.character_class.toLowerCase() ?? "";
  const hasAutoReactions =
    !!you?.features.some((f) => f.cost === "reaction") || cls === "rogue" || cls === "monk" || cls === "wizard" || cls === "sorcerer" || cls === "warlock";

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
            Spar with a foe using your real sheet — your weapons, spells, slots and class features, run
            by the rules. Nothing here touches your character. Learn the turn: one action, one bonus
            action, when to Dodge, when to spend a slot.
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
                    <button key={f.id} className={`ar-foe ${f.tier}`} disabled={busy} onClick={() => void start(f.id)}>
                      <b>{f.name}</b>
                      <span className="cr">CR {f.cr}</span>
                      <small>
                        {f.creature_type} · AC {f.ac} · {f.hp_average} HP ·{" "}
                        <em>{f.tier === "easy" ? "easy" : f.tier === "tough" ? "above your level" : "way above your level"}</em>
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

      {state && you && foe && (
        <>
          <div className="ar-cards">
            <div className="ar-card foe">
              <p className="nm">{foe.name}</p>
              <div className="meta">
                CR {foe.cr} · AC {foe.ac}
              </div>
              <div className="ar-bar">
                <i className={hpClass(foe.hp, foe.hp_max)} style={{ width: `${(100 * foe.hp) / Math.max(1, foe.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {foe.hp}/{foe.hp_max}
              </div>
              <div className="ar-chips">
                {foe.conditions.map((c) => (
                  <span key={c} className="bad">
                    {c}
                  </span>
                ))}
                {foe.attacks.map((a) => (
                  <span key={a.name}>
                    {a.name} +{a.hit_bonus} · {a.damage}
                    {a.count > 1 ? ` ×${a.count}` : ""}
                  </span>
                ))}
              </div>
            </div>
            <div className="ar-card you">
              <p className="nm">{you.name}</p>
              <div className="meta">
                Lv {you.level} {you.character_class}
                {you.subclass ? ` · ${you.subclass}` : ""} · AC {you.beast ? you.beast.ac : you.ac}
              </div>
              <div className="ar-bar">
                <i className={hpClass(you.hp, you.hp_max)} style={{ width: `${(100 * you.hp) / Math.max(1, you.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {you.hp}/{you.hp_max}
              </div>
              <div className="ar-chips">
                {yourChips.map((c) => (
                  <span key={c.label} className={c.cls}>
                    {c.label}
                  </span>
                ))}
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
                <button className="ar-btn primary" disabled={busy} onClick={() => void start(foe.monster_id ?? null)}>
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
                  &nbsp; Reaction
                  <i className={`ar-dot ${state.reaction_used || !state.auto_reactions ? "" : "on"}`} />
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
              {sealExpired && (
                <div className="ar-grid" style={{ marginBottom: 8 }}>
                  <button className="ar-btn primary" disabled={busy} onClick={() => setState(null)}>
                    <b>Start over — this fight expired</b>
                  </button>
                </div>
              )}

              <div className="ar-sec">Action</div>
              <div className="ar-grid">
                {you.attacks
                  .filter((a) => a.cost === "action" && !a.after_melee_hit)
                  .map((a) => {
                    const why = whyNot(a);
                    const leveled = a.spell_level > 0 && (a.kind === "spell" || a.kind === "heal" || a.kind === "buff");
                    const levels = leveled ? slotLevels(a.spell_level) : [];
                    const detail = (
                      <small>
                        {a.hit_bonus != null ? `+${a.hit_bonus} to hit · ` : a.save_dc ? `DC ${a.save_dc} ${a.save_ability?.toUpperCase()} · ` : ""}
                        {a.damage !== "0" ? `${a.damage} ${a.damage_type}` : a.note}
                        {a.spell_level > 0 ? ` · L${a.spell_level}` : ""}
                        {upcastHint(a, levels)}
                      </small>
                    );
                    if (leveled && levels.length > 1 && !why) {
                      return (
                        <div key={a.key} className="ar-btn wide" title={a.note}>
                          <b>
                            {KIND_ICON[a.kind]} {a.name}
                          </b>
                          {detail}
                          <span className="ar-slots">
                            {levels.map((lvl) => (
                              <button key={lvl} disabled={busy} onClick={() => void act("cast", a.key, lvl)}>
                                Slot L{lvl}
                              </button>
                            ))}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={a.key}
                        className="ar-btn"
                        disabled={busy || !!why}
                        title={why || a.note}
                        onClick={() => void act(a.kind === "weapon" || a.kind === "unarmed" ? "attack" : "cast", a.key, levels[0])}
                      >
                        <b>
                          {KIND_ICON[a.kind]} {a.name}
                        </b>
                        {detail}
                        {why && <small className="ar-why">{why}</small>}
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
                  <small>foe attacks at disadvantage</small>
                </button>
                {you.features
                  .filter((f) => f.cost === "action")
                  .map((f) => {
                    const blocked = f.uses_left <= 0 ? "No uses left" : state.action_used && !state.extra_action ? "Action already used" : "";
                    return (
                      <button key={f.key} className="ar-btn" disabled={busy || !!blocked} title={blocked || f.blurb} onClick={() => void act("feature", f.key)}>
                        <b>✚ {f.name}</b>
                        <small>
                          {f.uses_left >= 99 ? "at will" : `${f.uses_left} left`} · {f.blurb}
                        </small>
                        {blocked && <small className="ar-why">{blocked}</small>}
                      </button>
                    );
                  })}
              </div>

              <div className="ar-sec">Bonus action &amp; riders</div>
              <div className="ar-grid">
                {you.attacks
                  .filter((a) => a.cost === "bonus" || a.after_melee_hit)
                  .map((a) => {
                    const why = whyNot(a);
                    const levels = a.spell_level > 0 ? slotLevels(a.spell_level) : [];
                    const pickSlot = a.effect === "divine_smite" || a.effect === "searing_smite" || levels.length > 1;
                    return (
                      <div key={a.key} className={`ar-btn${pickSlot ? " wide" : ""}`} style={{ opacity: why ? 0.55 : 1 }} title={why || a.note}>
                        <b>
                          {KIND_ICON[a.kind]} {a.name}
                        </b>
                        <small>
                          {a.hit_bonus != null ? `+${a.hit_bonus} to hit · ` : a.save_dc ? `DC ${a.save_dc} ${a.save_ability?.toUpperCase()} · ` : ""}
                          {a.damage !== "0" ? `${a.damage} ${a.damage_type} · ` : ""}
                          {a.note}
                          {upcastHint(a, levels)}
                        </small>
                        {why ? (
                          <small className="ar-why">{why}</small>
                        ) : pickSlot ? (
                          <span className="ar-slots">
                            {levels.map((lvl) => (
                              <button key={lvl} disabled={busy} onClick={() => void act("cast", a.key, lvl)}>
                                Slot L{lvl}
                              </button>
                            ))}
                          </span>
                        ) : (
                          <span className="ar-slots">
                            <button disabled={busy} onClick={() => void act(a.kind === "weapon" ? "attack" : "cast", a.key)}>
                              Use
                            </button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                {you.features
                  .filter((f) => f.cost === "bonus" || f.cost === "free")
                  .map((f) => {
                    const blocked =
                      f.uses_left <= 0 ? "No uses left" : f.cost === "bonus" && state.bonus_used ? "Bonus action already used" : f.key === "wild_shape" && you.beast ? "Already in a form" : "";
                    if (f.key === "wild_shape") {
                      return (
                        <div key={f.key} className="ar-btn wide" style={{ opacity: blocked ? 0.55 : 1 }}>
                          <b>🐾 {f.name}</b>
                          <small>
                            {f.uses_left} left · {f.blurb}
                          </small>
                          {blocked ? (
                            <small className="ar-why">{blocked}</small>
                          ) : (
                            <span className="ar-slots">
                              {(beasts ?? []).map((b) => (
                                <button key={b.id} disabled={busy} onClick={() => void act("wild_shape", b.id)} title={`AC ${b.ac} · ${b.hp_average} HP · CR ${b.cr}`}>
                                  {b.name}
                                </button>
                              ))}
                              {beasts !== null && beasts.length === 0 && <small>No beasts in the catalog at your CR.</small>}
                            </span>
                          )}
                        </div>
                      );
                    }
                    if (f.key === "create_slot" || f.key === "convert_slot") {
                      const make = f.key === "create_slot";
                      const options = make
                        ? [1, 2, 3, 4, 5].filter((l) => you.level >= FONT_MIN_LEVEL[l] && you.sorcery >= FONT_COST[l])
                        : you.sorcery < you.sorcery_max
                          ? slotLevels(1)
                          : [];
                      const stuck =
                        blocked ||
                        (options.length === 0
                          ? make
                            ? "Not enough sorcery points"
                            : you.sorcery >= you.sorcery_max
                              ? "Sorcery points are full"
                              : "No slots to convert"
                          : "");
                      return (
                        <div key={f.key} className="ar-btn wide" style={{ opacity: stuck ? 0.55 : 1 }} title={f.blurb}>
                          <b>⚡ {f.name}</b>
                          <small>{f.blurb}</small>
                          {stuck ? (
                            <small className="ar-why">{stuck}</small>
                          ) : (
                            <span className="ar-slots">
                              {options.map((l) => (
                                <button key={l} disabled={busy} onClick={() => void act("feature", f.key, l)}>
                                  {make ? `L${l} for ${FONT_COST[l]} pts` : `L${l} → ${l} pts`}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <button key={f.key} className="ar-btn" disabled={busy || !!blocked} title={blocked || f.blurb} onClick={() => void act("feature", f.key)}>
                        <b>
                          {f.cost === "bonus" ? "⚡ " : "✦ "}
                          {f.name}
                        </b>
                        <small>
                          {f.cost} · {f.uses_left >= 99 ? "at will" : `${f.uses_left} left`} · {f.blurb}
                        </small>
                        {blocked && <small className="ar-why">{blocked}</small>}
                      </button>
                    );
                  })}
              </div>

              {hasAutoReactions && (
                <>
                  <div className="ar-sec">Reactions (automatic)</div>
                  <div className="ar-grid">
                    <button
                      className="ar-btn wide ghost"
                      disabled={busy}
                      onClick={() => void act("toggle_reactions")}
                      title="Shield, Uncanny Dodge, Deflect Attacks, Cutting Words and Hellish Rebuke fire on their own when they help"
                    >
                      <b>{state.auto_reactions ? "⏸ Reactions: on" : "▶ Reactions: off"}</b>
                      <small>
                        {you.features
                          .filter((f) => f.cost === "reaction")
                          .map((f) => `${f.name} (${f.uses_left} left)`)
                          .join(" · ") || "Shield / Uncanny Dodge / Deflect Attacks / Hellish Rebuke fire on their own"}
                      </small>
                    </button>
                  </div>
                </>
              )}

              <div className="ar-grid" style={{ marginTop: 8 }}>
                <button className="ar-btn primary" disabled={busy} onClick={() => void act("end_turn")}>
                  <b>End turn → {foe.name} acts</b>
                </button>
                <button className="ar-btn wide" disabled={busy} onClick={() => void endFight()} title="Stop here. Nothing is saved to your sheet either way.">
                  <b>🏳 End the fight</b>
                  <small>leave the ring — the referee logs it as a retreat</small>
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
