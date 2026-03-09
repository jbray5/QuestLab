import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { sessionsApi } from "../api/sessions";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "badge-draft",
  READY: "badge-ready",
  IN_PROGRESS: "badge-progress",
  COMPLETE: "badge-complete",
};

const STATUS_EMOJI: Record<string, string> = {
  DRAFT: "📝",
  READY: "✅",
  IN_PROGRESS: "⚔️",
  COMPLETE: "🏁",
};

export default function Sessions() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [sessionNumber, setSessionNumber] = useState(1);
  const [datePlanned, setDatePlanned] = useState("");

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["sessions", adventureId],
    queryFn: () => sessionsApi.list(adventureId!),
    enabled: !!adventureId,
  });

  const create = useMutation({
    mutationFn: () =>
      sessionsApi.create(adventureId!, {
        title,
        session_number: sessionNumber,
        date_planned: datePlanned || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", adventureId] });
      setTitle(""); setSessionNumber(sessions.length + 2); setDatePlanned("");
      setShowForm(false);
    },
  });

  const advance = useMutation({
    mutationFn: (id: string) => sessionsApi.advance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", adventureId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => sessionsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sessions", adventureId] }),
  });

  return (
    <div className="fade-in">
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Sessions</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Cancel" : "+ New Session"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 480 }}>
          <h3>New Session</h3>
          <div className="grid-2">
            <div className="form-group">
              <label>Session # *</label>
              <input type="number" value={sessionNumber} onChange={(e) => setSessionNumber(Number(e.target.value))} min={1} />
            </div>
            <div className="form-group">
              <label>Date Planned</label>
              <input type="date" value={datePlanned} onChange={(e) => setDatePlanned(e.target.value)} />
            </div>
          </div>
          <div className="form-group">
            <label>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The Heist…" />
          </div>
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={create.isPending}
          >
            {create.isPending ? "Creating…" : "Create Session"}
          </button>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading…</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {sessions.map((s) => (
          <div key={s.id} className="card">
            <div className="flex items-center" style={{ justifyContent: "space-between" }}>
              <div className="flex items-center gap-2">
                <span style={{ fontSize: "1.2rem" }}>{STATUS_EMOJI[s.status] ?? "📝"}</span>
                <div>
                  <strong style={{ color: "var(--gold)" }}>
                    Session {s.session_number}{s.title ? `: ${s.title}` : ""}
                  </strong>
                  <div className="flex items-center gap-2" style={{ marginTop: "0.2rem" }}>
                    <span className={`badge ${STATUS_BADGE[s.status] ?? "badge-draft"}`}>
                      {s.status}
                    </span>
                    {s.date_planned && (
                      <span className="text-sm text-muted">{s.date_planned}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn btn-secondary"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => navigate(`/sessions/${s.id}/run`)}
                >
                  ▶ Run
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => advance.mutate(s.id)}
                  disabled={s.status === "COMPLETE" || advance.isPending}
                >
                  Advance →
                </button>
                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.7rem" }}
                  onClick={() => window.confirm("Delete session?") && del.mutate(s.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
        {!isLoading && sessions.length === 0 && (
          <p className="text-muted">No sessions yet — create one above.</p>
        )}
      </div>
    </div>
  );
}
