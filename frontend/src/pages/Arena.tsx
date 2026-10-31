import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bot,
  Check,
  ChevronLeft,
  Crosshair,
  Dices,
  Flag,
  HandFist,
  HeartPulse,
  PawPrint,
  Shield,
  Skull,
  Sparkles,
  Star,
  Sun,
  Sword,
  Zap,
} from "lucide-react";

import { apiBase } from "../api/client";
import { useEventStream } from "../hooks/useEventStream";
import { Monogram, Tip } from "./player/ui";

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
  // Plan 116 — "boss" when the party is fighting one monster together.
  mode?: "duel" | "boss";
  boss?: string;
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
.ar-root { min-height: 100dvh; max-width: 592px; margin: 0 auto; padding: 8px 16px calc(48px + env(safe-area-inset-bottom, 0px));
  color: var(--text); font-family: var(--font-ui); }
.ar-back { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; color: var(--accent-text); font-size: 0.9375rem;
  font-weight: 500; text-decoration: none; background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; }
.ar-back:hover { color: var(--accent-hover); text-decoration: none; }
.ar-title { font-size: 1.5rem; margin: 2px 0 4px; }
.ar-sub { color: var(--text2); margin: 0 0 12px; font-size: 0.9375rem; }
.ar-calls { display: flex; flex-direction: column; gap: 6px; margin: 8px 0 12px; }
.ar-call { display: flex; flex-direction: column; gap: 2px; text-align: left; min-height: 52px; padding: 10px 14px; border-radius: 12px;
  font: inherit; cursor: pointer; border: 1px solid var(--accent-edge); background: var(--accent-soft); color: var(--text); }
.ar-call b { font-weight: 600; font-size: 0.9375rem; }
.ar-call small { color: var(--text2); font-size: 0.8125rem; }
.ar-modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; margin: 4px 0 12px;
  border-radius: 10px; background: var(--surface); border: 1px solid var(--border); }
.ar-modes.two { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ar-mode { min-height: 44px; padding: 6px; border-radius: 8px; border: none; background: transparent; color: var(--text2);
  font: 500 0.875rem var(--font-ui); cursor: pointer; line-height: 1.2; }
.ar-mode.on { background: var(--accent-active); color: var(--accent-active-text); }
.ar-big { width: 100%; min-height: 52px; padding: 12px 14px; border-radius: 10px; border: 1px solid transparent; margin: 4px 0;
  background: var(--accent); color: var(--accent-ink); font: 600 1rem var(--font-ui); cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px; }
.ar-big:hover:not(:disabled) { background: var(--accent-hover); }
.ar-big:disabled { opacity: 0.45; cursor: not-allowed; }
.ar-big.ghost { background: transparent; color: var(--text); border-color: var(--border2); font-weight: 500; }
.ar-big.ghost:hover:not(:disabled) { background: var(--surface3); }
.ar-h { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.875rem; font-weight: 600;
  color: var(--text2); margin: 18px 0 8px; }
.ar-link { background: none; border: none; padding: 0 4px; min-height: 44px; color: var(--accent-text); font: 500 0.875rem var(--font-ui); cursor: pointer; }
.ar-foe-list { display: grid; gap: 6px; }
.ar-foe { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; align-items: center; text-align: left; min-height: 56px;
  padding: 8px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); color: var(--text);
  cursor: pointer; font-family: inherit; }
.ar-foe:hover:not(:disabled) { border-color: var(--border2); }
.ar-foe:disabled { opacity: 0.55; cursor: default; }
.ar-foe b { display: flex; align-items: center; gap: 6px; font-size: 0.975rem; font-weight: 600; color: var(--text); }
.ar-foe small { color: var(--text2); font-size: 0.8125rem; }
.ar-foe small em { font-style: normal; }
.ar-foe.tough small em { color: var(--amber-text); }
.ar-foe.deadly small em { color: var(--danger-text); }
.ar-foe .cr { color: var(--text2); font-size: 0.75rem; grid-row: 1 / span 2; grid-column: 2; align-self: center; text-align: right; line-height: 1.2; }
.ar-foe .cr .num { display: block; color: var(--text); font-weight: 600; font-size: 0.975rem; }
.ar-foe.picked { border-color: var(--accent-edge); background: var(--accent-soft); }
.ar-foe.party { grid-template-columns: 1fr; }
.ar-cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 4px; }
.ar-card { border: 1px solid var(--border); border-radius: 14px; padding: 12px 10px; background: var(--surface); text-align: center; min-width: 0; }
.ar-card.foe { border-color: var(--danger-line); }
.ar-face { display: flex; align-items: center; justify-content: center; flex: none; border-radius: 50%; overflow: hidden; line-height: 1;
  box-shadow: inset 0 0 0 1px var(--border2); background: var(--surface3); }
