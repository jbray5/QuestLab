import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, Plus, Swords, X } from "lucide-react";
import { AI_ON } from "../lib/flags";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { encountersApi } from "../api/encounters";
import type { ThemedMonsterSuggestion } from "../api/encounters";
import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { monstersApi } from "../api/monsters";
import { useCampaignStore } from "../stores/useCampaignStore";
import type { Encounter, Monster, RosterEntry } from "../api/types";
import DifficultyMeter from "../components/encounter-builder/DifficultyMeter";
import SuggestionsPanel from "../components/encounter-builder/SuggestionsPanel";
import { plural } from "../lib/plural";
import RowMenu from "../components/RowMenu";
import {
  DIFFICULTY_HELP,
  DIFFICULTY_HOW,
  DIFFICULTY_PILL,
} from "../components/encounter-builder/difficultyHelp";

/** Roster table header cell (Console table: small, muted, sentence case). */
const TH: React.CSSProperties = {
  padding: "0.4rem 0.6rem",
  color: "var(--muted)",
  fontWeight: 500,
  fontSize: "0.75rem",
  background: "var(--surface2)",
};
const TD: React.CSSProperties = { padding: "0.45rem 0.6rem" };

// ── Roster editor (inline inside expanded encounter card) ─────────────────────

interface RosterEditorProps {
  encounter: Encounter;
  adventureId: string;
  pcLevels: number[];
  onSaved: () => void;
}

/** The roster as the API stores it. */
function rosterPayload(entries: RosterEntry[]) {
  return entries.map((r) => ({
    monster_id: r.monster_id,
    count: r.count,
    name: r.name,
    xp: r.xp,
    cr: r.cr,
    hp: r.hp,
    ac: r.ac,
  }));
}

