import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { apiBase } from "../api/client";
import { useEventStream } from "../hooks/useEventStream";
import { classEmoji } from "../lib/classEmoji";

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
  portrait_url: string | null;
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
  // Plan 105 — which creature's turn wrote this, and what everybody's hit
  // points were at that moment (roster order, or [you, foe] in a solo fight).
  beat: number;
  hp: number[] | null;
}
interface ArenaSlot {
  kind: "pc" | "monster";
  label: string;
  pc_id: string | null;
  team: number;
  auto: boolean;
  pc: ArenaPc | null;
  foe: ArenaFoe | null;
  initiative: number;
}
// Plan 104 — a duel the server holds, so everybody can be on their own phone.
interface DuelSeat {
  pc_id: string;
  name: string;
  hp: number;
  hp_max: number;
  up: boolean;
}
interface DuelRead {
  id: string;
  host_pc_id: string;
  phase: string;
  seats: DuelSeat[];
  up_pc_id: string | null;
  your_turn: boolean;
  updated_at: string;
  state: ArenaState;
}
interface DuelSummary {
  id: string;
  host_pc_id: string;
  host_name: string;
  phase: string;
  seats: string[];
  your_turn: boolean;
}
interface PartyRow {
  id: string;
  character_name: string;
  player_name: string;
  character_class: string;
  subclass: string | null;
  level: number;
  hp_max: number;
  ac: number;
  portrait_url: string | null;
  figure_url: string | null;
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
  // Plan 101 — a fight of more than two. Empty for the solo arena.
  mode?: "solo" | "duel" | "boss";
  roster?: ArenaSlot[];
  order?: number[];
  turn?: number;
  target_index?: number | null;
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
.ar-calls { display: flex; flex-direction: column; gap: 6px; margin: 10px 0 4px; }
.ar-call { text-align: left; padding: 10px 12px; border-radius: 12px; font: inherit; cursor: pointer;
  border: 1px solid #d6af36; background: rgba(214,175,54,0.14); color: #f0e6c8; }
.ar-call b { display: block; font-size: 0.86rem; }
.ar-call small { opacity: 0.78; font-size: 0.72rem; }
.ar-big.ghost { background: rgba(255,255,255,0.03); color: #cfcfd8; border: 1px solid var(--border, #3a3a46); }
@keyframes ar-shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-7px); }
  40%, 60% { transform: translateX(7px); }
}
@keyframes ar-flash {
  from { box-shadow: 0 0 0 0 rgba(220,70,70,0.6); background-color: rgba(220,70,70,0.20); }
  to { box-shadow: 0 0 0 14px rgba(220,70,70,0); }
}
.ar-hit { animation: ar-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both,
  ar-flash 0.56s ease-out both; }