/* The portraits on the sheets are square busts with the face high in the frame,
   so a plain circular crop of one shows chest. Zoom to the head instead. */
.ar-face img { width: 100%; height: 100%; object-fit: cover; transform: scale(1.55); transform-origin: 50% 0%; }
.ar-face.down { filter: grayscale(1); opacity: 0.62; }
.ar-card .ar-face { margin: 0 auto 8px; }
.ar-card .nm { font-family: var(--font-story); font-weight: 700; font-size: 1.05rem; color: var(--text); margin: 0 0 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ar-card .meta { font-size: 0.8125rem; color: var(--text2); line-height: 1.35; }
.ar-bar { height: 8px; border-radius: 4px; background: var(--border); overflow: hidden; margin: 8px 0 4px; }
.ar-bar i { display: block; height: 100%; background: var(--teal); transition: width 0.35s ease; }
.ar-bar i.low { background: var(--amber); } .ar-bar i.crit { background: var(--danger); }
.ar-hp { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 600; font-size: 1rem; color: var(--text); }
.ar-hp small { font-family: var(--font-ui); font-weight: 400; font-size: 0.75rem; color: var(--muted); }
.ar-chips { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; margin-top: 8px; }
.ar-chips span { font-size: 0.75rem; line-height: 1.35; border-radius: 999px; padding: 2px 8px; background: var(--surface3); color: var(--text2); }
.ar-chips span.cond { background: var(--amber-soft); color: var(--amber-text); }
.ar-chips span.bad { background: var(--danger-soft); color: var(--danger-text); }
.ar-econ { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 6px 12px; margin: 12px 0 8px;
  padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface); font-size: 0.875rem; color: var(--text2); }
.ar-econ.lit { border-color: var(--accent-edge); background: var(--accent-soft); }
.ar-econ b { font-weight: 600; font-size: 0.975rem; color: var(--text); }
.ar-econ .uses { display: flex; flex-wrap: wrap; gap: 4px 12px; }
.ar-econ .uses span { display: inline-flex; align-items: center; gap: 5px; }
.ar-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1.5px solid var(--border2); }
.ar-dot.on { background: var(--accent); border-color: var(--accent); }
.ar-turn { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin: 8px 0; padding: 10px 14px; border-radius: 12px;
  border: 1px solid var(--accent-edge); background: var(--accent-soft); color: var(--text); }
