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
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { encountersApi } from "../api/encounters";
import { npcsApi } from "../api/npcs";
import TonightsCastDrawer from "../components/tonights-cast/TonightsCastDrawer";
import EditableRunbookText from "../components/runbook/EditableRunbookText";
import TableRollStrip from "../components/dice-tray/TableRollStrip";
import { monstersApi } from "../api/monsters";
import { restApi } from "../api/rest";
import { spellcastingApi } from "../api/spellcasting";
import BriefPanel from "../components/brief/BriefPanel";
import CharacterSheet from "../components/character-sheet/CharacterSheet";
import PlayerLinkButton from "../components/character-sheet/PlayerLinkButton";
import DmScreen from "../components/dm-screen/DmScreen";
import LootPanel from "../components/LootPanel";
import TableConsole from "../components/table/TableConsole";
import { useEventStream, type StreamEvent } from "../hooks/useEventStream";
import MonsterStatBlock from "../components/MonsterStatBlock";
import { useInitiativeStore } from "../stores/useInitiativeStore";
import CombatBeatsPanel from "../components/combat-beats/CombatBeatsPanel";
import type {
  Combatant,
  PlayerCharacter,
  RunbookScene,
  Encounter,
  RosterEntry,
  SessionCombatant,
} from "../api/types";

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
  /** Lowercase condition names the target is immune to (from monster stat block). */
  immunities?: Set<string>;
}