.ar-seat.hurt { animation: ar-flash 0.56s ease-out both; border-color: #b45050; }
@media (prefers-reduced-motion: reduce) { .ar-hit, .ar-seat.hurt { animation: none; } }
.ar-modes { display: flex; gap: 6px; margin: 10px 0; }
.ar-mode { flex: 1; padding: 10px 6px; border-radius: 10px; border: 1px solid var(--border, #3a3a46);
  background: rgba(255,255,255,0.03); color: #cfcfd8; font: inherit; font-size: 0.78rem; cursor: pointer; }
.ar-mode.on { border-color: #d6af36; background: rgba(214,175,54,0.14); color: #f0e6c8; }
.ar-foe.picked { border-color: #d6af36; background: rgba(214,175,54,0.12); }
.ar-turn { margin: 10px 0; padding: 10px 12px; border-radius: 12px; border: 1px solid #d6af36;
  background: rgba(214,175,54,0.14); color: #f0e6c8; display: flex; justify-content: space-between; align-items: baseline; }
.ar-turn.auto { border-color: #3a3a46; background: rgba(255,255,255,0.03); color: #b9b9c4; }
.ar-turn small { opacity: 0.7; }
.ar-roster { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ar-seat { flex: 1 1 44%; text-align: left; padding: 7px 9px; border-radius: 10px; font: inherit;
  border: 1px solid var(--border, #3a3a46); background: rgba(255,255,255,0.03); color: #cfcfd8; cursor: pointer; }
.ar-seat:disabled { cursor: default; opacity: 0.75; }
.ar-seat.up { border-color: #d6af36; }
.ar-seat.aimed { background: rgba(220,80,80,0.14); border-color: #b45050; }
.ar-seat b { display: block; font-size: 0.78rem; }
.ar-seat small { font-size: 0.68rem; opacity: 0.75; }
.ar-seat .bar { display: block; height: 4px; border-radius: 3px; background: rgba(255,255,255,0.09); margin: 4px 0 2px; }
.ar-seat .bar i { display: block; height: 100%; border-radius: 3px; background: #6fbf73; }
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
.ar-face { display: flex; align-items: center; justify-content: center; flex: none;
  border-radius: 50%; overflow: hidden; line-height: 1;
  border: 1px solid rgba(240,230,200,0.22); background: rgba(240,230,200,0.06); }
/* The sheets' portraits are square busts with the face high in the frame, so a
   plain circular crop of one shows chest. Zoom to the head instead. */
.ar-face img { width: 100%; height: 100%; object-fit: cover;
  transform: scale(1.55); transform-origin: 50% 0%; }
.ar-face.down { filter: grayscale(1); opacity: 0.62; }
.ar-card .ar-face { margin: 0 auto 6px; }
.ar-card.foe .ar-face { border-color: rgba(200,80,80,0.55); }
.ar-card.you .ar-face { border-color: rgba(214,175,54,0.55); }
.ar-card { text-align: center; }
.ar-card .ar-chips { justify-content: center; }
.ar-seat { display: flex; align-items: center; gap: 8px; }
.ar-seat .who { flex: 1; min-width: 0; }
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

/** What a monster wears when it has no portrait of its own. */
const TYPE_EMOJI: Record<string, string> = {
  aberration: "👁️",
  beast: "🐺",
  celestial: "😇",
  construct: "🗿",
  dragon: "🐉",
  elemental: "🔥",
  fey: "🧚",
  fiend: "😈",
  giant: "🗿",
  humanoid: "🧍",
  monstrosity: "🐙",
  ooze: "🫧",
  plant: "🌱",
  undead: "💀",
};

/**
 * A combatant's face. Plan 106 — Justin: "can we have headshots of the
 * monsters/characters at the top?"
 *
 * Falls back to the class emoji a sheet already wears before it has a
 * portrait, so a fight never shows an empty frame. Goes grey when the
 * creature drops, in step with the narration like every other figure.
 */
function Headshot({
  src,
  fallback,
  size,
  down,
  alt,
}: {
  src: string | null | undefined;
  fallback: string;
  size: number;
  down?: boolean;
  alt: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={`ar-face${down ? " down" : ""}`} style={{ width: size, height: size }}>
      {src && !broken ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
        />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.5) }} aria-hidden="true">
          {fallback}
        </span>
      )}
    </span>
  );
}

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

/** How long one creature's turn holds the floor before the next lands. */
const CHUNK_MS = 1150;

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
  // act() and endFight() are declared before the duel state below; these refs
  // are how they reach it without reordering the whole component.
  const duelIdRef = useRef<string | null>(null);
  const takeRef = useRef<(d: DuelRead) => void>(() => {});

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
  async function act(kind: string, key?: string, slotLevel?: number, target?: number) {
    if (!pcId || !state) return;
    setBusy(true);
    setErr(null);
    const action = {
      kind,
      key: key ?? null,
      slot_level: slotLevel ?? null,
      target: target ?? null,
    };
    try {
      if (duelIdRef.current) {
        takeRef.current(
          await post<DuelRead>(`/play/${pcId}/duels/${duelIdRef.current}/act`, { action }),
        );
      } else {
        setState(await post<ArenaState>(`/play/${pcId}/arena/act`, { state, action }));
      }
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
      if (duelIdRef.current) {
        const d = await post<DuelRead>(`/play/${pcId}/duels/${duelIdRef.current}/end`, {});
        setDuelId(null);
        setDuel(d);
        setState(d.state);
      } else {
        setState(
          await post<ArenaState>(`/play/${pcId}/arena/act`, {
            state,
            action: { kind: "flee", key: null, slot_level: null },
          }),
        );
      }
    } catch {
      setDuelId(null);
      setState(null);
    } finally {
      setBusy(false);
    }
  }
  const sealExpired = !!err && /altered or expired/i.test(err);

  const suggested = useMemo(() => (foes ?? []).filter((f) => f.suggested), [foes]);
  const others = useMemo(() => (foes ?? []).filter((f) => !f.suggested), [foes]);
  // Plan 103 — the referee narrates. Cory: "I press buttons and it all resolves
  // instantly. I'd like the thinking and anticipation!"
  //
  // Plan 105 — a turn at a time rather than a line at a time. The server
  // settles a whole batch in one reply (in a boss battle, the ally's turn and
  // the boss's), and each line now says which creature's turn wrote it, so the
  // page shows one creature's turn, pauses for it to land, then the next.
  const total = state?.log.length ?? 0;
  const [revealed, setRevealed] = useState<number | null>(null);
  useEffect(() => {
    // First sight of a fight, or a new one started: show what is already there.
    if (revealed === null || total < revealed) setRevealed(total);
  }, [total, revealed]);
  // The first chunk of a batch is nearly always your own action — waiting a
  // beat to watch your own sword swing is the snappiness Plan 103 kept.
  const lastTotal = useRef(0);
  useEffect(() => {
    if (!state || revealed === null || revealed >= total) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setRevealed(total);
      return;
    }
    const first = lastTotal.current !== total;
    lastTotal.current = total;
    const beat = state.log[revealed]?.beat ?? 0;
    let end = revealed + 1;
    while (end < total && (state.log[end]?.beat ?? 0) === beat) end += 1;
    const t = window.setTimeout(() => setRevealed(end), first ? 0 : CHUNK_MS);
    return () => window.clearTimeout(t);
  }, [revealed, total, state]);
  const playing = revealed !== null && revealed < total;
  // The score as of the last line on screen. Until something has been revealed
  // we have nothing to draw from, so the live figures stand in.
  const shownHp =
    state && revealed !== null && revealed > 0 ? (state.log[revealed - 1]?.hp ?? null) : null;
  /** Hit points to draw for roster seat `i` — what the narration has reached. */
  const hpAt = (i: number, live: number) => shownHp?.[i] ?? live;
  // Plan 101 — the duelling hall.
  const [hall, setHall] = useState<"monster" | "duel" | "boss">("monster");
  const [picked, setPicked] = useState<string[]>([]);
  const [party, setParty] = useState<PartyRow[]>([]);
  useEffect(() => {
    if (!pcId) return;
    fetch(`${apiBase()}/play/${pcId}/arena/party`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PartyRow[]) => setParty(rows))
      .catch(() => setParty([]));
  }, [pcId]);
  const roster = state?.roster ?? [];
  const upNow =
    roster.length && state?.order && state.turn !== undefined
      ? roster[state.order[state.turn]]
      : null;

  // Plan 104 — a duel fought on separate devices. The fight lives on the
  // server; this page watches it and may only act on its own turn. Everything
  // else about the arena is unchanged: a solo spar and a hot-seat duel still
  // never leave the phone.
  const [duelId, setDuelId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`duel-${pcId}`);
    } catch {
      return null;
    }
  });
  const [duel, setDuel] = useState<DuelRead | null>(null);
  const [calls, setCalls] = useState<DuelSummary[]>([]);
  useEffect(() => {
    try {
      if (duelId) localStorage.setItem(`duel-${pcId}`, duelId);
      else localStorage.removeItem(`duel-${pcId}`);
    } catch {
      /* storage blocked — the duel just won't survive a refresh */
    }
  }, [duelId, pcId]);

  // A finished duel lets go of the server: the end screen reads the last state
  // we were handed, and the buttons on it start something new.
  const take = useCallback((d: DuelRead) => {
    setDuel(d);
    setState(d.state);
    if (d.state.phase === "over") setDuelId(null);
  }, []);

  const loadDuel = useCallback(
    async (id: string) => {
      if (!pcId) return;
      try {
        const r = await fetch(`${apiBase()}/play/${pcId}/duels/${id}`);
        if (!r.ok) {
          setDuelId(null);
          setDuel(null);
          return;
        }
        take((await r.json()) as DuelRead);
      } catch {
        /* the stream will bring the next one */
      }
    },
    [pcId, take],
  );
  useEffect(() => {
    if (duelId) void loadDuel(duelId);
  }, [duelId, loadDuel]);

  const refreshCalls = useCallback(() => {
    if (!pcId) return;
    fetch(`${apiBase()}/play/${pcId}/duels`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DuelSummary[]) => setCalls(rows))
      .catch(() => setCalls([]));
  }, [pcId]);
  useEffect(() => {
    refreshCalls();
  }, [refreshCalls]);

  // Both phones watch the same fight. One push per turn; each refetches.
  useEventStream("duel", duelId ?? undefined, () => {
    if (duelId) void loadDuel(duelId);
  });
  useEventStream("pc", pcId, (e) => {
    if (e.type === "duel.called") refreshCalls();
  });

  // It is your turn, or it is nobody's business but the person holding this
  // phone. The server checks this too — the UI only saves them the round trip.
  const locked = !!duelId && !(duel?.your_turn ?? false);
  const waiting = busy || locked;

  duelIdRef.current = duelId;
  takeRef.current = take;

  async function startLive() {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      const ids = Array.from(new Set([pcId, ...picked]));
      const d = await post<DuelRead>(`/play/${pcId}/duels`, { pc_ids: ids });
      setDuelId(d.id);
      setDuel(d);
      setState(d.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startDuel() {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      const ids = Array.from(new Set([pcId, ...picked]));
      setState(await post<ArenaState>(`/play/${pcId}/arena/duel`, { pc_ids: ids }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startBoss(monsterId: string) {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      const ids = Array.from(new Set([pcId, ...picked]));
      setState(
        await post<ArenaState>(`/play/${pcId}/arena/boss`, {
          pc_ids: ids,
          monster_id: monsterId,
          controlled: pcId,
        }),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const logNewestFirst = useMemo(
    () => (state ? state.log.slice(0, revealed ?? total).reverse() : []),
    [state, revealed, total],
  );

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

  // On a live duel this phone always shows its own sheet — the working set
  // belongs to whoever is acting, which on their turn is not you.
  const mySeat = duelId ? roster.find((sl) => sl.pc_id === pcId) : undefined;
  const you = mySeat?.pc ?? state?.pc;
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
  // Plan 104 — a hit you can feel. Android buzzes; iOS Safari has no
  // vibrate at all, so the flinch is the real effect and the buzz is a bonus.
  const hpKey = state
    ? roster.length
      ? roster.map((sl, i) => hpAt(i, (sl.pc ?? sl.foe)?.hp ?? 0)).join(",")
      : `${hpAt(0, state.pc.hp)},${hpAt(1, state.foe.hp)}`
    : "";
  const myIndex = roster.length
    ? duelId
      ? roster.findIndex((sl) => sl.pc_id === pcId)
      : (state?.order?.[state.turn ?? 0] ?? -1)
    : 0;
  const prevHp = useRef("");
  const [hurt, setHurt] = useState<number[]>([]);
  const [ouch, setOuch] = useState(0);
  useEffect(() => {
    const before = prevHp.current;
    prevHp.current = hpKey;
    if (!before || !hpKey || before === hpKey) return;
    const was = before.split(",").map(Number);
    const now = hpKey.split(",").map(Number);
    if (was.length !== now.length) return;
    const dropped = now.map((hp, i) => (hp < was[i] ? i : -1)).filter((i) => i >= 0);
    if (dropped.length === 0) return;
    const mine = dropped.includes(myIndex);
    try {
      // Two thumps when it's you, one tick when it's somebody else.
      navigator.vibrate?.(mine ? [0, 38, 45, 80] : 18);
    } catch {
      /* some browsers throw while the page is hidden */
    }
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setHurt(dropped);
    if (mine) setOuch((n) => n + 1);
    const t = window.setTimeout(() => setHurt([]), 560);
    return () => window.clearTimeout(t);
  }, [hpKey, myIndex]);

  // Plan 105 — the figures the cards draw, held to the narration.
  const upSide = upNow ? (upNow.pc ?? upNow.foe) : null;
  const upHp = upSide ? hpAt(state?.order?.[state.turn ?? 0] ?? -1, upSide.hp) : 0;
  const upMax = upSide?.hp_max ?? 1;
  const foeHp = foe ? hpAt(roster.length ? (state?.target_index ?? -1) : 1, foe.hp) : 0;
  const youHp = you ? hpAt(myIndex, you.hp) : 0;

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

      {(!state || state.phase === "over") && calls.length > 0 && (
        <div className="ar-calls">
          {calls.map((c) => (
            <button key={c.id} className="ar-call" onClick={() => setDuelId(c.id)}>
              <b>⚔️ {c.host_name || "Someone"} called you out</b>
              <small>
                {c.seats.join(" vs ")}
                {c.your_turn ? " · you're up" : ""}
              </small>
            </button>
          ))}
        </div>
      )}

      {!state && (
        <>
          <p className="ar-sub">
            Spar using your real sheet — your weapons, spells, slots and class features, run by the
            rules. Nothing here touches anybody's character.
          </p>
          <div className="ar-modes">
            {(
              [
                ["monster", "🐉 Fight a monster"],
                ["duel", "⚔️ Duel a friend"],
                ["boss", "🛡 Boss battle"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                className={`ar-mode${hall === key ? " on" : ""}`}
                onClick={() => setHall(key)}
              >
                {label}
              </button>
            ))}
          </div>
          {hall !== "monster" && (
            <>
              <p className="ar-sub">
                {hall === "duel"
                  ? "Everyone for themselves, initiative rolled fresh. On your own devices the fight is kept live for everyone and each phone can only act on its own turn."
                  : "Your party against one monster. You pick your own actions; the referee plays everybody else."}
              </p>
              <div className="ar-h">Who's in</div>
              <div className="ar-foe-list">
                {party
                  .filter((row) => row.id !== pcId)
                  .map((row) => {
                    const on = picked.includes(row.id);
                    return (
                      <button
                        key={row.id}
                        className={`ar-foe${on ? " picked" : ""}`}
                        onClick={() =>
                          setPicked((cur) =>
                            cur.includes(row.id)
                              ? cur.filter((x) => x !== row.id)
                              : [...cur, row.id],
                          )
                        }
                      >
                        <b>
                          {on ? "✓ " : ""}
                          {row.character_name}
                        </b>
                        <small>
                          {row.player_name} · Lv {row.level} {row.character_class}
                          {row.subclass ? ` (${row.subclass})` : ""} · AC {row.ac} · {row.hp_max} HP
                        </small>
                      </button>
                    );
                  })}
              </div>
              {hall === "duel" && (
                <>
                  <button
                    className="ar-big"
                    disabled={busy || picked.length === 0}
                    onClick={() => void startLive()}
                  >
                    {picked.length === 0
                      ? "Pick at least one opponent"
                      : `📱 Each on your own device — ${picked.length + 1} in the ring`}
                  </button>
                  <button
                    className="ar-big ghost"
                    disabled={busy || picked.length === 0}
                    onClick={() => void startDuel()}
                  >
                    🤝 One device, passed round
                  </button>
                </>
              )}
              {hall === "boss" && (
                <p className="ar-sub">
                  Now choose the boss from the list below and the fight starts.
                </p>
              )}
              {err && <p className="ar-err">{err}</p>}
            </>
          )}
          {hall === "monster" && (
            <button className="ar-big" disabled={busy || !pcId} onClick={() => void start(null)}>
              🎲 Surprise me — a foe that fits my level
            </button>
          )}
          {err && <p className="ar-err">{err}</p>}
          {foes === null && <p className="ar-sub" style={{ marginTop: "1rem" }}>Sizing up the catalog…</p>}
          {suggested.length > 0 && (
            <>
              <div className="ar-h">Fits your level</div>
              <div className="ar-foe-list">
                {suggested.map((f) => (
                  <button key={f.id} className="ar-foe" disabled={busy} onClick={() => void (hall === "boss" ? startBoss(f.id) : start(f.id))}>
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
                    <button key={f.id} className={`ar-foe ${f.tier}`} disabled={busy} onClick={() => void (hall === "boss" ? startBoss(f.id) : start(f.id))}>
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
            {locked && upNow ? (
              <div className={`ar-card foe${hurt.includes(state.order?.[state.turn ?? 0] ?? -1) ? " ar-hit" : ""}`}>
                <Headshot
                  src={upNow.pc?.portrait_url ?? upNow.foe?.image_url}
                  fallback={
                    upNow.pc
                      ? classEmoji(upNow.pc.character_class)
                      : (TYPE_EMOJI[upNow.foe?.creature_type?.toLowerCase() ?? ""] ?? "👹")
                  }
                  size={64}
                  down={upHp <= 0}
                  alt={upNow.label}
                />
                <p className="nm">{upNow.label}</p>
                <div className="meta">taking their turn</div>
                <div className="ar-bar">
                  <i
                    className={hpClass(upHp, upMax)}
                    style={{ width: `${(100 * upHp) / Math.max(1, upMax)}%` }}
                  />
                </div>
                <div className="ar-hp">
                  {upHp}/{upMax}
                </div>
              </div>
            ) : (
            <div className={`ar-card foe${hurt.includes(roster.length ? (state.target_index ?? -1) : 1) ? " ar-hit" : ""}`}>
              <Headshot
                src={foe.image_url}
                fallback={TYPE_EMOJI[foe.creature_type?.toLowerCase()] ?? "👹"}
                size={64}
                down={foeHp <= 0}
                alt={foe.name}
              />
              <p className="nm">{foe.name}</p>
              <div className="meta">
                CR {foe.cr} · AC {foe.ac}
              </div>
              <div className="ar-bar">
                <i className={hpClass(foeHp, foe.hp_max)} style={{ width: `${(100 * foeHp) / Math.max(1, foe.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {foeHp}/{foe.hp_max}
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
            )}
            <div
              key={`you-${ouch}`}
              className={`ar-card you${hurt.includes(myIndex) ? " ar-hit" : ""}`}
            >
              <Headshot
                src={you.portrait_url}
                fallback={classEmoji(you.character_class)}
                size={64}
                down={youHp <= 0}
                alt={you.name}
              />
              <p className="nm">{you.name}</p>
              <div className="meta">
                Lv {you.level} {you.character_class}
                {you.subclass ? ` · ${you.subclass}` : ""} · AC {you.beast ? you.beast.ac : you.ac}
              </div>
              <div className="ar-bar">
                <i className={hpClass(youHp, you.hp_max)} style={{ width: `${(100 * youHp) / Math.max(1, you.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {youHp}/{you.hp_max}
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
            // Plan 103 paced the log so a turn has some anticipation in it; the
            // result must not outrun it. The server settles the whole fight in
            // one reply — in a boss battle that is the ally's turn and the
            // boss's — so announcing the winner the moment the reply lands
            // spoils every line still queued behind it. Wait for the referee to
            // finish talking. "Tap to skip ahead" is right below, and takes you
            // straight here.
            playing ? null : (
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
            )
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
              {upNow && (
                <div className={`ar-turn${upNow.auto || locked ? " auto" : ""}`}>
                  <b>
                    {locked
                      ? `${upNow.label} is taking their turn…`
                      : upNow.auto
                        ? `${upNow.label} is acting…`
                        : duelId
                          ? "You're up"
                          : `${upNow.label}, you're up`}
                  </b>
                  {locked && <small>live · this updates itself</small>}
                  {!locked && !upNow.auto && !duelId && roster.length > 2 && (
                    <small>pass the device</small>
                  )}
                </div>
              )}
              {roster.length > 0 && (
                <div className="ar-roster">
                  {roster.map((slot, i) => {
                    const side = slot.pc ?? slot.foe;
                    if (!side) return null;
                    // Plan 105 — what the narration has reached, not the end of
                    // the fight. A seat goes dark when the log says it does.
                    const hp = hpAt(i, side.hp);
                    const pct = Math.max(0, Math.round((hp / side.hp_max) * 100));
                    const isUp = state.order?.[state.turn ?? 0] === i;
                    const isTarget = state.target_index === i;
                    const mine = upNow ? slot.team === upNow.team : false;
                    return (
                      <button
                        key={i}
                        className={`ar-seat${isUp ? " up" : ""}${isTarget ? " aimed" : ""}${
                          hurt.includes(i) ? " hurt" : ""
                        }`}
                        disabled={waiting || mine || side.hp <= 0}
                        title={mine ? "On your side" : "Aim at this one"}
                        onClick={() => void act("aim", undefined, undefined, i)}
                      >
                        <Headshot
                          src={slot.pc?.portrait_url ?? slot.foe?.image_url}
                          fallback={
                            slot.pc
                              ? classEmoji(slot.pc.character_class)
                              : (TYPE_EMOJI[slot.foe?.creature_type?.toLowerCase() ?? ""] ?? "👹")
                          }
                          size={34}
                          down={hp <= 0}
                          alt={slot.label}
                        />
                        <span className="who">
                          <b>
                            {hp <= 0 ? "💀 " : isTarget ? "🎯 " : ""}
                            {slot.label}
                          </b>
                          <span className="bar">
                            <i style={{ width: `${pct}%` }} />
                          </span>
                          <small>
                            {hp}/{side.hp_max}
                          </small>
                        </span>
                      </button>
                    );
                  })}
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
                              <button key={lvl} disabled={waiting} onClick={() => void act("cast", a.key, lvl)}>
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
                        disabled={waiting || !!why}
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
                  disabled={waiting || (state.action_used && !state.extra_action)}
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
                      <button key={f.key} className="ar-btn" disabled={waiting || !!blocked} title={blocked || f.blurb} onClick={() => void act("feature", f.key)}>
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
                              <button key={lvl} disabled={waiting} onClick={() => void act("cast", a.key, lvl)}>
                                Slot L{lvl}
                              </button>
                            ))}
                          </span>
                        ) : (
                          <span className="ar-slots">
                            <button disabled={waiting} onClick={() => void act(a.kind === "weapon" ? "attack" : "cast", a.key)}>
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
                                <button key={b.id} disabled={waiting} onClick={() => void act("wild_shape", b.id)} title={`AC ${b.ac} · ${b.hp_average} HP · CR ${b.cr}`}>
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
                                <button key={l} disabled={waiting} onClick={() => void act("feature", f.key, l)}>
                                  {make ? `L${l} for ${FONT_COST[l]} pts` : `L${l} → ${l} pts`}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <button key={f.key} className="ar-btn" disabled={waiting || !!blocked} title={blocked || f.blurb} onClick={() => void act("feature", f.key)}>
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
                      disabled={waiting}
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
                <button className="ar-btn primary" disabled={waiting} onClick={() => void act("end_turn")}>
                  <b>End turn → {foe.name} acts</b>
                </button>
                <button className="ar-btn wide" disabled={waiting} onClick={() => void endFight()} title="Stop here. Nothing is saved to your sheet either way.">
                  <b>🏳 End the fight</b>
                  <small>leave the ring — the referee logs it as a retreat</small>
                </button>
              </div>
            </>
          )}

          {playing && (
            <button
              className="ar-btn ghost"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => setRevealed(total)}
            >
              <small>▸ tap to skip ahead</small>
            </button>
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
