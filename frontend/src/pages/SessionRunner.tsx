import { useEffect, useState } from "react";
import {
  Check, Dices, Lightbulb, MonitorPlay, NotebookPen, PenLine, RefreshCw, Sparkles, Undo2, X,
} from "lucide-react";
import { AI_ON } from "../lib/flags";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adventuresApi } from "../api/adventures";
import { sessionsApi } from "../api/sessions";
import LootPanel from "../components/LootPanel";
import { useInitiativeStore } from "../stores/useInitiativeStore";
import type { Combatant, SessionRunbook } from "../api/types";
import { statusLabel } from "../lib/labels";

// ── Initiative Tracker ────────────────────────────────────────────────────────

// Review 10/30 — every number in a row sits under a column that names it.
// Plan 121 — a Console table: labeled columns, hairline rows, the live row lit.
const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "58px minmax(0, 1fr) 58px 62px 30px",
  alignItems: "center",
  gap: "0.5rem",
};
const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  margin: 0,
  fontSize: "0.75rem",
  fontWeight: 500,
  color: "var(--muted)",
};
const cellInput: React.CSSProperties = {
  width: "100%",
  textAlign: "center",
  padding: "0.2rem 0.25rem",
  fontSize: "0.9375rem",
};
/** Who's on which side, as a pill: party teal, foes red, NPCs neutral. */
const SIDE: Record<string, { label: string; cls: string; title: string }> = {
  pc: { label: "Party", cls: "pill pill-teal", title: "Player character" },
  monster: { label: "Foe", cls: "pill pill-danger", title: "Monster" },
  npc: { label: "NPC", cls: "pill", title: "NPC" },
};
const STATUS_BADGE: Record<string, string> = {
  Draft: "badge badge-draft",
  Ready: "badge badge-ready",
  InProgress: "badge badge-progress",
  Complete: "badge badge-complete",
  Completed: "badge badge-complete",
};

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