.ar-turn b { font-weight: 600; }
.ar-turn.auto { border-color: var(--border); background: var(--surface); color: var(--text2); }
.ar-turn small { color: var(--muted); font-size: 0.8125rem; }
.ar-roster { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.ar-seat { flex: 1 1 44%; display: flex; align-items: center; gap: 8px; min-height: 52px; text-align: left; padding: 6px 10px; border-radius: 12px;
  font: inherit; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; min-width: 0; }
.ar-seat:disabled { cursor: default; opacity: 0.8; }
.ar-seat.up { border-color: var(--accent-edge); }
.ar-seat.aimed { background: var(--danger-soft); border-color: var(--danger-line); }
.ar-seat .who { flex: 1; min-width: 0; }
.ar-seat b { display: flex; align-items: center; gap: 4px; font-size: 0.875rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ar-seat small { font-family: var(--font-mono); font-size: 0.75rem; color: var(--text2); }
.ar-seat .bar { display: block; height: 4px; border-radius: 3px; background: var(--border); margin: 4px 0 2px; }
.ar-seat .bar i { display: block; height: 100%; border-radius: 3px; background: var(--teal); }
.ar-sec { display: flex; align-items: center; gap: 6px; font-size: 0.875rem; font-weight: 600; color: var(--text2); margin: 16px 0 6px; }
.ar-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.ar-btn { text-align: left; min-height: 56px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border2); background: var(--surface);
  color: var(--text); cursor: pointer; font-family: inherit; display: grid; gap: 3px; align-content: start; min-width: 0; }
.ar-btn:hover:not(:disabled) { background: var(--surface3); }
.ar-btn b { display: flex; align-items: center; gap: 6px; font-size: 0.9375rem; font-weight: 600; color: var(--text); }
.ar-btn b svg { color: var(--muted); }
.ar-btn small { font-size: 0.8125rem; color: var(--text2); font-variant-numeric: tabular-nums; line-height: 1.35; }
.ar-btn .ar-why { color: var(--amber-text); }
.ar-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.ar-btn.primary { grid-column: 1 / -1; border-color: transparent; background: var(--accent); text-align: center; justify-content: center; min-height: 52px; align-content: center; }
.ar-btn.primary:hover:not(:disabled) { background: var(--accent-hover); }
.ar-btn.primary b { justify-content: center; color: var(--accent-ink); font-size: 1rem; }
.ar-btn.ghost { background: transparent; border-color: var(--border); }
.ar-btn.wide { grid-column: 1 / -1; }
.ar-slots { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.ar-slots button { min-height: 40px; border: 1px solid var(--accent-line); background: var(--accent-soft); color: var(--accent-active-text);
  border-radius: 999px; padding: 4px 14px; font: 500 0.875rem var(--font-ui); cursor: pointer; }
.ar-slots button:disabled { opacity: 0.4; cursor: not-allowed; }
.ar-slots button.on { background: var(--accent-active); border-color: var(--accent-edge); }
.ar-slots small { font-size: 0.8125rem; color: var(--muted); }
@media (pointer: coarse) { .ar-slots button { min-height: 44px; } }
.ar-away { width: 100%; margin: 0 0 8px; }
.ar-err { color: var(--danger-text); font-size: 0.875rem; margin: 6px 0; }
.ar-log { margin-top: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--surface); padding: 2px 12px; }
.ar-log:empty { display: none; }
.ar-line { position: relative; padding: 8px 0 8px 14px; border-bottom: 1px solid var(--border); font-size: 0.9375rem; line-height: 1.4; }
.ar-line:last-child { border-bottom: none; }
.ar-line::before { content: ""; position: absolute; left: 0; top: 15px; width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.ar-line.you::before { background: var(--accent); }
.ar-line.foe::before { background: var(--danger); }
.ar-line.ref { font-family: var(--font-story); font-style: italic; color: var(--story-text); }
.ar-line.crit { color: var(--accent-active-text); }
.ar-line small { display: block; font-family: var(--font-mono); font-style: normal; color: var(--muted); font-size: 0.75rem; margin-top: 2px; }
.ar-over { text-align: center; padding: 16px 14px; border-radius: 14px; border: 1px solid var(--accent-edge); background: var(--accent-soft); margin-bottom: 10px; }
.ar-over h2 { font-family: var(--font-story); font-weight: 700; font-size: 1.6rem; margin: 0 0 6px; color: var(--text); }
.ar-over p { margin: 0 0 4px; color: var(--text2); font-size: 0.9375rem; }
@keyframes ar-shake {
  10%, 90% { transform: translateX(-2px); }
  20%, 80% { transform: translateX(4px); }
  30%, 50%, 70% { transform: translateX(-7px); }
  40%, 60% { transform: translateX(7px); }
}
@keyframes ar-flash {
  from { background-color: var(--danger-soft); }
  to { background-color: var(--surface); }
}
.ar-hit { animation: ar-shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both, ar-flash 0.56s ease-out both; }
.ar-seat.hurt { animation: ar-flash 0.56s ease-out both; border-color: var(--danger-line); }
@media (prefers-reduced-motion: reduce) { .ar-hit, .ar-seat.hurt { animation: none; } }
`;

/**
 * A combatant's face. Plan 106 — Justin: "can we have headshots of the
 * monsters/characters at the top?"
 *
 * Falls back to the name's initials (the phone's monogram) before a sheet or
 * monster has a picture, so a fight never shows an empty frame. Goes grey
 * when the creature drops, in step with the narration like every other figure.
 */
function Headshot({
  src,
  size,
  down,
  alt,
}: {
  src: string | null | undefined;
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
        <Monogram name={alt} size={size} />
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

const KIND_ICON: Record<ArenaAttack["kind"], ReactNode> = {
  weapon: <Sword size={16} />,
  unarmed: <HandFist size={16} />,
  cantrip: <Sparkles size={16} />,
  spell: <Sparkles size={16} />,
  heal: <HeartPulse size={16} />,
  buff: <Sun size={16} />,
  feature: <Star size={16} />,
};

const ABILITY_WORD: Record<string, string> = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};
/** "+5 to hit · " or "DC 13 Wisdom save · " — the opening of an attack's detail line. */
const hitOrSave = (a: ArenaAttack) =>
  a.hit_bonus != null
    ? `+${a.hit_bonus} to hit · `
    : a.save_dc
      ? `DC ${a.save_dc} ${ABILITY_WORD[a.save_ability?.toUpperCase() ?? ""] ?? a.save_ability?.toUpperCase() ?? ""} save · `
      : "";

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
  // Plan 116 — which friend a heal lands on (a roster index), or null for yourself.
  const [healTo, setHealTo] = useState<number | null>(null);
  // act() and endFight() are declared before the duel state below; these refs
  // are how they reach it without reordering the whole component.
  const duelIdRef = useRef<string | null>(null);
  const takeRef = useRef<(d: DuelRead) => void>(() => {});
  const setDuelRef = useRef<(d: DuelRead | null) => void>(() => {});

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
      setDuelRef.current(null);
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
  // Plan 116 — a boss battle with everyone on their own phone, or one phone.
  const [bossLive, setBossLive] = useState(true);
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
  setDuelRef.current = setDuel;

  // Plan 116 — `monsterId` makes it a boss battle with everyone on their own
  // phone; `seats` replays a finished fight's line-up for a rematch.
  async function startLive(monsterId?: string, seats?: string[]) {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      const ids = Array.from(new Set([pcId, ...(seats ?? picked)]));
      const d = await post<DuelRead>(`/play/${pcId}/duels`, {
        pc_ids: ids,
        monster_id: monsterId ?? null,
      });
      setDuelId(d.id);
      setDuel(d);
      setState(d.state);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startDuel(seats?: string[]) {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      const ids = Array.from(new Set([pcId, ...(seats ?? picked)]));
      setDuel(null);
      setState(await post<ArenaState>(`/play/${pcId}/arena/duel`, { pc_ids: ids }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Plan 116 — a seat whose person stepped away is played by the referee, and
  // handed back when they return. The server decides who may do either.
  async function seatChange(path: "referee" | "return", seat?: string) {
    if (!pcId || !duelId) return;
    setBusy(true);
    setErr(null);
    try {
      take(
        await post<DuelRead>(
          `/play/${pcId}/duels/${duelId}/${path}`,
          path === "referee" ? { seat_pc_id: seat } : {},
        ),
      );
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function pickFoe(monsterId: string) {
    if (hall !== "boss") return void start(monsterId);
    if (bossLive && picked.length > 0) return void startLive(monsterId);
    return void startBoss(monsterId);
  }

  async function startBoss(monsterId: string, seats?: string[]) {
    if (!pcId) return;
    setBusy(true);
    setErr(null);
    try {
      const ids = Array.from(new Set([pcId, ...(seats ?? picked)]));
      setDuel(null);
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
      yourChips.push({ label: you.slots_max?.[lvl] ? `Level ${lvl} slots ${n}/${you.slots_max[lvl]}` : `Level ${lvl} slots ×${n}` }),
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

  // Plan 116 — friends a heal can land on: your own side, the fallen included
  // (a heal is how a party gets somebody back up).
  const mySide = roster[myIndex]?.team;
  const friends = roster
    .map((sl, i) => ({ sl, i }))
    .filter(({ sl, i }) => sl.kind === "pc" && sl.pc && sl.team === mySide && i !== myIndex);
  const canHeal =
    !!you &&
    (you.attacks.some((a) => a.effect === "heal") || you.features.some((f) => f.key === "lay_on_hands"));
  const healArg = healTo !== null && friends.some((f) => f.i === healTo) ? healTo : undefined;
  const healFor = (a: ArenaAttack) => (a.effect === "heal" ? healArg : undefined);
  // A seat the referee is covering for this phone's person.
  const coveredForMe = !!duelId && !!mySeat?.auto;

  // Plan 116 — the end screen speaks to whoever is holding this phone. A
  // roster fight is "won" whenever anybody is left standing, so the loser of a
  // duel used to be told they had won.
  const standing = roster.filter((sl) => ((sl.pc ?? sl.foe)?.hp ?? 0) > 0);
  const fromHere = duel ? roster.findIndex((sl) => sl.pc_id === pcId) : -1;
  function verdict(): string {
    if (!state) return "";
    if (!roster.length) {
      return state.result === "won" ? "You win" : state.result === "lost" ? "You're down" : "You left the ring";
    }
    if (state.result === "fled" || standing.length === 0) return "Called off";
    const names = standing.map((sl) => sl.label).join(" & ");
    if (state.mode === "boss") {
      return standing.some((sl) => sl.team === 0) ? "The party wins" : `${names} wins`;
    }
    if (fromHere >= 0) {
      return standing.some((sl) => sl.pc_id === pcId) ? "You win" : `${names} wins`;
    }
    return `${names} wins`;
  }
  // The same line-up again, on the same footing (own phones or one phone).
  function rematch() {
    if (!state) return;
    if (!roster.length) return void start(state.foe.monster_id ?? null);
    const seats = roster.filter((sl) => sl.kind === "pc" && sl.pc_id).map((sl) => sl.pc_id as string);
    const bossId = roster.find((sl) => sl.kind === "monster")?.foe?.monster_id ?? null;
    if (state.mode === "boss" && bossId) {
      return void (duel ? startLive(bossId, seats) : startBoss(bossId, seats));
    }
    return void (duel ? startLive(undefined, seats) : startDuel(seats));
  }

  return (
    <div className="ar-root">
      <style>{CSS}</style>
      <nav aria-label="Back">
        <Link className="ar-back" to={`/play/${pcId}`}>
          <ChevronLeft size={18} /> Back to your sheet
        </Link>
      </nav>
      <h1 className="ar-title">Practice arena</h1>

      {(!state || state.phase === "over") && calls.length > 0 && (
        <div className="ar-calls">
          {calls.map((c) => (
            <button key={c.id} type="button" className="ar-call" onClick={() => setDuelId(c.id)}>
              {c.mode === "boss" ? (
                <>
                  <b>
                    {c.host_name || "Someone"} needs you against {c.boss || "a boss"}
                  </b>
                  <small>
                    {c.seats.join(", ")}
                    {c.your_turn ? " · you're up" : ""} · tap to join
                  </small>
                </>
              ) : (
                <>
                  <b>{c.host_name || "Someone"} called you out</b>
                  <small>
                    {c.seats.join(" vs ")}
                    {c.your_turn ? " · you're up" : ""} · tap to join
                  </small>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {!state && (
        <>
          <p className="ar-sub">
            Spar using your real sheet: your weapons, spells, spell slots and class features, run
            by the rules. Nothing here changes anybody&rsquo;s character.
          </p>
          <div className="ar-modes" role="group" aria-label="Kind of fight">
            {(
              [
                ["monster", "Fight a monster"],
                ["duel", "Duel a friend"],
                ["boss", "Boss battle"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={hall === key}
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
                  : bossLive
                    ? "Your party against one monster, everyone on their own phone. Each of you plays your own turns; the referee plays the monster. Heals can land on a friend."
                    : "Your party against one monster on this phone. You pick your own actions; the referee plays everybody else."}
              </p>
              <div className="ar-h">Who&rsquo;s in</div>
              <div className="ar-foe-list">
                {party
                  .filter((row) => row.id !== pcId)
                  .map((row) => {
                    const on = picked.includes(row.id);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        aria-pressed={on}
                        className={`ar-foe party${on ? " picked" : ""}`}
                        onClick={() =>
                          setPicked((cur) =>
                            cur.includes(row.id)
                              ? cur.filter((x) => x !== row.id)
                              : [...cur, row.id],
                          )
                        }
                      >
                        <b>
                          {on && <Check size={16} color="var(--accent-text)" />}
                          <span className="story" style={{ fontWeight: 700 }}>{row.character_name}</span>
                        </b>
                        <small>
                          {row.player_name} · {row.character_class} {row.level}
                          {row.subclass ? ` (${row.subclass})` : ""} · Armor Class {row.ac} · {row.hp_max} hit points
                        </small>
                      </button>
                    );
                  })}
                {party.filter((row) => row.id !== pcId).length === 0 && (
                  <p className="ar-sub" style={{ margin: 0 }}>
                    Nobody else in your party has a character yet. Once a friend joins the table, they show up here.
                  </p>
                )}
              </div>
              {hall === "duel" && (
                <>
                  <button
                    type="button"
                    className="ar-big"
                    style={{ marginTop: 12 }}
                    disabled={busy || picked.length === 0}
                    onClick={() => void startLive()}
                  >
                    {picked.length === 0
                      ? "Pick at least one opponent"
                      : `Each on your own phone: ${picked.length + 1} in the ring`}
                  </button>
                  <button
                    type="button"
                    className="ar-big ghost"
                    disabled={busy || picked.length === 0}
                    onClick={() => void startDuel()}
                  >
                    One phone, passed around
                  </button>
                </>
              )}
              {hall === "boss" && (
                <>
                  <div className="ar-modes two" role="group" aria-label="Whose phones" style={{ marginTop: 12 }}>
                    <button
                      type="button"
                      aria-pressed={bossLive}
                      className={`ar-mode${bossLive ? " on" : ""}`}
                      onClick={() => setBossLive(true)}
                    >
                      Everyone on their own phone
                    </button>
                    <button
                      type="button"
                      aria-pressed={!bossLive}
                      className={`ar-mode${bossLive ? "" : " on"}`}
                      onClick={() => setBossLive(false)}
                    >
                      Just this phone
                    </button>
                  </div>
                  <p className="ar-sub">
                    {bossLive && picked.length === 0
                      ? "Pick who's in above, then choose the boss below; each of them gets called in."
                      : "Now choose the boss from the list below and the fight starts."}
                  </p>
                </>
              )}
            </>
          )}
          {hall === "monster" && (
            <button type="button" className="ar-big" disabled={busy || !pcId} onClick={() => void start(null)}>
              <Dices size={18} /> Surprise me: a foe that fits my level
            </button>
          )}
          {err && <p className="ar-err">{err}</p>}
          {foes === null && <p className="ar-sub" style={{ marginTop: "1rem" }}>Looking through the monsters…</p>}
          {hall !== "duel" && suggested.length > 0 && (
            <>
              <div className="ar-h">{hall === "boss" ? "Bosses that fit your level" : "Fits your level"}</div>
              <div className="ar-foe-list">
                {suggested.map((f) => (
                  <button key={f.id} type="button" className="ar-foe" disabled={busy} onClick={() => pickFoe(f.id)}>
                    <b>{f.name}</b>
                    <span className="cr">Challenge<span className="num">{f.cr}</span></span>
                    <small>
                      {f.creature_type} · Armor Class {f.ac} · {f.hp_average} hit points
                    </small>
                  </button>
                ))}
              </div>
            </>
          )}
          {hall !== "duel" && others.length > 0 && (
            <>
              <div className="ar-h">
                <span>Everything else</span>
                <button type="button" className="ar-link" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
                  {showAll ? "Hide" : `Show all ${others.length}`}
                </button>
              </div>
              {showAll && (
                <div className="ar-foe-list">
                  {others.map((f) => (
                    <button key={f.id} type="button" className={`ar-foe ${f.tier}`} disabled={busy} onClick={() => pickFoe(f.id)}>
                      <b>{f.name}</b>
                      <span className="cr">Challenge<span className="num">{f.cr}</span></span>
                      <small>
                        {f.creature_type} · Armor Class {f.ac} · {f.hp_average} hit points ·{" "}
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
              There are no monsters to fight yet. Ask your DM to open QuestLab once so the monster list fills in.
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
                  size={64}
                  down={upHp <= 0}
                  alt={upNow.label}
                />
                <p className="nm">{upNow.label}</p>
                <div className="meta">Taking their turn</div>
                <div className="ar-bar">
                  <i
                    className={hpClass(upHp, upMax)}
                    style={{ width: `${(100 * upHp) / Math.max(1, upMax)}%` }}
                  />
                </div>
                <div className="ar-hp">
                  {upHp}/{upMax} <small>hit points</small>
                </div>
              </div>
            ) : (
            <div className={`ar-card foe${hurt.includes(roster.length ? (state.target_index ?? -1) : 1) ? " ar-hit" : ""}`}>
              <Headshot
                src={foe.image_url}
                size={64}
                down={foeHp <= 0}
                alt={foe.name}
              />
              <p className="nm">{foe.name}</p>
              <div className="meta">
                Armor Class <span className="num">{foe.ac}</span>
                <br />
                Challenge <span className="num">{foe.cr}</span>
              </div>
              <div className="ar-bar">
                <i className={hpClass(foeHp, foe.hp_max)} style={{ width: `${(100 * foeHp) / Math.max(1, foe.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {foeHp}/{foe.hp_max} <small>hit points</small>
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
                size={64}
                down={youHp <= 0}
                alt={you.name}
              />
              <p className="nm">{you.name}</p>
              <div className="meta">
                Armor Class <span className="num">{you.beast ? you.beast.ac : you.ac}</span>
                <br />
                {you.character_class} {you.level}
                {you.subclass ? ` · ${you.subclass}` : ""}
              </div>
              <div className="ar-bar">
                <i className={hpClass(youHp, you.hp_max)} style={{ width: `${(100 * youHp) / Math.max(1, you.hp_max)}%` }} />
              </div>
              <div className="ar-hp">
                {youHp}/{you.hp_max} <small>hit points</small>
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
              <h2>{verdict()}</h2>
              {state.tips.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
              <div className="ar-grid" style={{ marginTop: 12 }}>
                <button type="button" className="ar-btn primary" disabled={busy} onClick={rematch}>
                  <b>{roster.length ? "Rematch, same line-up" : "Again, same foe"}</b>
                </button>
                <button type="button" className="ar-btn" style={{ alignContent: "center", textAlign: "center" }} disabled={busy} onClick={() => setState(null)}>
                  <b style={{ justifyContent: "center" }}>{roster.length ? "Back to the arena" : "Pick another foe"}</b>
                </button>
                <Link className="ar-btn ghost" to={`/play/${pcId}`} style={{ textDecoration: "none", textAlign: "center", alignContent: "center" }}>
                  <b style={{ justifyContent: "center" }}>Back to my sheet</b>
                </Link>
              </div>
            </div>
            )
          ) : (
            <>
              <div className={`ar-econ${locked ? "" : " lit"}`}>
                <b>Round <span className="num">{state.round}</span>{locked ? "" : " · your turn"}</b>
                <span className="uses" aria-label="What you have left this turn">
                  <span>
                    Action
                    <i className={`ar-dot ${state.action_used && !state.extra_action ? "" : "on"}`} />
                    {state.extra_action && <i className="ar-dot on" />}
                  </span>
                  <span>
                    Bonus
                    <i className={`ar-dot ${state.bonus_used ? "" : "on"}`} />
                  </span>
                  <span>
                    Reaction
                    <i className={`ar-dot ${state.reaction_used || !state.auto_reactions ? "" : "on"}`} />
                  </span>
                </span>
              </div>
              {state.tips.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 8 }}>
                  {state.tips.map((t, i) => (
                    <Tip key={i}>{t}</Tip>
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
                  {locked && <small>Live: this updates itself</small>}
                  {!locked && !upNow.auto && !duelId && roster.length > 2 && (
                    <small>Pass the phone</small>
                  )}
                </div>
              )}
              {coveredForMe ? (
                <button
                  type="button"
                  className="ar-btn wide ar-away"
                  disabled={busy}
                  onClick={() => void seatChange("return")}
                >
                  <b>I&rsquo;m back: let me play my turns</b>
                  <small>The referee is playing {you.name} for you right now.</small>
                </button>
              ) : (
                locked &&
                upNow?.pc_id &&
                !upNow.auto &&
                !playing && (
                  <button
                    type="button"
                    className="ar-btn wide ghost ar-away"
                    disabled={busy}
                    onClick={() => void seatChange("referee", upNow.pc_id ?? undefined)}
                    title="Their phone died or they stepped away? The referee plays their turns until they come back."
                  >
                    <b><Bot size={16} /> {upNow.label} stepped away?</b>
                    <small>Let the referee play their turns until they come back.</small>
                  </button>
                )
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
                        type="button"
                        aria-pressed={isTarget}
                        className={`ar-seat${isUp ? " up" : ""}${isTarget ? " aimed" : ""}${
                          hurt.includes(i) ? " hurt" : ""
                        }`}
                        disabled={waiting || mine || side.hp <= 0}
                        title={mine ? "On your side" : "Aim at this one"}
                        onClick={() => void act("aim", undefined, undefined, i)}
                      >
                        <Headshot
                          src={slot.pc?.portrait_url ?? slot.foe?.image_url}
                          size={34}
                          down={hp <= 0}
                          alt={slot.label}
                        />
                        <span className="who">
                          <b>
                            {hp <= 0 ? (
                              <Skull size={14} aria-label="down" />
                            ) : isTarget ? (
                              <Crosshair size={14} color="var(--danger-text)" aria-label="your target" />
                            ) : null}
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
                  <button type="button" className="ar-btn primary" disabled={busy} onClick={() => setState(null)}>
                    <b>This fight expired. Start over</b>
                  </button>
                </div>
              )}

              {canHeal && friends.length > 0 && !locked && (
                <>
                  <div className="ar-sec"><HeartPulse size={16} /> Your heals land on</div>
                  <div className="ar-slots" style={{ marginBottom: 4 }}>
                    <button type="button" aria-pressed={healArg === undefined} className={healArg === undefined ? "on" : ""} onClick={() => setHealTo(null)}>
                      You · <span className="num">{youHp}/{you.hp_max}</span>
                    </button>
                    {friends.map(({ sl, i }) => {
                      const hp = hpAt(i, sl.pc?.hp ?? 0);
                      return (
                        <button key={i} type="button" aria-pressed={healArg === i} className={healArg === i ? "on" : ""} onClick={() => setHealTo(i)}>
                          {sl.label} · <span className="num">{hp}/{sl.pc?.hp_max ?? 0}</span>
                          {hp <= 0 ? " (down)" : ""}
                        </button>
                      );
                    })}
                  </div>
                </>
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
                        {hitOrSave(a)}
                        {a.damage !== "0" ? `${a.damage} ${a.damage_type}` : a.note}
                        {a.spell_level > 0 ? ` · level ${a.spell_level} spell` : ""}
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
                              <button key={lvl} type="button" disabled={waiting} onClick={() => void act("cast", a.key, lvl, healFor(a))}>
                                Level {lvl} slot
                              </button>
                            ))}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <button
                        key={a.key}
                        type="button"
                        className="ar-btn"
                        disabled={waiting || !!why}
                        title={why || a.note}
                        onClick={() =>
                          void act(
                            a.kind === "weapon" || a.kind === "unarmed" ? "attack" : "cast",
                            a.key,
                            levels[0],
                            healFor(a),
                          )
                        }
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
                  type="button"
                  className="ar-btn"
                  disabled={waiting || (state.action_used && !state.extra_action)}
                  title="Attacks against you have disadvantage until your next turn"
                  onClick={() => void act("dodge")}
                >
                  <b><Shield size={16} /> Dodge</b>
                  <small>Attacks against you have disadvantage until your next turn</small>
                </button>
                {you.features
                  .filter((f) => f.cost === "action")
                  .map((f) => {
                    const blocked = f.uses_left <= 0 ? "No uses left" : state.action_used && !state.extra_action ? "Action already used" : "";
                    return (
                      <button key={f.key} type="button" className="ar-btn" disabled={waiting || !!blocked} title={blocked || f.blurb} onClick={() => void act("feature", f.key)}>
                        <b><Star size={16} /> {f.name}</b>
                        <small>
                          {f.uses_left >= 99 ? "at will" : `${f.uses_left} left`} · {f.blurb}
                        </small>
                        {blocked && <small className="ar-why">{blocked}</small>}
                      </button>
                    );
                  })}
              </div>

              <div className="ar-sec">Bonus action and extras on a hit</div>
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
                          {hitOrSave(a)}
                          {a.damage !== "0" ? `${a.damage} ${a.damage_type} · ` : ""}
                          {a.note}
                          {upcastHint(a, levels)}
                        </small>
                        {why ? (
                          <small className="ar-why">{why}</small>
                        ) : pickSlot ? (
                          <span className="ar-slots">
                            {levels.map((lvl) => (
                              <button key={lvl} type="button" disabled={waiting} onClick={() => void act("cast", a.key, lvl, healFor(a))}>
                                Level {lvl} slot
                              </button>
                            ))}
                          </span>
                        ) : (
                          <span className="ar-slots">
                            <button
                              type="button"
                              disabled={waiting}
                              onClick={() => void act(a.kind === "weapon" ? "attack" : "cast", a.key, undefined, healFor(a))}
                            >
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
                          <b><PawPrint size={16} /> {f.name}</b>
                          <small>
                            {f.uses_left} left · {f.blurb}
                          </small>
                          {blocked ? (
                            <small className="ar-why">{blocked}</small>
                          ) : (
                            <span className="ar-slots">
                              {(beasts ?? []).map((b) => (
                                <button key={b.id} type="button" disabled={waiting} onClick={() => void act("wild_shape", b.id)} title={`Armor Class ${b.ac} · ${b.hp_average} hit points · Challenge ${b.cr}`}>
                                  {b.name}
                                </button>
                              ))}
                              {beasts !== null && beasts.length === 0 && <small>No beasts you can turn into yet at your level.</small>}
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
                          <b><Zap size={16} /> {f.name}</b>
                          <small>{f.blurb}</small>
                          {stuck ? (
                            <small className="ar-why">{stuck}</small>
                          ) : (
                            <span className="ar-slots">
                              {options.map((l) => (
                                <button key={l} type="button" disabled={waiting} onClick={() => void act("feature", f.key, l)}>
                                  {make ? `Level ${l} slot for ${FONT_COST[l]} points` : `Level ${l} slot → ${l} points`}
                                </button>
                              ))}
                            </span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <button
                        key={f.key}
                        type="button"
                        className="ar-btn"
                        disabled={waiting || !!blocked}
                        title={blocked || f.blurb}
                        onClick={() =>
                          void act("feature", f.key, undefined, f.key === "lay_on_hands" ? healArg : undefined)
                        }
                      >
                        <b>
                          {f.cost === "bonus" ? <Zap size={16} /> : <Star size={16} />}
                          {f.name}
                        </b>
                        <small>
                          {f.cost === "bonus" ? "Bonus action" : "Free"} · {f.uses_left >= 99 ? "at will" : `${f.uses_left} left`} · {f.blurb}
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
                      type="button"
                      aria-pressed={state.auto_reactions}
                      className="ar-btn wide ghost"
                      disabled={waiting}
                      onClick={() => void act("toggle_reactions")}
                      title="Shield, Uncanny Dodge, Deflect Attacks, Cutting Words and Hellish Rebuke fire on their own when they help"
                    >
                      <b>{state.auto_reactions ? "Automatic reactions: on · tap to turn off" : "Automatic reactions: off · tap to turn on"}</b>
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
                <button type="button" className="ar-btn primary" disabled={waiting} onClick={() => void act("end_turn")}>
                  <b>{roster.length ? "End turn" : `End turn: ${foe.name} acts`}</b>
                </button>
                <button type="button" className="ar-btn wide ghost" disabled={waiting} onClick={() => void endFight()} title="Stop here. Nothing is saved to your sheet either way.">
                  <b><Flag size={16} /> End the fight</b>
                  <small>Leave the ring; the referee counts it as a retreat. Nothing changes on your sheet.</small>
                </button>
                {duelId && !coveredForMe && pcId && (
                  <button
                    type="button"
                    className="ar-btn wide ghost"
                    disabled={busy}
                    onClick={() => void seatChange("referee", pcId)}
                    title="The fight goes on without you holding it up. Come back any time."
                  >
                    <b><Bot size={16} /> Step away: the referee plays me</b>
                    <small>Everyone else keeps fighting; take your turns back whenever you like.</small>
                  </button>
                )}
              </div>
            </>
          )}

          {playing && (
            <button
              type="button"
              className="ar-btn ghost"
              style={{ width: "100%", marginTop: 10, minHeight: 44, alignContent: "center", textAlign: "center" }}
              onClick={() => setRevealed(total)}
            >
              <b style={{ justifyContent: "center", fontWeight: 500, color: "var(--text2)" }}>Skip ahead</b>
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
