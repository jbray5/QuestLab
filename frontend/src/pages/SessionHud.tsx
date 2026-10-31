/**
 * Session HUD — persistent screen for running a session at the table.
 *
 * Three-panel layout (CSS grid):
 *   Left  — Party Tracker: HP, AC, conditions, spell slots per PC
 *   Center — Scene Navigator: runbook scenes with read-aloud + DM notes
 *   Right  — Combat: initiative tracker, round counter, per-combatant HP/conditions
 *
 * Bottom bar: dice roller + quick rules reference (collapsible).
 *
 * All transient state (conditions, spell slots, initiative, dice) lives in React
 * useState — intentionally ephemeral, resets each session.
 * HP changes are persisted via PATCH /characters/:id.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, BookOpen, Brain, ChevronDown, ChevronRight, CircleStop, Clapperboard, Coins, Copy, Dices, Gamepad2, Lightbulb,
  Map as MapIcon, Maximize2, Megaphone, Minimize2, Moon, MoreHorizontal, Plus, QrCode, ScreenShare, ScrollText, Shield,
  Skull, Sparkles, SquareArrowOutUpRight, Tent, Tv, Undo2, UserRound, Users, Warehouse, X,
} from "lucide-react";
import { AI_ON } from "../lib/flags";
import { zoomable } from "../lib/lightbox";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";
import { apiBase } from "../api/client";
import { useToast } from "../components/Toast";
import { portraitSrc } from "../lib/portrait";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { encountersApi } from "../api/encounters";
import { npcsApi } from "../api/npcs";
import TonightsCastDrawer from "../components/tonights-cast/TonightsCastDrawer";
import HudMenu from "../components/hud/HudMenu";
import { useHudPrefs } from "../stores/useHudPrefs";
import EditableRunbookText from "../components/runbook/EditableRunbookText";
import TableRollStrip from "../components/dice-tray/TableRollStrip";
import { monstersApi } from "../api/monsters";
import { restApi } from "../api/rest";
import { featuresApi } from "../api/features";
import { spellcastingApi } from "../api/spellcasting";
import BriefPanel from "../components/brief/BriefPanel";
import CharacterSheet from "../components/character-sheet/CharacterSheet";
import PlayerLinkButton from "../components/character-sheet/PlayerLinkButton";
import DmScreen from "../components/dm-screen/DmScreen";
import LootPanel from "../components/LootPanel";
import { TableConsoleModal } from "../components/table/TableConsole";
import LiveBoardPane from "../components/table/LiveBoardPane";
import { useIsCompactHeight } from "../hooks/useIsCompact";
import SessionNotesEditor from "../components/dm/SessionNotesEditor";
import { tableApi } from "../api/table";
import { useEventStream, type StreamEvent } from "../hooks/useEventStream";
import MonsterStatBlock from "../components/MonsterStatBlock";
import { FLAVORS } from "../engine/strikes";
import { useInitiativeStore } from "../stores/useInitiativeStore";
import { useStrikeStore } from "../stores/useStrikeStore";
import SpellChips from "../components/table/SpellChips";
import CombatBeatsPanel from "../components/combat-beats/CombatBeatsPanel";
import type {
  Combatant,
  PlayerCharacter,
  RunbookScene,
  Encounter,
  RosterEntry,
  SessionCombatant,
} from "../api/types";
import { plural } from "../lib/plural";

// ── Constants ─────────────────────────────────────────────────────────────────

const CONDITIONS = [
  "Blinded", "Charmed", "Concentrating", "Deafened", "Exhausted",
  "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed",
  "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
] as const;

type Condition = (typeof CONDITIONS)[number];

// ── Lamplit look (Plan 121 · docs/DESIGN.md) ──────────────────────────────────
// The cockpit is dense, so its controls run shorter than the global .btn.
const BTN_SM: React.CSSProperties = { minHeight: 30, padding: "0.25rem 0.6rem", fontSize: "0.8125rem", gap: "0.35rem" };
const BTN_XS: React.CSSProperties = { minHeight: 26, padding: "0.1rem 0.45rem", fontSize: "0.75rem", gap: "0.3rem" };
/** A square icon-only button (always paired with an aria-label). */
const BTN_ICON: React.CSSProperties = { minHeight: 26, width: 26, padding: 0, border: "none" };
/** A toggle that is on: the sidebar's "you are here" warmth, not the primary orange. */
const TOGGLE_ON: React.CSSProperties = {
  background: "var(--accent-active)",
  color: "var(--accent-active-text)",
  borderColor: "var(--accent-line)",
};
/** The band at the top of each cockpit column. */
const PANEL_BAND: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.4rem",
};
/** A small sentence-case label over a group (never letter-spaced capitals). */
const GROUP_LABEL: React.CSSProperties = { fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.35rem" };

/** Health reads teal → amber (≤ half) → red (≤ quarter). */
function hpTone(fraction: number): string {
  return fraction > 0.5 ? "var(--teal)" : fraction > 0.25 ? "var(--amber)" : "var(--danger)";
}

/** Session numbers are Roman numerals (DESIGN.md §1). */
function toRoman(n: number): string {
  if (!Number.isFinite(n) || n <= 0 || n >= 4000) return String(n);
  const table: Array<[number, string]> = [
    [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
    [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
  ];
  let out = "";
  let rest = Math.floor(n);
  for (const [v, s] of table) {
    while (rest >= v) {
      out += s;
      rest -= v;
    }
  }
  return out;
}

/** Two letters for a portrait that has no picture yet. */
function initials(name: string): string {
  const words = name.split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, "")).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return (first + last).toUpperCase();
}

const CONDITION_RULES: Record<Condition, string> = {
  Blinded: "Can't see. Auto-fail checks needing sight. Attack rolls against you have advantage; your attacks have disadvantage.",
  Charmed: "Can't attack charmer. Charmer has advantage on social checks vs you.",
  Concentrating: "Casting a concentration spell. Taking damage requires CON save (DC 10 or half damage, whichever is higher) or lose the spell.",
  Deafened: "Can't hear. Auto-fail checks needing hearing.",
  Exhausted: "Levels 1–6 apply cumulative penalties (disadvantage → speed halved → -5 to all → speed 0 → death saves fail → dead).",
  Frightened: "Disadvantage on checks/saves while source is in sight. Can't willingly move closer to source.",
  Grappled: "Speed = 0. Ends if grappler is incapacitated or target is moved out of reach.",
  Incapacitated: "Can't take actions or reactions.",
  Invisible: "Impossible to see without magic. Attacks against you have disadvantage; your attacks have advantage.",
  Paralyzed: "Incapacitated + can't move/speak. Auto-fail STR/DEX saves. Attacks against you have advantage. Hits within 5 ft are crits.",
  Petrified: "Transformed to stone. Incapacitated, speed 0. Resistance to all damage. Immune to poison/disease.",
  Poisoned: "Disadvantage on attack rolls and ability checks.",
  Prone: "Melee attacks against you have advantage; ranged have disadvantage. Your attacks have disadvantage. Getting up costs half movement.",
  Restrained: "Speed = 0. Attacks against you have advantage; your attacks have disadvantage. Disadvantage on DEX saves.",
  Stunned: "Incapacitated + can't move + can only speak falteringly. Auto-fail STR/DEX saves. Attacks against you have advantage.",
  Unconscious: "Incapacitated + can't move/speak + unaware of surroundings. Drop held items, fall prone. Auto-fail STR/DEX saves. Attacks have advantage; hits within 5 ft are crits.",
};


function abilityMod(score: number) {
  return Math.floor((score - 10) / 2);
}

function profBonus(level: number) {
  return Math.floor((level - 1) / 4) + 2;
}

// Plan 60 — party-strip quick stats. Casting ability by class; null = no DC row.
const CASTING_ABILITY: Record<string, "wis" | "cha" | "int"> = {
  Cleric: "wis",
  Druid: "wis",
  Ranger: "wis",
  Bard: "cha",
  Paladin: "cha",
  Sorcerer: "cha",
  Warlock: "cha",
  Wizard: "int",
};

function spellSaveDc(pc: PlayerCharacter): number | null {
  const ability = CASTING_ABILITY[pc.character_class];
  if (!ability) return null;
  const score =
    ability === "wis" ? pc.score_wis : ability === "cha" ? pc.score_cha : pc.score_int;
  return 8 + profBonus(pc.level) + abilityMod(score);
}

function passiveSkill(score: number, pb: number, rank: number): number {
  // rank 0 = none, 1 = proficient, 2 = expertise (matches skill_proficiencies).
  return 10 + abilityMod(score) + pb * rank;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface HpEditorProps {
  hp: number;
  maxHp: number;
  onSave: (newHp: number) => void;
  saving: boolean;
}

function HpEditor({ hp, maxHp, onSave, saving }: HpEditorProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(hp));
  const inputRef = useRef<HTMLInputElement>(null);
  // Plan 82 — rapid −/+ taps accumulate locally and save once the tapping
  // stops; the old code read the stale prop each click and lost taps.
  const [local, setLocal] = useState<{ base: number; value: number } | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const pending = useRef<number | null>(null);
  const shown = local && local.base === hp ? local.value : hp;
  function bump(delta: number) {
    // Plan 85 — read the pending value, not the rendered one, so taps that
    // land in the same tick all count (Jess: three taps became one).
    const cur = pending.current ?? shown;
    const next = Math.min(maxHp, Math.max(0, cur + delta));
    pending.current = next;
    setLocal({ base: hp, value: next });
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      pending.current = null;
      onSave(next);
    }, 320);
  }
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const n = Math.min(maxHp, Math.max(0, Number(val) || 0));
    onSave(n);
    setEditing(false);
  }

  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (shown / maxHp) * 100)) : 0;
  const barColor = hpTone(pct / 100);
  const stepBtn: React.CSSProperties = { ...BTN_XS, minWidth: 28, padding: "0 0.4rem", fontSize: "0.875rem" };

  return (
    <div style={{ width: "100%" }}>
      <div className="flex" style={{ alignItems: "center", gap: "0.4rem", marginBottom: "0.3rem", flexWrap: "nowrap" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }} title="Hit points">HP</span>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            className="num"
            style={{ width: 56, fontSize: "0.95rem", padding: "0.1rem 0.3rem" }}
          />
        ) : (
          <button
            onClick={() => { setVal(String(shown)); setEditing(true); }}
            className="num"
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "1rem", fontWeight: 600, color: "var(--text)", padding: 0,
            }}
            disabled={saving}
            title="Click to type their hit points"
          >
            {shown}
          </button>
        )}
        <span className="num" style={{ color: "var(--muted)", fontSize: "0.875rem" }}>/ {maxHp}</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <button
            className="btn btn-ghost"
            style={stepBtn}
            onClick={() => bump(-1)}
            disabled={shown <= 0}
            title="−1 HP (taps add up, then save)"
          >−</button>
          <button
            className="btn btn-ghost"
            style={stepBtn}
            onClick={() => bump(1)}
            disabled={shown >= maxHp}
            title="+1 HP (taps add up, then save)"
          >+</button>
          <button
            className="btn btn-ghost"
            style={{ ...stepBtn, color: "var(--teal-text)" }}
            onClick={() => onSave(maxHp)}
            disabled={saving || hp === maxHp}
            title="Full heal — back to max hit points"
          >Full</button>
        </span>
      </div>
      <div style={{
        height: 6, borderRadius: 3, background: "var(--border)",
        overflow: "hidden", width: "100%",
      }}>
        <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.3s, background 0.3s" }} />
      </div>
    </div>
  );
}

interface ConditionTagsProps {
  active: Set<Condition>;
  onToggle: (c: Condition) => void;
  /** Lowercase condition names the target is immune to (from monster stat block). */
  immunities?: Set<string>;
  /**
   * Pin the picker and tooltip to the viewport. The initiative strip scrolls
   * sideways, which clips anything that pops out of it; fixed escapes that.
   */
  floating?: boolean;
}