function InitiativeTracker({ sessionId }: { sessionId: string }) {
  const {
    combatants,
    round,
    activeCombatantId,
    loading,
    error,
    hydrate,
    replaceFromRoll,
    patchCombatant,
    toggleDefeated,
    nextTurn,
    prevTurn,
    reset,
    setInitiative,
  } = useInitiativeStore();

  // Review 10/30 — empty fields with "10" as a hint, not pre-filled 10s that
  // read as values someone typed.
  const [newName, setNewName] = useState("");
  const [newDex, setNewDex] = useState("");
  const [newHp, setNewHp] = useState("");
  const [newType, setNewType] = useState<"pc" | "monster" | "npc">("monster");

  // Hydrate from backend on mount / session change — survives browser refresh.
  useEffect(() => {
    if (sessionId) void hydrate(sessionId);
  }, [sessionId, hydrate]);

  const roll = useMutation({
    mutationFn: (cs: Combatant[]) => sessionsApi.rollInitiative(sessionId, cs),
    onSuccess: (data) => replaceFromRoll(sessionId, data),
  });

  function addCombatant() {
    if (!newName.trim()) return;
    // Project current persisted combatants back to the raw shape the roller wants,
    // then append the new one. The server re-sorts and the store re-persists,
    // so linkbacks (monster_id, character_id) must survive the round-trip.
    const existing: Combatant[] = combatants.map((c) => ({
      name: c.name,
      dex_score: c.dex_score,
      hp: c.hp_current,
      max_hp: c.hp_max,
      type: (c.type as "pc" | "monster" | "npc") ?? "monster",
      monster_id: c.monster_id,
      character_id: c.character_id,
    }));
    const dex = Number(newDex) || 10;
    const hp = Number(newHp) || 10;
    const next: Combatant = {
      name: newName.trim(),
      dex_score: dex,
      hp,
      max_hp: hp,
      type: newType,
    };
    setNewName("");
    setNewDex("");
    setNewHp("");
    roll.mutate([...existing, next]);
  }

  return (
    <div className="card" style={{ padding: "1rem" }}>
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", marginBottom: "0.85rem", gap: "0.5rem" }}
      >
        <div className="flex items-center" style={{ gap: "0.5rem" }}>
          <h3 style={{ margin: 0 }}>Initiative</h3>
          {combatants.length > 0 && (
            <span className="pill" title="Combat round">
              Round <span className="num">{round}</span>
            </span>
          )}
        </div>
        <button
          className="btn btn-ghost"
          style={{ minHeight: 30, fontSize: "0.8125rem", padding: "0.2rem 0.6rem", border: "none" }}
          onClick={() => void reset()}
          title="Clear the order and start over"
        >
          Reset
        </button>
      </div>

      {error && (
        <p
          className="text-sm"
          style={{ color: "var(--danger-text)", marginBottom: "0.75rem" }}
        >
          {error}
        </p>
      )}

      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...fieldLabel, flex: "2 1 140px" }}>
          Name
          <input
            placeholder="e.g. Goblin boss"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCombatant()}
          />
        </label>
        <label style={{ ...fieldLabel, flex: "1 1 70px" }} title="The DEX score (10 = +0). Initiative is d20 + its modifier.">
          DEX score
          <input type="number" className="num" placeholder="10" value={newDex} onChange={(e) => setNewDex(e.target.value)} />
        </label>
        <label style={{ ...fieldLabel, flex: "1 1 70px" }}>
          Hit points
          <input type="number" className="num" placeholder="10" value={newHp} onChange={(e) => setNewHp(e.target.value)} />
        </label>
        <label style={{ ...fieldLabel, flex: "1 1 90px" }}>
          Side
          <select value={newType} onChange={(e) => setNewType(e.target.value as "pc" | "monster" | "npc")}>
            <option value="pc">PC</option>
            <option value="monster">Monster</option>
            <option value="npc">NPC</option>
          </select>
        </label>
        <button className="btn btn-secondary" onClick={addCombatant} disabled={roll.isPending} title="Add them and roll initiative for everyone">
          <Dices size={16} aria-hidden /> Add &amp; roll
        </button>
      </div>

      {loading && (
        <p className="text-muted text-sm">Loading combat state…</p>
      )}

      {!loading && combatants.length === 0 && (
        <p className="text-muted text-sm" style={{ lineHeight: 1.5 }}>
          The turn order for a fight lives here. Add each monster or NPC above — the app rolls initiative
          for everyone and sorts them, highest first.
        </p>
      )}

      {combatants.length > 0 && (
        <div className="ql-table">
          <div className="ql-table-head" style={{ ...rowGrid, padding: "0.4rem 0.75rem" }}>
            <span title="Initiative — highest goes first">Initiative</span>
            <span>Name</span>
            <span>Side</span>
            <span>Hit points</span>
            <span />
          </div>
          {/* Highest initiative first, the order the HUD shows and the turns follow. */}
          <div role="list" aria-label="Initiative order">
            {[...combatants].sort((a, b) => b.initiative_roll - a.initiative_roll).map((c) => {
              const isActive = c.id === activeCombatantId;
              const side = SIDE[c.type] ?? SIDE.npc;
              return (
                <div
                  key={c.id}
                  role="listitem"
                  aria-current={isActive ? "true" : undefined}
                  className={`ql-table-row${isActive ? " lit" : ""}`}
                  style={{
                    ...rowGrid,
                    padding: "0.45rem 0.75rem",
                    opacity: c.defeated ? 0.45 : 1,
                  }}
                >
                  <input
                    type="number"
                    aria-label={`${c.name} initiative`}
                    title={c.initiative_roll ? "Initiative" : "Not rolled yet — type their roll"}
                    placeholder="—"
                    value={c.initiative_roll || ""}
                    onChange={(e) => void setInitiative(c.id, Number(e.target.value) || 0)}
                    className="num"
                    style={{ ...cellInput, fontWeight: 600 }}
                  />
                  <span style={{ minWidth: 0 }}>
                    <span
                      className="story"
                      style={{
                        display: "block",
                        fontWeight: 700,
                        fontSize: "1rem",
                        lineHeight: 1.25,
                        textDecoration: c.defeated ? "line-through" : "none",
                        overflowWrap: "anywhere",
                      }}
                    >
                      {c.name}
                    </span>
                    {isActive && (
                      <span style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--accent-text)" }}>
                        Their turn
                      </span>
                    )}
                  </span>
                  <span className={side.cls} style={{ fontSize: "0.75rem", padding: "0 0.5rem", justifySelf: "start" }} title={side.title}>
                    {side.label}
                  </span>
                  <input
                    type="number"
                    aria-label={`${c.name} hit points`}
                    title="Hit points"
                    value={c.hp_current}
                    onChange={(e) =>
                      void patchCombatant(c.id, { hp_current: Math.max(0, Number(e.target.value)) })
                    }
                    className="num"
                    style={cellInput}
                  />
                  <button
                    className="btn btn-ghost"
                    title={c.defeated ? "Bring them back" : "Mark defeated"}
                    aria-label={c.defeated ? `Revive ${c.name}` : `Mark ${c.name} defeated`}
                    style={{ minHeight: 28, width: 30, padding: 0, border: "none", color: "var(--muted)" }}
                    onClick={() => void toggleDefeated(c.id)}
                  >
                    {c.defeated ? <Undo2 size={15} aria-hidden /> : <X size={15} aria-hidden />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {combatants.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            className="btn btn-ghost"
            onClick={() => void prevTurn()}
            title="Undo an accidental Next turn — step back one combatant"
          >
            ← Back
          </button>
          <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => void nextTurn()}>
            Next turn →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Runbook section ───────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--muted)", marginBottom: "0.35rem" };

function RunbookView({ runbook }: { runbook: SessionRunbook }) {
  const [activeScene, setActiveScene] = useState(0);
  const scenes = runbook.scenes ?? [];
  const scene = scenes[activeScene];

  return (
    <div>
      {/* Opening scene */}
      {runbook.opening_scene && (
        <div className="read-aloud" style={{ marginBottom: "1.25rem" }}>
          {runbook.opening_scene}
        </div>
      )}

      {/* Scene tabs */}
      {scenes.length > 0 && (
        <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
          {scenes.map((sc, i) => (
            <button
              key={i}
              className="btn btn-ghost"
              aria-pressed={i === activeScene}
              style={{
                minHeight: 32,
                fontSize: "0.875rem",
                padding: "0.25rem 0.7rem",
                ...(i === activeScene
                  ? { background: "var(--accent-active)", color: "var(--accent-active-text)", borderColor: "var(--accent-line)" }
                  : {}),
              }}
              onClick={() => setActiveScene(i)}
            >
              <span className="num">{i + 1}</span> {sc.title}
            </button>
          ))}
        </div>
      )}

      {/* Active scene */}
      {scene && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3 className="story" style={{ marginBottom: "0.15rem", fontSize: "1.4rem" }}>{scene.title}</h3>
          <p style={{ fontSize: "0.8125rem", marginBottom: "0.75rem", color: "var(--muted)" }}>
            About <span className="num">{scene.estimated_minutes}</span> min
          </p>
          <div style={sectionLabel}>Read aloud</div>
          <div className="read-aloud" style={{ marginBottom: "0.9rem", whiteSpace: "pre-wrap" }}>
            {scene.read_aloud}
          </div>
          {scene.dm_notes && (
            <>
              <div style={sectionLabel}>Your notes</div>
              <p style={{ whiteSpace: "pre-wrap", fontSize: "0.95rem", marginBottom: 0, color: "var(--text2)" }}>
                {scene.dm_notes}
              </p>
            </>
          )}
        </div>
      )}

      {/* NPC Dialog */}
      {(runbook.npc_dialog ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>What the NPCs might say</h3>
          {runbook.npc_dialog!.map((npc, i) => (
            <div key={i} style={{ marginBottom: "0.75rem" }}>
              <strong className="story" style={{ color: "var(--text)", fontSize: "1.05rem" }}>{npc.npc_name}</strong>
              <ul style={{ paddingLeft: "1.25rem", margin: "0.25rem 0 0" }}>
                {npc.lines.map((l, j) => (
                  <li key={j} className="story" style={{ fontSize: "1rem", fontStyle: "italic", marginBottom: "0.2rem", color: "var(--story-text)" }}>
                    &ldquo;{l}&rdquo;
                  </li>
                ))}
                {npc.improv_hooks.map((h, j) => (
                  <li
                    key={`h-${j}`}
                    style={{ fontSize: "0.875rem", color: "var(--muted)", marginBottom: "0.2rem", listStyle: "none", marginLeft: "-1.25rem" }}
                  >
                    <Lightbulb size={14} aria-hidden style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Encounter flows */}
      {(runbook.encounter_flows ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>Encounter flows</h3>
          {runbook.encounter_flows!.map((ef, i) => (
            <div key={i} style={{ marginBottom: "1rem" }}>
              <strong className="story" style={{ color: "var(--text)", fontSize: "1.05rem" }}>{ef.encounter_name}</strong>
              {ef.terrain_notes && (
                <p className="text-sm text-muted" style={{ margin: "0.2rem 0" }}>
                  Terrain: {ef.terrain_notes}
                </p>
              )}
              <ul style={{ paddingLeft: "1.25rem", margin: "0.25rem 0 0" }}>
                {ef.round_by_round.map((r, j) => (
                  <li key={j} style={{ fontSize: "0.9rem", marginBottom: "0.2rem" }}>
                    Round {j + 1}: {r}
                  </li>
                ))}
              </ul>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: "0.25rem" }}>
                Tactics: {ef.tactics}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* XP awards */}
      {runbook.xp_awards && Object.keys(runbook.xp_awards).length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>XP awards</h3>
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {Object.entries(runbook.xp_awards).map(([k, v]) => (
              <li key={k} style={{ marginBottom: "0.2rem" }}>
                {k}: <span className="num">{v}</span> XP
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Loot notes */}
      {(runbook.loot_awards ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>Loot</h3>
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {runbook.loot_awards!.map((item, i) => {
              const text =
                typeof item === "string"
                  ? item
                  : typeof item === "object" && item !== null && "notes" in item
                    ? String((item as Record<string, unknown>).notes)
                    : JSON.stringify(item);
              return (
                <li key={i} style={{ marginBottom: "0.25rem" }}>
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Closing hooks */}
      {runbook.closing_hooks && (
        <div className="card">
          <h3>Closing hooks</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{runbook.closing_hooks}</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SessionRunner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [dmNotes, setDmNotes] = useState("");
  const [extraNotes, setExtraNotes] = useState("");

  const {
    data: session,
    isLoading: sessionLoading,
    isError: sessionError,
  } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const {
    data: runbook,
    isLoading: runbookLoading,
  } = useQuery({
    queryKey: ["runbook", sessionId],
    queryFn: () => sessionsApi.getRunbook(sessionId!),
    enabled: !!sessionId,
  });

  // Adventure is loaded so the LootPanel can scope PCs to this campaign.
  const { data: adventure } = useQuery({
    queryKey: ["adventure", session?.adventure_id],
    queryFn: () => adventuresApi.get(session!.adventure_id),
    enabled: !!session?.adventure_id,
  });

  // Initialise DM notes from saved value when the server-side notes change
  // (e.g. after a handout appends a line). Don't clobber unsaved local edits.
  const [notesDirty, setNotesDirty] = useState(false);
  useEffect(() => {
    if (!notesDirty && session?.actual_notes !== undefined) {
      setDmNotes(session.actual_notes ?? "");
    }
  }, [session?.actual_notes, notesDirty]);

  const generateRunbook = useMutation({
    mutationFn: () => sessionsApi.generateRunbook(sessionId!, extraNotes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["runbook", sessionId] }),
  });

  // Plan 86 — no generative AI: start an empty runbook and write it in the editor.
  const createBlank = useMutation({
    mutationFn: () => sessionsApi.createBlankRunbook(sessionId!),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["runbook", sessionId] }),
  });
  // Plan 70 — AI Session Pack: premise in, LINKED session out (real
  // encounters with catalog monsters, campaign NPCs, loot, runbook).
  const generatePack = useMutation({
    mutationFn: () => sessionsApi.generatePack(sessionId!, extraNotes),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["runbook", sessionId] });
      void qc.invalidateQueries({ queryKey: ["encounters"] });
      void qc.invalidateQueries({ queryKey: ["npcs"] });
    },
  });

  const saveNotes = useMutation({
    mutationFn: (value: string) => sessionsApi.updateNotes(sessionId!, value),
    onSuccess: () => {
      setNotesDirty(false);
    },
  });

  // Debounced autosave — fires 1.2s after the last keystroke. The manual
  // "Save Notes" button remains as a flush-now affordance.
  useEffect(() => {
    if (!sessionId || !notesDirty) return;
    const handle = window.setTimeout(() => {
      saveNotes.mutate(dmNotes);
    }, 1200);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dmNotes, notesDirty, sessionId]);

  if (sessionLoading || runbookLoading) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          gap: "1rem",
        }}
      >
        <Dices size={30} aria-hidden className="dice-rolling" style={{ color: "var(--muted)" }} />
        <p style={{ color: "var(--muted)" }}>
          {runbookLoading ? "Loading runbook…" : "Loading session…"}
        </p>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
        <p style={{ color: "var(--danger-text)", marginBottom: "1rem" }}>
          Failed to load session. Check that the backend is running.
        </p>
      </div>
    );
  }

  return (
    <div className="fade-in">
      {/* Generating overlay */}
      {generateRunbook.isPending && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(5,8,7,0.78)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            gap: "1rem",
          }}
        >
          <Dices size={44} aria-hidden className="dice-rolling-loop" style={{ color: "var(--text2)" }} />
          <p style={{ color: "var(--text)", fontSize: "1.1rem", fontWeight: 500 }}>
            Claude is writing your runbook…
          </p>
          <p className="text-muted text-sm">
            Big sessions can take 1–5 minutes. The die keeps spinning while it's working.
          </p>
        </div>
      )}

      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", marginBottom: "0.35rem" }}>
        <h1 className="story" style={{ minWidth: 0 }}>
          Session {toRoman(session.session_number)}
          {session.title ? `: ${session.title}` : ""}
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/sessions/${sessionId}/hud`)}
          title="Open Session HUD — party HP, combat tracker, dice, rules reference"
          style={{ flexShrink: 0 }}
        >
          <MonitorPlay size={16} aria-hidden /> Open HUD
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: "1.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
        Status <span className={STATUS_BADGE[session.status] ?? "badge"}>{statusLabel(session.status)}</span>
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(340px, 420px)",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ── Left: runbook ── */}
        <div style={{ minWidth: 0 }}>
          {!runbook && !AI_ON ? (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Write tonight&rsquo;s runbook</h3>
              <p className="text-muted text-sm" style={{ marginBottom: "1rem", lineHeight: 1.55 }}>
                The runbook is your script for the night: read-aloud text, your notes and how each fight
                should go, scene by scene. Start blank and fill it in as you prep — at the table, the
                HUD&rsquo;s Script button reads it back to you.
              </p>
              <button
                className="btn btn-secondary"
                onClick={() => createBlank.mutate()}
                disabled={createBlank.isPending}
              >
                <PenLine size={16} aria-hidden />
                {createBlank.isPending ? "Starting…" : "Start a blank runbook"}
              </button>
              {createBlank.isError && (
                <p className="text-sm" style={{ color: "var(--danger-text)", marginTop: "0.5rem" }}>
                  {(createBlank.error as Error).message}
                </p>
              )}
            </div>
          ) : !runbook ? (
            /* No runbook yet */
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Plan tonight&rsquo;s session</h3>
              <p className="text-muted text-sm" style={{ marginBottom: "1rem" }}>
                Write a paragraph about tonight. <b>Session Pack</b> builds the whole night
                and wires it in: real encounters (catalog monsters, balanced to the party),
                new NPCs on your roster, loot, and the runbook — everything already in the
                HUD. <b>Runbook only</b> writes the script without creating anything.
              </p>
              <div className="form-group">
                <label>Tonight's premise</label>
                <textarea
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="e.g. The party returns to town to find the inn shuttered and the innkeeper missing. A stranger delivers an invitation nobody should trust…"
                  rows={4}
                  style={{ resize: "vertical" }}
                />
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => generatePack.mutate()}
                  disabled={generatePack.isPending || generateRunbook.isPending || !extraNotes.trim()}
                  title="Generates and LINKS everything: encounters, NPCs, loot, runbook"
                >
                  <Sparkles size={16} aria-hidden />
                  {generatePack.isPending ? "Building the night… (~1 min)" : "Generate session pack"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => generateRunbook.mutate()}
                  disabled={generateRunbook.isPending || generatePack.isPending}
                >
                  {generateRunbook.isPending ? "Writing…" : "Runbook only"}
                </button>
              </div>
              {generatePack.isSuccess && (
                <div
                  style={{
                    marginTop: "0.9rem",
                    padding: "0.7rem 0.9rem",
                    border: "1px solid var(--border2)",
                    background: "var(--surface2)",
                    borderRadius: 10,
                    fontSize: "0.875rem",
                  }}
                >
                  <b>Pack ready:</b> {generatePack.data.scenes} scenes ·{" "}
                  {generatePack.data.encounters.map((e) => `${e.name} (${e.difficulty})`).join(", ") || "no encounters"} ·{" "}
                  NPCs: {generatePack.data.npcs.map((n) => n.name).join(", ") || "none"} ·{" "}
                  loot: {generatePack.data.loot.length}
                  {generatePack.data.warnings.length > 0 && (
                    <div style={{ color: "var(--muted)", marginTop: 4 }}>
                      {generatePack.data.warnings.join(" · ")}
                    </div>
                  )}
                </div>
              )}
              {(generateRunbook.isError || generatePack.isError) && (
                <p style={{ color: "var(--danger-text)", marginTop: "0.75rem", fontSize: "0.875rem" }}>
                  Error: {((generatePack.error || generateRunbook.error) as Error).message}
                </p>
              )}
            </div>
          ) : (
            /* Runbook exists */
            <div>
              <div
                className="flex items-center"
                style={{ justifyContent: "space-between", marginBottom: "1rem" }}
              >
                <h2 style={{ margin: 0 }}>Session runbook</h2>
                {AI_ON && (
                  <button
                    className="btn btn-ghost"
                    style={{ minHeight: 32, fontSize: "0.8125rem", padding: "0.25rem 0.65rem" }}
                    onClick={() => generateRunbook.mutate()}
                    disabled={generateRunbook.isPending}
                  >
                    <RefreshCw size={14} aria-hidden /> Regenerate
                  </button>
                )}
              </div>
              <RunbookView runbook={runbook} />
            </div>
          )}

          {/* DM Notes */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <NotebookPen size={18} aria-hidden style={{ color: "var(--muted)" }} /> DM notes
            </h3>
            <textarea
              value={dmNotes}
              onChange={(e) => {
                setDmNotes(e.target.value);
                setNotesDirty(true);
              }}
              rows={6}
              placeholder="What happened tonight, what they said, what you owe them next time…"
              aria-label="DM notes"
              style={{ resize: "vertical", marginBottom: "0.5rem" }}
            />
            <div className="flex items-center gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => saveNotes.mutate(dmNotes)}
                disabled={saveNotes.isPending || !notesDirty}
                title="Notes also save automatically a moment after you stop typing"
              >
                {saveNotes.isPending ? "Saving…" : notesDirty ? "Save now" : "Saved"}
              </button>
              {!notesDirty && saveNotes.isSuccess && (
                <span style={{ color: "var(--teal-text)", fontSize: "0.875rem", display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Check size={14} aria-hidden /> Autosaved
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: initiative + loot ── */}
        <div style={{ minWidth: 0 }}>
          <InitiativeTracker sessionId={sessionId!} />
          {adventure && (
            <LootPanel
              sessionId={sessionId!}
              attendingPcIds={session.attending_pc_ids ?? []}
              campaignId={adventure.campaign_id}
            />
          )}
        </div>
      </div>
    </div>
  );
}
