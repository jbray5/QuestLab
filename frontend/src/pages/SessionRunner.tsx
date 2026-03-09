import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";
import { useInitiativeStore } from "../stores/useInitiativeStore";
import type { Combatant } from "../api/types";

function InitiativeTracker({ sessionId }: { sessionId: string }) {
  const { combatants, round, setCombatants, nextTurn, toggleDefeated, setHp, reset } =
    useInitiativeStore();

  const [newName, setNewName] = useState("");
  const [newDex, setNewDex] = useState(10);
  const [newHp, setNewHp] = useState(10);
  const [newType, setNewType] = useState<"pc" | "monster" | "npc">("monster");

  const roll = useMutation({
    mutationFn: (cs: Combatant[]) => sessionsApi.rollInitiative(sessionId, cs),
    onSuccess: (data) => setCombatants(data),
  });

  function addCombatant() {
    if (!newName.trim()) return;
    const next: Combatant = { name: newName.trim(), dex_score: newDex, hp: newHp, max_hp: newHp, type: newType };
    setNewName(""); setNewDex(10); setNewHp(10);
    roll.mutate([...combatants.filter((c) => !c.roll), next]);
  }

  return (
    <div className="card">
      <div className="flex items-center" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
        <h3 style={{ margin: 0 }}>⚔ Initiative — Round {round}</h3>
        <button className="btn btn-ghost" style={{ fontSize: "0.75rem" }} onClick={reset}>Reset</button>
      </div>

      {/* Add combatant */}
      <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
        <input
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          style={{ flex: "2 1 120px" }}
        />
        <input
          type="number"
          placeholder="DEX"
          value={newDex}
          onChange={(e) => setNewDex(Number(e.target.value))}
          style={{ flex: "1 1 60px" }}
        />
        <input
          type="number"
          placeholder="HP"
          value={newHp}
          onChange={(e) => setNewHp(Number(e.target.value))}
          style={{ flex: "1 1 60px" }}
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value as "pc" | "monster" | "npc")} style={{ flex: "1 1 80px" }}>
          <option value="pc">PC</option>
          <option value="monster">Monster</option>
          <option value="npc">NPC</option>
        </select>
        <button className="btn btn-primary" onClick={addCombatant}>+ Add</button>
      </div>

      {combatants.length === 0 && (
        <p className="text-muted text-sm">Add combatants and roll initiative.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {combatants.map((c, i) => (
          <div
            key={`${c.name}-${i}`}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.5rem 0.75rem",
              borderRadius: 6,
              background: c.active ? "rgba(139,26,26,0.3)" : "var(--surface2)",
              border: c.active ? "1px solid var(--crimson2)" : "1px solid var(--border)",
              opacity: c.defeated ? 0.4 : 1,
            }}
          >
            <span className="text-mono" style={{ minWidth: 30, color: "var(--gold)", fontWeight: 700 }}>
              {c.initiative ?? "—"}
            </span>
            <span style={{ flex: 1, textDecoration: c.defeated ? "line-through" : "none" }}>{c.name}</span>
            <span className={`badge badge-${c.type === "pc" ? "ready" : c.type === "monster" ? "artifact" : "draft"}`}>
              {c.type}
            </span>
            <input
              type="number"
              value={c.hp}
              onChange={(e) => setHp(c.name, Number(e.target.value))}
              style={{ width: 55, textAlign: "center", padding: "0.2rem 0.3rem" }}
            />
            <button
              className="btn btn-ghost"
              style={{ fontSize: "0.65rem", padding: "0.2rem 0.4rem" }}
              onClick={() => toggleDefeated(c.name)}
            >
              {c.defeated ? "Revive" : "✕"}
            </button>
          </div>
        ))}
      </div>

      {combatants.length > 0 && (
        <button className="btn btn-primary" style={{ marginTop: "0.75rem" }} onClick={nextTurn}>
          Next Turn →
        </button>
      )}
    </div>
  );
}

