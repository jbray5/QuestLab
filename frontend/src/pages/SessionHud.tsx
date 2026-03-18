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

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { encountersApi } from "../api/encounters";
import type { PlayerCharacter, RunbookScene, Encounter, RosterEntry } from "../api/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const CONDITIONS = [
  "Blinded", "Charmed", "Concentrating", "Deafened", "Exhausted",
  "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed",
  "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious",
] as const;

type Condition = (typeof CONDITIONS)[number];

const CONDITION_COLOR: Record<Condition, string> = {
  Blinded: "#607d8b", Charmed: "#e91e8c", Concentrating: "#9c27b0",
  Deafened: "#795548", Exhausted: "#f44336", Frightened: "#ff5722",
  Grappled: "#ff9800", Incapacitated: "#f44336", Invisible: "#00bcd4",
  Paralyzed: "#f44336", Petrified: "#9e9e9e", Poisoned: "#4caf50",
  Prone: "#8d6e63", Restrained: "#ff9800", Stunned: "#f44336",
  Unconscious: "#212121",
};

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

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;

const SPELLCASTER_CLASSES = ["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard", "Artificer"];

// Rough slot table by class+level (simplified; full short/long rest not tracked)
function maxSlotsForLevel(cls: string | null, level: number): number[] {
  if (!cls || !SPELLCASTER_CLASSES.includes(cls)) return [];
  const isHalf = ["Paladin", "Ranger", "Artificer"].includes(cls);
  const effectiveLevel = isHalf ? Math.floor(level / 2) : level;
  const table: Record<number, number[]> = {
    1:  [2],
    2:  [3],
    3:  [4, 2],
    4:  [4, 3],
    5:  [4, 3, 2],
    6:  [4, 3, 3],
    7:  [4, 3, 3, 1],
    8:  [4, 3, 3, 2],
    9:  [4, 3, 3, 3, 1],
    10: [4, 3, 3, 3, 2],
    11: [4, 3, 3, 3, 2, 1],
    12: [4, 3, 3, 3, 2, 1],
    13: [4, 3, 3, 3, 2, 1, 1],
    14: [4, 3, 3, 3, 2, 1, 1],
    15: [4, 3, 3, 3, 2, 1, 1, 1],
    16: [4, 3, 3, 3, 2, 1, 1, 1],
    17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
    18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
    19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
    20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
  };
  return table[Math.min(Math.max(effectiveLevel, 1), 20)] ?? [];
}

function abilityMod(score: number) {
  return Math.floor((score - 10) / 2);
}

function passivePerception(wis: number, profBonus: number, hasProficiency = true) {
  return 10 + abilityMod(wis) + (hasProficiency ? profBonus : 0);
}

