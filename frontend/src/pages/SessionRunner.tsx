import { useEffect, useState } from "react";
import { AI_ON } from "../lib/flags";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adventuresApi } from "../api/adventures";
import { sessionsApi } from "../api/sessions";
import LootPanel from "../components/LootPanel";
import { useInitiativeStore } from "../stores/useInitiativeStore";
import type { Combatant, SessionRunbook } from "../api/types";

// ── Initiative Tracker ────────────────────────────────────────────────────────

// Review 10/30 — every number in a row sits under a column that names it.
const rowGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "46px minmax(0, 1fr) 40px 50px 30px",
  alignItems: "center",
  gap: "0.4rem",
};
const fieldLabel: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  fontSize: "0.7rem",
  color: "var(--muted)",
};

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

      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ ...fieldLabel, flex: "2 1 120px" }}>
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
          <input type="number" placeholder="10" value={newDex} onChange={(e) => setNewDex(e.target.value)} />
        </label>
        <label style={{ ...fieldLabel, flex: "1 1 60px" }}>
          HP
          <input type="number" placeholder="10" value={newHp} onChange={(e) => setNewHp(e.target.value)} />
        </label>
        <label style={{ ...fieldLabel, flex: "1 1 80px" }}>
          Side
          <select value={newType} onChange={(e) => setNewType(e.target.value as "pc" | "monster" | "npc")}>
            <option value="pc">PC</option>
            <option value="monster">Monster</option>
            <option value="npc">NPC</option>
          </select>
        </label>
        <button className="btn btn-primary" onClick={addCombatant} disabled={roll.isPending}>
          + Add &amp; roll
        </button>
      </div>

      {loading && (
        <p className="text-muted text-sm">Loading combat state…</p>
      )}

      {!loading && combatants.length === 0 && (
        <p className="text-muted text-sm">Add combatants above, then roll initiative.</p>
      )}

      {combatants.length > 0 && (
        <div style={{ ...rowGrid, padding: "0 0.75rem 0.2rem", fontSize: "0.65rem", letterSpacing: "0.08em", color: "var(--muted)" }}>
          <span title="Initiative — highest goes first">INIT</span>
          <span>NAME</span>
          <span>SIDE</span>
          <span>HP</span>
          <span />
        </div>
      )}
      {/* Highest initiative first, the order the HUD shows and the turns follow. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }} role="list" aria-label="Initiative order">
        {[...combatants].sort((a, b) => b.initiative_roll - a.initiative_roll).map((c) => {
          const isActive = c.id === activeCombatantId;
          return (
            <div
              key={c.id}
              role="listitem"
              aria-current={isActive ? "true" : undefined}
              style={{
                ...rowGrid,
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                background: isActive ? "rgba(139,26,26,0.3)" : "var(--surface2)",
                border: isActive ? "1px solid var(--crimson2)" : "1px solid var(--border)",
                opacity: c.defeated ? 0.4 : 1,
              }}
            >
              <input
                type="number"
                aria-label={`${c.name} initiative`}
                title={c.initiative_roll ? "Initiative" : "Not rolled yet — type their roll"}
                placeholder="—"
                value={c.initiative_roll || ""}
                onChange={(e) => void setInitiative(c.id, Number(e.target.value) || 0)}
                className="text-mono"
                style={{ width: 46, textAlign: "center", padding: "0.2rem 0.2rem", color: "var(--gold)", fontWeight: 700 }}
              />
              <span style={{ textDecoration: c.defeated ? "line-through" : "none", fontWeight: isActive ? 700 : 400 }}>
                {isActive && (
                  <span style={{ color: "var(--gold)", marginRight: 6 }} aria-hidden>
                    ▶
                  </span>
                )}
                {c.name}
                {isActive && <span className="text-muted" style={{ display: "block", fontSize: "0.65rem" }}>their turn</span>}
              </span>
              <span
                className={`badge badge-${
                  c.type === "pc" ? "ready" : c.type === "monster" ? "artifact" : "draft"
                }`}
                style={{ fontSize: "0.58rem", padding: "0.05rem 0.25rem", justifySelf: "start" }}
                title={c.type === "pc" ? "Player character" : c.type === "monster" ? "Monster" : "NPC"}
              >
                {c.type === "monster" ? "MON" : c.type.toUpperCase()}
              </span>
              <input
                type="number"
                aria-label={`${c.name} hit points`}
                title="Hit points"
                value={c.hp_current}
                onChange={(e) =>
                  void patchCombatant(c.id, { hp_current: Math.max(0, Number(e.target.value)) })
                }
                style={{ width: 50, textAlign: "center", padding: "0.2rem 0.2rem" }}
              />
              <button
                className="btn btn-ghost"
                title={c.defeated ? "Bring them back" : "Mark defeated"}
                aria-label={c.defeated ? `Revive ${c.name}` : `Mark ${c.name} defeated`}
                style={{ fontSize: "0.65rem", padding: "0.2rem 0.3rem" }}
                onClick={() => void toggleDefeated(c.id)}
              >
                {c.defeated ? "Revive" : "✕"}
              </button>
            </div>
          );
        })}
      </div>

      {combatants.length > 0 && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <button
            className="btn"
            onClick={() => void prevTurn()}
            title="Undo an accidental Next Turn — step back one combatant"
          >
            ← Back
          </button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void nextTurn()}>
            Next Turn →
          </button>
        </div>
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
          {!runbook && !AI_ON ? (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>✍️ Write tonight's runbook</h3>
              <p className="text-muted text-sm" style={{ marginBottom: "1rem" }}>
                Read-aloud text, your notes, the fight's flow — yours, in the editor. Start blank
                and fill it in as you prep; the HUD's 🎬 Script reads it back to you at the table.
              </p>
              <button
                className="btn btn-primary"
                onClick={() => createBlank.mutate()}
                disabled={createBlank.isPending}
              >
                {createBlank.isPending ? "Starting…" : "✍️ Start a blank runbook"}
              </button>
              {createBlank.isError && (
                <p className="text-sm" style={{ color: "var(--crimson2)", marginTop: "0.5rem" }}>
                  {(createBlank.error as Error).message}
                </p>
              )}
            </div>
          ) : !runbook ? (
            /* No runbook yet */
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>✨ Plan tonight's session</h3>
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
                  className="btn btn-primary"
                  onClick={() => generatePack.mutate()}
                  disabled={generatePack.isPending || generateRunbook.isPending || !extraNotes.trim()}
                  title="Generates and LINKS everything: encounters, NPCs, loot, runbook"
                >
                  {generatePack.isPending ? "🎒 Building the night… (~1 min)" : "🎒 Generate Session Pack"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => generateRunbook.mutate()}
                  disabled={generateRunbook.isPending || generatePack.isPending}
                >
                  {generateRunbook.isPending ? "✨ Writing…" : "✨ Runbook only"}
                </button>
              </div>
              {generatePack.isSuccess && (
                <div
                  style={{
                    marginTop: "0.9rem",
                    padding: "0.7rem 0.9rem",
                    border: "1px solid var(--gold)",
                    borderRadius: 8,
                    fontSize: "0.85rem",
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
                <p style={{ color: "var(--red)", marginTop: "0.75rem", fontSize: "0.85rem" }}>
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
                <h2 style={{ margin: 0 }}>Session Runbook</h2>
                {AI_ON && (
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: "0.75rem" }}
                    onClick={() => generateRunbook.mutate()}
                    disabled={generateRunbook.isPending}
                  >
                    ↺ Regenerate
                  </button>
                )}
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