function RosterEditor({ encounter, adventureId, pcLevels, onSaved }: RosterEditorProps) {
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
  // Review 10/30 — the roster saves itself. `savedKey` is what the server
  // holds; anything else on screen is an unsaved change.
  const [savedKey, setSavedKey] = useState(() => JSON.stringify(rosterPayload(initialRoster)));
  const payloadKey = JSON.stringify(rosterPayload(roster));
  const dirty = payloadKey !== savedKey;

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
    mutationFn: (entries: RosterEntry[]) =>
      encountersApi.update(encounter.id, {
        monster_roster: rosterPayload(entries),
        pc_levels: pcLevels,
      }),
    onSuccess: (_e, entries) => {
      setSaveError(null);
      setSavedKey(JSON.stringify(rosterPayload(entries)));
      qc.invalidateQueries({ queryKey: ["encounters"] });
    },
    onError: (err: Error) => setSaveError(err.message),
  });
  const save = saveMut.mutate;

  // Autosave a moment after the last change.
  useEffect(() => {
    if (!dirty) return;
    const t = window.setTimeout(() => save(roster), 700);
    return () => window.clearTimeout(t);
  }, [dirty, payloadKey, roster, save]);

  // Leaving the page with a change still unsaved asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Closing the editor mid-change still saves it.
  const pending = useRef<{ dirty: boolean; roster: RosterEntry[] }>({ dirty: false, roster });
  useEffect(() => {
    pending.current = { dirty, roster };
  }, [dirty, roster]);
  useEffect(() => {
    const id = encounter.id;
    return () => {
      if (!pending.current.dirty) return;
      void encountersApi
        .update(id, { monster_roster: rosterPayload(pending.current.roster), pc_levels: pcLevels })
        .then(() => qc.invalidateQueries({ queryKey: ["encounters"] }));
    };
    // Unmount only: the ref carries the latest roster.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Plan 31 — live difficulty preview. Keyed on the roster contents so
  // each unique combination triggers one fetch + then caches.
  const rosterKey = useMemo(
    () =>
      JSON.stringify(
        roster.map((r) => ({ monster_id: r.monster_id, count: r.count })),
      ),
    [roster],
  );
  const { data: difficultyPreview, isFetching: previewLoading } = useQuery({
    queryKey: ["encounter-preview", adventureId, rosterKey],
    queryFn: () =>
      encountersApi.previewDifficulty(
        adventureId,
        roster.map((r) => ({ monster_id: r.monster_id, count: r.count })),
      ),
    enabled: pcLevels.length > 0,
    staleTime: 30_000,
  });

  function addSuggestion(s: ThemedMonsterSuggestion) {
    setRoster((prev) => {
      const existing = prev.find((r) => r.monster_id === s.monster_id);
      if (existing) {
        return prev.map((r) =>
          r.monster_id === s.monster_id
            ? { ...r, count: r.count + s.count }
            : r,
        );
      }
      // Pull monster details lazily — store what we know now; details
      // for HP/AC come from the catalog when we display them, but the
      // suggestion already carries enough for XP math + display.
      return [
        ...prev,
        {
          monster_id: s.monster_id,
          count: s.count,
          name: s.monster_name,
          xp: s.xp,
          cr: s.challenge_rating,
          hp: 0,
          ac: 0,
        },
      ];
    });
  }

  function addAllSuggestions(items: ThemedMonsterSuggestion[]) {
    items.forEach(addSuggestion);
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      {/* Plan 31 — themed AI suggestions */}
      {AI_ON && (<SuggestionsPanel
        adventureId={adventureId}
        onAdd={addSuggestion}
        onAddAll={addAllSuggestions}
      />)}

      {/* Plan 31 — live difficulty meter */}
      <div style={{ marginBottom: "0.75rem" }}>
        <DifficultyMeter preview={difficultyPreview} isLoading={previewLoading} />
      </div>

      {/* ── Monster search ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: "0.75rem" }}>
        <label
          htmlFor={`monster-search-${encounter.id}`}
          style={{ display: "block", fontSize: "0.875rem", color: "var(--text2)", marginBottom: "0.3rem" }}
        >
          Add monsters
        </label>
        <div style={{ position: "relative", maxWidth: 420 }}>
          <input
            id={`monster-search-${encounter.id}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name — e.g. Goblin, Troll, Beholder…"
            style={{ width: "100%" }}
          />
          {search.trim().length >= 2 && (
            <div style={{
              position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 30,
              background: "var(--surface)", border: "1px solid var(--border2)",
              borderRadius: 8, maxHeight: 260, overflowY: "auto",
              boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
            }}>
              {searching && (
                <div style={{ padding: "0.5rem 0.75rem", color: "var(--muted)", fontSize: "0.875rem" }}>
                  Searching…
                </div>
              )}
              {!searching && searchResults.length === 0 && (
                <div style={{ padding: "0.5rem 0.75rem", color: "var(--muted)", fontSize: "0.875rem" }}>
                  No monsters found.
                </div>
              )}
              {searchResults.map((m) => (
                <button
                  key={m.id}
                  onClick={() => addMonster(m)}
                  style={{
                    display: "flex", width: "100%", gap: "0.75rem",
                    alignItems: "center", justifyContent: "space-between",
                    padding: "0.5rem 0.75rem", background: "none",
                    border: "none", cursor: "pointer", textAlign: "left",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text)", fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  <span className="story" style={{ fontWeight: 700, fontSize: "1rem" }}>{m.name}</span>
                  <span className="num" style={{ fontSize: "0.8125rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
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
        <p style={{ color: "var(--muted)", fontSize: "0.875rem" }}>
          No monsters yet — search above to add some.
        </p>
      ) : (
        <div style={{ marginBottom: "0.75rem" }}>
          <div className="ql-table" style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", minWidth: 460 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                <th style={{ ...TH, textAlign: "left" }}>Monster</th>
                <th style={{ ...TH, textAlign: "center" }} title="Challenge rating — roughly the party level it's a fair fight for">CR</th>
                <th style={{ ...TH, textAlign: "center" }}>How many</th>
                <th style={{ ...TH, textAlign: "right" }} title="Experience points for one">XP each</th>
                <th style={{ ...TH, textAlign: "right" }}>XP total</th>
                <th style={{ ...TH, width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.monster_id} className="ql-table-row">
                  <td style={TD}>
                    <span className="story" style={{ fontWeight: 700, fontSize: "1rem", color: "var(--text)" }}>
                      {r.name}
                    </span>
                  </td>
                  <td className="num" style={{ ...TD, textAlign: "center", color: "var(--text2)" }}>
                    {r.cr}
                  </td>
                  <td style={{ ...TD, textAlign: "center" }}>
                    <div className="flex" style={{ alignItems: "center", justifyContent: "center", gap: "0.3rem", flexWrap: "nowrap" }}>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.15rem", minHeight: 0, border: "none" }}
                        onClick={() => setCount(r.monster_id, r.count - 1)}
                        aria-label={`One fewer ${r.name}`}
                        title="One fewer"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="num" style={{ minWidth: 22, textAlign: "center", fontWeight: 600 }}>{r.count}</span>
                      <button
                        className="btn btn-ghost"
                        style={{ padding: "0.15rem", minHeight: 0, border: "none" }}
                        onClick={() => setCount(r.monster_id, r.count + 1)}
                        aria-label={`One more ${r.name}`}
                        title="One more"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </td>
                  <td className="num" style={{ ...TD, textAlign: "right", color: "var(--muted)" }}>
                    {r.xp.toLocaleString()}
                  </td>
                  <td className="num" style={{ ...TD, textAlign: "right", fontWeight: 600 }}>
                    {(r.xp * r.count).toLocaleString()}
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>
                    <button
                      className="btn btn-ghost"
                      style={{ padding: "0.2rem", minHeight: 0, border: "none", color: "var(--muted)" }}
                      onClick={() => removeMonster(r.monster_id)}
                      title="Remove"
                      aria-label={`Remove ${r.name}`}
                    >
                      <X size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* XP summary */}
          <div className="flex gap-2" style={{
            marginTop: "0.5rem", padding: "0.5rem 0.65rem",
            background: "var(--surface2)", borderRadius: 8, fontSize: "0.875rem",
            alignItems: "center", flexWrap: "wrap",
          }}>
            <span style={{ color: "var(--muted)" }}>
              <span className="num">{totalMonsters}</span> monster{totalMonsters !== 1 ? "s" : ""}
            </span>
            <span style={{ color: "var(--muted)" }}>·</span>
            <span title="The monsters' XP added up, before any adjustment">
              <span style={{ color: "var(--muted)" }}>Total XP</span>{" "}
              <strong className="num" style={{ fontWeight: 600 }}>{rawXp.toLocaleString()}</strong>
            </span>
            {pcLevels.length > 0 && (
              <>
                <span style={{ color: "var(--muted)" }}>·</span>
                <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                  Party: {plural(pcLevels.length, "PC")}, average level{" "}
                  <span className="num">{Math.round(pcLevels.reduce((a, b) => a + b, 0) / pcLevels.length)}</span>
                  {" "}— the saved difficulty updates as the roster saves
                </span>
              </>
            )}
            {pcLevels.length === 0 && (
              <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                Add characters to your campaign to see the difficulty
              </span>
            )}
          </div>
        </div>
      )}

      {saveError && (
        <p className="text-sm" style={{ color: "var(--danger-text)", marginBottom: "0.5rem" }}>
          Couldn&rsquo;t save the roster: {saveError}{" "}
          <button className="btn btn-ghost" style={{ fontSize: "0.8125rem", minHeight: 0, padding: "0.2rem 0.6rem" }} onClick={() => save(roster)}>
            Try again
          </button>
        </p>
      )}

      <div className="flex gap-2" style={{ alignItems: "center" }}>
        <button
          className="btn btn-secondary"
          onClick={() => {
            if (dirty) save(roster, { onSuccess: () => onSaved() });
            else onSaved();
          }}
          disabled={saveMut.isPending}
        >
          Done
        </button>
        <span
          className="text-sm"
          role="status"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.3rem",
            color: dirty || saveError ? "var(--amber-text)" : "var(--muted)",
          }}
        >
          {saveMut.isPending ? (
            "Saving…"
          ) : saveError ? (
            "Unsaved changes"
          ) : dirty ? (
            "Unsaved changes — saving…"
          ) : (
            <>
              <Check size={14} /> All changes saved
            </>
          )}
        </span>
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
      <nav className="text-sm" style={{ marginBottom: "0.75rem", color: "var(--muted)" }}>
        <span style={{ cursor: "pointer", color: "var(--accent-text)" }} onClick={() => navigate("/")}>Dashboard</span>
        {activeCampaign && (
          <>
            {" / "}
            <span style={{ cursor: "pointer", color: "var(--accent-text)" }} onClick={() => navigate(`/campaigns/${activeCampaign.id}/sessions`)}>
              {activeCampaign.name}
            </span>
          </>
        )}
        {(activeAdventure || adventure) && (
          <>
            {" / "}
            <span style={{ cursor: "pointer", color: "var(--accent-text)" }}
              onClick={() => navigate(`/adventures/${(activeAdventure ?? adventure)!.id}/sessions`)}>
              {activeAdventure?.title ?? adventure?.title}
            </span>
          </>
        )}
        {" / "}
        <span style={{ color: "var(--text2)" }}>Encounters</span>
      </nav>
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between", gap: "1rem" }}>
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Encounters</h1>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            The fights you plan for this arc — pick the monsters and see how hard they are for your party.
          </p>
        </div>
        <button className={showForm ? "btn btn-secondary" : "btn btn-primary"} onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <X size={16} /> Cancel
            </>
          ) : (
            <>
              <Plus size={16} /> New encounter
            </>
          )}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 480 }}>
          <h3>New encounter</h3>
          <div className="form-group">
            <label>Name *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && name.trim() && create.mutate()}
              placeholder="e.g. Goblin Ambush"
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
            <label title="A first guess — once it has monsters, the difficulty is worked out for your party">
              Starting difficulty
            </label>
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="Low">Low</option>
              <option value="Moderate">Moderate</option>
              <option value="High">High</option>
              <option value="Deadly">Deadly</option>
            </select>
          </div>
          {createError && (
            <p className="text-sm" style={{ color: "var(--danger-text)", marginBottom: "0.5rem" }}>
              Error: {createError}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={() => create.mutate()}
            disabled={!name.trim() || create.isPending}
          >
            {create.isPending ? "Creating…" : "Create encounter"}
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
                  aria-expanded={isOpen}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: "0.55rem",
                    padding: 0, flex: 1, textAlign: "left", flexWrap: "wrap",
                    color: "inherit", fontFamily: "inherit", minWidth: 0,
                  }}
                >
                  {isOpen ? (
                    <ChevronDown size={16} style={{ color: "var(--muted)" }} />
                  ) : (
                    <ChevronRight size={16} style={{ color: "var(--muted)" }} />
                  )}
                  <strong className="story" style={{ color: "var(--text)", fontSize: "1.2rem", fontWeight: 700 }}>
                    {e.name}
                  </strong>
                  <span
                    className={DIFFICULTY_PILL[e.difficulty] ?? "pill"}
                    title={
                      (DIFFICULTY_HELP[e.difficulty] ?? e.difficulty) +
                      " " +
                      (pcLevels.length && e.xp_budget > 0
                        ? DIFFICULTY_HOW
                        : "This is your pick for now — add characters and monsters and it's worked out for you.")
                    }
                  >
                    {e.difficulty}
                  </span>
                  {e.xp_budget > 0 && (
                    <span className="num text-sm" style={{ color: "var(--muted)" }} title="The monsters' total XP">
                      {e.xp_budget.toLocaleString()} XP
                    </span>
                  )}
                  {rosterCount > 0 && (
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      · {monsterTotal} monster{monsterTotal !== 1 ? "s" : ""} ({rosterCount} kind{rosterCount !== 1 ? "s" : ""})
                    </span>
                  )}
                  {rosterCount === 0 && (
                    <span className="text-sm" style={{ color: "var(--muted)" }}>
                      · no monsters yet
                    </span>
                  )}
                </button>

                <RowMenu
                  label={`More for ${e.name}`}
                  items={[
                    {
                      label: "Delete encounter…",
                      danger: true,
                      confirm: `Delete the encounter "${e.name}"? This can't be undone.`,
                      onSelect: () => del.mutate(e.id),
                    },
                  ]}
                />
              </div>

              {/* ── Description ───────────────────────────────────────── */}
              {e.description && (
                <p
                  className="story"
                  style={{ marginTop: "0.4rem", marginBottom: 0, fontSize: "1rem", color: "var(--text2)" }}
                >
                  {e.description}
                </p>
              )}

              {/* ── Monster roster (collapsed summary) ────────────────── */}
              {!isOpen && rosterCount > 0 && (
                <div className="flex" style={{ gap: "0.4rem", marginTop: "0.6rem", flexWrap: "wrap" }}>
                  {(e.monster_roster ?? []).map((r: Record<string, unknown>, i: number) => (
                    <span key={i} className="pill">
                      <span className="story" style={{ fontSize: "0.9375rem", color: "var(--text)" }}>
                        {String(r.name ?? "?")}
                      </span>
                      <span className="num">×{Number(r.count ?? 1)}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* ── Expanded roster editor ─────────────────────────────── */}
              {isOpen && (
                <RosterEditor
                  encounter={e}
                  adventureId={adventureId!}
                  pcLevels={pcLevels}
                  onSaved={() => setExpandedId(null)}
                />
              )}
            </div>
          );
        })}
        {!isLoading && encounters.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">
              <Swords size={28} />
            </div>
            <p style={{ maxWidth: 460, margin: "0 auto" }}>
              Plan a fight before the session: name it, add monsters, and the difficulty is worked
              out for your party. Start with New encounter.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