function ConditionTags({ active, onToggle, immunities }: ConditionTagsProps) {
  const [open, setOpen] = useState(false);
  const [tooltip, setTooltip] = useState<Condition | null>(null);

  function isImmune(c: Condition): boolean {
    return !!immunities && immunities.has(c.toLowerCase());
  }

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
          {CONDITIONS.map((c) => {
            const immune = isImmune(c);
            return (
              <button
                key={c}
                onClick={() => { onToggle(c); setOpen(false); }}
                title={immune ? `Target is immune to ${c}. Click to apply anyway.` : CONDITION_RULES[c]}
                style={{
                  background: active.has(c) ? CONDITION_COLOR[c] : "var(--surface2)",
                  color: active.has(c) ? "#fff" : immune ? "var(--muted)" : "var(--text)",
                  border: `1px solid ${immune ? "var(--border)" : CONDITION_COLOR[c]}`,
                  borderRadius: 4, padding: "0.15rem 0.45rem",
                  fontSize: "0.7rem", cursor: "pointer",
                  opacity: immune && !active.has(c) ? 0.45 : 1,
                  textDecoration: immune && !active.has(c) ? "line-through" : "none",
                }}
              >
                {c}
                {immune && !active.has(c) ? " 🛡" : ""}
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
        gap: "0.1rem",
        fontSize: "0.6rem",
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
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
    <div style={{ marginTop: "0.3rem" }}>
      <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.2rem" }}>
        Spell Slots
      </div>
      <div className="flex" style={{ flexWrap: "wrap", gap: "0.3rem" }}>
        {levels.map((lvl) => {
          const s = state.levels[String(lvl)];
          return (
            <div
              key={lvl}
              style={{ display: "flex", alignItems: "center", gap: "0.15rem" }}
            >
              <span style={{ fontSize: "0.6rem", color: "var(--muted)", minWidth: 10 }}>
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
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      border: "1px solid var(--gold)",
                      background: filled ? "var(--gold)" : "transparent",
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
  }

  // ── Scene navigator ────────────────────────────────────────────────────────
  const [sceneIdx, setSceneIdx] = useState(0);
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
  const advanceTurn = useInitiativeStore((s) => s.nextTurn);
  const resetCombat = useInitiativeStore((s) => s.reset);
  const addPersistedCombatant = useInitiativeStore((s) => s.addCombatant);
  const removePersistedCombatant = useInitiativeStore((s) => s.removeCombatant);
  const setPersistedInitiative = useInitiativeStore((s) => s.setInitiative);

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

  function updateCombatantHp(id: string, newHp: number) {
    const target = persistedCombatants.find((c) => c.id === id);
    if (!target) return;
    const clamped = Math.min(target.hp_max, Math.max(0, newHp));
    void patchPersistedCombatant(id, { hp_current: clamped });
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
        `⛺ Short rest applied to ${total} PC${total === 1 ? "" : "s"} · ` +
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
        `🌙 Long rest applied to ${total} PC${total === 1 ? "" : "s"} · ` +
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
    "Exhaustion (2024)": [
      "0–6 scale. Each level applies a cumulative −2 to ALL D20 Tests",
      "(attack rolls, ability checks, saving throws).",
      "Level 6 = death. Long rest reduces by 1.",
      "Common triggers: forced march, going without food/water, failed CON",
      "save vs harmful effect, certain spells (Ray of Sickness).",
      "Note: 2024 rules — different from 2014's per-level distinct effects.",
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
        flexWrap: "wrap", gap: "0.4rem",
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
        <div className="flex gap-2" style={{ alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            onClick={() => {
              if (
                window.confirm(
                  "⛺ Short rest the whole party? This restores short-rest features (Action Surge, Channel Divinity, etc.) and Warlock pact slots for every attending PC.",
                )
              ) {
                shortRestParty.mutate();
              }
            }}
            disabled={shortRestParty.isPending}
            title="Apply a short rest to every attending PC"
          >
            ⛺ Short rest
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            onClick={() => {
              if (
                window.confirm(
                  "🌙 Long rest the whole party? This restores all class features, all spell slots, and HP to max for every attending PC.",
                )
              ) {
                longRestParty.mutate();
              }
            }}
            disabled={longRestParty.isPending}
            title="Apply a long rest to every attending PC"
          >
            🌙 Long rest
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            onClick={() => setDmScreenOpen(true)}
            title="Open the DM rules reference"
          >
            📖 DM Screen
          </button>
          {sessionId && adventure && (
            <TableConsole
              sessionId={sessionId}
              campaignId={adventure.campaign_id}
              party={party}
            />
          )}
          {sessionId && <BriefPanel sessionId={sessionId} />}
          <button
            className="btn btn-secondary"
            style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
            onClick={() => setLootOpen(true)}
            title="Hand out a magic item to a PC"
            disabled={!adventure}
          >
            💰 Loot
          </button>
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

      {/* Rest toast (auto-dismisses after 5s) */}
      {restToast && (
        <div
          style={{
            position: "fixed",
            top: "4rem",
            right: "1rem",
            background: "var(--surface)",
            border: "1px solid var(--gold)",
            color: "var(--text)",
            padding: "0.6rem 0.9rem",
            borderRadius: 6,
            zIndex: 250,
            maxWidth: 380,
            fontSize: "0.85rem",
            boxShadow: "0 4px 18px rgba(0,0,0,0.5)",
          }}
        >
          {restToast}
        </div>
      )}

      {/* ── Three-panel body (CSS stacks + scrolls it below 820px) ─────────── */}
      <div className="ql-hud-body" style={{
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
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <button
                      onClick={() => setSheetPcId(pc.id)}
                      title="Open full character sheet"
                      style={{
                        background: "transparent",
                        border: "none",
                        padding: 0,
                        cursor: "pointer",
                        color: isUnconcious ? "var(--crimson2)" : "var(--gold)",
                        fontWeight: 700,
                        fontSize: "0.9rem",
                        fontFamily: "inherit",
                        textAlign: "left",
                        textDecoration: "underline dotted",
                        textUnderlineOffset: 3,
                      }}
                    >
                      {pc.character_name}
                    </button>
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
                    <div style={{ marginTop: "0.2rem" }}>
                      <PlayerLinkButton characterId={pc.id} compact />
                    </div>
                  </div>
                </div>

                {/* Plan 23 — combat-state status icons */}
                <PcStatusIcons pc={pc} />

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

                {/* Spell slots — persistent, reads from Plan 20 store */}
                <SpellSlotTracker pcId={pc.id} />
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
          {/* Plan 39 — public dice roller; broadcasts to player phones */}
          {sessionId && <TableRollStrip sessionId={sessionId} />}
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
            <div
              style={{
                display: "flex",
                gap: "0.35rem",
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              {combatActive && (
                <button
                  className="btn btn-primary"
                  style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem", fontWeight: 700 }}
                  onClick={nextTurn}
                  title="Advance to the next combatant's turn"
                >
                  End Turn →
                </button>
              )}
              <button
                className="btn btn-secondary"
                style={{ fontSize: "0.65rem", padding: "0.2rem 0.55rem" }}
                onClick={rollAllInitiative}
              >
                🎲 Roll Init
              </button>
              {combatActive && (
                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.7rem", padding: "0.2rem 0.55rem", fontWeight: 600 }}
                  onClick={() => {
                    if (window.confirm("End combat? Clears the initiative tracker and resets the round counter.")) {
                      void resetCombat();
                    }
                  }}
                  title="End combat — clears the initiative tracker"
                >
                  🛑 End Combat
                </button>
              )}
            </div>
          </div>

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

          {/* Add combatant form — grid layout so inputs grow with the column */}
          <div
            style={{
              padding: "0.5rem 0.75rem",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface2)",
              display: "flex",
              flexDirection: "column",
              gap: "0.35rem",
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
                style={{ fontSize: "0.72rem", padding: "0.2rem 0.35rem", minWidth: 0 }}
                title="Pre-fill the form from a campaign PC or NPC"
              >
                <option value="">+ Add from roster…</option>
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
                placeholder="Name"
                value={newCName}
                onChange={(e) => setNewCName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCombatant()}
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.4rem", minWidth: 0 }}
              />
              <select
                value={newCType}
                onChange={(e) =>
                  setNewCType(e.target.value as "pc" | "monster" | "npc")
                }
                style={{ fontSize: "0.78rem", padding: "0.25rem 0.3rem", minWidth: 0 }}
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
              <FormField label="HP">
                <input
                  type="number"
                  value={newCHp}
                  onChange={(e) => {
                    setNewCHp(Number(e.target.value));
                    setNewCHpMax(Number(e.target.value));
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.35rem",
                    textAlign: "center",
                  }}
                />
              </FormField>
              <FormField label="AC">
                <input
                  type="number"
                  value={newCAc}
                  onChange={(e) => setNewCAc(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.35rem",
                    textAlign: "center",
                  }}
                />
              </FormField>
              <FormField label="Init">
                <input
                  type="number"
                  value={newCInit}
                  onChange={(e) => setNewCInit(Number(e.target.value))}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    minWidth: 0,
                    fontSize: "0.78rem",
                    padding: "0.2rem 0.35rem",
                    textAlign: "center",
                  }}
                />
              </FormField>
              <button
                className="btn btn-secondary"
                style={{
                  fontSize: "0.72rem",
                  padding: "0.3rem 0.65rem",
                  whiteSpace: "nowrap",
                  alignSelf: "end",
                }}
                onClick={addCombatant}
                title="Add to initiative tracker"
              >
                + Add
              </button>
            </div>
          </div>

          {/* Combatant list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {combatants.map((c) => {
              // Plan 38 P4-2 — match by id since combatants is now sorted
              // by initiative desc (which can differ from sort_index).
              const isActive = combatActive && c.id === storeActiveId;
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
                        <span style={{ fontSize: "0.65rem", color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                          init
                          {/* Plan 38 P4-2 — click-to-edit initiative; PATCH on blur/Enter. */}
                          <input
                            type="number"
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
                              width: 36,
                              fontSize: "0.65rem",
                              padding: "0 0.2rem",
                              textAlign: "center",
                              background: "var(--surface2)",
                              border: "1px solid var(--border)",
                              borderRadius: 3,
                              color: "var(--muted)",
                            }}
                            title="Edit initiative — Enter or click out to save"
                          />
                          · AC {c.ac}
                        </span>
                      </div>

                      {/* HP row — typed amount drives the −/+ buttons (Plan 38) */}
                      <div className="flex" style={{ alignItems: "center", gap: "0.25rem", marginTop: "0.2rem" }}>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0 0.35rem", fontSize: "0.75rem", color: "var(--red, #ef5350)", fontWeight: 700 }}
                          onClick={() => updateCombatantHp(c.id, c.hp - deltaFor(c.id))}
                          disabled={c.defeated}
                          title={`Apply ${deltaFor(c.id)} damage`}
                        >−</button>
                        <input
                          type="number"
                          min={1}
                          value={deltaFor(c.id)}
                          onChange={(e) => setDeltaFor(c.id, Number(e.target.value))}
                          onFocus={(e) => e.currentTarget.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updateCombatantHp(c.id, c.hp - deltaFor(c.id));
                          }}
                          style={{
                            width: 38,
                            fontSize: "0.7rem",
                            padding: "0.1rem 0.2rem",
                            textAlign: "center",
                          }}
                          title="Damage/heal amount (Enter applies damage)"
                        />
                        <button
                          className="btn btn-ghost"
                          style={{ padding: "0 0.35rem", fontSize: "0.75rem", color: "var(--green2, #4caf50)", fontWeight: 700 }}
                          onClick={() => updateCombatantHp(c.id, c.hp + deltaFor(c.id))}
                          disabled={c.defeated}
                          title={`Apply ${deltaFor(c.id)} healing`}
                        >+</button>
                        <span style={{ fontSize: "0.8rem", fontWeight: 700, color: barColor, minWidth: 28, marginLeft: "0.2rem" }}>
                          {c.hp}
                        </span>
                        <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>/{c.maxHp}</span>
                        <div style={{ flex: 1, height: 5, borderRadius: 3, background: "var(--surface2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: barColor, transition: "width 0.2s" }} />
                        </div>
                      </div>

                      {/* Conditions */}
                      <div style={{ marginTop: "0.2rem" }}>
                        <ConditionTags
                          active={c.conditions}
                          onToggle={(cond) => toggleCombatantCondition(c.id, cond)}
                          immunities={
                            c.monsterId ? immunitiesByMonsterId[c.monsterId] : undefined
                          }
                        />
                      </div>
                    </div>

                    {/* Stat block (monsters only) */}
                    {c.monsterId && (
                      <button
                        className="btn btn-ghost"
                        style={{ fontSize: "0.7rem", padding: "0.1rem 0.3rem", marginRight: "0.2rem" }}
                        onClick={() => setStatBlockMonsterId(c.monsterId)}
                        title="View stat block"
                      >
                        📖
                      </button>
                    )}

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
              borderRadius: 8,
              border: "1px solid var(--border)",
              padding: "1rem",
              position: "relative",
            }}
          >
            <button
              onClick={() => setLootOpen(false)}
              style={{
                position: "absolute",
                top: "0.5rem",
                right: "0.6rem",
                background: "transparent",
                border: "none",
                color: "var(--muted)",
                fontSize: "1.2rem",
                cursor: "pointer",
              }}
              title="Close"
            >
              ✕
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
        <StatusBadge
          color="var(--green2, #4caf50)"
          title={`Temp HP +${tempHp}`}
        >
          🛡 +{tempHp}
        </StatusBadge>
      )}
      {insp && (
        <StatusBadge color="var(--gold)" title="Heroic Inspiration available">
          ✨ Insp
        </StatusBadge>
      )}
      {conc && (
        <StatusBadge
          color="var(--green2, #4caf50)"
          title={`Concentrating on: ${conc}`}
        >
          🌀 {conc}
        </StatusBadge>
      )}
      {dying && (
        <StatusBadge
          color="var(--red, #ef5350)"
          title={`Death saves: ${pc.death_save_successes ?? 0}✓ / ${pc.death_save_failures ?? 0}✗`}
        >
          💀 {pc.death_save_successes ?? 0}✓/{pc.death_save_failures ?? 0}✗
        </StatusBadge>
      )}
      {exhaustion > 0 && (
        <StatusBadge
          color={exhaustion >= 6 ? "var(--red, #ef5350)" : "var(--crimson2, #8b1a1a)"}
          title={
            exhaustion >= 6
              ? "Exhaustion 6 — dead"
              : `Exhaustion ${exhaustion} (${exhaustion * -2} to D20 Tests)`
          }
        >
          😵 {exhaustion}
        </StatusBadge>
      )}
    </div>
  );
}

function StatusBadge({
  color,
  title,
  children,
}: {
  color: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span
      title={title}
      style={{
        fontSize: "0.65rem",
        fontWeight: 600,
        padding: "0.12rem 0.4rem",
        borderRadius: 10,
        background: "var(--surface2)",
        border: `1px solid ${color}`,
        color,
        whiteSpace: "nowrap",
        maxWidth: 160,
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {children}
    </span>
  );
}
