import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adventuresApi } from "../api/adventures";
import { sessionsApi } from "../api/sessions";
import LootPanel from "../components/LootPanel";
import { useInitiativeStore } from "../stores/useInitiativeStore";
import type { Combatant, SessionRunbook } from "../api/types";

// ── Initiative Tracker ────────────────────────────────────────────────────────

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
    reset,
  } = useInitiativeStore();

  const [newName, setNewName] = useState("");
  const [newDex, setNewDex] = useState(10);
  const [newHp, setNewHp] = useState(10);
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
    const next: Combatant = {
      name: newName.trim(),
      dex_score: newDex,
      hp: newHp,
      max_hp: newHp,
      type: newType,
    };
    setNewName("");
    setNewDex(10);
    setNewHp(10);
    roll.mutate([...existing, next]);
  }

  return (
    <div className="card">
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", marginBottom: "1rem" }}
      >
        <h3 style={{ margin: 0 }}>⚔ Initiative — Round {round}</h3>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem" }}
          onClick={() => void reset()}
        >
          Reset
        </button>
      </div>

      {error && (
        <p
          className="text-sm"
          style={{ color: "var(--red)", marginBottom: "0.75rem" }}
        >
          {error}
        </p>
      )}

      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCombatant()}
          style={{ flex: "2 1 120px" }}
        />
        <input
          type="number"
          placeholder="DEX"
          value={newDex}
          onChange={(e) => setNewDex(Number(e.target.value))}
          style={{ flex: "1 1 55px" }}
        />
        <input
          type="number"
          placeholder="HP"
          value={newHp}
          onChange={(e) => setNewHp(Number(e.target.value))}
          style={{ flex: "1 1 55px" }}
        />
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value as "pc" | "monster" | "npc")}
          style={{ flex: "1 1 80px" }}
        >
          <option value="pc">PC</option>
          <option value="monster">Monster</option>
          <option value="npc">NPC</option>
        </select>
        <button className="btn btn-primary" onClick={addCombatant} disabled={roll.isPending}>
          + Add
        </button>
      </div>

      {loading && (
        <p className="text-muted text-sm">Loading combat state…</p>
      )}

      {!loading && combatants.length === 0 && (
        <p className="text-muted text-sm">Add combatants above, then roll initiative.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {combatants.map((c) => {
          const isActive = c.id === activeCombatantId;
          return (
            <div
              key={c.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                background: isActive ? "rgba(139,26,26,0.3)" : "var(--surface2)",
                border: isActive ? "1px solid var(--crimson2)" : "1px solid var(--border)",
                opacity: c.defeated ? 0.4 : 1,
              }}
            >
              <span
                className="text-mono"
                style={{ minWidth: 30, color: "var(--gold)", fontWeight: 700 }}
              >
                {c.initiative_roll}
              </span>
              <span style={{ flex: 1, textDecoration: c.defeated ? "line-through" : "none" }}>
                {c.name}
              </span>
              <span
                className={`badge badge-${
                  c.type === "pc" ? "ready" : c.type === "monster" ? "artifact" : "draft"
                }`}
              >
                {c.type}
              </span>
              <input
                type="number"
                value={c.hp_current}
                onChange={(e) =>
                  void patchCombatant(c.id, { hp_current: Math.max(0, Number(e.target.value)) })
                }
                style={{ width: 55, textAlign: "center", padding: "0.2rem 0.3rem" }}
              />
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
                onClick={() => void toggleDefeated(c.id)}
              >
                {c.defeated ? "Revive" : "✕"}
              </button>
            </div>
          );
        })}
      </div>

      {combatants.length > 0 && (
        <button
          className="btn btn-primary"
          style={{ marginTop: "0.75rem", width: "100%" }}
          onClick={() => void nextTurn()}
        >
          Next Turn →
        </button>
      )}
    </div>
  );
}

