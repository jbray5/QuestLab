import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { spellsApi } from "../api/spells";
import type { Spell } from "../api/types";

const LEVELS = ["All", "Cantrip", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const SCHOOLS = [
  "All",
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
] as const;

const CLASSES = [
  "All",
  "Bard",
  "Cleric",
  "Druid",
  "Paladin",
  "Ranger",
  "Sorcerer",
  "Warlock",
  "Wizard",
] as const;

const SCHOOL_COLORS: Record<string, string> = {
  Abjuration: "#6090f0",
  Conjuration: "#f0c060",
  Divination: "#a0b0d0",
  Enchantment: "#e070c0",
  Evocation: "#f06060",
  Illusion: "#b070e0",
  Necromancy: "#80a060",
  Transmutation: "#60c0a0",
};

function levelLabel(lvl: number): string {
  return lvl === 0 ? "Cantrip" : `Level ${lvl}`;
}

function componentsString(s: Spell): string {
  const parts: string[] = [];
  if (s.components_v) parts.push("V");
  if (s.components_s) parts.push("S");
  if (s.components_m) parts.push(`M (${s.components_m})`);
  return parts.join(", ") || "None";
}

export default function Spells() {
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("All");
  const [school, setSchool] = useState<(typeof SCHOOLS)[number]>("All");
  const [classFilter, setClassFilter] = useState<(typeof CLASSES)[number]>("All");
  const [showRituals, setShowRituals] = useState(false);
  const [showConcentration, setShowConcentration] = useState(false);
  const [selected, setSelected] = useState<Spell | null>(null);

  const params = useMemo(
    () => ({
      q: search.trim() || undefined,
      level:
        level === "All" ? undefined : level === "Cantrip" ? 0 : Number(level),
      school: school === "All" ? undefined : school,
      class_name: classFilter === "All" ? undefined : classFilter,
      is_ritual: showRituals ? true : undefined,
      is_concentration: showConcentration ? true : undefined,
    }),
    [search, level, school, classFilter, showRituals, showConcentration],
  );

  const { data: spells = [], isLoading } = useQuery({
    queryKey: ["spells", params],
    queryFn: () => spellsApi.list(params),
  });

  return (
    <div className="fade-in">
      <h1>📖 Spells</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        D&amp;D 5.5e (2024) SRD spell reference. {spells.length} spells in catalog.
      </p>

      {/* Filter bar */}
      <div
        className="card"
        style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }}
      >
        <div style={{ flex: "2 1 200px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            SEARCH
          </label>
          <input
            placeholder="Spell name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 110px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            LEVEL
          </label>
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
            style={{ width: "100%" }}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "All" ? "All Levels" : l === "Cantrip" ? "Cantrip" : `Level ${l}`}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 130px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            SCHOOL
          </label>
          <select
            value={school}
            onChange={(e) => setSchool(e.target.value as (typeof SCHOOLS)[number])}
            style={{ width: "100%" }}
          >
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All Schools" : s}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            CLASS
          </label>
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as (typeof CLASSES)[number])}
            style={{ width: "100%" }}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All Classes" : c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexDirection: "column" }}>
          <label style={{ fontSize: "0.75rem" }}>
            <input
              type="checkbox"
              checked={showRituals}
              onChange={(e) => setShowRituals(e.target.checked)}
              style={{ marginRight: "0.3rem" }}
            />
            Rituals only
          </label>
          <label style={{ fontSize: "0.75rem" }}>
            <input
              type="checkbox"
              checked={showConcentration}
              onChange={(e) => setShowConcentration(e.target.checked)}
              style={{ marginRight: "0.3rem" }}
            />
            Concentration only
          </label>
        </div>
      </div>

      {/* Empty / loading */}
      {isLoading && <p className="text-muted">Loading spells…</p>}
      {!isLoading && spells.length === 0 && (
        <div className="card">
          <p className="text-muted" style={{ margin: 0 }}>
            No spells match. (The catalog seeds on first app boot; if this is a fresh DB
            it may not be populated yet.)
          </p>
        </div>
      )}

      {/* Spell list */}
      {!isLoading && spells.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {spells.map((s) => {
            const isOpen = selected?.id === s.id;
            const schoolColor = SCHOOL_COLORS[s.school] ?? "var(--muted)";
            return (
              <div
                key={s.id}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${isOpen ? schoolColor : "var(--border)"}`,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setSelected(isOpen ? null : s)}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    padding: "0.6rem 0.8rem",
                    textAlign: "left",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 700,
                      color: "var(--gold)",
                      minWidth: 75,
                      fontSize: "0.7rem",
                    }}
                  >
                    {levelLabel(s.level)}
                  </span>
                  <span style={{ flex: 1, fontWeight: 600, color: "var(--text)" }}>
                    {s.name}
                  </span>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: schoolColor,
                      border: `1px solid ${schoolColor}`,
                      padding: "0.1rem 0.4rem",
                      borderRadius: 3,
                    }}
                  >
                    {s.school}
                  </span>
                  {s.is_ritual && (
                    <span className="badge badge-draft" style={{ fontSize: "0.65rem" }}>
                      Ritual
                    </span>
                  )}
                  {s.is_concentration && (
                    <span className="badge badge-progress" style={{ fontSize: "0.65rem" }}>
                      Conc.
                    </span>
                  )}
                </button>

                {isOpen && (
                  <div
                    style={{
                      padding: "0.5rem 1rem 1rem",
                      borderTop: "1px solid var(--border)",
                      background: "var(--surface2)",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                        gap: "0.5rem 1rem",
                        fontSize: "0.8rem",
                        marginBottom: "0.75rem",
                      }}
                    >
                      <div>
                        <strong style={{ color: "var(--muted)" }}>Casting</strong>
                        <br />
                        {s.casting_time}
                      </div>
                      <div>
                        <strong style={{ color: "var(--muted)" }}>Range</strong>
                        <br />
                        {s.range}
                      </div>
                      <div>
                        <strong style={{ color: "var(--muted)" }}>Components</strong>
                        <br />
                        {componentsString(s)}
                      </div>
                      <div>
                        <strong style={{ color: "var(--muted)" }}>Duration</strong>
                        <br />
                        {s.duration}
                      </div>
                      {s.classes.length > 0 && (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <strong style={{ color: "var(--muted)" }}>Classes</strong>
                          <br />
                          {s.classes.join(", ")}
                        </div>
                      )}
                    </div>

                    {(s.damage_dice || s.save_ability || s.attack_type) && (
                      <div
                        style={{
                          padding: "0.4rem 0.6rem",
                          background: "rgba(139,26,26,0.15)",
                          border: "1px solid rgba(139,26,26,0.4)",
                          borderRadius: 4,
                          fontSize: "0.78rem",
                          marginBottom: "0.75rem",
                        }}
                      >
                        {s.damage_dice && (
                          <span>
                            <strong>Damage:</strong> {s.damage_dice}
                            {s.damage_type ? ` ${s.damage_type}` : ""}.{" "}
                          </span>
                        )}
                        {s.attack_type && (
                          <span>
                            <strong>Attack:</strong> {s.attack_type}.{" "}
                          </span>
                        )}
                        {s.save_ability && (
                          <span>
                            <strong>Save:</strong> {s.save_ability}.
                          </span>
                        )}
                      </div>
                    )}

                    <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.9rem" }}>
                      {s.description}
                    </p>

                    {s.higher_levels && (
                      <p
                        style={{
                          whiteSpace: "pre-wrap",
                          marginTop: "0.6rem",
                          marginBottom: 0,
                          fontSize: "0.85rem",
                          color: "var(--muted)",
                        }}
                      >
                        <strong style={{ color: "var(--gold)" }}>Higher levels:</strong>{" "}
                        {s.higher_levels}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
