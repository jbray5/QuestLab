import { useEffect, useMemo, useState } from "react";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type CombatBeat,
  type CombatBeatCreate,
  beatStatus,
  combatBeatsApi,
} from "../../api/combatBeats";

/**
 * Combat-beats panel for the SessionHud combat tracker (Plan 40 Change 3).
 *
 * Surfaces three things, in priority order:
 *   1. **Fired beats banner** — beats whose trigger condition has fired
 *      but the DM hasn't dismissed yet. Top of the panel, gold accent.
 *      Dismiss (acknowledge & remove) or Reset (re-arm).
 *   2. **Attach UI** — two collapsible forms to author a new beat:
 *      "HP beat" (combatant picker + HP threshold + text) or
 *      "Round beat" (round threshold + text).
 *   3. **Pending list** — all armed beats not yet fired. Inline delete.
 *
 * The **auto-fire watcher** is a useEffect that observes the combatants'
 * HP and the current round and POSTs to /fire for any pending beat whose
 * trigger condition is now met. Idempotent on the server side, so even
 * if the effect runs twice we're safe.
 */
interface CombatantShape {
  id: string;
  name: string;
  hp_current: number;
}

interface Props {
  sessionId: string;
  combatants: CombatantShape[];
  round: number;
}

export default function CombatBeatsPanel({ sessionId, combatants, round }: Props) {
  const qc = useQueryClient();

  const { data: beats = [] } = useQuery({
    queryKey: ["combat-beats", sessionId],
    queryFn: () => combatBeatsApi.list(sessionId),
    refetchOnWindowFocus: false,
  });

  const fireMutation = useMutation({
    mutationFn: (beatId: string) => combatBeatsApi.fire(beatId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["combat-beats", sessionId] }),
  });
  const dismissMutation = useMutation({
    mutationFn: (beatId: string) => combatBeatsApi.dismiss(beatId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["combat-beats", sessionId] }),
  });
  const resetMutation = useMutation({
    mutationFn: (beatId: string) => combatBeatsApi.reset(beatId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["combat-beats", sessionId] }),
  });
  const deleteMutation = useMutation({
    mutationFn: (beatId: string) => combatBeatsApi.delete(beatId),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["combat-beats", sessionId] }),
  });
  const createMutation = useMutation({
    mutationFn: (body: CombatBeatCreate) =>
      combatBeatsApi.create(sessionId, body),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["combat-beats", sessionId] }),
  });

  // ── Auto-fire watcher ───────────────────────────────────────────────
  // Maps combatant_id -> current HP for O(1) lookup, and recomputes only
  // when the relevant inputs change.
  const combatantHp = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of combatants) m[c.id] = c.hp_current;
    return m;
  }, [combatants]);

  useEffect(() => {
    if (beats.length === 0) return;
    const toFire: string[] = [];
    for (const b of beats) {
      if (b.fired_at !== null) continue; // already fired or dismissed
      if (b.trigger_kind === "hp_lte") {
        if (!b.combatant_id) continue;
        const hp = combatantHp[b.combatant_id];
        if (hp === undefined) continue; // combatant no longer in tracker
        if (hp <= b.trigger_value) toFire.push(b.id);
      } else if (b.trigger_kind === "round_gte") {
        if (round >= b.trigger_value) toFire.push(b.id);
      }
    }
    if (toFire.length === 0) return;
    // Fire each in parallel; the server is idempotent on fired_at.
    Promise.all(toFire.map((id) => fireMutation.mutateAsync(id))).catch(
      () => {
        // Swallow — we'll retry on next state change.
      },
    );
    // We deliberately do NOT depend on fireMutation here; including it
    // would cause a re-run loop. Mutate is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beats, combatantHp, round]);

  // ── Buckets for rendering ───────────────────────────────────────────
  const fired = useMemo(
    () => beats.filter((b) => beatStatus(b) === "fired"),
    [beats],
  );
  const pending = useMemo(
    () => beats.filter((b) => beatStatus(b) === "pending"),
    [beats],
  );

  // ── Attach forms ────────────────────────────────────────────────────
  const [showHpForm, setShowHpForm] = useState(false);
  const [showRoundForm, setShowRoundForm] = useState(false);
  const [hpCombatant, setHpCombatant] = useState("");
  const [hpValue, setHpValue] = useState<number | "">(5);
  const [hpText, setHpText] = useState("");
  const [roundValue, setRoundValue] = useState<number | "">(5);
  const [roundText, setRoundText] = useState("");

  function submitHp() {
    if (!hpCombatant || hpText.trim().length === 0 || hpValue === "") return;
    createMutation.mutate(
      {
        combatant_id: hpCombatant,
        trigger_kind: "hp_lte",
        trigger_value: Number(hpValue),
        text: hpText.trim(),
      },
      {
        onSuccess: () => {
          setHpText("");
          setShowHpForm(false);
        },
      },
    );
  }
  function submitRound() {
    if (roundText.trim().length === 0 || roundValue === "") return;
    createMutation.mutate(
      {
        combatant_id: null,
        trigger_kind: "round_gte",
        trigger_value: Number(roundValue),
        text: roundText.trim(),
      },
      {
        onSuccess: () => {
          setRoundText("");
          setShowRoundForm(false);
        },
      },
    );
  }

  if (beats.length === 0 && !showHpForm && !showRoundForm) {
    // Compact placeholder when nothing is authored yet: what beats are, and the next step.
    return (
      <div style={emptyStyle}>
        <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text2)" }}>Beats</div>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)", lineHeight: 1.45, margin: "0.15rem 0 0.5rem" }}>
          A reminder that pops up here when a foe&rsquo;s HP drops low or a round arrives — a line to say, a
          twist to spring.
        </p>
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-ghost"
            style={addBtnStyle}
            onClick={() => setShowHpForm(true)}
            disabled={combatants.length === 0}
            title={
              combatants.length === 0
                ? "Add a combatant first"
                : "Attach a beat to a combatant's HP threshold"
            }
          >
            <Plus size={14} aria-hidden /> HP beat
          </button>
          <button
            className="btn btn-ghost"
            style={addBtnStyle}
            onClick={() => setShowRoundForm(true)}
            title="Attach a beat to a round number"
          >
            <Plus size={14} aria-hidden /> Round beat
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={panelStyle}>
      {/* Banner — fired, not dismissed */}
      {fired.length > 0 && (
        <div style={firedListStyle} role="status">
          {fired.map((b) => (
            <div key={b.id} style={firedItemStyle}>
              <div style={firedTriggerStyle}>
                {beatTriggerLabel(b, combatants)}
              </div>
              <div style={firedTextStyle}>{b.text}</div>
              <div style={firedActionsStyle}>
                <button
                  className="btn btn-ghost"
                  style={smallBtnStyle}
                  onClick={() => resetMutation.mutate(b.id)}
                  title="Re-arm so it can fire again"
                >
                  <RotateCcw size={13} aria-hidden /> Reset
                </button>
                <button
                  className="btn btn-secondary"
                  style={dismissBtnStyle}
                  onClick={() => dismissMutation.mutate(b.id)}
                  disabled={dismissMutation.isPending}
                >
                  <Check size={14} aria-hidden /> Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header + attach controls */}
      <div style={headerStyle}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text2)" }}>
          Beats
          {pending.length > 0 && (
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
              {" "}· <span className="num">{pending.length}</span> waiting
            </span>
          )}
        </span>
        <div style={{ display: "flex", gap: "0.3rem" }}>
          <button
            className="btn btn-ghost"
            style={addBtnStyle}
            onClick={() => setShowHpForm((p) => !p)}
            disabled={combatants.length === 0}
            aria-expanded={showHpForm}
            title={
              combatants.length === 0
                ? "Add a combatant first"
                : "Attach a beat to a combatant's HP threshold"
            }
          >
            {showHpForm ? <X size={13} aria-hidden /> : <Plus size={13} aria-hidden />} HP
          </button>
          <button
            className="btn btn-ghost"
            style={addBtnStyle}
            aria-expanded={showRoundForm}
            onClick={() => setShowRoundForm((p) => !p)}
            title="Attach a beat to a round number"
          >
            {showRoundForm ? <X size={13} aria-hidden /> : <Plus size={13} aria-hidden />} Round
          </button>
        </div>
      </div>

      {/* HP beat form */}
      {showHpForm && (
        <div style={formStyle}>
          <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.3rem" }}>
            <select
              value={hpCombatant}
              onChange={(e) => setHpCombatant(e.target.value)}
              aria-label="Combatant"
              style={{ ...fieldStyle, flex: 2 }}
            >
              <option value="">Who…</option>
              {combatants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", alignSelf: "center" }}>
              at or below
            </span>
            <input
              type="number"
              min={0}
              className="num"
              value={hpValue}
              onChange={(e) =>
                setHpValue(e.target.value === "" ? "" : Number(e.target.value))
              }
              aria-label="HP threshold"
              style={{ ...fieldStyle, width: 56 }}
              placeholder="HP"
            />
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", alignSelf: "center" }}>
              HP
            </span>
          </div>
          <textarea
            value={hpText}
            onChange={(e) => setHpText(e.target.value)}
            placeholder="e.g. When she's bloodied she whispers: 'help me — it's so loud — make it stop'"
            aria-label="What to say or do"
            rows={2}
            style={{ ...fieldStyle, width: "100%", marginBottom: "0.35rem" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.3rem" }}>
            <button
              className="btn btn-secondary"
              style={addBtnStyle}
              onClick={submitHp}
              disabled={
                createMutation.isPending ||
                !hpCombatant ||
                hpText.trim().length === 0 ||
                hpValue === ""
              }
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Round beat form */}
      {showRoundForm && (
        <div style={formStyle}>
          <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.3rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)", alignSelf: "center" }}>
              From round
            </span>
            <input
              type="number"
              min={1}
              className="num"
              value={roundValue}
              onChange={(e) =>
                setRoundValue(e.target.value === "" ? "" : Number(e.target.value))
              }
              aria-label="Round"
              style={{ ...fieldStyle, width: 56 }}
              placeholder="N"
            />
          </div>
          <textarea
            value={roundText}
            onChange={(e) => setRoundText(e.target.value)}
            placeholder="e.g. Wenneth is visibly weakening — her HP drops by 2 at the start of each of her turns."
            aria-label="What to say or do"
            rows={2}
            style={{ ...fieldStyle, width: "100%", marginBottom: "0.35rem" }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.3rem" }}>
            <button
              className="btn btn-secondary"
              style={addBtnStyle}
              onClick={submitRound}
              disabled={
                createMutation.isPending ||
                roundText.trim().length === 0 ||
                roundValue === ""
              }
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Pending (armed) list */}
      {pending.length > 0 && (
        <ul style={pendingListStyle}>
          {pending.map((b) => (
            <li key={b.id} style={pendingItemStyle}>
              <span style={{ fontSize: "0.75rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                {beatTriggerLabel(b, combatants)}
              </span>
              <span style={{ fontSize: "0.8125rem", color: "var(--text)", flex: 1, minWidth: 0 }}>
                {b.text}
              </span>
              <button
                onClick={() => deleteMutation.mutate(b.id)}
                style={deleteBtnStyle}
                title="Delete this beat"
                aria-label="Delete this beat"
              >
                <X size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function beatTriggerLabel(b: CombatBeat, combatants: CombatantShape[]): string {
  if (b.trigger_kind === "hp_lte") {
    const c = combatants.find((x) => x.id === b.combatant_id);
    const name = c?.name ?? "combatant gone";
    return `${name} at ${b.trigger_value} HP or less`;
  }
  return `From round ${b.trigger_value}`;
}

// ── styles (Lamplit, Plan 121) ──────────────────────────────────────────────

const emptyStyle: React.CSSProperties = {
  padding: "0.55rem 0.75rem",
  borderBottom: "1px solid var(--border)",
};

const panelStyle: React.CSSProperties = {
  borderBottom: "1px solid var(--border)",
};

const fieldStyle: React.CSSProperties = {
  fontSize: "0.8125rem",
  padding: "0.25rem 0.4rem",
};

const firedListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.4rem",
  padding: "0.5rem 0.6rem",
  borderBottom: "1px solid var(--border)",
};

// A fired beat is the live thing in this panel: lit like the current turn.
const firedItemStyle: React.CSSProperties = {
  border: "1px solid var(--accent-edge)",
  borderRadius: 10,
  padding: "0.5rem 0.65rem",
  background: "var(--accent-soft)",
};

const firedTriggerStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  fontWeight: 600,
  color: "var(--accent-text)",
  marginBottom: "0.2rem",
};

const firedTextStyle: React.CSSProperties = {
  fontSize: "0.95rem",
  color: "var(--text)",
  lineHeight: 1.45,
  marginBottom: "0.4rem",
  whiteSpace: "pre-wrap",
};

const firedActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.3rem",
  justifyContent: "flex-end",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "0.4rem 0.75rem",
  borderBottom: "1px solid var(--border)",
};

const addBtnStyle: React.CSSProperties = {
  minHeight: 28,
  fontSize: "0.8125rem",
  padding: "0.15rem 0.55rem",
  gap: "0.3rem",
};

const dismissBtnStyle: React.CSSProperties = {
  minHeight: 28,
  fontSize: "0.8125rem",
  padding: "0.15rem 0.65rem",
  gap: "0.3rem",
};

const smallBtnStyle: React.CSSProperties = {
  minHeight: 28,
  fontSize: "0.8125rem",
  padding: "0.15rem 0.5rem",
  gap: "0.3rem",
  border: "none",
};

const formStyle: React.CSSProperties = {
  padding: "0.55rem 0.7rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface2)",
};

const pendingListStyle: React.CSSProperties = {
  listStyle: "none",
  margin: 0,
  padding: "0.4rem 0.75rem",
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
};

const pendingItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.4rem",
  fontSize: "0.78rem",
  color: "var(--text)",
};

const deleteBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--muted)",
  cursor: "pointer",
  padding: "0.15rem 0.25rem",
  display: "inline-flex",
  alignItems: "center",
};