function profBonus(level: number) {
  return Math.floor((level - 1) / 4) + 2;
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

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function commit() {
    const n = Math.min(maxHp, Math.max(0, Number(val) || 0));
    onSave(n);
    setEditing(false);
  }

  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const barColor = pct > 50 ? "#4caf50" : pct > 25 ? "#ff9800" : "#f44336";

  return (
    <div style={{ width: "100%" }}>
      <div className="flex" style={{ alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
        {editing ? (
          <input
            ref={inputRef}
            type="number"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
            style={{ width: 52, fontSize: "0.9rem", padding: "0.1rem 0.3rem" }}
          />
        ) : (
          <button
            onClick={() => { setVal(String(hp)); setEditing(true); }}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontSize: "0.95rem", fontWeight: 700, color: barColor, padding: 0,
            }}
            disabled={saving}
            title="Click to edit HP"
          >
            {hp}
          </button>
        )}
        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>/ {maxHp}</span>
        <button
          className="btn btn-ghost"
          style={{ padding: "0.1rem 0.35rem", fontSize: "0.7rem" }}
          onClick={() => { const n = Math.max(0, hp - 1); onSave(n); }}
          disabled={saving || hp <= 0}
          title="−1 HP"
        >−</button>
        <button
          className="btn btn-ghost"
          style={{ padding: "0.1rem 0.35rem", fontSize: "0.7rem" }}
          onClick={() => { const n = Math.min(maxHp, hp + 1); onSave(n); }}
          disabled={saving || hp >= maxHp}
          title="+1 HP"
        >+</button>
        <button
          className="btn btn-ghost"
          style={{ padding: "0.1rem 0.35rem", fontSize: "0.7rem", color: "#4caf50" }}
          onClick={() => onSave(maxHp)}
          disabled={saving || hp === maxHp}
          title="Full heal"
        >↑</button>
      </div>
      <div style={{
        height: 6, borderRadius: 3, background: "var(--surface2)",
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
}

function ConditionTags({ active, onToggle }: ConditionTagsProps) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState<Condition | null>(null);

  return (
    <div style={{ position: "relative" }}>
      <div className="flex" style={{ flexWrap: "wrap", gap: "0.2rem", alignItems: "center" }}>
        {Array.from(active).map((c) => (
          <button
            key={c}
            onClick={() => onToggle(c)}
            onMouseEnter={() => setTooltip(c)}
            onMouseLeave={() => setTooltip(null)}
            style={{
              background: CONDITION_COLOR[c], color: "#fff",
              border: "none", borderRadius: 3, padding: "0.1rem 0.4rem",
              fontSize: "0.65rem", cursor: "pointer", fontWeight: 600,
            }}
            title={CONDITION_RULES[c]}
          >
            {c} ✕
          </button>
        ))}
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}
          onClick={() => setOpen(!open)}
          title="Add condition"
        >
          + cond
        </button>
      </div>

      {tooltip && (
        <div style={{
          position: "absolute", zIndex: 50, bottom: "110%", left: 0,
          background: "var(--surface2)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "0.5rem 0.75rem", maxWidth: 280,
          fontSize: "0.75rem", color: "var(--text)", pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          <strong style={{ color: CONDITION_COLOR[tooltip] }}>{tooltip}</strong>
          <br />{CONDITION_RULES[tooltip]}
        </div>
      )}

      {open && (
        <div style={{
          position: "absolute", zIndex: 40, top: "110%", left: 0,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "0.5rem", display: "flex",
          flexWrap: "wrap", gap: "0.25rem", maxWidth: 300,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}>
          {CONDITIONS.map((c) => (
            <button
              key={c}
              onClick={() => { onToggle(c); setOpen(false); }}
              style={{
                background: active.has(c) ? CONDITION_COLOR[c] : "var(--surface2)",
                color: active.has(c) ? "#fff" : "var(--text)",
                border: `1px solid ${CONDITION_COLOR[c]}`,
                borderRadius: 4, padding: "0.15rem 0.45rem",
                fontSize: "0.7rem", cursor: "pointer",
              }}
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface SpellSlotTrackerProps {
  cls: string | null;
  level: number;
  pcId: string;
  slots: Record<string, boolean[]>;
  onToggle: (pcId: string, slotLevel: number, idx: number) => void;
}

function SpellSlotTracker({ cls, level, pcId, slots, onToggle }: SpellSlotTrackerProps) {
  const maxSlots = maxSlotsForLevel(cls, level);
  if (maxSlots.length === 0) return null;

  return (
    <div style={{ marginTop: "0.3rem" }}>
      <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.2rem" }}>Spell Slots</div>
      <div className="flex" style={{ flexWrap: "wrap", gap: "0.3rem" }}>
        {maxSlots.map((count, lvlIdx) => {
          const key = `${pcId}-${lvlIdx}`;
          const used = slots[key] ?? Array(count).fill(false);
          return (
            <div key={lvlIdx} style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}>
              <span style={{ fontSize: "0.6rem", color: "var(--muted)", minWidth: 10 }}>{lvlIdx + 1}</span>
              {used.map((spent, idx) => (
                <button
                  key={idx}
                  onClick={() => onToggle(pcId, lvlIdx, idx)}
                  title={`L${lvlIdx + 1} slot ${idx + 1} — ${spent ? "spent" : "available"}`}
                  style={{
                    width: 10, height: 10, borderRadius: "50%",
                    border: "1px solid var(--gold)",
                    background: spent ? "transparent" : "var(--gold)",
                    cursor: "pointer", padding: 0,
                  }}
                />
              ))}
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
}

// ── Main HUD ──────────────────────────────────────────────────────────────────

export default function SessionHud() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

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

  const { data: allChars = [] } = useQuery({
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
  const [conditions, setConditions] = useState<Record<string, Set<Condition>>>({});
  const [spellSlots, setSpellSlots] = useState<Record<string, boolean[]>>({});

  function toggleCondition(pcId: string, c: Condition) {
    setConditions((prev) => {
      const s = new Set(prev[pcId] ?? []);
      s.has(c) ? s.delete(c) : s.add(c);
      return { ...prev, [pcId]: s };
    });
  }

  function toggleSlot(pcId: string, slotLevel: number, idx: number) {
    const key = `${pcId}-${slotLevel}`;
    setSpellSlots((prev) => {
      const maxSlots = maxSlotsForLevel(
        party.find((p) => p.id === pcId)?.character_class ?? null,
        party.find((p) => p.id === pcId)?.level ?? 1,
      );
      const current = prev[key] ?? Array(maxSlots[slotLevel] ?? 0).fill(false);
      const next = [...current];
      next[idx] = !next[idx];
      return { ...prev, [key]: next };
    });
  }

  // ── Scene navigator ────────────────────────────────────────────────────────
  const [sceneIdx, setSceneIdx] = useState(0);
  const scenes: RunbookScene[] = runbook?.scenes ?? [];
  const currentScene = scenes[sceneIdx] ?? null;

  // ── Combat tracker ─────────────────────────────────────────────────────────
  const [combatants, setCombatants] = useState<HudCombatant[]>([]);
  const [combatActive, setCombatActive] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [round, setRound] = useState(1);
  const [newCName, setNewCName] = useState("");
  const [newCType, setNewCType] = useState<"pc" | "monster" | "npc">("monster");
  const [loadEncounterId, setLoadEncounterId] = useState("");
  const [newCHp, setNewCHp] = useState(10);
  const [newCHpMax, setNewCHpMax] = useState(10);
  const [newCAc, setNewCAc] = useState(10);
  const [newCInit, setNewCInit] = useState(0);

  // Pre-populate combat with party on first open
  useEffect(() => {
    if (party.length > 0 && combatants.length === 0) {
      setCombatants(
        party.map((pc) => ({
          id: pc.id,
          name: pc.character_name,
          type: "pc",
          initiative: 0,
          hp: pc.hp_current,
          maxHp: pc.hp_max,
          ac: pc.ac,
          conditions: new Set<Condition>(),
          defeated: false,
        })),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party.length]);

  function addCombatant() {
    if (!newCName.trim()) return;
    setCombatants((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: newCName.trim(),
        type: newCType,
        initiative: newCInit,
        hp: newCHp,
        maxHp: newCHpMax,
        ac: newCAc,
        conditions: new Set<Condition>(),
        defeated: false,
      },
    ]);
    setNewCName(""); setNewCHp(10); setNewCHpMax(10); setNewCAc(10); setNewCInit(0);
  }

  function loadEncounter() {
    const enc = adventureEncounters.find((e) => e.id === loadEncounterId);
    if (!enc) return;
    const roster: RosterEntry[] = (enc.monster_roster ?? []) as unknown as RosterEntry[];
    const newCombatants: HudCombatant[] = [];
    for (const entry of roster) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        const label = count === 1 ? entry.name : `${entry.name} ${i + 1}`;
        newCombatants.push({
          id: crypto.randomUUID(),
          name: label,
          type: "monster",
          initiative: 0,
          hp: entry.hp ?? 10,
          maxHp: entry.hp ?? 10,
          ac: entry.ac ?? 10,
          conditions: new Set<Condition>(),
          defeated: false,
        });
      }
    }
    if (newCombatants.length === 0) return;
    setCombatants((prev) => [...prev, ...newCombatants]);
    setLoadEncounterId("");
  }

  function rollAllInitiative() {
    setCombatants((prev) =>
      [...prev]
        .map((c) => ({ ...c, initiative: Math.floor(Math.random() * 20) + 1 + abilityMod(10) }))
        .sort((a, b) => b.initiative - a.initiative),
    );
    setCombatActive(true);
    setCurrentTurn(0);
    setRound(1);
  }

  function nextTurn() {
    const alive = combatants.filter((c) => !c.defeated);
    if (alive.length === 0) return;
    const nextIdx = (currentTurn + 1) % combatants.length;
    // Skip defeated
    let i = nextIdx;
    while (combatants[i]?.defeated && i !== currentTurn) {
      i = (i + 1) % combatants.length;
    }
    if (i < currentTurn || (i === 0 && currentTurn === combatants.length - 1)) {
      setRound((r) => r + 1);
    }
    setCurrentTurn(i);
  }

  function updateCombatantHp(id: string, newHp: number) {
    setCombatants((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, hp: Math.min(c.maxHp, Math.max(0, newHp)) } : c,
      ),
    );
    // If this is a PC, also persist
    const pc = party.find((p) => p.id === id);
    if (pc) saveHp(id, Math.min(pc.hp_max, Math.max(0, newHp)));
  }

  function toggleCombatantCondition(id: string, cond: Condition) {
    setCombatants((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const s = new Set(c.conditions);
        s.has(cond) ? s.delete(cond) : s.add(cond);
        return { ...c, conditions: s };
      }),
    );
  }

  function removeCombatant(id: string) {
    setCombatants((prev) => prev.filter((c) => c.id !== id));
  }

  // ── Dice roller ────────────────────────────────────────────────────────────
  const [diceLog, setDiceLog] = useState<{ die: number; result: number }[]>([]);

  const rollDie = useCallback((sides: number) => {
    const result = Math.floor(Math.random() * sides) + 1;
    setDiceLog((prev) => [{ die: sides, result }, ...prev].slice(0, 8));
  }, []);

  // ── Quick rules accordion ──────────────────────────────────────────────────
  const [rulesOpen, setRulesOpen] = useState<string | null>(null);

  const QUICK_RULES: Record<string, string[]> = {
    "Actions": [
      "Action: Attack, Cast a Spell, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use Object",
      "Bonus Action: Class features, some spells (requires explicit 'bonus action' tag)",
      "Reaction: Opportunity attack, Shield, Absorb Elements, Counterspell — triggered by a condition",
      "Free: Communicate, Drop an object, Open an unlocked door (DM discretion)",
    ],
    "Death Saves": [
      "Roll d20 at start of turn when at 0 HP. 10+ = success, 9 or less = failure.",
      "3 successes = stable (0 HP, unconscious). 3 failures = dead.",
      "Nat 1 = 2 failures. Nat 20 = regain 1 HP.",
      "Taking any damage = 1 failure. Taking a crit = 2 failures.",
      "Another creature using the Help action (Medicine check DC 10) = stable.",
    ],
    "Concentration": [
      "Only one concentration spell at a time. New one drops the old one.",
      "Taking damage: CON save DC = max(10, half damage taken).",
      "Incapacitated or killed: concentration drops immediately.",
      "Spells tagged [concentration] in spell description.",
    ],
    "Conditions": CONDITIONS.map((c) => `${c}: ${CONDITION_RULES[c]}`),
    "Advantage / Disadv": [
      "Advantage: roll 2d20, take higher.",
      "Disadvantage: roll 2d20, take lower.",
      "They cancel out. Multiple sources of each don't stack.",
      "Nat 20 on attack = crit (regardless of modifiers). Roll damage dice twice.",
      "Nat 1 on attack = automatic miss.",
    ],
    "Exhaustion": [
      "Level 1: Disadvantage on ability checks",
      "Level 2: Speed halved",
      "Level 3: Disadvantage on attacks and saves",
      "Level 4: HP maximum halved",
      "Level 5: Speed = 0",
      "Level 6: Death",
      "Remove 1 level per long rest.",
    ],
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!session) {
    return <div className="fade-in" style={{ padding: "2rem" }}><p className="text-muted">Loading session…</p></div>;
  }

  const sessionLabel = `Session ${session.session_number}${session.title ? `: ${session.title}` : ""}`;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex" style={{
        alignItems: "center", justifyContent: "space-between",
        padding: "0.5rem 1rem", borderBottom: "1px solid var(--border)",
        background: "var(--surface)", flexShrink: 0,
      }}>
        <div className="flex" style={{ alignItems: "center", gap: "0.75rem" }}>
          <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--gold)" }}>
            ⚔️ {sessionLabel}
          </span>
          {combatActive && (
            <span className="badge badge-progress" style={{ fontSize: "0.7rem" }}>
              Round {round}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/sessions/${sessionId}/run`}
            style={{ fontSize: "0.75rem", color: "var(--muted)" }}
          >
            Full Runbook →
          </Link>
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.75rem" }}
            onClick={() => navigate(-1)}
          >
            ← Back
          </button>
        </div>
      </div>

      {/* ── Three-panel body ────────────────────────────────────────────── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "280px 1fr 320px",
        flex: 1,
        overflow: "hidden",
        minHeight: 0,
      }}>

        {/* ── LEFT: Party Tracker ─────────────────────────────────────── */}
        <div style={{
          borderRight: "1px solid var(--border)",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 0,
        }}>
          <div style={{
            padding: "0.6rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            fontSize: "0.7rem",
            fontWeight: 700,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: "var(--surface2)",
          }}>
            Party — {party.length} PCs
          </div>

          {party.length === 0 && (
            <p className="text-muted" style={{ padding: "1rem", fontSize: "0.85rem" }}>
              No characters found.{" "}
              <Link to={`/campaigns/${adventure?.campaign_id}/characters`} style={{ color: "var(--gold)" }}>
                Add characters
              </Link>{" "}
              or set attending PCs on the session.
            </p>
          )}

          {party.map((pc) => {
            const mod = abilityMod;
            const pb = profBonus(pc.level);
            const pp = passivePerception(pc.score_wis, pb);
            const pcConditions = conditions[pc.id] ?? new Set<Condition>();
            const isUnconcious = pc.hp_current <= 0;

            return (
              <div
                key={pc.id}
                style={{
                  padding: "0.65rem 0.75rem",
                  borderBottom: "1px solid var(--border)",
                  background: isUnconcious ? "rgba(244,67,54,0.07)" : "transparent",
                }}
              >
                {/* Name + class/level */}
                <div className="flex" style={{ justifyContent: "space-between", marginBottom: "0.3rem" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "0.9rem", color: isUnconcious ? "var(--crimson2)" : "var(--gold)" }}>
                      {pc.character_name}
                    </span>
                    {pc.player_name && (
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)", marginLeft: "0.4rem" }}>
                        ({pc.player_name})
                      </span>
                    )}
                    <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                      {[pc.race, pc.character_class, `Lvl ${pc.level}`].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.72rem", color: "var(--muted)" }}>
                    <div>AC <strong style={{ color: "var(--text)" }}>{pc.ac}</strong></div>
                    <div>PP <strong style={{ color: "var(--text)" }}>{pp}</strong></div>
                  </div>
                </div>

                {/* HP bar */}
                <HpEditor
                  hp={pc.hp_current}
                  maxHp={pc.hp_max}
                  onSave={(n) => saveHp(pc.id, n)}
                  saving={savingHp[pc.id] ?? false}
                />

                {/* Ability scores compact */}
                <div className="flex" style={{ gap: "0.3rem", marginTop: "0.4rem", flexWrap: "wrap" }}>
                  {(["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const).map((stat, i) => {
                    const scores = [pc.score_str, pc.score_dex, pc.score_con, pc.score_int, pc.score_wis, pc.score_cha];
                    const m = mod(scores[i]);
                    return (
                      <div key={stat} style={{
                        background: "var(--surface2)", borderRadius: 4,
                        padding: "0.1rem 0.3rem", textAlign: "center", minWidth: 30,
                      }}>
                        <div style={{ fontSize: "0.55rem", color: "var(--muted)" }}>{stat}</div>
                        <div style={{ fontSize: "0.7rem", fontWeight: 700 }}>
                          {m >= 0 ? "+" : ""}{m}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Conditions */}
                <div style={{ marginTop: "0.4rem" }}>
                  <ConditionTags
                    active={pcConditions}
                    onToggle={(c) => toggleCondition(pc.id, c)}
                  />
                </div>

                {/* Spell slots */}
                <SpellSlotTracker
                  cls={pc.character_class}
                  level={pc.level}
                  pcId={pc.id}
                  slots={spellSlots}
                  onToggle={toggleSlot}
                />
              </div>
            );
          })}
        </div>

        {/* ── CENTER: Scene Navigator ───────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{
            padding: "0.6rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            fontSize: "0.7rem",
            fontWeight: 700,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: "var(--surface2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>Scene Navigator</span>
            {scenes.length > 0 && (
              <span style={{ fontWeight: 400 }}>
                {sceneIdx + 1} / {scenes.length}
              </span>
            )}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "1rem" }}>
            {!runbook && (
              <div style={{ color: "var(--muted)", textAlign: "center", marginTop: "2rem" }}>
                <p>No runbook generated yet.</p>
                <Link
                  to={`/sessions/${sessionId}/run`}
                  className="btn btn-secondary"
                  style={{ display: "inline-block", marginTop: "0.5rem" }}
                >
                  Generate Runbook →
                </Link>
              </div>
            )}

            {runbook && scenes.length === 0 && (
              <div>
                <h3 style={{ marginBottom: "0.75rem" }}>Opening Scene</h3>
                <p style={{ fontSize: "0.9rem", lineHeight: 1.6, color: "var(--muted)" }}>
                  {runbook.opening_scene}
                </p>
              </div>
            )}

            {currentScene && (
              <div>
                {/* Scene tabs */}
                <div className="flex" style={{ gap: "0.3rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  {scenes.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setSceneIdx(i)}
                      className={`btn ${i === sceneIdx ? "btn-primary" : "btn-ghost"}`}
                      style={{ fontSize: "0.7rem", padding: "0.2rem 0.6rem" }}
                    >
                      {i + 1}. {s.title.length > 20 ? s.title.slice(0, 19) + "…" : s.title}
                    </button>
                  ))}
                </div>

                <h2 style={{ marginBottom: "0.3rem", fontSize: "1.1rem", color: "var(--gold)" }}>
                  {currentScene.title}
                </h2>
                {currentScene.estimated_minutes > 0 && (
                  <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
                    ~{currentScene.estimated_minutes} min
                  </p>
                )}

                {/* Read aloud */}
                <div style={{
                  background: "rgba(212,185,120,0.08)",
                  border: "1px solid var(--gold)",
                  borderLeft: "4px solid var(--gold)",
                  borderRadius: 6,
                  padding: "0.75rem 1rem",
                  marginBottom: "1rem",
                }}>
                  <div style={{ fontSize: "0.65rem", color: "var(--gold)", fontWeight: 700, marginBottom: "0.3rem", textTransform: "uppercase" }}>
                    Read Aloud
                  </div>
                  <p style={{ fontSize: "0.9rem", lineHeight: 1.7, fontStyle: "italic" }}>
                    {currentScene.read_aloud}
                  </p>
                </div>

                {/* DM Notes */}
                {currentScene.dm_notes && (
                  <div style={{
                    background: "rgba(108,71,255,0.07)",
                    border: "1px solid #5a3a9a",
                    borderLeft: "4px solid #5a3a9a",
                    borderRadius: 6,
                    padding: "0.75rem 1rem",
                    marginBottom: "1rem",
                  }}>
                    <div style={{ fontSize: "0.65rem", color: "#9575cd", fontWeight: 700, marginBottom: "0.3rem", textTransform: "uppercase" }}>
                      DM Notes
                    </div>
                    <p style={{ fontSize: "0.85rem", lineHeight: 1.6 }}>
                      {currentScene.dm_notes}
                    </p>
                  </div>
                )}

                {/* Prev / Next */}
                <div className="flex gap-2" style={{ marginTop: "1rem" }}>
                  <button
                    className="btn btn-ghost"
                    disabled={sceneIdx === 0}
                    onClick={() => setSceneIdx((i) => i - 1)}
                  >
                    ← Prev Scene
                  </button>
                  <button
                    className="btn btn-secondary"
                    disabled={sceneIdx === scenes.length - 1}
                    onClick={() => setSceneIdx((i) => i + 1)}
                  >
                    Next Scene →
                  </button>
                </div>
              </div>
            )}

            {/* NPC dialog quick view */}
            {runbook?.npc_dialog && runbook.npc_dialog.length > 0 && (
              <div style={{ marginTop: "1.5rem" }}>
                <div style={{
                  fontSize: "0.7rem", fontWeight: 700, color: "var(--muted)",
                  textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem",
                }}>
                  NPC Dialog Hooks
                </div>
                {runbook.npc_dialog.map((npc, i) => (
                  <details key={i} style={{ marginBottom: "0.5rem" }}>
                    <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--gold)", fontWeight: 600 }}>
                      {npc.npc_name}
                    </summary>
                    <ul style={{ margin: "0.3rem 0 0 1rem", padding: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
                      {npc.lines.map((l, j) => <li key={j} style={{ fontStyle: "italic", marginBottom: "0.2rem" }}>"{l}"</li>)}
                      {npc.improv_hooks.map((h, j) => <li key={`h${j}`} style={{ marginBottom: "0.2rem" }}>💡 {h}</li>)}
                    </ul>
                  </details>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Combat Tracker ─────────────────────────────────────── */}
        <div style={{
          borderLeft: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "0.6rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            fontSize: "0.7rem",
            fontWeight: 700,
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            background: "var(--surface2)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span>Combat {combatActive ? `· Round ${round}` : ""}</span>
            <div className="flex gap-1">
              {combatActive && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem" }}
                  onClick={nextTurn}
                >
                  End Turn →
                </button>
              )}
              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem" }}
                onClick={rollAllInitiative}
              >
                🎲 Roll Init
              </button>
            </div>
          </div>

          {/* Load Encounter */}
          {adventureEncounters.length > 0 && (
            <div style={{
              padding: "0.4rem 0.75rem",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface2)",
              display: "flex",
              gap: "0.4rem",
              alignItems: "center",
            }}>
              <select
                value={loadEncounterId}
                onChange={(e) => setLoadEncounterId(e.target.value)}
                style={{ flex: 1, fontSize: "0.72rem" }}
              >
                <option value="">Load Encounter…</option>
                {adventureEncounters.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.difficulty})
                  </option>
                ))}
              </select>
              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem", whiteSpace: "nowrap" }}
                disabled={!loadEncounterId}
                onClick={loadEncounter}
              >
                ⚔️ Load
              </button>
            </div>
          )}

          {/* Add combatant form */}
          <div style={{
            padding: "0.5rem 0.75rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface2)",
          }}>
            <div className="flex gap-1" style={{ flexWrap: "wrap" }}>
              <input
                placeholder="Name"
                value={newCName}
                onChange={(e) => setNewCName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCombatant()}
                style={{ flex: 2, minWidth: 80, fontSize: "0.75rem" }}
              />
              <select
                value={newCType}
                onChange={(e) => setNewCType(e.target.value as "pc" | "monster" | "npc")}
                style={{ flex: 1, minWidth: 70, fontSize: "0.75rem" }}
              >
                <option value="monster">Monster</option>
                <option value="npc">NPC</option>
                <option value="pc">PC</option>
              </select>
            </div>
            <div className="flex gap-1" style={{ marginTop: "0.3rem" }}>
              <input
                type="number"
                placeholder="HP"
                value={newCHp}
                onChange={(e) => { setNewCHp(Number(e.target.value)); setNewCHpMax(Number(e.target.value)); }}
                style={{ width: 52, fontSize: "0.75rem" }}
              />
              <input
                type="number"
                placeholder="AC"
                value={newCAc}
                onChange={(e) => setNewCAc(Number(e.target.value))}
                style={{ width: 48, fontSize: "0.75rem" }}
              />
              <input
                type="number"
                placeholder="Init"
                value={newCInit}
                onChange={(e) => setNewCInit(Number(e.target.value))}
                style={{ width: 48, fontSize: "0.75rem" }}
              />
              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                onClick={addCombatant}
              >
                + Add
              </button>
            </div>
          </div>

          {/* Combatant list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {combatants.map((c, i) => {
              const isActive = combatActive && i === currentTurn;
              const pct = c.maxHp > 0 ? Math.max(0, (c.hp / c.maxHp) * 100) : 0;
              const barColor = pct > 50 ? "#4caf50" : pct > 25 ? "#ff9800" : "#f44336";
              const typeColor = c.type === "pc" ? "var(--gold)" : c.type === "npc" ? "#64b5f6" : "#ef5350";

              return (
                <div
                  key={c.id}
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--border)",
                    background: isActive
                      ? "rgba(212,185,120,0.1)"
                      : c.defeated
                        ? "rgba(0,0,0,0.2)"
                        : "transparent",
                    opacity: c.defeated ? 0.5 : 1,
                  }}
                >
                  <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div className="flex" style={{ alignItems: "center", gap: "0.3rem" }}>
                        {isActive && <span style={{ color: "var(--gold)", fontSize: "0.8rem" }}>▶</span>}
                        <span style={{ fontWeight: 700, fontSize: "0.82rem", color: typeColor }}>
                          {c.name}
                        </span>
                        <span style={{ fontSize: "0.65rem", color: "var(--muted)" }}>
                          init {c.initiative} · AC {c.ac}
                        </span>
                      </div>

                      {/* HP row */}
                      <div className="flex" style={{ alignItems: "center", gap: "0.3rem", marginTop: "0.2rem" }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0 0.3rem", fontSize: "0.7rem" }}
                          onClick={() => updateCombatantHp(c.id, c.hp - 1)}
                          disabled={c.defeated}
                        >−</button>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: barColor, minWidth: 28 }}>
                          {c.hp}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>/{c.maxHp}</span>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0 0.3rem", fontSize: "0.7rem" }}
                          onClick={() => updateCombatantHp(c.id, c.hp + 1)}
                          disabled={c.defeated}
                        >+</button>
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--surface2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.2s" }} />
                        </div>
                      </div>

                      {/* Conditions */}
                      <div style={{ marginTop: "0.2rem" }}>
                        <ConditionTags
                          active={c.conditions}
                          onToggle={(cond) => toggleCombatantCondition(c.id, cond)}
                        />
                      </div>
                    </div>

                    {/* Remove */}
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: "0.6rem", padding: "0.1rem 0.3rem", opacity: 0.4 }}
                      onClick={() => removeCombatant(c.id)}
                      title="Remove from tracker"
                    >✕</button>
                  </div>
                </div>
              );
            })}

            {combatants.length === 0 && (
              <p style={{ padding: "1rem", fontSize: "0.8rem", color: "var(--muted)" }}>
                Add combatants above, then roll initiative.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom bar: Dice + Quick Rules ────────────────────────────── */}
      <div style={{
        borderTop: "1px solid var(--border)",
        background: "var(--surface2)",
        padding: "0.5rem 1rem",
        flexShrink: 0,
        display: "flex",
        gap: "2rem",
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}>

        {/* Dice roller */}
        <div>
          <div className="flex" style={{ gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
              Dice
            </span>
            {DICE.map((d) => (
              <button
                key={d}
                className="btn btn-ghost"
                style={{
                  fontSize: "0.75rem", padding: "0.2rem 0.5rem",
                  fontWeight: 700, color: "var(--gold)",
                  border: "1px solid var(--gold)",
                }}
                onClick={() => rollDie(d)}
              >
                d{d}
              </button>
            ))}
            {diceLog.length > 0 && (
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "0.5rem" }}>
                {diceLog.map((r, i) => (
                  <span key={i} style={{ marginRight: "0.5rem" }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.65rem" }}>d{r.die}:</span>
                    {" "}
                    <strong style={{ color: r.result === r.die ? "#4caf50" : r.result === 1 ? "#f44336" : "var(--text)" }}>
                      {r.result}
                    </strong>
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>

        {/* Quick rules */}
        <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontWeight: 700, textTransform: "uppercase" }}>
            Rules
          </span>
          {Object.entries(QUICK_RULES).map(([title, rules]) => (
            <div key={title} style={{ position: "relative" }}>
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                onClick={() => setRulesOpen(rulesOpen === title ? null : title)}
              >
                {title} {rulesOpen === title ? "▲" : "▾"}
              </button>
              {rulesOpen === title && (
                <div style={{
                  position: "absolute", bottom: "110%", left: 0, zIndex: 60,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: 8, padding: "0.75rem 1rem",
                  maxWidth: 360, maxHeight: 280, overflowY: "auto",
                  boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
                  fontSize: "0.78rem", lineHeight: 1.6,
                }}>
                  <div style={{
                    fontWeight: 700, color: "var(--gold)",
                    marginBottom: "0.5rem", fontSize: "0.8rem",
                  }}>
                    {title}
                  </div>
                  {rules.map((r, i) => (
                    <div key={i} style={{ marginBottom: "0.4rem", color: "var(--muted)" }}>
                      {r}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