// ── Runbook section ───────────────────────────────────────────────────────────

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
              className={`btn ${i === activeScene ? "btn-primary" : "btn-ghost"}`}
              style={{ fontSize: "0.75rem" }}
              onClick={() => setActiveScene(i)}
            >
              {i + 1}. {sc.title}
            </button>
          ))}
        </div>
      )}

      {/* Active scene */}
      {scene && (
        <div className="parchment-card" style={{ marginBottom: "1rem" }}>
          <h3 style={{ marginBottom: "0.5rem" }}>{scene.title}</h3>
          <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem", opacity: 0.6 }}>
            ⏱ ~{scene.estimated_minutes} min
          </p>
          <div className="read-aloud" style={{ marginBottom: "0.75rem" }}>
            {scene.read_aloud}
          </div>
          <p style={{ whiteSpace: "pre-wrap", fontSize: "0.95rem", marginBottom: 0 }}>
            {scene.dm_notes}
          </p>
        </div>
      )}

      {/* NPC Dialog */}
      {(runbook.npc_dialog ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>🎭 NPC Dialog</h3>
          {runbook.npc_dialog!.map((npc, i) => (
            <div key={i} style={{ marginBottom: "0.75rem" }}>
              <strong style={{ color: "var(--gold)" }}>{npc.npc_name}</strong>
              <ul style={{ paddingLeft: "1.25rem", margin: "0.25rem 0 0" }}>
                {npc.lines.map((l, j) => (
                  <li key={j} style={{ fontSize: "0.9rem", marginBottom: "0.2rem" }}>
                    "{l}"
                  </li>
                ))}
                {npc.improv_hooks.map((h, j) => (
                  <li
                    key={`h-${j}`}
                    style={{ fontSize: "0.85rem", color: "var(--muted)", marginBottom: "0.2rem" }}
                  >
                    💡 {h}
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
          <h3>⚔ Encounter Flows</h3>
          {runbook.encounter_flows!.map((ef, i) => (
            <div key={i} style={{ marginBottom: "1rem" }}>
              <strong style={{ color: "var(--gold)" }}>{ef.encounter_name}</strong>
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
          <h3>⭐ XP Awards</h3>
          <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
            {Object.entries(runbook.xp_awards).map(([k, v]) => (
              <li key={k} className="text-mono" style={{ marginBottom: "0.2rem" }}>
                {k}: {v} XP
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Loot notes */}
      {(runbook.loot_awards ?? []).length > 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3>💰 Loot</h3>
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
          <h3>🪝 Closing Hooks</h3>
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
        <div style={{ fontSize: "2rem" }} className="dice-rolling">🎲</div>
        <p style={{ color: "var(--gold)", fontFamily: "Cinzel Decorative, serif" }}>
          {runbookLoading ? "Loading runbook…" : "Loading session…"}
        </p>
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: "4rem auto", textAlign: "center" }}>
        <p style={{ color: "var(--red)", marginBottom: "1rem" }}>
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
            background: "rgba(0,0,0,0.75)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            gap: "1rem",
          }}
        >
          <div style={{ fontSize: "3rem" }} className="dice-rolling-loop">🎲</div>
          <p style={{ color: "var(--gold)", fontFamily: "Cinzel Decorative, serif", fontSize: "1.2rem" }}>
            Claude is writing your runbook…
          </p>
          <p className="text-muted text-sm">
            Big sessions can take 1–5 minutes. The die keeps spinning while it's working.
          </p>
        </div>
      )}

      <div className="flex" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.25rem" }}>
        <h1>
          Session {session.session_number}
          {session.title ? `: ${session.title}` : ""}
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => navigate(`/sessions/${sessionId}/hud`)}
          title="Open Session HUD — party HP, combat tracker, dice, rules reference"
          style={{ flexShrink: 0 }}
        >
          🖥 Open HUD
        </button>
      </div>
      <p className="text-muted" style={{ marginBottom: "2rem" }}>
        Status: <strong style={{ color: "var(--gold)" }}>{session.status}</strong>
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 340px",
          gap: "1.5rem",
          alignItems: "start",
        }}
      >
        {/* ── Left: runbook ── */}
        <div>
          {!runbook ? (
            /* No runbook yet */
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>✨ Generate Session Runbook</h3>
              <p className="text-muted text-sm" style={{ marginBottom: "1rem" }}>
                Claude will write opening narration, scenes, NPC dialog, encounter tactics,
                and closing hooks for this session.
              </p>
              <div className="form-group">
                <label>DM Notes (optional)</label>
                <textarea
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="Special requests, tone, key NPCs to feature…"
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => generateRunbook.mutate()}
                disabled={generateRunbook.isPending}
              >
                ✨ Generate Runbook
              </button>
              {generateRunbook.isError && (
                <p style={{ color: "var(--red)", marginTop: "0.75rem", fontSize: "0.85rem" }}>
                  Error: {(generateRunbook.error as Error).message}
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
                <h2 style={{ margin: 0 }}>Session Runbook</h2>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => generateRunbook.mutate()}
                  disabled={generateRunbook.isPending}
                >
                  ↺ Regenerate
                </button>
              </div>
              <RunbookView runbook={runbook} />
            </div>
          )}

          {/* DM Notes */}
          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h3>📝 DM Notes</h3>
            <textarea
              value={dmNotes}
              onChange={(e) => {
                setDmNotes(e.target.value);
                setNotesDirty(true);
              }}
              rows={6}
              placeholder="Live session notes…"
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
                <span style={{ color: "var(--green2)", fontSize: "0.85rem" }}>✓ Autosaved</span>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: initiative + loot ── */}
        <div>
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