function ConditionTags({ active, onToggle, immunities, floating = false }: ConditionTagsProps) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState<Condition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number } | null>(null);
  function measure() {
    if (!floating || !rootRef.current) return;
    const r = rootRef.current.getBoundingClientRect();
    setAnchor({ left: r.left, top: r.top, bottom: r.bottom });
  }
  const pinned = floating && anchor;
  const pickerPos: React.CSSProperties = pinned
    ? { position: "fixed", top: anchor.bottom + 4, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 336)) }
    : { position: "absolute", top: "110%", left: 0 };
  const tipPos: React.CSSProperties = pinned
    ? { position: "fixed", top: anchor.top - 6, left: Math.max(8, Math.min(anchor.left, window.innerWidth - 296)), transform: "translateY(-100%)" }
    : { position: "absolute", bottom: "110%", left: 0 };

  function isImmune(c: Condition): boolean {
    return !!immunities && immunities.has(c.toLowerCase());
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <div className="flex" style={{ flexWrap: "wrap", gap: "0.25rem", alignItems: "center" }}>
        {Array.from(active).map((c) => (
          <button
            key={c}
            className="pill pill-amber"
            onClick={() => { setTooltip(null); onToggle(c); }}
            onMouseEnter={() => { measure(); setTooltip(c); }}
            onMouseLeave={() => setTooltip(null)}
            style={{ border: "none", cursor: "pointer", fontSize: "0.75rem", padding: "0.05rem 0.5rem" }}
            title={CONDITION_RULES[c]}
          >
            {c} <X size={12} aria-hidden />
          </button>
        ))}
        <button
          className="btn btn-ghost"
          style={{ ...BTN_XS, minHeight: 24, border: "1px dashed var(--border2)" }}
          onClick={() => { measure(); setOpen(!open); }}
          title="Add a condition (Prone, Poisoned, Frightened…)"
          aria-expanded={open}
        >
          <Plus size={12} aria-hidden /> Condition
        </button>
      </div>

      {tooltip && (
        <div style={{
          ...tipPos, zIndex: 50,
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: 8, padding: "0.5rem 0.75rem", maxWidth: 280,
          fontSize: "0.8125rem", lineHeight: 1.45, color: "var(--text)", pointerEvents: "none",
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
        }}>
          <strong style={{ color: "var(--amber-text)" }}>{tooltip}</strong>
          <br />{CONDITION_RULES[tooltip]}
        </div>
      )}

      {open && (
        <div style={{
          ...pickerPos, zIndex: 40,
          background: "var(--surface)", border: "1px solid var(--border2)",
          borderRadius: 10, padding: "0.5rem", display: "flex",
          flexWrap: "wrap", gap: "0.3rem", maxWidth: 320,
          boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
        }}>
          {CONDITIONS.map((c) => {
            const immune = isImmune(c);
            const on = active.has(c);
            return (
              <button
                key={c}
                onClick={() => { onToggle(c); setOpen(false); }}
                title={immune ? `Target is immune to ${c}. Click to apply anyway.` : CONDITION_RULES[c]}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: on ? "var(--amber-soft)" : "var(--surface2)",
                  color: on ? "var(--amber-text)" : immune ? "var(--muted)" : "var(--text)",
                  border: `1px solid ${on ? "var(--amber-soft)" : "var(--border2)"}`,
                  borderRadius: 999, padding: "0.15rem 0.55rem",
                  fontSize: "0.8125rem", cursor: "pointer", fontFamily: "inherit",
                  opacity: immune && !on ? 0.6 : 1,
                  textDecoration: immune && !on ? "line-through" : "none",
                }}
              >
                {c}
                {immune && !on ? <Shield size={12} aria-label="immune" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Tiny labeled-input wrapper used by the combat add-combatant form. */
function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.15rem",
        fontSize: "0.75rem",
        fontWeight: 500,
        color: "var(--muted)",
        margin: 0,
        minWidth: 0,
      }}
    >
      {label}
      {children}
    </label>
  );
}

interface SpellSlotTrackerProps {
  pcId: string;
}

/**
 * Persistent slot pips for a PC (Plan 00020 + 00021 fix).
 *
 * Reads the real ``/spell-slots`` state instead of ephemeral component
 * state so party rest, per-PC rest, and explicit cast actions all stay in
 * sync. Clicking a filled pip spends a slot; clicking a hollow pip
 * restores one (DM undo).
 */
/**
 * Plan 60 — per-PC class-feature pips in the party strip.
 *
 * Same interaction grammar as spell slots: filled pip = available (click
 * to spend), hollow = spent (click to restore). Psionic features glow
 * cyan, matching the player sheet. Passive features (max_uses 0) hidden.
 */
function FeaturePipsRow({ pcId }: { pcId: string }) {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["hud-features", pcId],
    queryFn: () => featuresApi.list(pcId),
  });
  const spend = useMutation({
    mutationFn: (rowId: string) => featuresApi.spend(pcId, rowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hud-features", pcId] }),
  });
  const restore = useMutation({
    mutationFn: (rowId: string) => featuresApi.restore(pcId, rowId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hud-features", pcId] }),
  });

  const tracked = rows.filter((r) => r.max_uses > 0);
  if (tracked.length === 0) return null;

  return (
    <div style={{ marginTop: "0.4rem" }}>
      {tracked.map((r) => {
        const remaining = Math.max(0, r.max_uses - r.uses_spent);
        const psionic = /psionic/i.test(r.feature_name);
        const hue = psionic ? "var(--teal)" : "var(--text2)";
        return (
          <div
            key={r.id}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.2rem" }}
          >
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--muted)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={`${r.feature_name} — ${remaining}/${r.max_uses} (${r.recovery})`}
            >
              {r.feature_name}
            </span>
            <span style={{ display: "flex", gap: "0.2rem", flex: "none" }}>
              {Array.from({ length: r.max_uses }).map((_, i) => {
                const filled = i < remaining;
                return (
                  <button
                    key={i}
                    onClick={() => (filled ? spend.mutate(r.id) : restore.mutate(r.id))}
                    title={filled ? `${r.feature_name}: available — click to spend` : `${r.feature_name}: spent — click to restore`}
                    style={{
                      width: 11,
                      height: 11,
                      padding: 0,
                      borderRadius: "50%",
                      border: `1px solid ${filled ? hue : "var(--muted)"}`,
                      background: filled ? hue : "transparent",
                      cursor: "pointer",
                    }}
                  />
                );
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function SpellSlotTracker({ pcId }: SpellSlotTrackerProps) {
  const qc = useQueryClient();
  const { data: state } = useQuery({
    queryKey: ["spell-slots", pcId],
    queryFn: () => spellcastingApi.slotState(pcId),
  });

  const expend = useMutation({
    mutationFn: (lvl: number) => spellcastingApi.expend(pcId, lvl),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spell-slots", pcId] }),
  });
  const restore = useMutation({
    mutationFn: (lvl: number) => spellcastingApi.restore(pcId, lvl),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["spell-slots", pcId] }),
  });

  if (!state) return null;
  const levels = Object.keys(state.levels)
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n))
    .sort((a, b) => a - b);
  if (levels.length === 0) return null;

  return (
    <div style={{ marginTop: "0.45rem", display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
      <span style={{ fontSize: "0.75rem", color: "var(--muted)" }} title="Filled = still available. Click a filled one to spend it, a hollow one to give it back.">
        Spell slots
      </span>
      <div className="flex" style={{ flexWrap: "wrap", gap: "0.2rem 0.6rem" }}>
        {levels.map((lvl) => {
          const s = state.levels[String(lvl)];
          return (
            <div
              key={lvl}
              style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}
              title={`Level ${lvl} slots: ${s.remaining} of ${s.max} left`}
            >
              <span className="num" style={{ fontSize: "0.75rem", color: "var(--muted)", minWidth: 10 }}>
                {lvl}
              </span>
              {Array.from({ length: s.max }).map((_, idx) => {
                const filled = idx < s.remaining;
                return (
                  <button
                    key={idx}
                    onClick={() =>
                      filled ? expend.mutate(lvl) : restore.mutate(lvl)
                    }
                    title={`L${lvl} slot — ${filled ? "available (click to spend)" : "spent (click to restore)"}`}
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: "50%",
                      border: `1px solid ${filled ? "var(--text2)" : "var(--muted)"}`,
                      background: filled ? "var(--text2)" : "transparent",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Combat tracker types ───────────────────────────────────────────────────────

interface HudCombatant {
  id: string;
  name: string;
  type: "pc" | "monster" | "npc";
  initiative: number;
  hp: number;
  maxHp: number;
  ac: number;
  conditions: Set<Condition>;
  defeated: boolean;
  monsterId: string | null;
}

// ── Main HUD ──────────────────────────────────────────────────────────────────

export default function SessionHud() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ── Remote data ────────────────────────────────────────────────────────────
  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const { data: adventure } = useQuery({
    queryKey: ["adventure", session?.adventure_id],
    queryFn: () => adventuresApi.get(session!.adventure_id),
    enabled: !!session?.adventure_id,
  });

  const { data: allChars = [], isLoading: charsLoading } = useQuery({
    queryKey: ["characters", adventure?.campaign_id],
    queryFn: () => charactersApi.list(adventure!.campaign_id),
    enabled: !!adventure?.campaign_id,
  });

  const { data: runbook } = useQuery({
    queryKey: ["runbook", sessionId],
    queryFn: () => sessionsApi.getRunbook(sessionId!),
    enabled: !!sessionId,
    retry: false,
  });

  const { data: adventureEncounters = [] } = useQuery<Encounter[]>({
    queryKey: ["encounters", session?.adventure_id],
    queryFn: () => encountersApi.list(session!.adventure_id),
    enabled: !!session?.adventure_id,
  });

  // Plan 38 P4-1/9 — campaign NPC roster, used by the "Add from roster"
  // dropdown to spawn a known NPC into combat without manual typing.
  const { data: campaignNpcs = [] } = useQuery({
    queryKey: ["npcs", adventure?.campaign_id],
    queryFn: () => npcsApi.list(adventure!.campaign_id),
    enabled: !!adventure?.campaign_id,
  });

  // Plan 37 — extracted early so the campaign-stream callback below can
  // depend on it without a TDZ violation. The rest of the initiative
  // store is extracted further down where it's used by the combat tracker.
  const hydrateStore = useInitiativeStore((s) => s.hydrate);

  // Plan 26 — live sync via SSE. Refetch party + per-PC data when the
  // backend signals any PC in this campaign changed.
  const onCampaignStreamEvent = useCallback(
    (evt: StreamEvent) => {
      // Refetch the party list so HP/state badges update.
      qc.invalidateQueries({ queryKey: ["characters", adventure?.campaign_id] });
      // If a specific PC was updated, invalidate its per-PC queries too —
      // the character-sheet modal subscribes to ["character", id] and the
      // spell-slot tracker / features / inventory etc. all key on the PC.
      if (evt.pc_id) {
        qc.invalidateQueries({ queryKey: ["character", evt.pc_id] });
        qc.invalidateQueries({ queryKey: ["spell-slots", evt.pc_id] });
        qc.invalidateQueries({ queryKey: ["character-features", evt.pc_id] });
        qc.invalidateQueries({ queryKey: ["inventory", evt.pc_id] });
      }
      // Plan 37 — combat tracker (a Zustand store, not React Query) needs
      // an explicit re-hydrate when the backend syncs a combatant's
      // defeated flag or HP. Without this the HUD shows a stale greyed-out
      // PC until the DM hard-refreshes the page.
      if (evt.type === "pc.combat.updated" || evt.type === "session.combat.updated") {
        if (session?.id) void hydrateStore(session.id);
      }
    },
    [qc, adventure?.campaign_id, session?.id, hydrateStore],
  );
  useEventStream("campaign", adventure?.campaign_id, onCampaignStreamEvent);

  // Filter to attending PCs (or all if none specified)
  const partyIds = session?.attending_pc_ids ?? [];
  const party: PlayerCharacter[] = allChars.filter(
    (c) => partyIds.length === 0 || partyIds.includes(c.id),
  );

  // ── HP persistence ─────────────────────────────────────────────────────────
  const [savingHp, setSavingHp] = useState<Record<string, boolean>>({});

  async function saveHp(charId: string, newHp: number) {
    setSavingHp((p) => ({ ...p, [charId]: true }));
    try {
      await charactersApi.update(charId, { hp_current: newHp });
    } finally {
      setSavingHp((p) => ({ ...p, [charId]: false }));
    }
  }

  // ── Ephemeral party state ──────────────────────────────────────────────────
  // Conditions are still local — Plan 21 backend doesn't persist them yet.
  // Spell slots now live in the persistent store (see SpellSlotTracker).
  const [conditions, setConditions] = useState<Record<string, Set<Condition>>>({});

  function toggleCondition(pcId: string, c: Condition) {
    setConditions((prev) => {
      const s = new Set(prev[pcId] ?? []);
      if (s.has(c)) s.delete(c);
      else s.add(c);
      return { ...prev, [pcId]: s };
    });
    // Plan 69 — write through to the persisted combatant row so the
    // condition renders on the boards (Plan 65 FX). Local state stays the
    // instant-UI source; out of combat there is no row and it stays local.
    const row = persistedCombatants.find((pc) => pc.character_id === pcId);
    if (row) {
      const current = row.conditions ?? [];
      const has = current.includes(c);
      const next = has ? current.filter((x) => x !== c) : [...current, c];
      void patchPersistedCombatant(row.id, { conditions: next });
    }
  }

  // ── Scene navigator ────────────────────────────────────────────────────────
  const [sceneIdx, setSceneIdx] = useState(0);

  // ── Plan 60 — map-first center panel: Maps | People, Script in a drawer ───
  // Plan 53 demoted the runbook to a tab; in practice sessions run from map
  // control and cards, so Maps is now the default and the script slides over
  // on demand instead of occupying a tab.
  const [centerTab, setCenterTab] = useState<"maps" | "live" | "people">("maps");
  // Plan 76 — cockpit chrome: the ＋ Add / 📣 Table roll popover and the
  // height of the notes strip under the board (persisted).
  // Plan 82 — a laptop at 1366×768 or 1280×800 has no room for the strip,
  // a tall notes pane and the rules bar all at once; the board comes first.
  const shortScreen = useIsCompactHeight(900);
  const [addOpen, setAddOpen] = useState(false);
  const [tableRollOpen, setTableRollOpen] = useState(false);
  const [stripOpen, setStripOpen] = useState(!shortScreen);
  const [notesH, setNotesH] = useState<number>(() => {
    try {
      const fallback = window.matchMedia("(max-height: 900px)").matches ? 140 : 200;
      return Math.min(520, Math.max(120, Number(localStorage.getItem("ql-hud-notes-h") ?? fallback) || fallback));
    } catch {
      return 200;
    }
  });
  function startNotesResize(e: React.PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = notesH;
    const move = (ev: PointerEvent) => setNotesH(Math.min(520, Math.max(120, startH - (ev.clientY - startY))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setNotesH((h) => {
        try {
          localStorage.setItem("ql-hud-notes-h", String(h));
        } catch {
          /* height just doesn't persist */
        }
        return h;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  const [scriptOpen, setScriptOpen] = useState(false);
  // Party owns the real estate by default; the center only claims it while
  // the DM is actively working a map. Auto-enters on staging a map, manual
  // toggle either way.
  const [mapFocus, setMapFocus] = useState(false);
  const { data: hudMaps = [], isLoading: hudMapsLoading } = useQuery({
    queryKey: ["battle-maps", adventure?.campaign_id],
    queryFn: () => tableApi.listMaps(adventure!.campaign_id),
    enabled: !!adventure?.campaign_id,
  });
  const { data: hudTable } = useQuery({
    queryKey: ["hud-table", sessionId],
    queryFn: () => tableApi.getState(sessionId!),
    enabled: !!sessionId,
  });
  // Plan 69 — the QR belongs on the PROJECTOR: the HUD button toggles
  // table state; the projector overlay follows via SSE.
  const projectorQrOn = !!hudTable?.join_qr_on;
  const toggleJoinQr = useMutation({
    mutationFn: () => tableApi.updateState(sessionId!, { join_qr_on: !projectorQrOn }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hud-table", sessionId] }),
  });
  const setActiveMap = useMutation({
    // Plan 82 — staging a map is the start of play: the join QR steps aside.
    mutationFn: (mapId: string) => tableApi.updateState(sessionId!, { active_map_id: mapId, join_qr_on: false }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hud-table", sessionId] }),
  });
  // Plan 113 — the shelf: the maps tonight needs. Staging a map puts it there (the API does
  // that); the DM pulls more from the library and takes any off again.
  const setShelf = useMutation({
    mutationFn: (ids: string[]) => tableApi.updateState(sessionId!, { map_shelf: ids }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["hud-table", sessionId] }),
  });
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const shelfIds = useMemo(
    () => new Set([...(hudTable?.map_shelf ?? []), ...(hudTable?.active_map_id ? [hudTable.active_map_id] : [])]),
    [hudTable],
  );
  const shelfMaps = hudMaps.filter((m) => shelfIds.has(m.id));
  const libraryMaps = hudMaps.filter((m) => !shelfIds.has(m.id) && m.name.toLowerCase().includes(libraryQuery.toLowerCase()));
  // Distinct monsters across tonight's encounter rosters (for 👥 People).
  const rosterMonsters = useMemo(() => {
    const seen = new Map<string, RosterEntry>();
    for (const enc of adventureEncounters) {
      for (const r of (enc.monster_roster ?? []) as unknown as RosterEntry[]) {
        if (r.monster_id && !seen.has(r.monster_id)) seen.set(r.monster_id, r);
      }
    }
    return Array.from(seen.values());
  }, [adventureEncounters]);
  const scenes: RunbookScene[] = runbook?.scenes ?? [];
  const currentScene = scenes[sceneIdx] ?? null;

  // ── Combat tracker (Plan 00015 — persists across browser refresh) ─────────
  // The Zustand store is the source of truth for combatants, round, and the
  // active turn. AC is NOT yet persisted (no column on session_combatants),
  // so for monsters we keep a local override map and for PCs we pull from
  // the character record.
  const persistedCombatants = useInitiativeStore((s) => s.combatants);
  const storeRound = useInitiativeStore((s) => s.round);
  const storeActiveId = useInitiativeStore((s) => s.activeCombatantId);
  const replaceFromRoll = useInitiativeStore((s) => s.replaceFromRoll);
  const patchPersistedCombatant = useInitiativeStore((s) => s.patchCombatant);
  // Plan 113 — what the next hit is, for the table's strike effect.
  const [tableConsoleOpen, setTableConsoleOpen] = useState(false);
  const tableMode = useHudPrefs((s) => s.tableMode);
  const setTableMode = useHudPrefs((s) => s.setTableMode);
  const hitFlavor = useStrikeStore((s) => s.flavor);
  const setHitFlavor = useStrikeStore((s) => s.setFlavor);
  const advanceTurn = useInitiativeStore((s) => s.nextTurn);
  const rewindTurn = useInitiativeStore((s) => s.prevTurn);
  const resetCombat = useInitiativeStore((s) => s.reset);
  const addPersistedCombatant = useInitiativeStore((s) => s.addCombatant);
  const removePersistedCombatant = useInitiativeStore((s) => s.removeCombatant);
  const setPersistedInitiative = useInitiativeStore((s) => s.setInitiative);
  // Plan 121 — the party card of whoever's turn it is gets lit, like its chip.
  const activePcId = storeActiveId
    ? (persistedCombatants.find((c) => c.id === storeActiveId)?.character_id ?? null)
    : null;

  // Plan 38 P4-1/9 — link a roster pick (PC or NPC) so addCombatant can
  // attach the character_id for HP sync. Cleared after each add.
  const [pendingCharId, setPendingCharId] = useState<string | null>(null);
  // Plan 38 P4-4b — per-combatant typed amount for −/+ HP buttons.
  // Defaults to 1; DM can type any positive amount.
  const [hpDelta, setHpDelta] = useState<Record<string, number>>({});
  const deltaFor = (id: string) => hpDelta[id] ?? 1;
  const setDeltaFor = (id: string, n: number) =>
    setHpDelta((p) => ({ ...p, [id]: Math.max(1, Math.floor(n) || 1) }));
  const [newCName, setNewCName] = useState("");
  const [newCType, setNewCType] = useState<"pc" | "monster" | "npc">("monster");
  const [loadEncounterId, setLoadEncounterId] = useState("");
  const [newCHp, setNewCHp] = useState(10);
  const [newCHpMax, setNewCHpMax] = useState(10);
  const [newCAc, setNewCAc] = useState(10);
  const [newCInit, setNewCInit] = useState(0);

  // Hydrate persisted combat state on session change.
  useEffect(() => {
    if (sessionId) void hydrateStore(sessionId);
  }, [sessionId, hydrateStore]);

  // Map party PCs by id for AC + canonical name/hp lookups.
  const partyById = useMemo(() => {
    const m: Record<string, PlayerCharacter> = {};
    for (const pc of party) m[pc.id] = pc;
    return m;
  }, [party]);

  function acFor(c: SessionCombatant): number {
    // Plan 41 — AC is persisted on the combatant row now. Fall back to the
    // linked PC's sheet AC, then a sane default for ad-hoc combatants.
    if (c.ac != null) return c.ac;
    if (c.character_id && partyById[c.character_id]) return partyById[c.character_id].ac;
    return 10;
  }

  // Derive the HUD's view shape from the persisted store. AC is best-effort
  // (PC ac, AC override, or default 10). Conditions are persisted as string[]
  // but rendered as Set<Condition>.
  const combatants: HudCombatant[] = useMemo(() => {
    return persistedCombatants.map((c) => {
      const validConditions = new Set<Condition>();
      for (const raw of c.conditions ?? []) {
        if ((CONDITIONS as readonly string[]).includes(raw)) {
          validConditions.add(raw as Condition);
        }
      }
      return {
        id: c.id,
        name: c.name,
        type: (c.type === "pc" || c.type === "npc" ? c.type : "monster") as "pc" | "monster" | "npc",
        initiative: c.initiative_roll,
        hp: c.hp_current,
        maxHp: c.hp_max,
        ac: acFor(c),
        conditions: validConditions,
        defeated: c.defeated,
        monsterId: c.monster_id,
      };
    })
      // Plan 38 P4-2 — display in initiative-desc order so DM-edited
      // initiative scores immediately reflect in the rendered list. The server
      // reseats sort_index to match, so the turn walk follows this same order.
      .sort((a, b) => b.initiative - a.initiative);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistedCombatants, partyById]);

  const combatActive = combatants.length > 0;
  const round = storeRound;

  // Project a persisted SessionCombatant back to the loose Combatant shape
  // expected by the initiative roller and replaceFromRoll. Carries linkbacks
  // so the server-side row keeps its monster_id / character_id on re-roll.
  function projectExisting(): Combatant[] {
    return persistedCombatants.map((c) => ({
      name: c.name,
      dex_score: c.dex_score,
      hp: c.hp_current,
      max_hp: c.hp_max,
      type: (c.type as "pc" | "monster" | "npc") ?? "monster",
      initiative: c.initiative_roll,
      defeated: c.defeated,
      ac: c.ac,
      monster_id: c.monster_id,
      character_id: c.character_id,
      conditions: c.conditions,
    }));
  }

  // Pre-populate combat with party on first open IF nothing persisted yet.
  useEffect(() => {
    if (
      sessionId
      && party.length > 0
      && persistedCombatants.length === 0
      && !useInitiativeStore.getState().loading
    ) {
      const seeded: Combatant[] = party.map((pc) => ({
        name: pc.character_name,
        dex_score: pc.score_dex,
        hp: pc.hp_current,
        max_hp: pc.hp_max,
        type: "pc",
        initiative: 0,
        defeated: false,
        character_id: pc.id,
      }));
      // Plan 41 — seed as "idle": a prep roster must never set an active turn
      // or ping player phones. Combat only goes "running" on Roll Initiative.
      void replaceFromRoll(sessionId, seeded, "idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, party.length, persistedCombatants.length]);

  function addCombatant() {
    if (!newCName.trim() || !sessionId) return;
    const added: Combatant = {
      name: newCName.trim(),
      dex_score: 10,
      hp: newCHp,
      max_hp: newCHpMax,
      type: newCType,
      initiative: newCInit,
      defeated: false,
      ac: newCAc,
      // Plan 38 P4-1/9 — preserve PC linkback if this row was picked from
      // the roster dropdown, so HP changes mirror onto the PC sheet.
      character_id: pendingCharId,
    };
    // Plan 41 — incremental add: preserves round/turn/conditions/beats and
    // carries AC in the payload (no more name-match setTimeout hack).
    void addPersistedCombatant(added);
    setNewCName("");
    setNewCHp(10);
    setNewCHpMax(10);
    setNewCAc(10);
    setNewCInit(0);
    setPendingCharId(null);
  }

  // Plan 38 P4-1/9 — pre-fill the manual add form from a roster pick.
  // Picks come in as "pc:<uuid>" or "npc:<uuid>".
  function pickFromRoster(key: string) {
    if (!key) return;
    const [kind, id] = key.split(":");
    if (kind === "pc") {
      const pc = allChars.find((p) => p.id === id);
      if (!pc) return;
      setNewCName(pc.character_name);
      setNewCType("pc");
      setNewCHp(pc.hp_current);
      setNewCHpMax(pc.hp_max);
      setNewCAc(pc.ac);
      setPendingCharId(pc.id);
    } else if (kind === "npc") {
      const npc = campaignNpcs.find((n) => n.id === id);
      if (!npc) return;
      setNewCName(npc.name);
      setNewCType("npc");
      // NPCs don't carry stat blocks at the campaign level — leave HP/AC
      // at sensible defaults the DM can adjust before clicking Add.
      setNewCHp(10);
      setNewCHpMax(10);
      setNewCAc(12);
      // No character_id linkback for NPCs (they aren't PCs).
      setPendingCharId(null);
    }
  }

  function loadEncounter() {
    if (!sessionId) return;
    const enc = adventureEncounters.find((e) => e.id === loadEncounterId);
    if (!enc) return;
    const roster: RosterEntry[] = (enc.monster_roster ?? []) as unknown as RosterEntry[];
    const additions: Combatant[] = [];
    for (const entry of roster) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        const label = count === 1 ? entry.name : `${entry.name} ${i + 1}`;
        additions.push({
          name: label,
          dex_score: 10,
          hp: entry.hp ?? 10,
          max_hp: entry.hp ?? 10,
          type: "monster",
          initiative: 0,
          defeated: false,
          ac: entry.ac ?? 10,
          monster_id: entry.monster_id ?? null,
        });
      }
    }
    if (additions.length === 0) return;
    // Plan 41 — add each monster incrementally so loading an encounter
    // mid-fight preserves the round/turn and existing combatants' beats.
    void (async () => {
      for (const combatant of additions) await addPersistedCombatant(combatant);
    })();
    setLoadEncounterId("");
  }

  function rollAllInitiative() {
    if (!sessionId || persistedCombatants.length === 0) return;
    const rolled: Combatant[] = projectExisting()
      .map((c) => ({ ...c, initiative: Math.floor(Math.random() * 20) + 1 + abilityMod(c.dex_score) }))
      .sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0));
    // Plan 41 — rolling initiative starts the fight: "running" selects the
    // active combatant and pings the up-first PC.
    void replaceFromRoll(sessionId, rolled, "running");
  }

  function nextTurn() {
    void advanceTurn();
  }
  // Plan 85 — E ends the turn (Sam counted 34 tabs per turn). Not while typing,
  // and only while someone actually has the turn. Plan 90 — Shift+E steps back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "e" && e.key !== "E") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (!storeActiveId) return;
      e.preventDefault();
      if (e.shiftKey) void rewindTurn();
      else void advanceTurn();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeActiveId]);
  // Plan 85 — players' phone rolls reach the DM as a toast (Theo ran blind).
  const toast = useToast();
  useEffect(() => {
    if (!sessionId) return;
    const es = new EventSource(`${apiBase()}/stream/table/${sessionId}`);
    const onRoll = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { roller?: string; total?: number; label?: string; die?: string; rolls?: number[] };
        if (typeof d.total !== "number" || d.roller === "DM") return;
        const nat = d.rolls && d.rolls.length === 1 && d.die === "d20" ? d.rolls[0] : null;
        toast.push(
          `${d.roller ?? "Someone"} rolled ${d.total}${d.label ? ` (${d.label})` : ""}${nat === 20 ? " — natural 20!" : nat === 1 ? " — natural 1" : ""}`,
          nat === 20 ? "success" : nat === 1 ? "error" : "info",
        );
      } catch {
        /* ignore */
      }
    };
    es.addEventListener("table.roll", onRoll as EventListener);
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  function updateCombatantHp(id: string, newHp: number) {
    const target = persistedCombatants.find((c) => c.id === id);
    if (!target) return;
    const clamped = Math.min(target.hp_max, Math.max(0, newHp));
    // The table plays a strike from whoever's turn it is: this hit's kind rides along.
    const hit_flavor = clamped < (target.hp_current ?? clamped) ? hitFlavor : "heal";
    void patchPersistedCombatant(id, { hp_current: clamped, hit_flavor });
    // If this is a PC, also persist to the canonical character record.
    if (target.character_id) saveHp(target.character_id, clamped);
    else {
      const pc = party.find((p) => p.id === id);
      if (pc) saveHp(id, clamped);
    }
  }

  function toggleCombatantCondition(id: string, cond: Condition) {
    const target = persistedCombatants.find((c) => c.id === id);
    if (!target) return;
    const currentList = target.conditions ?? [];
    const has = currentList.includes(cond);
    const next = has ? currentList.filter((c) => c !== cond) : [...currentList, cond];
    void patchPersistedCombatant(id, { conditions: next });
  }

  function removeCombatant(id: string) {
    if (!sessionId) return;
    // Plan 41 — incremental remove: preserves round/turn/conditions/beats and
    // advances the pointer server-side if the removed combatant was active.
    void removePersistedCombatant(id);
  }

  // ── Loot modal ─────────────────────────────────────────────────────────────
  const [lootOpen, setLootOpen] = useState(false);
  // Plan 27 — DM Screen modal
  const [dmScreenOpen, setDmScreenOpen] = useState(false);

  // ── Character sheet modal (Plan 00022) ────────────────────────────────────
  // Plan 39 — persist open-sheet PC to ?sheet=<id> so a browser refresh
  // mid-session doesn't close the modal.
  const [searchParams, setSearchParams] = useSearchParams();
  const sheetPcId = searchParams.get("sheet");
  // Plan 83 — the dashboard's sample button lands here with the script open.
  useEffect(() => {
    if (searchParams.get("script") === "1") setScriptOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setSheetPcId = useCallback(
    (id: string | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id) next.set("sheet", id);
          else next.delete("sheet");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // ── Party rest (Plan 00021) ────────────────────────────────────────────────
  const [restToast, setRestToast] = useState<string | null>(null);

  const shortRestParty = useMutation({
    mutationFn: () => restApi.shortRestParty(sessionId!),
    onSuccess: (summaries) => {
      const total = summaries.length;
      const totalFeatures = summaries.reduce(
        (sum, s) => sum + s.features_restored.length,
        0,
      );
      setRestToast(
        `Short rest applied to ${total} PC${total === 1 ? "" : "s"} · ` +
          `${totalFeatures} feature use(s) restored`,
      );
      // Refresh any open feature/spell/character data on the rest of the app.
      qc.invalidateQueries({ queryKey: ["features"] });
      qc.invalidateQueries({ queryKey: ["spell-slots"] });
      qc.invalidateQueries({ queryKey: ["characters"] });
      setTimeout(() => setRestToast(null), 5000);
    },
    onError: (e: Error) => setRestToast(`Short rest failed: ${e.message}`),
  });

  const longRestParty = useMutation({
    mutationFn: () => restApi.longRestParty(sessionId!),
    onSuccess: (summaries) => {
      const total = summaries.length;
      const totalHp = summaries.reduce((sum, s) => sum + s.hp_restored, 0);
      const totalFeatures = summaries.reduce(
        (sum, s) => sum + s.features_restored.length,
        0,
      );
      setRestToast(
        `Long rest applied to ${total} PC${total === 1 ? "" : "s"} · ` +
          `${totalFeatures} feature(s), all slots, +${totalHp} HP total`,
      );
      qc.invalidateQueries({ queryKey: ["features"] });
      qc.invalidateQueries({ queryKey: ["spell-slots"] });
      qc.invalidateQueries({ queryKey: ["characters"] });
      setTimeout(() => setRestToast(null), 5000);
    },
    onError: (e: Error) => setRestToast(`Long rest failed: ${e.message}`),
  });

  // ── Monster stat-block modal ───────────────────────────────────────────────
  const [statBlockMonsterId, setStatBlockMonsterId] = useState<string | null>(null);
  const { data: statBlockMonster } = useQuery({
    queryKey: ["monster", statBlockMonsterId],
    queryFn: () => monstersApi.get(statBlockMonsterId!),
    enabled: !!statBlockMonsterId,
  });

  // ── Condition immunities (Plan 00015 enhancement) ──────────────────────────
  // Batch-fetch monster stat blocks for any combatants that have a monster_id,
  // then expose a map of lowercase condition-immunity sets keyed by monster id.
  // Stat blocks are immutable per-id, so cache for the session.
  const distinctMonsterIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of persistedCombatants) {
      if (c.monster_id) set.add(c.monster_id);
    }
    return Array.from(set);
  }, [persistedCombatants]);

  const monsterQueries = useQueries({
    queries: distinctMonsterIds.map((mid) => ({
      queryKey: ["monster", mid],
      queryFn: () => monstersApi.get(mid),
      staleTime: Infinity,
    })),
  });

  const immunitiesByMonsterId = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    monsterQueries.forEach((q, i) => {
      const m = q.data;
      if (m) {
        map[distinctMonsterIds[i]] = new Set(
          (m.condition_immunities ?? []).map((c) => c.toLowerCase()),
        );
      }
    });
    return map;
  }, [monsterQueries, distinctMonsterIds]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!session) {
    return <div className="fade-in" style={{ padding: "2rem" }}><p className="text-muted">Loading session…</p></div>;
  }

  const sessionLabel = `Session ${toRoman(session.session_number)}${session.title ? `: ${session.title}` : ""}`;
  const castRoster = (adventure?.npc_roster ?? []).map((n) => String(n.name ?? "")).filter(Boolean);
  const wideParty = tableMode && !mapFocus && party.length > 1;

  return (
    <div className="fade-in ql-hud-root" style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex" style={{
        alignItems: "center", justifyContent: "space-between",
        padding: "0.45rem 0.9rem", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", flexShrink: 0,
        flexWrap: "wrap", gap: "0.4rem 0.75rem",
      }}>
        <div className="flex" style={{ alignItems: "center", gap: "0.6rem", minWidth: 0, flexWrap: "nowrap" }}>
          <h1
            className="story"
            title={sessionLabel}
            style={{ fontSize: "1.3rem", margin: 0, lineHeight: 1.25, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {sessionLabel}
          </h1>
        </div>
        <div className="flex" style={{ alignItems: "center", gap: "0.35rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Review 10/30 — nine top-bar buttons became a few menus. */}
          <HudMenu
            label="Rests"
            icon={<Tent size={15} aria-hidden />}
            title="Short or long rest for every attending PC"
            items={[
              {
                key: "short",
                label: "Short rest",
                icon: <Tent size={16} />,
                hint: "An hour's breather: short-rest features (Action Surge, Channel Divinity…) and Warlock pact slots come back",
                disabled: shortRestParty.isPending,
                onSelect: () => {
                  if (
                    window.confirm(
                      "Short rest the whole party? This restores short-rest features (Action Surge, Channel Divinity, etc.) and Warlock pact slots for every attending PC.",
                    )
                  ) {
                    shortRestParty.mutate();
                  }
                },
              },
              {
                key: "long",
                label: "Long rest",
                icon: <Moon size={16} />,
                hint: "A night's sleep: all features, all spell slots, hit points to max",
                disabled: longRestParty.isPending,
                onSelect: () => {
                  if (
                    window.confirm(
                      "Long rest the whole party? This restores all class features, all spell slots, and HP to max for every attending PC.",
                    )
                  ) {
                    longRestParty.mutate();
                  }
                },
              },
            ]}
          />
          <HudMenu
            label="Reference"
            icon={<BookOpen size={15} aria-hidden />}
            title="Rules and your prep"
            items={[
              {
                key: "screen",
                label: "DM screen",
                icon: <BookOpen size={16} />,
                hint: "Conditions, actions, cover, travel — the rules at a glance",
                onSelect: () => setDmScreenOpen(true),
              },
              {
                key: "prep",
                label: "Session prep",
                icon: <ScrollText size={16} />,
                hint: "Tonight's brief, runbook and notes",
                to: `/sessions/${sessionId}/prep`,
              },
            ]}
          />
          {/* Review 10/30 — Table / 3D Board / Immersive gave no hint which to use. */}
          <HudMenu
            label="Player display"
            icon={<Tv size={15} aria-hidden />}
            title="What your players look at — pick one and put it on their screen"
            items={[
              {
                key: "tv",
                label: "Projector / TV",
                icon: <Tv size={16} />,
                hint: "The battle map for the room: fog, tokens, dice. Open it on the TV; drive it from the Live tab.",
                recommended: true,
                href: `/table/${sessionId}`,
              },
              {
                key: "share",
                label: "Screen share",
                icon: <ScreenShare size={16} />,
                hint: "A 3D board for online games: share this tab in Discord or Zoom.",
                to: `/sessions/${sessionId}/board`,
              },
            ]}
            footer={[
              {
                key: "immersive",
                label: "3D set dressing (immersive)",
                icon: <Warehouse size={16} />,
                hint: "Built rooms, walking figures, fog and weather on the TV. Needs a strong computer.",
                href: `/table/${sessionId}/engine`,
              },
              {
                key: "console",
                label: "Map controls in a pop-up",
                icon: <SquareArrowOutUpRight size={16} />,
                hint: "The Live tab's fog, tokens and title cards in a window of their own.",
                disabled: !adventure,
                onSelect: () => setTableConsoleOpen(true),
              },
            ]}
          />
          {AI_ON && sessionId && <BriefPanel sessionId={sessionId} />}
          <button
            className="btn btn-secondary"
            style={BTN_SM}
            onClick={() => setLootOpen(true)}
            title="Hand out a magic item to a PC"
            disabled={!adventure}
          >
            <Coins size={15} aria-hidden /> Loot
          </button>
          <button
            className="btn btn-secondary"
            style={{ ...BTN_SM, ...(tableMode ? TOGGLE_ON : {}) }}
            onClick={() => setTableMode(!tableMode)}
            title={tableMode ? "Show the app sidebar again" : "Hide the app sidebar while you run the table"}
            aria-pressed={tableMode}
          >
            {tableMode ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />} Table mode
          </button>
          <button
            className="btn btn-ghost"
            style={{ ...BTN_SM, border: "none" }}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={15} aria-hidden /> Back
          </button>
        </div>
      </div>

      {/* Rest toast (auto-dismisses after 5s) */}
      {restToast && (
        <div
          role="status"
          style={{
            position: "fixed",
            top: "4rem",
            right: "1rem",
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            color: "var(--text)",
            padding: "0.6rem 0.9rem",
            borderRadius: 8,
            zIndex: 250,
            maxWidth: 380,
            fontSize: "0.875rem",
            boxShadow: "0 6px 18px rgba(0,0,0,0.45)",
          }}
        >
          {restToast}
        </div>
      )}

      {/* ── Three-panel body (CSS stacks + scrolls it below 820px) ─────────── */}
      <div className="ql-hud-body" style={{
        display: "grid",
        // Plan 76 — two columns: the party, then the cockpit (combat bar +
        // initiative strip over the board, notes + beats under it).
        gridTemplateColumns: mapFocus
          ? "300px minmax(0, 1fr)"
          : wideParty
            ? "minmax(600px, 46%) minmax(0, 1fr)"
            : "minmax(330px, 380px) minmax(0, 1fr)",
        transition: "grid-template-columns 0.25s ease",
        flex: 1,
        overflow: "hidden",
        minHeight: 0,
      }}>

        {/* ── LEFT: Party Tracker ─────────────────────────────────────── */}
        {/* Review 10/30 — in table mode the party sits two abreast, so a
            party of four fits at 1440×900 without scrolling. */}
        <div style={{
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          display: wideParty ? "grid" : "flex",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          alignContent: "start",
          flexDirection: "column",
          gap: 0,
          paddingBottom: "0.6rem",
          background: "var(--surface)",
        }}>
          <div style={{ ...PANEL_BAND, gridColumn: "1 / -1", padding: "0.4rem 0.6rem 0.4rem 0.75rem" }}>
            <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text)" }}>
              Party <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {plural(party.length, "PC")}</span>
            </span>
            {adventure?.campaign_id && (
              <span style={{ display: "flex", gap: 4 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => toggleJoinQr.mutate()}
                  disabled={toggleJoinQr.isPending}
                  aria-pressed={projectorQrOn}
                  title={
                    projectorQrOn
                      ? "Hide the join QR on the projector"
                      : "Show the join QR on the projector — players scan the big screen to join"
                  }
                  style={{ ...BTN_XS, ...(projectorQrOn ? TOGGLE_ON : {}) }}
                >
                  <QrCode size={14} aria-hidden />
                  {projectorQrOn ? "QR on the TV" : "Join QR → TV"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    void navigator.clipboard?.writeText(
                      `${window.location.origin}/join/${adventure.campaign_id}`,
                    );
                  }}
                  title="Copy the join link (players open it to pick their character)"
                  aria-label="Copy the join link"
                  style={{ ...BTN_ICON, border: "1px solid var(--border2)" }}
                >
                  <Copy size={14} aria-hidden />
                </button>
              </span>
            )}
          </div>

          {!charsLoading && party.length === 0 && (
            <div style={{ gridColumn: "1 / -1", padding: "1rem 0.9rem", fontSize: "0.875rem", color: "var(--muted)", lineHeight: 1.5 }}>
              <p style={{ margin: "0 0 0.5rem", color: "var(--text2)" }}>
                The party shows here: each character&rsquo;s hit points, armor class, conditions and spell slots.
              </p>
              <p style={{ margin: 0 }}>
                No characters yet.{" "}
                <Link to={`/campaigns/${adventure?.campaign_id}/characters`}>Add the party&rsquo;s characters</Link>{" "}
                to this campaign, or pick who is playing tonight on the session.
              </p>
            </div>
          )}

          {party.map((pc) => {
            const mod = abilityMod;
            const pb = profBonus(pc.level);
            const skills = (pc.skill_proficiencies ?? {}) as Record<string, number>;
            const pp = passiveSkill(pc.score_wis, pb, skills["Perception"] ?? 0);
            const pi = passiveSkill(pc.score_wis, pb, skills["Insight"] ?? 0);
            const dc = spellSaveDc(pc);
            const pcConditions = conditions[pc.id] ?? new Set<Condition>();
            const isUnconcious = pc.hp_current <= 0;
            const isTurn = activePcId === pc.id;

            return (
              <div
                key={pc.id}
                className="ql-pc-card"
                aria-current={isTurn ? "true" : undefined}
                style={{
                  margin: "0.5rem 0.55rem 0",
                  padding: "0.65rem 0.75rem 0.7rem",
                  borderRadius: 10,
                  border: `1px solid ${isTurn ? "var(--accent-edge)" : isUnconcious ? "var(--danger-line)" : "var(--border)"}`,
                  background: isTurn ? "var(--accent-soft)" : "var(--surface2)",
                  minWidth: 0,
                }}
              >
                {/* Portrait + identity */}
                <div className="flex" style={{ gap: "0.65rem", alignItems: "center", flexWrap: "nowrap" }}>
                  <button
                    onClick={() => setSheetPcId(pc.id)}
                    title="Open full character sheet"
                    aria-label={`Open ${pc.character_name}'s character sheet`}
                    style={{
                      padding: 0,
                      border: "1px solid var(--border2)",
                      borderRadius: 8,
                      width: 46,
                      height: 46,
                      flex: "none",
                      overflow: "hidden",
                      cursor: "pointer",
                      background: "var(--surface3)",
                      filter: isUnconcious ? "grayscale(0.9)" : undefined,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {pc.portrait_url ? (
                      <img
                        src={portraitSrc(pc.portrait_url, pc.updated_at)} {...zoomable(portraitSrc(pc.portrait_url, pc.updated_at), pc.character_name)}
                        alt={pc.character_name}
                        loading="lazy"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <span className="story" aria-hidden style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text2)" }}>
                        {initials(pc.character_name)}
                      </span>
                    )}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex" style={{ alignItems: "center", gap: "0.4rem", flexWrap: "nowrap" }}>
                      <button
                        className="story"
                        onClick={() => setSheetPcId(pc.id)}
                        title={`${pc.character_name} — open the full character sheet`}
                        style={{
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                          color: isUnconcious ? "var(--danger-text)" : "var(--text)",
                          fontWeight: 700,
                          fontSize: "1.15rem",
                          lineHeight: 1.2,
                          textAlign: "left",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          minWidth: 0,
                        }}
                      >
                        {pc.character_name}
                      </button>
                      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.4rem", flex: "none" }}>
                        {isTurn && (
                          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-text)", whiteSpace: "nowrap" }}>
                            Their turn
                          </span>
                        )}
                        <PlayerLinkButton characterId={pc.id} compact />
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[[pc.character_class, pc.level].filter(Boolean).join(" "), pc.player_name].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>

                {/* Quick stats — the DM cheat-sheet row: muted label, mono value, full name on hover */}
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.1rem 0.75rem", marginTop: "0.45rem" }}>
                  {(
                    [
                      ["AC", pc.ac, "Armor class"],
                      ["PP", pp, "Passive Perception — notices hidden things without rolling at or below this"],
                      ["Ins", pi, "Passive Insight — reads lies and moods without rolling at or below this"],
                      ...(dc !== null ? ([["DC", dc, "Spell save DC — what a target rolls against their spells"]] as const) : []),
                      ["Init", `${mod(pc.score_dex) >= 0 ? "+" : ""}${mod(pc.score_dex)}`, "Initiative modifier"],
                      ["Spd", pc.speed, "Speed in feet"],
                    ] as const
                  ).map(([abbr, value, label]) => (
                    <span
                      key={abbr}
                      title={label}
                      aria-label={`${label.split(" — ")[0]} ${value}`}
                      style={{ display: "inline-flex", alignItems: "baseline", gap: "0.3rem", whiteSpace: "nowrap", cursor: "help" }}
                    >
                      <span aria-hidden style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{abbr}</span>
                      <span aria-hidden className="num" style={{ fontSize: "0.9rem", fontWeight: 500, color: "var(--text)" }}>{value}</span>
                    </span>
                  ))}
                </div>

                {/* Plan 23 — combat-state status icons */}
                <PcStatusIcons pc={pc} />

                {/* HP bar */}
                <div style={{ marginTop: "0.45rem" }}>
                  <HpEditor
                    hp={pc.hp_current}
                    maxHp={pc.hp_max}
                    onSave={(n) => saveHp(pc.id, n)}
                    saving={savingHp[pc.id] ?? false}
                  />
                </div>

                {/* Ability modifiers, compact */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 4, marginTop: "0.55rem" }}>
                  {(["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((stat, i) => {
                    const scores = [pc.score_str, pc.score_dex, pc.score_con, pc.score_int, pc.score_wis, pc.score_cha];
                    const m = mod(scores[i]);
                    const full = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"][i];
                    return (
                      <div
                        key={stat}
                        title={`${full} modifier (score ${scores[i]})`}
                        style={{
                          background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 6,
                          padding: "0.05rem 0 0.1rem", textAlign: "center", minWidth: 0,
                        }}
                      >
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", lineHeight: 1.2 }}>{stat}</div>
                        <div className="num" style={{ fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.2 }}>
                          {m >= 0 ? "+" : ""}{m}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Conditions */}
                <div style={{ marginTop: "0.5rem" }}>
                  <ConditionTags
                    active={pcConditions}
                    onToggle={(c) => toggleCondition(pc.id, c)}
                  />
                </div>

                {/* Spell slots — persistent, reads from Plan 20 store */}
                <SpellSlotTracker pcId={pc.id} />
                <SpellChips pcId={pc.id} characterClass={pc.character_class} />

                {/* Plan 60 — spendable class-feature pips (Channel Divinity,
                    Psionic Dice, Wild Shape…) without leaving the HUD. */}
                <FeaturePipsRow pcId={pc.id} />
              </div>
            );
          })}
        </div>

        {/* ── COCKPIT (Plan 76): combat bar + initiative strip over the board, notes + beats under it ── */}
        <div
          className="ql-cockpit"
          style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}
        >
          <div style={{ ...PANEL_BAND, position: "relative", flexWrap: "wrap" }}>
            <button
              className="btn btn-ghost"
              onClick={() => setStripOpen((v) => !v)}
              title={stripOpen ? "Hide the initiative order" : "Show the initiative order"}
              aria-expanded={stripOpen}
              style={{ ...BTN_SM, border: "none", paddingLeft: "0.25rem", color: "var(--muted)", gap: "0.3rem" }}
            >
              {stripOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
              <span style={{ fontWeight: 600, color: "var(--text)" }}>Combat</span>
              {combatActive ? (
                <span>
                  · Round <span className="num">{round}</span> · {combatants.length} in order
                </span>
              ) : (
                <span>· not started</span>
              )}
            </button>
            {combatActive && (
              <label
                className="flex"
                style={{
                  gap: "0.35rem", alignItems: "center", margin: 0, flexWrap: "nowrap",
                  fontSize: "0.8125rem", fontWeight: 400, color: "var(--muted)",
                }}
                title="What the next damage is — the immersive table plays the strike in this colour"
              >
                Next hit
                <select
                  value={hitFlavor}
                  onChange={(e) => setHitFlavor(e.target.value)}
                  style={{ fontSize: "0.8125rem", padding: "0.15rem 0.35rem", width: "auto" }}
                >
                  {FLAVORS.filter((f) => f.key !== "heal").map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.label.charAt(0).toUpperCase() + f.label.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div
              style={{
                display: "flex",
                gap: "0.35rem",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                marginLeft: "auto",
              }}
            >
              <button
                className="btn btn-ghost"
                style={{ ...BTN_SM, ...(addOpen ? TOGGLE_ON : {}) }}
                aria-expanded={addOpen}
                onClick={() => {
                  setAddOpen((v) => !v);
                  setTableRollOpen(false);
                }}
                title="Load an encounter or add one combatant"
              >
                <Plus size={15} aria-hidden /> Add
              </button>
              <button
                className="btn btn-ghost"
                style={{ ...BTN_SM, ...(tableRollOpen ? TOGGLE_ON : {}) }}
                aria-expanded={tableRollOpen}
                onClick={() => {
                  setTableRollOpen((v) => !v);
                  setAddOpen(false);
                }}
                title="Roll dice the players' phones see"
              >
                <Megaphone size={15} aria-hidden /> Table roll
              </button>
              <button
                className={`btn ${storeActiveId ? "btn-ghost" : "btn-primary"}`}
                style={BTN_SM}
                onClick={rollAllInitiative}
                title={storeActiveId ? "Re-roll everyone's initiative" : "Roll initiative for everyone and start the fight"}
              >
                <Dices size={15} aria-hidden /> Roll init
              </button>
              {combatActive && (
                // Rare, and it clears the tracker: behind a ⋯ menu (DESIGN.md §4).
                <HudMenu
                  label="More combat actions"
                  icon={<MoreHorizontal size={16} aria-hidden />}
                  iconOnly
                  items={[
                    {
                      key: "end",
                      label: "End combat",
                      icon: <CircleStop size={16} />,
                      danger: true,
                      hint: "The fight is over: clears the initiative order and resets the round counter",
                      onSelect: () => {
                        if (window.confirm("End combat? Clears the initiative tracker and resets the round counter.")) {
                          void resetCombat();
                        }
                      },
                    },
                  ]}
                />
              )}
              {combatActive && (
                <button
                  className="btn btn-ghost"
                  style={BTN_SM}
                  onClick={() => void rewindTurn()}
                  title="Undo an accidental End turn — step back one combatant (Shift+E)"
                >
                  <Undo2 size={15} aria-hidden /> Undo turn
                </button>
              )}
              {combatActive && (
                <button
                  className={`btn ${storeActiveId ? "btn-primary" : "btn-secondary"}`}
                  style={{ ...BTN_SM, padding: "0.25rem 0.85rem", fontSize: "0.875rem" }}
                  onClick={nextTurn}
                  title="Advance to the next combatant's turn (E)"
                >
                  End turn →
                </button>
              )}
            </div>

          {(addOpen || tableRollOpen) && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 8,
                zIndex: 45,
                width: "min(440px, 94%)",
                background: "var(--surface)",
                border: "1px solid var(--border2)",
                borderRadius: 10,
                boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
                overflow: "hidden",
              }}
            >
              {tableRollOpen && sessionId && <TableRollStrip sessionId={sessionId} />}
              {addOpen && (
                <>
          {/* Load Encounter */}
          {adventureEncounters.length > 0 && (
            <div style={{
              padding: "0.5rem 0.75rem",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface2)",
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
            }}>
              <select
                value={loadEncounterId}
                onChange={(e) => setLoadEncounterId(e.target.value)}
                style={{ flex: 1, fontSize: "0.8125rem", padding: "0.3rem 0.45rem" }}
              >
                <option value="">Load a prepared encounter…</option>
                {adventureEncounters.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.difficulty})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                style={BTN_SM}
                disabled={!loadEncounterId}
                onClick={loadEncounter}
              >
                Load
              </button>
            </div>
          )}

          {/* Add combatant form — grid layout so inputs grow with the column */}
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface2)",
              display: "flex",
              flexDirection: "column",
              gap: "0.4rem",
            }}
          >
            {/* Plan 38 P4-1/9 — Add-from-roster shortcut. Pre-fills the
                manual form from a known PC or NPC; the DM can still
                tweak HP / AC / init before clicking + Add. */}
            {(party.length > 0 || campaignNpcs.length > 0) && (
              <select
                value=""
                onChange={(e) => {
                  pickFromRoster(e.target.value);
                  e.target.value = "";
                }}
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.45rem", minWidth: 0 }}
                title="Pre-fill the form from a campaign PC or NPC"
              >
                <option value="">Fill in from the party or an NPC…</option>
                {party.length > 0 && (
                  <optgroup label="Party">
                    {party
                      .filter(
                        (p) => !persistedCombatants.some((c) => c.character_id === p.id),
                      )
                      .map((p) => (
                        <option key={p.id} value={`pc:${p.id}`}>
                          {p.character_name} (Lv {p.level} {p.character_class})
                        </option>
                      ))}
                  </optgroup>
                )}
                {campaignNpcs.length > 0 && (
                  <optgroup label="NPCs">
                    {campaignNpcs.map((n) => (
                      <option key={n.id} value={`npc:${n.id}`}>
                        {n.name}
                        {n.role ? ` — ${n.role}` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
                gap: "0.35rem",
              }}
            >
              <input
                placeholder="Name, e.g. Goblin boss"
                aria-label="Combatant name"
                value={newCName}
                onChange={(e) => setNewCName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCombatant()}
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.45rem", minWidth: 0 }}
              />
              <select
                value={newCType}
                aria-label="Side"
                onChange={(e) =>
                  setNewCType(e.target.value as "pc" | "monster" | "npc")
                }
                style={{ fontSize: "0.8125rem", padding: "0.3rem 0.4rem", minWidth: 0 }}
              >
                <option value="monster">Monster</option>
                <option value="npc">NPC</option>
                <option value="pc">PC</option>
              </select>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) auto",
                gap: "0.35rem",
                alignItems: "end",
              }}
            >
              <FormField label="Hit points">
                <input
                  type="number"
                  className="num"
                  value={newCHp}
                  onChange={(e) => {
                    setNewCHp(Number(e.target.value));
                    setNewCHpMax(Number(e.target.value));
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    fontSize: "0.8125rem",
                    padding: "0.3rem 0.35rem",
                    textAlign: "center",
                  }}
                />
              </FormField>
              <FormField label="Armor class">
                <input
                  type="number"
                  className="num"
                  value={newCAc}
                  onChange={(e) => setNewCAc(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    fontSize: "0.8125rem",
                    padding: "0.3rem 0.35rem",
                    textAlign: "center",
                  }}
                />
              </FormField>
              <FormField label="Initiative">
                <input
                  type="number"
                  className="num"
                  value={newCInit}
                  onChange={(e) => setNewCInit(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    fontSize: "0.8125rem",
                    padding: "0.3rem 0.35rem",
                    textAlign: "center",
                  }}
                />
              </FormField>
              <button
                className="btn btn-secondary"
                style={{ ...BTN_SM, minHeight: 32, alignSelf: "end" }}
                onClick={addCombatant}
                title="Add to initiative tracker"
              >
                <Plus size={14} aria-hidden /> Add
              </button>
            </div>
          </div>

                </>
              )}
              <div style={{ textAlign: "right", padding: "0.3rem 0.5rem" }}>
                <button
                  className="btn btn-ghost"
                  style={{ ...BTN_XS, border: "none" }}
                  onClick={() => {
                    setAddOpen(false);
                    setTableRollOpen(false);
                  }}
                >
                  <X size={14} aria-hidden /> Close
                </button>
              </div>
            </div>
          )}
          </div>
          {/* Combatant list */}
          {stripOpen && (
          <div
            className="ql-init-strip"
            role="list"
            aria-label="Initiative order"
            style={{
              display: "flex",
              alignItems: "stretch",
              gap: 8,
              overflowX: "auto",
              overflowY: "hidden",
              padding: "0.5rem 0.6rem",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
              flexShrink: 0,
            }}
          >
            {combatants.map((c) => {
              // Plan 38 P4-2 — match by id since combatants is now sorted
              // by initiative desc (which can differ from sort_index).
              const isActive = combatActive && c.id === storeActiveId;
              const pct = c.maxHp > 0 ? Math.max(0, (c.hp / c.maxHp) * 100) : 0;
              const barColor = hpTone(pct / 100);
              const foe = c.type === "monster";
              const side = c.type === "pc" ? "Party" : c.type === "npc" ? "NPC" : "Foe";

              return (
                <div
                  key={c.id}
                  role="listitem"
                  aria-current={isActive ? "true" : undefined}
                  style={{
                    padding: "0.45rem 0.55rem 0.5rem",
                    width: 272,
                    flexShrink: 0,
                    borderRadius: 10,
                    border: `1px solid ${isActive ? "var(--accent-edge)" : "var(--border)"}`,
                    background: isActive ? "var(--accent-soft)" : "var(--surface2)",
                    opacity: c.defeated ? 0.5 : 1,
                  }}
                >
                  {/* The chip: initiative (click to edit) + name */}
                  <div className="flex" style={{ alignItems: "center", gap: "0.3rem", flexWrap: "nowrap", minWidth: 0 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.2rem",
                        minWidth: 0,
                        flex: "0 1 auto",
                        padding: "0.05rem 0.65rem 0.05rem 0.1rem",
                        borderRadius: 999,
                        background: isActive ? "var(--accent)" : "transparent",
                        border: `1px solid ${isActive ? "var(--accent)" : foe ? "var(--danger-line)" : "var(--border2)"}`,
                        color: isActive ? "var(--accent-ink)" : foe ? "var(--danger-text)" : "var(--text)",
                      }}
                    >
                      {/* Plan 38 P4-2 — click-to-edit initiative; PATCH on blur/Enter. */}
                      <input
                        type="number"
                        className="num"
                        aria-label={`${c.name} initiative`}
                        defaultValue={c.initiative}
                        key={`init-${c.id}-${c.initiative}`}
                        onBlur={(e) => {
                          const v = Number(e.target.value);
                          if (!Number.isFinite(v) || v === c.initiative) return;
                          // Plan 41 — persists immediately; server reseats
                          // sort_index so End Turn follows the shown order.
                          void setPersistedInitiative(c.id, v);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur();
                        }}
                        onFocus={(e) => e.currentTarget.select()}
                        style={{
                          width: 34,
                          fontSize: "0.875rem",
                          fontWeight: 600,
                          padding: "0.05rem 0",
                          textAlign: "center",
                          background: "transparent",
                          border: "none",
                          borderRadius: 999,
                          color: "inherit",
                        }}
                        title="Initiative — click to change it; Enter or click out to save"
                      />
                      <span
                        className="story"
                        title={c.name}
                        style={{
                          fontWeight: 700, fontSize: "1rem", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          textDecoration: c.defeated ? "line-through" : undefined,
                        }}
                      >
                        {c.name}
                      </span>
                    </span>
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", flex: "none" }}>
                      {/* Stat block (monsters only) */}
                      {c.monsterId && (
                        <button
                          className="btn btn-ghost"
                          style={BTN_ICON}
                          onClick={() => setStatBlockMonsterId(c.monsterId)}
                          title="View stat block"
                          aria-label={`View ${c.name}'s stat block`}
                        >
                          <BookOpen size={15} aria-hidden />
                        </button>
                      )}
                      {/* Remove */}
                      <button
                        className="btn btn-ghost"
                        style={{ ...BTN_ICON, color: "var(--muted)" }}
                        onClick={() => removeCombatant(c.id)}
                        title="Remove from tracker"
                        aria-label={`Remove ${c.name} from the tracker`}
                      >
                        <X size={15} aria-hidden />
                      </button>
                    </span>
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.15rem 0 0 0.15rem", whiteSpace: "nowrap" }}>
                    {isActive && <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>Their turn · </span>}
                    {side} · <span title="Armor class">AC</span> <span className="num" style={{ color: "var(--text2)" }}>{c.ac}</span>
                    {c.defeated && " · defeated"}
                  </div>

                  {/* HP row — typed amount drives the −/+ buttons (Plan 38) */}
                  <div className="flex" style={{ alignItems: "center", gap: "0.25rem", marginTop: "0.35rem", flexWrap: "nowrap" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ ...BTN_XS, minWidth: 28, padding: "0 0.35rem", fontSize: "0.95rem", color: "var(--danger-text)" }}
                      onClick={() => updateCombatantHp(c.id, c.hp - deltaFor(c.id))}
                      disabled={c.defeated}
                      title={`Apply ${deltaFor(c.id)} damage`}
                    >−</button>
                    <input
                      type="number"
                      className="num"
                      min={1}
                      aria-label={`Damage or healing amount for ${c.name}`}
                      value={deltaFor(c.id)}
                      onChange={(e) => setDeltaFor(c.id, Number(e.target.value))}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") updateCombatantHp(c.id, c.hp - deltaFor(c.id));
                      }}
                      style={{
                        width: 42,
                        fontSize: "0.8125rem",
                        padding: "0.15rem 0.2rem",
                        textAlign: "center",
                      }}
                      title="How much damage or healing (Enter applies damage)"
                    />
                    <button
                      className="btn btn-ghost"
                      style={{ ...BTN_XS, minWidth: 28, padding: "0 0.35rem", fontSize: "0.95rem", color: "var(--teal-text)" }}
                      onClick={() => updateCombatantHp(c.id, c.hp + deltaFor(c.id))}
                      disabled={c.defeated}
                      title={`Apply ${deltaFor(c.id)} healing`}
                    >+</button>
                    <span className="num" title="Hit points" style={{ fontSize: "0.875rem", fontWeight: 600, marginLeft: "0.3rem", whiteSpace: "nowrap" }}>
                      {c.hp} <span style={{ color: "var(--muted)", fontWeight: 400 }}>/ {c.maxHp}</span>
                    </span>
                    <div style={{ flex: 1, minWidth: 24, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.2s" }} />
                    </div>
                  </div>

                  {/* Conditions */}
                  <div style={{ marginTop: "0.35rem" }}>
                    <ConditionTags
                      active={c.conditions}
                      onToggle={(cond) => toggleCombatantCondition(c.id, cond)}
                      immunities={
                        c.monsterId ? immunitiesByMonsterId[c.monsterId] : undefined
                      }
                      floating
                    />
                  </div>
                </div>
              );
            })}

            {combatants.length === 0 && (
              <p style={{ padding: "0.15rem 0.3rem", margin: 0, fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.5 }}>
                The turn order shows here once a fight starts. Use <strong style={{ color: "var(--text2)" }}>Add</strong> to
                bring in an encounter or a single foe, then <strong style={{ color: "var(--text2)" }}>Roll init</strong> to set the order.
              </p>
            )}
          </div>
          )}
        {/* ── CENTER: map control first; the script slides over on demand ── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", flex: 1, minHeight: 0 }}>
          <div style={PANEL_BAND}>
            <div className="flex" style={{ gap: "0.3rem", flexWrap: "nowrap" }}>
              {(
                [
                  ["maps", "Maps", <MapIcon key="i" size={15} aria-hidden />, "Tonight's battle maps — click one to put it on the table"],
                  ["live", "Live", <Gamepad2 key="i" size={15} aria-hidden />, "Drive the table: fog, tokens and title cards"],
                  ["people", "People", <Users key="i" size={15} aria-hidden />, "The party, tonight's monsters and the NPCs, one click from their sheets"],
                ] as const
              ).map(([k, label, icon, hint]) => (
                <button
                  key={k}
                  onClick={() => { setCenterTab(k); if (k === "live") setMapFocus(true); }}
                  className="btn btn-ghost"
                  aria-pressed={centerTab === k}
                  title={hint}
                  style={{ ...BTN_SM, ...(centerTab === k ? TOGGLE_ON : {}) }}
                >
                  {icon} {label}
                </button>
              ))}
            </div>
            <div className="flex" style={{ gap: "0.3rem", flexWrap: "nowrap" }}>
              <button
                onClick={() => setMapFocus((v) => !v)}
                className="btn btn-ghost"
                aria-pressed={mapFocus}
                title={mapFocus ? "Give the space back to the party panel" : "Widen the map pane (the party column narrows)"}
                style={{ ...BTN_SM, ...(mapFocus ? TOGGLE_ON : {}) }}
              >
                {mapFocus ? <Minimize2 size={15} aria-hidden /> : <Maximize2 size={15} aria-hidden />}
                {mapFocus ? "Unfocus" : "Focus map"}
              </button>
              <button
                onClick={() => setScriptOpen((v) => !v)}
                className="btn btn-ghost"
                aria-pressed={scriptOpen}
                title="Your runbook: read-aloud text and notes, scene by scene (slides over the map)"
                style={{ ...BTN_SM, ...(scriptOpen ? TOGGLE_ON : {}) }}
              >
                <Clapperboard size={15} aria-hidden /> Script
                {scenes.length > 0 && <span className="num" style={{ fontSize: "0.75rem", opacity: 0.8 }}>{sceneIdx + 1}/{scenes.length}</span>}
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
            {/* Plan 60 — runbook drawer: slides over the center column. */}
            {scriptOpen && (
            <div
              style={{
                position: "absolute",
                top: 0,
                right: 0,
                bottom: 0,
                width: "min(520px, 92%)",
                zIndex: 40,
                background: "var(--surface)",
                borderLeft: "1px solid var(--border2)",
                boxShadow: "-12px 0 28px rgba(0,0,0,0.4)",
                overflowY: "auto",
                padding: "0.9rem 1rem 1rem",
              }}
            >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.7rem" }}>
              <strong style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text2)", display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                <Clapperboard size={15} aria-hidden /> Script
              </strong>
              <button
                className="btn btn-ghost"
                style={{ ...BTN_XS, border: "none" }}
                onClick={() => setScriptOpen(false)}
              >
                <X size={14} aria-hidden /> Close
              </button>
            </div>
            {!runbook && (
              <div style={{ color: "var(--muted)", textAlign: "center", marginTop: "2rem", fontSize: "0.9rem", lineHeight: 1.5 }}>
                <p style={{ color: "var(--text2)" }}>
                  The script is your runbook: read-aloud text and your notes, scene by scene.
                </p>
                <p>This session doesn&rsquo;t have one yet.</p>
                <Link
                  to={`/sessions/${sessionId}/prep`}
                  className="btn btn-secondary"
                  style={{ marginTop: "0.5rem" }}
                >
                  Write it in session prep →
                </Link>
              </div>
            )}

            {runbook && scenes.length === 0 && (
              <div>
                <div style={GROUP_LABEL}>Opening scene · read aloud</div>
                <div className="read-aloud" style={{ fontSize: "1.02rem", whiteSpace: "pre-wrap" }}>
                  {runbook.opening_scene || (
                    <span style={{ color: "var(--muted)", fontStyle: "normal", fontFamily: "var(--font-ui)", fontSize: "0.875rem" }}>
                      Nothing written yet — add scenes in session prep.
                    </span>
                  )}
                </div>
              </div>
            )}

            {currentScene && (
              <div>
                {/* Scene tabs */}
                <div className="flex" style={{ gap: "0.3rem", marginBottom: "0.9rem", flexWrap: "wrap" }}>
                  {scenes.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSceneIdx(i)}
                      className="btn btn-ghost"
                      aria-pressed={i === sceneIdx}
                      title={s.title}
                      style={{ ...BTN_XS, ...(i === sceneIdx ? TOGGLE_ON : {}) }}
                    >
                      <span className="num">{i + 1}</span> {s.title.length > 20 ? s.title.slice(0, 19) + "…" : s.title}
                    </button>
                  ))}
                </div>

                <h2 className="story" style={{ marginBottom: "0.15rem", fontSize: "1.4rem" }}>
                  {currentScene.title}
                </h2>
                {currentScene.estimated_minutes > 0 && (
                  <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
                    About <span className="num">{currentScene.estimated_minutes}</span> min
                  </p>
                )}

                {/* Read aloud */}
                <div style={{ ...GROUP_LABEL, marginTop: "0.5rem" }}>Read aloud</div>
                <div className="read-aloud" style={{ marginBottom: "1rem", padding: "0.75rem 1rem" }}>
                  {sessionId && runbook && (
                    <EditableRunbookText
                      kind="scene"
                      sceneIndex={sceneIdx}
                      field="read_aloud"
                      sessionId={sessionId}
                      runbook={runbook}
                      variant="read_aloud"
                      fontSize="1.02rem"
                    />
                  )}
                </div>

                {/* DM Notes — always editable so DM can ADD even if Claude left empty */}
                <div style={GROUP_LABEL}>Your notes for this scene</div>
                <div style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 10,
                  padding: "0.7rem 0.9rem",
                  marginBottom: "1rem",
                }}>
                  {sessionId && runbook && (
                    <EditableRunbookText
                      kind="scene"
                      sceneIndex={sceneIdx}
                      field="dm_notes"
                      sessionId={sessionId}
                      runbook={runbook}
                      variant="dm_notes"
                      fontSize="0.95rem"
                    />
                  )}
                </div>

                {/* Prev / Next */}
                <div className="flex gap-2" style={{ marginTop: "1rem" }}>
                  <button
                    className="btn btn-ghost"
                    style={BTN_SM}
                    disabled={sceneIdx === 0}
                    onClick={() => setSceneIdx((i) => i - 1)}
                  >
                    ← Previous scene
                  </button>
                  <button
                    className="btn btn-secondary"
                    style={BTN_SM}
                    disabled={sceneIdx === scenes.length - 1}
                    onClick={() => setSceneIdx((i) => i + 1)}
                  >
                    Next scene →
                  </button>
                </div>
              </div>
            )}

            {/* NPC dialog quick view */}
            {runbook?.npc_dialog && runbook.npc_dialog.length > 0 && (
              <div style={{ marginTop: "1.5rem" }}>
                <div style={GROUP_LABEL}>What the NPCs might say</div>
                {runbook.npc_dialog.map((npc, i) => (
                  <details key={i} style={{ marginBottom: "0.5rem" }}>
                    <summary className="story" style={{ cursor: "pointer", fontSize: "1.02rem", color: "var(--text)", fontWeight: 700 }}>
                      {npc.npc_name}
                    </summary>
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, fontSize: "0.875rem", color: "var(--text2)" }}>
                      {npc.lines.map((l, j) => (
                        <li key={j} className="story" style={{ fontStyle: "italic", marginBottom: "0.25rem", fontSize: "0.95rem" }}>
                          &ldquo;{l}&rdquo;
                        </li>
                      ))}
                      {npc.improv_hooks.map((h, j) => (
                        <li key={`h${j}`} style={{ marginBottom: "0.25rem", color: "var(--muted)", listStyle: "none", marginLeft: "-1rem" }}>
                          <Lightbulb size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 6 }} />
                          {h}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            )}
            </div>
            )}

            {/* ── 🗺 Maps tab (Plan 53) — the battle-map library, one click to stage ── */}
            {centerTab === "maps" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.7rem" }}>
                  {shelfMaps.map((m) => {
                    const active = hudTable?.active_map_id === m.id;
                    return (
                      <div key={m.id} style={{ position: "relative" }}>
                      <button
                        onClick={() => {
                          setActiveMap.mutate(m.id);
                          setMapFocus(true);
                          setCenterTab("live");
                        }}
                        disabled={setActiveMap.isPending}
                        title={active ? "Live on the table" : "Put this map on the table"}
                        style={{
                          padding: 0,
                          width: "100%",
                          textAlign: "left",
                          background: active ? "var(--accent-soft)" : "var(--surface2)",
                          border: `1px solid ${active ? "var(--accent-edge)" : "var(--border)"}`,
                          borderRadius: 10,
                          overflow: "hidden",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        <img
                          src={m.thumb_url ?? m.image_url}
                          alt={m.name}
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", aspectRatio: "16/10", objectFit: "cover", display: "block" }}
                        />
                        <div style={{ padding: "0.4rem 0.55rem", display: "flex", alignItems: "center", gap: "0.4rem", minWidth: 0 }}>
                          <span
                            className="story"
                            style={{ fontSize: "0.95rem", fontWeight: 700, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}
                          >
                            {m.name}
                          </span>
                          {active && <span className="pill pill-live" style={{ marginLeft: "auto", fontSize: "0.75rem", padding: "0 0.5rem" }}>Live</span>}
                        </div>
                      </button>
                      {!active && (
                        <button
                          className="btn btn-ghost"
                          title="Take it off tonight's shelf (it stays in the library)"
                          aria-label={`Take ${m.name} off tonight's shelf`}
                          onClick={() => setShelf.mutate((hudTable?.map_shelf ?? []).filter((id) => id !== m.id))}
                          style={{ ...BTN_ICON, position: "absolute", top: 6, right: 6, background: "rgba(17,21,19,0.82)", color: "var(--text)" }}
                        >
                          <X size={14} aria-hidden />
                        </button>
                      )}
                      </div>
                    );
                  })}
                </div>
                {hudMaps.length > 0 && shelfMaps.length === 0 && (
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.5, maxWidth: 560 }}>
                    <p style={{ margin: "0 0 0.25rem", color: "var(--text)", fontWeight: 500 }}>Tonight&rsquo;s maps go here.</p>
                    <p style={{ margin: 0, color: "var(--muted)" }}>
                      Pull the ones you need from the library, then click a map to put it on the players&rsquo; screen.
                    </p>
                  </div>
                )}
                {hudMaps.length > 0 && (
                <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                  <button
                    className="btn btn-secondary"
                    style={{ ...BTN_SM, ...(libraryOpen ? TOGGLE_ON : {}) }}
                    aria-expanded={libraryOpen}
                    onClick={() => setLibraryOpen((v) => !v)}
                  >
                    {libraryOpen ? "Done" : <><Plus size={15} aria-hidden /> From the library</>}
                  </button>
                  <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                    <span className="num">{shelfMaps.length}</span> on tonight&rsquo;s shelf · <span className="num">{hudMaps.length - shelfMaps.length}</span> more in the library
                  </span>
                </div>
                )}
                {libraryOpen && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <input placeholder="Find a map…" aria-label="Find a map" value={libraryQuery} onChange={(e) => setLibraryQuery(e.target.value)} style={{ width: "100%", marginBottom: "0.5rem", fontSize: "0.875rem", padding: "0.35rem 0.6rem" }} />
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      {libraryMaps.map((m) => (
                        <button key={m.id} className="btn btn-ghost" style={BTN_SM} title="Put it on tonight's shelf" onClick={() => setShelf.mutate([...(hudTable?.map_shelf ?? []), m.id])}>
                          <Plus size={14} aria-hidden /> {m.name}
                        </button>
                      ))}
                      {libraryMaps.length === 0 && <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Nothing else matches.</span>}
                    </div>
                  </div>
                )}
                {!hudMapsLoading && hudMaps.length === 0 && (
                  <div style={{ fontSize: "0.9rem", lineHeight: 1.5, maxWidth: 560 }}>
                    <p style={{ margin: "0 0 0.25rem", color: "var(--text)", fontWeight: 500 }}>Battle maps for the players&rsquo; screen go here.</p>
                    <p style={{ margin: "0 0 0.6rem", color: "var(--muted)" }}>
                      This campaign has none yet. Upload a map image once, and it can go on the TV with fog and tokens.
                    </p>
                    {adventure?.campaign_id && (
                      <Link to={`/campaigns/${adventure.campaign_id}/battle-maps`} className="btn btn-secondary" style={BTN_SM}>
                        <MapIcon size={15} aria-hidden /> Add a battle map
                      </Link>
                    )}
                  </div>
                )}
                {hudMaps.length > 0 && (
                <p style={{ fontSize: "0.8125rem", color: "var(--muted)", marginTop: "0.8rem", lineHeight: 1.5, maxWidth: 640 }}>
                  Click a map to put it on the table (players&rsquo; views switch live), then move tokens and
                  lift the fog from the Live tab. The <Link to={`/sessions/${sessionId}/board`}>3D board</Link> is for set dressing.
                </p>
                )}
              </div>
            )}

            {/* ── 🎮 Live tab (Plan 75) — drive the projected table without leaving the HUD ── */}
            {centerTab === "live" && sessionId && adventure && (
              <LiveBoardPane sessionId={sessionId} campaignId={adventure.campaign_id} party={party} />
            )}

            {/* ── 👥 People tab (Plan 53) — full blocks one click away ── */}
            {centerTab === "people" && (
              <div>
                <div style={GROUP_LABEL}>Party · click for the full sheet</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "0.5rem", marginBottom: "1.1rem" }}>
                  {party.map((pc) => (
                    <button
                      key={pc.id}
                      onClick={() => setSheetPcId(pc.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.45rem 0.6rem",
                        background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10,
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "var(--text)", minWidth: 0,
                      }}
                    >
                      {pc.portrait_url ? (
                        <img src={pc.portrait_url} {...zoomable(pc.portrait_url, pc.character_name)} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
                      ) : (
                        <PersonDot label={initials(pc.character_name)} />
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="story" style={{ fontSize: "1rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pc.character_name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                          Level <span className="num">{pc.level}</span> · HP <span className="num">{pc.hp_current}/{pc.hp_max}</span> · AC <span className="num">{pc.ac}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                <div style={GROUP_LABEL}>Monsters in tonight&rsquo;s encounters · click for the stat block</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "0.5rem", marginBottom: "1.1rem" }}>
                  {rosterMonsters.map((r) => (
                    <button
                      key={r.monster_id}
                      onClick={() => setStatBlockMonsterId(r.monster_id)}
                      style={{
                        padding: "0.45rem 0.6rem", background: "var(--surface2)", fontFamily: "inherit",
                        border: "1px solid var(--border)", borderRadius: 10, cursor: "pointer", textAlign: "left", minWidth: 0,
                      }}
                    >
                      <div className="story" style={{ fontSize: "1rem", fontWeight: 700, color: "var(--danger-text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name}{r.count > 1 ? <span className="num" style={{ fontSize: "0.8125rem", fontWeight: 500 }}> ×{r.count}</span> : ""}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        <span title="Challenge rating">CR</span> <span className="num">{r.cr}</span> · HP <span className="num">{r.hp}</span> · AC <span className="num">{r.ac}</span>
                      </div>
                    </button>
                  ))}
                  {rosterMonsters.length === 0 && (
                    <p style={{ color: "var(--muted)", fontSize: "0.875rem", margin: 0, gridColumn: "1 / -1", lineHeight: 1.5 }}>
                      Monsters from this adventure&rsquo;s encounters show here, one click from their stat blocks. None are
                      planned yet — build an encounter in prep, or use <strong style={{ color: "var(--text2)" }}>Add</strong> in the combat bar for a quick foe.
                    </p>
                  )}
                </div>

                {campaignNpcs.length > 0 && (
                  <>
                    <div style={GROUP_LABEL}>NPCs</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: "0.5rem" }}>
                      {campaignNpcs.map((npc) => (
                        <div
                          key={npc.id}
                          title={npc.appearance ?? undefined}
                          style={{
                            display: "flex", alignItems: "center", gap: "0.6rem", padding: "0.45rem 0.6rem",
                            background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 10, minWidth: 0,
                          }}
                        >
                          {npc.portrait_url ? (
                            <img src={npc.portrait_url} {...zoomable(npc.portrait_url, npc.name)} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", flex: "none" }} />
                          ) : (
                            <PersonDot />
                          )}
                          <div style={{ minWidth: 0 }}>
                            <div className="story" style={{ fontSize: "1rem", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{npc.name}</div>
                            <div style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{npc.role}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

          {/* ── Under the board: tonight's notes + the beats ── */}
          <div
            onPointerDown={startNotesResize}
            title="Drag to resize the notes"
            style={{ height: 6, cursor: "row-resize", background: "var(--border)", flexShrink: 0 }}
          />
          <div
            className="ql-hud-bottom"
            style={{
              height: notesH,
              flexShrink: 0,
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 380px)",
              minHeight: 0,
              overflow: "hidden",
            }}
          >
            <div style={{ minWidth: 0, minHeight: 0 }}>
              {sessionId && <SessionNotesEditor sessionId={sessionId} fontSize="0.88rem" />}
            </div>
            <div style={{ borderLeft: "1px solid var(--border)", overflowY: "auto", minHeight: 0 }}>
          {/* Plan 40 Change 3 — state-triggered beats. Banner-on-fire,
              attach-by-HP / attach-by-round forms, pending list. */}
          {sessionId && (
            <CombatBeatsPanel
              sessionId={sessionId}
              combatants={persistedCombatants.map((c) => ({
                id: c.id,
                name: c.name,
                hp_current: c.hp_current,
              }))}
              round={round}
            />
          )}

            </div>
          </div>
        </div>
      </div>

      {/* Monster stat block modal (Plan 00015 — wire stat blocks into HUD) */}
      {statBlockMonster && (
        <MonsterStatBlock
          monster={statBlockMonster}
          onClose={() => setStatBlockMonsterId(null)}
        />
      )}

      {/* Character sheet modal (Plan 00022) */}
      {sheetPcId && (
        <CharacterSheet
          characterId={sheetPcId}
          onClose={() => setSheetPcId(null)}
        />
      )}

      {tableConsoleOpen && sessionId && adventure && (
        <TableConsoleModal
          sessionId={sessionId}
          campaignId={adventure.campaign_id}
          party={party}
          onClose={() => setTableConsoleOpen(false)}
        />
      )}

      {/* Loot modal (Plan 00016 — hand out items mid-session) */}
      {lootOpen && sessionId && adventure && (
        <div
          onClick={() => setLootOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            zIndex: 200,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            padding: "4rem 1rem 1rem",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 640,
              width: "100%",
              background: "var(--surface)",
              borderRadius: 10,
              border: "1px solid var(--border2)",
              padding: "1rem",
              position: "relative",
            }}
          >
            <button
              onClick={() => setLootOpen(false)}
              className="btn btn-ghost"
              style={{ ...BTN_ICON, position: "absolute", top: "0.5rem", right: "0.6rem", width: 30, minHeight: 30, color: "var(--muted)" }}
              title="Close"
              aria-label="Close"
            >
              <X size={18} aria-hidden />
            </button>
            <LootPanel
              sessionId={sessionId}
              attendingPcIds={session?.attending_pc_ids ?? []}
              campaignId={adventure.campaign_id}
              defaultOpen
            />
          </div>
        </div>
      )}

      {/* Plan 27 — DM Screen modal */}
      <DmScreen open={dmScreenOpen} onClose={() => setDmScreenOpen(false)} />

      {/* Plan 38/39 — Tonight's Cast drawer. Slides in from the right
          with NPC portraits / accents / dialog hooks, highlighting the
          ones mentioned in the current scene. Toggle button is the 🎭
          chip at the right edge. */}
      <TonightsCastDrawer
        npcs={campaignNpcs}
        currentScene={currentScene}
        rosterNames={castRoster}
        sessionNumber={session.session_number}
      />
    </div>
  );
}

/**
 * Plan 23 — compact at-a-glance icons for each PC in the party panel.
 *
 * Shows only the icons that are *active* (temp HP > 0, inspiration on,
 * concentrating, dying). Nothing renders when the PC has no statuses,
 * so the row stays tight for the common case.
 */
function PcStatusIcons({ pc }: { pc: PlayerCharacter }) {
  const tempHp = pc.temp_hp ?? 0;
  const insp = pc.heroic_inspiration ?? false;
  const conc = pc.concentration_on ?? null;
  const dying = pc.hp_current === 0;
  const exhaustion = pc.exhaustion ?? 0;
  const hasAny = tempHp > 0 || insp || !!conc || dying || exhaustion > 0;
  if (!hasAny) return null;
  return (
    <div
      style={{
        display: "flex",
        gap: "0.35rem",
        marginTop: "0.3rem",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {tempHp > 0 && (
        <StatusBadge tone="teal" title={`Temporary hit points +${tempHp} (lost first)`}>
          <Shield size={12} aria-hidden /> <span className="num">+{tempHp}</span> temp
        </StatusBadge>
      )}
      {insp && (
        <StatusBadge tone="neutral" title="Heroic Inspiration available — they can reroll one die">
          <Sparkles size={12} aria-hidden /> Inspiration
        </StatusBadge>
      )}
      {conc && (
        <StatusBadge tone="amber" title={`Concentrating on: ${conc} — damage forces a CON save`}>
          <Brain size={12} aria-hidden /> {conc}
        </StatusBadge>
      )}
      {dying && (
        <StatusBadge
          tone="danger"
          title={`Dying — death saves: ${pc.death_save_successes ?? 0} passed / ${pc.death_save_failures ?? 0} failed`}
        >
          <Skull size={12} aria-hidden /> Dying <span className="num">{pc.death_save_successes ?? 0}✓ {pc.death_save_failures ?? 0}✗</span>
        </StatusBadge>
      )}
      {exhaustion > 0 && (
        <StatusBadge
          tone={exhaustion >= 6 ? "danger" : "amber"}
          title={
            exhaustion >= 6
              ? "Exhaustion 6 — dead"
              : `Exhaustion ${exhaustion} (${exhaustion * -2} to D20 Tests)`
          }
        >
          Exhaustion <span className="num">{exhaustion}</span>
        </StatusBadge>
      )}
    </div>
  );
}

function StatusBadge({
  tone,
  title,
  children,
}: {
  tone: "teal" | "amber" | "danger" | "neutral";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      className={`pill${tone === "neutral" ? "" : ` pill-${tone}`}`}
      style={{
        fontSize: "0.75rem",
        padding: "0.05rem 0.55rem",
        maxWidth: 200,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </span>
  );
}

/** A round placeholder for a person with no portrait: initials, or a line icon. */
function PersonDot({ label }: { label?: string }) {
  return (
    <span
      aria-hidden
      className={label ? "story" : undefined}
      style={{
        width: 36,
        height: 36,
        borderRadius: "50%",
        background: "var(--surface3)",
        color: "var(--text2)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: "none",
        fontWeight: 700,
        fontSize: "0.9rem",
      }}
    >
      {label ?? <UserRound size={18} />}
    </span>
  );
}