export default function SessionRunner() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [dmNotes, setDmNotes] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [activeScene, setActiveScene] = useState(0);

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });

  const { data: runbook, refetch: refetchRunbook } = useQuery({
    queryKey: ["runbook", sessionId],
    queryFn: () => sessionsApi.getRunbook(sessionId!),
    enabled: !!sessionId,
  });

  const generateRunbook = useMutation({
    mutationFn: () => sessionsApi.generateRunbook(sessionId!, extraNotes),
    onSuccess: () => refetchRunbook(),
  });

  const saveNotes = useMutation({
    mutationFn: () => sessionsApi.updateNotes(sessionId!, dmNotes),
  });

  if (!session) return <p className="text-muted">Loading…</p>;

  return (
    <div className="fade-in">
      <h1 style={{ marginBottom: "0.25rem" }}>
        Session {session.session_number}{session.title ? `: ${session.title}` : ""}
      </h1>
      <p className="text-muted" style={{ marginBottom: "2rem" }}>
        Status: <strong>{session.status}</strong>
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem", alignItems: "start" }}>
        {/* Left: runbook */}
        <div>
          {!runbook ? (
            <div className="card" style={{ marginBottom: "1rem" }}>
              <h3>Generate Runbook</h3>
              <div className="form-group">
                <label>DM Notes (optional)</label>
                <textarea
                  value={extraNotes}
                  onChange={(e) => setExtraNotes(e.target.value)}
                  placeholder="Any special requests for the AI…"
                  rows={3}
                  style={{ resize: "vertical" }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={() => generateRunbook.mutate()}
                disabled={generateRunbook.isPending}
              >
                {generateRunbook.isPending ? "Generating… (may take 30s)" : "✨ Generate Runbook"}
              </button>
              {generateRunbook.isError && (
                <p style={{ color: "var(--red)", marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  {(generateRunbook.error as Error).message}
                </p>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center" style={{ justifyContent: "space-between", marginBottom: "1rem" }}>
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

              {/* Scene selector */}
              <div className="flex gap-2" style={{ marginBottom: "1rem", flexWrap: "wrap" }}>
                {runbook.scenes.map((sc, i) => (
                  <button
                    key={i}
                    className={`btn ${i === activeScene ? "btn-primary" : "btn-ghost"}`}
                    style={{ fontSize: "0.75rem" }}
                    onClick={() => setActiveScene(i)}
                  >
                    {sc.scene_number}. {sc.title}
                  </button>
                ))}
              </div>

              {runbook.scenes[activeScene] && (
                <div>
                  <div className="parchment-card" style={{ marginBottom: "1rem" }}>
                    <h3 style={{ marginBottom: "0.75rem" }}>
                      Scene {runbook.scenes[activeScene].scene_number}: {runbook.scenes[activeScene].title}
                    </h3>
                    <p style={{ fontSize: "0.8rem", marginBottom: "0.75rem", opacity: 0.7 }}>
                      ⏱ ~{runbook.scenes[activeScene].expected_duration_minutes} min
                    </p>
                    <div className="read-aloud" style={{ marginBottom: "0.75rem" }}>
                      {runbook.scenes[activeScene].read_aloud}
                    </div>
                    <p style={{ whiteSpace: "pre-wrap", fontSize: "0.95rem" }}>
                      {runbook.scenes[activeScene].dm_notes}
                    </p>
                  </div>
                </div>
              )}

              {/* Hooks */}
              {runbook.hooks.length > 0 && (
                <div className="card" style={{ marginBottom: "1rem" }}>
                  <h3>🪝 Session Hooks</h3>
                  <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                    {runbook.hooks.map((h, i) => (
                      <li key={i} style={{ marginBottom: "0.4rem" }}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Loot */}
              {runbook.loot.length > 0 && (
                <div className="card">
                  <h3>💰 Loot</h3>
                  <ul style={{ paddingLeft: "1.25rem", margin: 0 }}>
                    {runbook.loot.map((item, i) => (
                      <li key={i} style={{ marginBottom: "0.25rem" }}>
                        {typeof item === "string" ? item : JSON.stringify(item)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* DM Notes */}
          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>📝 DM Notes</h3>
            <textarea
              value={dmNotes}
              onChange={(e) => setDmNotes(e.target.value)}
              rows={6}
              placeholder="Notes during the session…"
              style={{ resize: "vertical", marginBottom: "0.5rem" }}
            />
            <button
              className="btn btn-secondary"
              onClick={() => saveNotes.mutate()}
              disabled={saveNotes.isPending}
            >
              {saveNotes.isPending ? "Saving…" : "Save Notes"}
            </button>
          </div>
        </div>

        {/* Right: initiative */}
        <div>
          <InitiativeTracker sessionId={sessionId!} />
        </div>
      </div>
    </div>
  );
}
