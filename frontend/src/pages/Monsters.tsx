import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, SearchX } from "lucide-react";
import { monstersApi } from "../api/monsters";
import type { Monster } from "../api/types";
import MonsterStatBlock from "../components/MonsterStatBlock";
import { useIsCompact } from "../hooks/useIsCompact";

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

/** CR as a calm difficulty tint: neutral up to 4, amber to 10, red beyond (Lamplit). */
function crPillClass(cr: string): string {
  const n = cr.includes("/") ? 0 : parseFloat(cr);
  if (n <= 4) return "pill";
  if (n <= 10) return "pill pill-amber";
  return "pill pill-danger";
}

/** A muted label beside a mono number ("HP 135"); the full name on hover. */
function Num({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
  return (
    <span title={title} style={{ whiteSpace: "nowrap", fontSize: "0.875rem" }}>
      <span style={{ color: "var(--muted)" }}>{label}</span>{" "}
      <span className="num" style={{ color: "var(--text2)" }}>{children}</span>
    </span>
  );
}

export default function Monsters() {
  const phone = useIsCompact(640);
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

  const filtered = !!search.trim() || cr !== "All" || creatureType !== "All Types";

  return (
    <div className="fade-in ql-page" style={{ "--page-max": "900px" } as React.CSSProperties}>
      {/* Page Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Monster Compendium</h1>
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          SRD 5.1 — Systems Reference Document. {phone ? "Tap" : "Click"} a monster for its stat
          block.
        </p>
      </div>

      {/* Filters: search on its own row on a phone, the two selects under it. */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div
          className="ql-filters"
          style={phone ? undefined : { gridTemplateColumns: "1fr auto auto" }}
        >
          <div className="form-group ql-filter-wide">
            <label htmlFor="monster-search">Search</label>
            <input
              id="monster-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search monsters…"
            />
          </div>

          <div className="form-group">
            <label htmlFor="cr-filter">Challenge rating</label>
            <select
              id="cr-filter"
              value={cr}
              onChange={(e) => setCr(e.target.value)}
              style={phone ? undefined : { minWidth: 120 }}
            >
              {CR_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "All" ? "All CRs" : `CR ${option}`}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="type-filter">Creature type</label>
            <select
              id="type-filter"
              value={creatureType}
              onChange={(e) => setCreatureType(e.target.value)}
              style={phone ? undefined : { minWidth: 140 }}
            >
              {CREATURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type === "All Types" ? "All types" : type}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Count */}
      <div style={{ marginBottom: "0.75rem" }}>
        <span className="text-sm text-muted">
          {isLoading
            ? "Loading monsters…"
            : `Showing ${monsters?.length ?? 0} monster${monsters?.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* Empty State */}
      {!isLoading && monsters && monsters.length === 0 && (
        <div className="card empty-state">
          <div className="empty-icon">
            <SearchX size={28} aria-hidden />
          </div>
          <p style={{ color: "var(--text)", marginBottom: "0.35rem" }}>No monsters match.</p>
          <p className="text-sm" style={{ marginBottom: filtered ? "1rem" : 0 }}>
            Try another name, challenge rating or creature type.
          </p>
          {filtered && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSearch("");
                setCr("All");
                setCreatureType("All Types");
              }}
            >
              Clear the filters
            </button>
          )}
        </div>
      )}

      {/* Monster List */}
      {!isLoading && monsters && monsters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {monsters.map((monster) =>
            phone ? (
              // Phone: the whole row is the button; name and CR, then type, then the numbers.
              <button
                key={monster.id}
                type="button"
                className="card"
                onClick={() => setSelected(monster)}
                aria-label={`${monster.name}, challenge rating ${monster.challenge_rating}: open the stat block`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "0.75rem 0.9rem",
                  cursor: "pointer",
                  color: "var(--text)",
                  fontSize: "1rem",
                }}
              >
                <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}>
                  <span className="story" style={{ fontSize: "1.1rem", fontWeight: 700, minWidth: 0 }}>
                    {monster.name}
                  </span>
                  <span className={crPillClass(monster.challenge_rating)} style={{ flexShrink: 0 }}>
                    CR <span className="num">{monster.challenge_rating}</span>
                  </span>
                </span>
                <span style={{ display: "block", fontSize: "0.875rem", color: "var(--muted)", marginTop: "0.1rem" }}>
                  {monster.size} {monster.creature_type}
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.9rem", marginTop: "0.4rem" }}>
                  <Num label="HP" title="Hit points">{monster.hp_average}</Num>
                  <Num label="AC" title="Armor class">{monster.ac}</Num>
                  <Num label="XP" title="Experience points">{monster.xp.toLocaleString()}</Num>
                  <ChevronRight size={18} aria-hidden style={{ marginLeft: "auto", color: "var(--muted)" }} />
                </span>
              </button>
            ) : (
              <div
                key={monster.id}
                className="card"
                onClick={() => setSelected(monster)}
                style={{
                  padding: "0.75rem 1rem",
                  cursor: "pointer",
                }}
              >
                <div
                  className="flex items-center"
                  style={{ justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap" }}
                >
                  {/* Left: Name + CR */}
                  <div className="flex items-center gap-2" style={{ minWidth: 0 }}>
                    <span
                      className="story"
                      style={{ color: "var(--text)", fontSize: "1rem", fontWeight: 700, whiteSpace: "nowrap" }}
                    >
                      {monster.name}
                    </span>
                    <span className={crPillClass(monster.challenge_rating)}>
                      CR <span className="num">{monster.challenge_rating}</span>
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
                    <Num label="HP" title="Hit points">{monster.hp_average}</Num>
                    <span style={{ color: "var(--border2)" }}>·</span>
                    <Num label="AC" title="Armor class">{monster.ac}</Num>
                    <span style={{ color: "var(--border2)" }}>·</span>
                    <Num label="XP" title="Experience points">{monster.xp.toLocaleString()}</Num>
                    <button
                      className="btn btn-ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(monster);
                      }}
                      style={{ padding: "0.25rem 0.6rem", fontSize: "0.8125rem", marginLeft: "0.25rem" }}
                    >
                      View stats
                    </button>
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Stat block: a modal on desktop, a bottom sheet on a phone. */}
      {selected && (
        <MonsterStatBlock monster={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
