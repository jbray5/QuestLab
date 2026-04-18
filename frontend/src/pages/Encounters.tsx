import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { encountersApi } from "../api/encounters";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { monstersApi } from "../api/monsters";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Encounter, Monster, RosterEntry } from "../api/types";

const DIFFICULTY_BADGE: Record<string, string> = {
  Low: "badge-ready",
  Moderate: "badge-draft",
  High: "badge-progress",
  Deadly: "badge-artifact",
};

const DIFFICULTY_COLOR: Record<string, string> = {
  Low: "#4caf50",
  Moderate: "#ff9800",
  High: "#ff5722",
  Deadly: "#f44336",
};

// ── Roster editor (inline inside expanded encounter card) ─────────────────────

interface RosterEditorProps {
  encounter: Encounter;
  pcLevels: number[];
  onSaved: () => void;
}

function RosterEditor({ encounter, pcLevels, onSaved }: RosterEditorProps) {
  const qc = useQueryClient();

  // Local copy of the roster — edited freely, saved on button press
  const initialRoster: RosterEntry[] = (encounter.monster_roster ?? []).map((e) => ({
    monster_id: String(e.monster_id ?? ""),
    count: Number(e.count ?? 1),
    name: String(e.name ?? ""),
    xp: Number(e.xp ?? 0),
    cr: String(e.cr ?? "?"),
    hp: Number(e.hp ?? 10),
    ac: Number(e.ac ?? 10),
  }));
  const [roster, setRoster] = useState<RosterEntry[]>(initialRoster);

  // Monster search
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: searchResults = [], isFetching: searching } = useQuery({
    queryKey: ["monster-search", search],
    queryFn: () => monstersApi.list({ search }),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  });

  const saveMut = useMutation({
    mutationFn: () =>
      encountersApi.update(encounter.id, {
        monster_roster: roster.map((r) => ({
          monster_id: r.monster_id,
          count: r.count,
          name: r.name,
          xp: r.xp,
          cr: r.cr,
          hp: r.hp,
          ac: r.ac,
        })),
        pc_levels: pcLevels,
      }),
    onSuccess: () => {
      setSaveError(null);
      qc.invalidateQueries({ queryKey: ["encounters"] });
      onSaved();
    },
    onError: (err: Error) => setSaveError(err.message),
  });

  function addMonster(m: Monster) {
    setRoster((prev) => {
      const existing = prev.find((r) => r.monster_id === m.id);
      if (existing) {
        return prev.map((r) =>
          r.monster_id === m.id ? { ...r, count: r.count + 1 } : r,
        );
      }
      return [
        ...prev,
        { monster_id: m.id, count: 1, name: m.name, xp: m.xp, cr: m.challenge_rating, hp: m.hp_average, ac: m.ac },
      ];
    });
    setSearch("");
  }

  function setCount(monsterId: string, count: number) {
    if (count < 1) {
      setRoster((prev) => prev.filter((r) => r.monster_id !== monsterId));
    } else {
      setRoster((prev) =>
        prev.map((r) => (r.monster_id === monsterId ? { ...r, count } : r)),
      );
    }
  }

  function removeMonster(monsterId: string) {
    setRoster((prev) => prev.filter((r) => r.monster_id !== monsterId));
  }

  // XP preview (raw total; server applies multiplier)
  const rawXp = roster.reduce((sum, r) => sum + r.xp * r.count, 0);
  const totalMonsters = roster.reduce((sum, r) => sum + r.count, 0);

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* ── Monster search ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)", marginBottom: "0.3rem" }}>
          Search monsters to add
        </label>
        <div style={{ position: "relative", maxWidth: 380 }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Goblin, Troll, Beholder…"
            style={{ width: "100%" }}
          />
          {search.trim().length >= 2 && (
            <div style={{
              position: "absolute", top: "110%", left: 0, right: 0, zIndex: 30,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 6, maxHeight: 240, overflowY: "auto",
              boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            }}>
              {searching && (
                <div style={{ padding: "0.5rem 0.75rem", color: "var(--muted)", fontSize: "0.8rem" }}>
                  Searching…
                </div>
              )}
              {!searching && searchResults.length === 0 && (
                <div style={{ padding: "0.5rem 0.75rem", color: "var(--muted)", fontSize: "0.8rem" }}>
                  No monsters found.
                </div>
              )}
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMonster(m)}
                  style={{
                    display: "flex", width: "100%",
                    alignItems: "center", justifyContent: "space-between",
                    padding: "0.5rem 0.75rem", background: "none",
                    border: "none", cursor: "pointer", textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.85rem" }}>{m.name}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    CR {m.challenge_rating} · {m.xp} XP · {m.hp_average} HP
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Current roster ─────────────────────────────────────────────── */}
      {roster.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.85rem", fontStyle: "italic" }}>
          No monsters yet — search above to add some.
        </p>
      ) : (
        <div style={{ marginBottom: "0.75rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ textAlign: "left", padding: "0.3rem 0.5rem", color: "var(--muted)", fontWeight: 600, fontSize: "0.7rem" }}>Monster</th>
                <th style={{ textAlign: "center", padding: "0.3rem 0.5rem", color: "var(--muted)", fontWeight: 600, fontSize: "0.7rem" }}>CR</th>
                <th style={{ textAlign: "center", padding: "0.3rem 0.5rem", color: "var(--muted)", fontWeight: 600, fontSize: "0.7rem" }}>Count</th>
                <th style={{ textAlign: "right", padding: "0.3rem 0.5rem", color: "var(--muted)", fontWeight: 600, fontSize: "0.7rem" }}>XP each</th>
                <th style={{ textAlign: "right", padding: "0.3rem 0.5rem", color: "var(--muted)", fontWeight: 600, fontSize: "0.7rem" }}>Subtotal</th>
                <th style={{ width: 32 }}></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.monster_id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem 0.5rem", fontWeight: 600, color: "var(--gold)" }}>
                    {r.name}
                  </td>
                  <td style={{ textAlign: "center", padding: "0.4rem 0.5rem" }}>
                    <span className="badge badge-draft" style={{ fontSize: "0.65rem" }}>
                      {r.cr}
                    </span>
                  </td>
                  <td style={{ textAlign: "center", padding: "0.4rem 0.5rem" }}>
                    <div className="flex" style={{ alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0 0.35rem", fontSize: "0.8rem" }}
                        onClick={() => setCount(r.monster_id, r.count - 1)}
                      >−</button>
                      <span style={{ minWidth: 20, textAlign: "center", fontWeight: 700 }}>{r.count}</span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0 0.35rem", fontSize: "0.8rem" }}
                        onClick={() => setCount(r.monster_id, r.count + 1)}
                      >+</button>
                    </div>
                  </td>
                  <td style={{ textAlign: "right", padding: "0.4rem 0.5rem", color: "var(--muted)" }}>
                    {r.xp.toLocaleString()}
                  </td>
                  <td style={{ textAlign: "right", padding: "0.4rem 0.5rem", fontWeight: 600 }}>
                    {(r.xp * r.count).toLocaleString()}
                  </td>
                  <td style={{ padding: "0.4rem 0.5rem" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ fontSize: "0.65rem", padding: "0.1rem 0.3rem", opacity: 0.5 }}
                      onClick={() => removeMonster(r.monster_id)}
                      title="Remove"
                    >✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* XP summary */}
          <div className="flex gap-2" style={{
            marginTop: "0.5rem", padding: "0.5rem 0.5rem",
            background: "var(--surface2)", borderRadius: 6, fontSize: "0.82rem",
            alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{ color: "var(--muted)" }}>
              {totalMonsters} monster{totalMonsters !== 1 ? "s" : ""}
            </span>
            <span style={{ color: "var(--muted)" }}>·</span>
            <span>
              Raw XP: <strong>{rawXp.toLocaleString()}</strong>
            </span>
            {pcLevels.length > 0 && (
              <>
                <span style={{ color: "var(--muted)" }}>·</span>
                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                  Party: {pcLevels.length} PCs (avg lvl {Math.round(pcLevels.reduce((a, b) => a + b, 0) / pcLevels.length)})
                  — adjusted XP + difficulty calculated on save
                </span>
              </>
            )}
            {pcLevels.length === 0 && (
              <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                Add characters to your campaign for auto difficulty
              </span>
            )}
          </div>
        </div>
      )}

      {saveError && (
        <p className="text-sm" style={{ color: "var(--crimson2)", marginBottom: "0.5rem" }}>
          Error: {saveError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
        >
          {saveMut.isPending ? "Saving…" : "Save Roster"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Encounters() {
  const { adventureId } = useParams<{ adventureId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { activeCampaign, activeAdventure } = useCampaignStore();

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [difficulty, setDifficulty] = useState("Moderate");
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch encounters
  const { data: encounters = [], isLoading } = useQuery({
    queryKey: ["encounters", adventureId],
    queryFn: () => encountersApi.list(adventureId!),
    enabled: !!adventureId,
  });

  // Fetch adventure → campaign_id → characters (for pc_levels)
  const { data: adventure } = useQuery({
    queryKey: ["adventure", adventureId],
    queryFn: () => adventuresApi.get(adventureId!),
    enabled: !!adventureId,
  });

  const { data: characters = [] } = useQuery({
    queryKey: ["characters", adventure?.campaign_id],
    queryFn: () => charactersApi.list(adventure!.campaign_id),
    enabled: !!adventure?.campaign_id,
  });

  const pcLevels = characters.map((c) => c.level);

  const create = useMutation({
    mutationFn: () =>
      encountersApi.create(adventureId!, { name, description, difficulty }),
    onSuccess: (enc) => {
      setCreateError(null);
      qc.invalidateQueries({ queryKey: ["encounters", adventureId] });
      setName(""); setDescription(""); setDifficulty("Moderate");
      setShowForm(false);
      setExpandedId(enc.id); // auto-open roster editor
    },
    onError: (err: Error) => setCreateError(err.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => encountersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["encounters", adventureId] }),
  });

  return (
    <div className="fade-in">
      {/* Breadcrumb */}
      <nav className="text-sm" style={{ marginBottom: "0.75rem", opacity: 0.7 }}>
        <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => navigate("/")}>Dashboard</span>
        {activeCampaign && (
          <>
            {" / "}
            <span style={{ cursor: "pointer", color: "var(--gold)" }} onClick={() => navigate(`/campaigns/${activeCampaign.id}/adventures`)}>
              {activeCampaign.name}
            </span>
          </>
        )}
        {(activeAdventure || adventure) && (
          <>
            {" / "}
            <span style={{ cursor: "pointer", color: "var(--gold)" }}
              onClick={() => navigate(`/adventures/${(activeAdventure ?? adventure)!.id}/sessions`)}>
              {activeAdventure?.title ?? adventure?.title}
            </span>
          </>
        )}
        {" / "}
        <strong>Encounters</strong>
      </nav>
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
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
              placeholder="Goblin Ambush"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ resize: "vertical" }}
            />
          </div>
          <div className="form-group">
            <label>Starting Difficulty</label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="Low">Low</option>
              <option value="Moderate">Moderate</option>
              <option value="High">High</option>
              <option value="Deadly">Deadly</option>
            </select>
          </div>
          {createError && (
            <p className="text-sm" style={{ color: "var(--crimson2)", marginBottom: "0.5rem" }}>
              Error: {createError}
            </p>
          )}
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
        {encounters.map((e) => {
          const isOpen = expandedId === e.id;
          const rosterCount = (e.monster_roster ?? []).length;
          const monsterTotal = (e.monster_roster ?? []).reduce(
            (sum: number, r: Record<string, unknown>) => sum + Number(r.count ?? 1), 0,
          );

          return (
            <div key={e.id} className="card">
              {/* ── Header row ────────────────────────────────────────── */}
              <div className="flex items-center" style={{ justifyContent: "space-between" }}>
                <button
                  onClick={() => setExpandedId(isOpen ? null : e.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "0.5rem",
                    padding: 0, flex: 1, textAlign: "left",
                  }}
                >
                  <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                    {isOpen ? "▼" : "▶"}
                  </span>
                  <strong style={{ color: "var(--gold)", fontSize: "1rem" }}>{e.name}</strong>
                  <span
                    className={`badge ${DIFFICULTY_BADGE[e.difficulty] ?? "badge-draft"}`}
                    style={{ color: DIFFICULTY_COLOR[e.difficulty] }}
                  >
                    {e.difficulty}
                  </span>
                  {e.xp_budget > 0 && (
                    <span className="text-mono text-sm" style={{ color: "var(--muted)" }}>
                      {e.xp_budget.toLocaleString()} XP
                    </span>
                  )}
                  {rosterCount > 0 && (
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      · {monsterTotal} monster{monsterTotal !== 1 ? "s" : ""} ({rosterCount} type{rosterCount !== 1 ? "s" : ""})
                    </span>
                  )}
                  {rosterCount === 0 && (
                    <span className="text-sm" style={{ color: "var(--muted)", fontStyle: "italic" }}>
                      · no monsters yet
                    </span>
                  )}
                </button>

                <button
                  className="btn btn-danger"
                  style={{ fontSize: "0.75rem", flexShrink: 0 }}
                  onClick={() => window.confirm("Delete encounter?") && del.mutate(e.id)}
                >
                  Delete
                </button>
              </div>

              {/* ── Description ───────────────────────────────────────── */}
              {e.description && (
                <p className="text-sm text-muted" style={{ marginTop: "0.4rem", marginBottom: 0 }}>
                  {e.description}
                </p>
              )}

              {/* ── Monster roster (collapsed summary) ────────────────── */}
              {!isOpen && rosterCount > 0 && (
                <div className="flex" style={{ gap: "0.4rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  {(e.monster_roster ?? []).map((r: Record<string, unknown>, i: number) => (
                    <span
                      key={i}
                      className="badge badge-draft"
                      style={{ fontSize: "0.7rem" }}
                    >
                      {String(r.name ?? "?")} ×{Number(r.count ?? 1)}
                    </span>
                  ))}
                </div>
              )}

              {/* ── Expanded roster editor ─────────────────────────────── */}
              {isOpen && (
                <RosterEditor
                  encounter={e}
                  pcLevels={pcLevels}
                  onSaved={() => setExpandedId(null)}
                />
              )}
            </div>
          );
        })}
        {!isLoading && encounters.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">💀</div>
            <p>No encounters yet — create one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
