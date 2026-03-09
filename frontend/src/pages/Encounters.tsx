import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { encountersApi } from "../api/encounters";

const DIFFICULTY_BADGE: Record<string, string> = {
  Low: "badge-ready",
  Moderate: "badge-draft",
  High: "badge-progress",
  Deadly: "badge-artifact",
};

export default function Encounters() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("Moderate");
  const [xpBudget, setXpBudget] = useState(0);

  const { data: encounters = [], isLoading } = useQuery({
    queryKey: ["encounters", adventureId],
    queryFn: () => encountersApi.list(adventureId!),
    enabled: !!adventureId,
  });

  const create = useMutation({
    mutationFn: () =>
      encountersApi.create(adventureId!, { name, description, difficulty, xp_budget: xpBudget }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["encounters", adventureId] });
      setName(""); setDescription(""); setDifficulty("Moderate"); setXpBudget(0);
      setShowForm(false);
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => encountersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["encounters", adventureId] }),
  });

  return (
    <div className="fade-in">
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Encounters</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Encounter"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 480 }}>
          <h3>New Encounter</h3>
          <div className="form-group">
            <label>Name *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goblin Ambush" />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ resize: "vertical" }} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label>Difficulty</label>
              <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="Low">Low</option>
                <option value="Moderate">Moderate</option>
                <option value="High">High</option>
                <option value="Deadly">Deadly</option>
              </select>
            </div>
            <div className="form-group">
              <label>XP Budget</label>
              <input type="number" value={xpBudget} onChange={(e) => setXpBudget(Number(e.target.value))} min={0} />
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create Encounter"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {encounters.map((e) => (
          <div key={e.id} className="card">
            <div className="flex items-center" style={{ justifyContent: "space-between" }}>
              <div className="flex items-center gap-2">
                <strong style={{ color: "var(--gold)" }}>{e.name}</strong>
                {e.difficulty && (
                  <span className={`badge ${DIFFICULTY_BADGE[e.difficulty] ?? "badge-draft"}`}>
                    {e.difficulty}
                  </span>
                )}
                {e.xp_budget && (
                  <span className="text-mono text-sm text-muted">{e.xp_budget} XP</span>
                )}
              </div>
              <button
                className="btn btn-danger"
                style={{ fontSize: "0.75rem" }}
                onClick={() => window.confirm("Delete encounter?") && del.mutate(e.id)}
              >
                Delete
              </button>
            </div>
            {e.description && (
              <p className="text-sm text-muted" style={{ marginTop: "0.5rem", marginBottom: 0 }}>
                {e.description}
              </p>
            )}
          </div>
        ))}
        {!isLoading && encounters.length === 0 && (
          <p className="text-muted">No encounters yet.</p>
        )}
      </div>
    </div>
  );
}
