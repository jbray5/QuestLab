import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { monstersApi } from "../api/monsters";
import type { Monster } from "../api/types";
import MonsterStatBlock from "../components/MonsterStatBlock";

const CR_OPTIONS = [
  "All", "0", "1/8", "1/4", "1/2",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
];

const CREATURE_TYPES = [
  "All Types",
  "Aberration",
  "Beast",
  "Celestial",
  "Construct",
  "Dragon",
  "Elemental",
  "Fey",
  "Fiend",
  "Giant",
  "Humanoid",
  "Monstrosity",
  "Ooze",
  "Plant",
  "Undead",
];

function crBadgeClass(cr: string): string {
  if (cr === "0") return "badge-ready";
  if (["1/8", "1/4", "1/2"].includes(cr)) return "badge-ready";
  const n = parseFloat(cr);
  if (n <= 4) return "badge-draft";
  if (n <= 10) return "badge-progress";
  return "badge-artifact";
}

export default function Monsters() {
  const [search, setSearch] = useState("");
  const [cr, setCr] = useState("All");
  const [creatureType, setCreatureType] = useState("All Types");
  const [selected, setSelected] = useState<Monster | null>(null);

  const queryParams = {
    search: search.trim() || undefined,
    cr: cr !== "All" ? cr : undefined,
    creature_type: creatureType !== "All Types" ? creatureType : undefined,
  };

  const { data: monsters, isLoading } = useQuery({
    queryKey: ["monsters", search, cr, creatureType],
    queryFn: () => monstersApi.list(queryParams),
  });

  return (
    <div className="fade-in" style={{ maxWidth: "900px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            color: "var(--gold)",
            fontSize: "2rem",
            marginBottom: "0.25rem",
          }}
        >
          Monster Compendium
        </h1>
        <p className="text-muted text-sm">SRD 5.1 — Systems Reference Document</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: "0.75rem",
            alignItems: "end",
          }}
        >
          {/* Search */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label
              htmlFor="monster-search"
              className="text-sm"
              style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-muted)" }}
            >
              Search
            </label>
            <input
              id="monster-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search monsters..."
              style={{
                width: "100%",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0.5rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.9rem",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* CR Filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label
              htmlFor="cr-filter"
              className="text-sm"
              style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-muted)" }}
            >
              Challenge Rating
            </label>
            <select
              id="cr-filter"
              value={cr}
              onChange={(e) => setCr(e.target.value)}
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0.5rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.9rem",
                minWidth: "120px",
              }}
            >
              {CR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All CRs" : `CR ${option}`}
                </option>
              ))}
            </select>
          </div>

          {/* Creature Type Filter */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label
              htmlFor="type-filter"
              className="text-sm"
              style={{ display: "block", marginBottom: "0.25rem", color: "var(--text-muted)" }}
            >
              Creature Type
            </label>
            <select
              id="type-filter"
              value={creatureType}
              onChange={(e) => setCreatureType(e.target.value)}
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: "4px",
                padding: "0.5rem 0.75rem",
                color: "var(--text)",
                fontSize: "0.9rem",
                minWidth: "140px",
              }}
            >
              {CREATURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: "0.75rem" }}>
        {isLoading ? (
          <span className="text-sm text-muted">Loading...</span>
        ) : (
          <span className="text-sm text-muted">
            Showing {monsters?.length ?? 0} monster{monsters?.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div
          style={{
            textAlign: "center",
            padding: "3rem",
            color: "var(--text-muted)",
            fontFamily: "var(--font-serif)",
            fontSize: "1.1rem",
          }}
        >
          Consulting the tomes...
        </div>
      )}

      {/* Empty State */}
      {!isLoading && monsters && monsters.length === 0 && (
        <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
          <p
            style={{
              fontFamily: "var(--font-serif)",
              color: "var(--gold)",
              fontSize: "1.2rem",
              marginBottom: "0.5rem",
            }}
          >
            No monsters found
          </p>
          <p className="text-muted text-sm">Try adjusting your search or filters.</p>
        </div>
      )}

      {/* Monster List */}
      {!isLoading && monsters && monsters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {monsters.map((monster) => (
            <div
              key={monster.id}
              className="card"
              onClick={() => setSelected(monster)}
              style={{
                padding: "0.75rem 1rem",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "var(--gold)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLDivElement).style.borderColor = "";
              }}
            >
              <div
                className="flex items-center"
                style={{ justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}
              >
                {/* Left: Name + CR badge */}
                <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: "var(--font-serif)",
                      color: "var(--gold)",
                      fontSize: "1rem",
                      fontWeight: "bold",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {monster.name}
                  </span>
                  <span className={`badge ${crBadgeClass(monster.challenge_rating)}`}>
                    CR {monster.challenge_rating}
                  </span>
                </div>

                {/* Center: Type + Size */}
                <div style={{ flex: 1, minWidth: "120px" }}>
                  <span className="text-sm text-muted">
                    {monster.size} {monster.creature_type}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <span
                    className="text-sm text-muted text-mono"
                    title="Hit Points"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    HP {monster.hp_average}
                  </span>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span
                    className="text-sm text-muted text-mono"
                    title="Armor Class"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    AC {monster.ac}
                  </span>
                  <span style={{ color: "var(--border)" }}>·</span>
                  <span
                    className="text-sm text-muted text-mono"
                    title="Experience Points"
                    style={{ whiteSpace: "nowrap" }}
                  >
                    {monster.xp.toLocaleString()} XP
                  </span>
                  <button
                    className="btn btn-ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(monster);
                    }}
                    style={{ padding: "0.25rem 0.6rem", fontSize: "0.8rem", marginLeft: "0.25rem" }}
                  >
                    View Stats
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stat Block Modal */}
      {selected && (
        <MonsterStatBlock monster={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
