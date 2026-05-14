import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";

const CATEGORIES = [
  "All",
  "Simple Melee",
  "Simple Ranged",
  "Martial Melee",
  "Martial Ranged",
] as const;

const MASTERIES = [
  "All",
  "Cleave",
  "Graze",
  "Nick",
  "Push",
  "Sap",
  "Slow",
  "Topple",
  "Vex",
] as const;

const PROPERTIES = [
  "All",
  "Ammunition",
  "Finesse",
  "Heavy",
  "Light",
  "Loading",
  "Reach",
  "Thrown",
  "Two-Handed",
  "Versatile",
] as const;

// One-line 2024 mastery explanations for tooltips.
const MASTERY_RULES: Record<string, string> = {
  Cleave:
    "On a melee hit, you can make a second melee attack vs another target within 5 ft. " +
    "No ability mod to that damage. Once per turn.",
  Graze:
    "On a miss, deal ability-modifier damage of the weapon's type. Damage scales only with the mod.",
  Nick: "The Light bonus-action attack becomes part of the Attack action instead. Once per turn.",
  Push: "On a hit, you can push the target up to 10 ft straight away if it's Large or smaller.",
  Sap: "On a hit, the target has Disadvantage on its next attack roll before your next turn.",
  Slow:
    "On a hit that deals damage, reduce the target's Speed by 10 ft until your next turn. " +
    "Doesn't stack.",
  Topple:
    "On a hit, the target makes a CON save (DC 8 + ability mod + prof). Fail = Prone.",
  Vex: "On a hit that deals damage, you have Advantage on your next attack roll vs the target.",
};

const PROPERTY_RULES: Record<string, string> = {
  Ammunition: "Requires ammo to fire. Drawing ammo is part of the attack.",
  Finesse: "Use STR or DEX for attack + damage (your choice).",
  Heavy: "Disadvantage on attacks if you don't meet the STR/DEX threshold (13 melee/ranged).",
  Light: "Bonus-action attack with another Light weapon (no ability mod to damage).",
  Loading: "Only one attack per action regardless of multi-attack.",
  Reach: "+5 ft reach on attacks and opportunity attacks.",
  Thrown: "Can be thrown for a ranged attack. Same ability mod as melee.",
  "Two-Handed": "Requires two hands to attack.",
  Versatile: "Can be used one- or two-handed; two-handed uses the larger damage die.",
};

function categoryColor(category: string | null): string {
  if (!category) return "var(--muted)";
  if (category.includes("Ranged")) return "#64b5f6";
  if (category.startsWith("Martial")) return "#ef5350";
  return "#ffb74d"; // Simple Melee
}

function masteryColor(mastery: string | null): string {
  if (!mastery) return "var(--muted)";
  const map: Record<string, string> = {
    Cleave: "#f06060",
    Graze: "#a0b0d0",
    Nick: "#e070c0",
    Push: "#ff9800",
    Sap: "#8d6e63",
    Slow: "#607d8b",
    Topple: "#9c27b0",
    Vex: "#4caf50",
  };
  return map[mastery] ?? "var(--gold)";
}

export default function Weapons() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [mastery, setMastery] = useState<(typeof MASTERIES)[number]>("All");
  const [propertyFilter, setPropertyFilter] = useState<(typeof PROPERTIES)[number]>("All");
  const [showMagicOnly, setShowMagicOnly] = useState(false);
  const [selected, setSelected] = useState<MagicItem | null>(null);

  const params = useMemo(
    () => ({
      q: search.trim() || undefined,
      category: category === "All" ? undefined : category,
      mastery: mastery === "All" ? undefined : mastery,
      property_name: propertyFilter === "All" ? undefined : propertyFilter,
      is_magic: showMagicOnly ? true : undefined,
    }),
    [search, category, mastery, propertyFilter, showMagicOnly],
  );

  const { data: weapons = [], isLoading } = useQuery({
    queryKey: ["weapons", params],
    queryFn: () => itemsApi.listWeapons(params),
  });

  return (
    <div className="fade-in">
      <h1>⚔ Weapons</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        D&amp;D 5.5e (2024) SRD weapons with 2024 Mastery properties. {weapons.length} weapons
        in catalog.
      </p>

      {/* Filter bar */}
      <div
        className="card"
        style={{
          display: "flex",
          gap: "0.75rem",
          flexWrap: "wrap",
          alignItems: "flex-end",
          marginBottom: "1rem",
        }}
      >
        <div style={{ flex: "2 1 200px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            SEARCH
          </label>
          <input
            placeholder="Weapon name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            CATEGORY
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
            style={{ width: "100%" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All Categories" : c}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            MASTERY
          </label>
          <select
            value={mastery}
            onChange={(e) => setMastery(e.target.value as (typeof MASTERIES)[number])}
            style={{ width: "100%" }}
          >
            {MASTERIES.map((m) => (
              <option key={m} value={m}>
                {m === "All" ? "All Masteries" : m}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label style={{ fontSize: "0.7rem", display: "block", marginBottom: "0.2rem" }}>
            PROPERTY
          </label>
          <select
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value as (typeof PROPERTIES)[number])}
            style={{ width: "100%" }}
          >
            {PROPERTIES.map((p) => (
              <option key={p} value={p}>
                {p === "All" ? "Any Property" : p}
              </option>
            ))}
          </select>
        </div>
        <label style={{ fontSize: "0.75rem" }}>
          <input
            type="checkbox"
            checked={showMagicOnly}
            onChange={(e) => setShowMagicOnly(e.target.checked)}
            style={{ marginRight: "0.3rem" }}
          />
          Magic only
        </label>
      </div>

      {isLoading && <p className="text-muted">Loading weapons…</p>}
      {!isLoading && weapons.length === 0 && (
        <div className="card">
          <p className="text-muted" style={{ margin: 0 }}>
            No weapons match.
          </p>
        </div>
      )}

      {/* Weapon list */}
      {!isLoading && weapons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {weapons.map((w) => {
            const isOpen = selected?.id === w.id;
            const catColor = categoryColor(w.weapon_category);
            const mastColor = masteryColor(w.mastery);
            return (
              <div
                key={w.id}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${isOpen ? catColor : "var(--border)"}`,
                  borderRadius: 6,
                  overflow: "hidden",
                }}
              >
                <button
                  onClick={() => setSelected(isOpen ? null : w)}
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
                  <span style={{ fontWeight: 600, color: "var(--text)", flex: 1 }}>
                    {w.name}
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                    {w.damage_die} {w.damage_type}
                    {w.versatile_damage ? ` (${w.versatile_damage} 2H)` : ""}
                  </span>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      color: catColor,
                      border: `1px solid ${catColor}`,
                      padding: "0.1rem 0.4rem",
                      borderRadius: 3,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {w.weapon_category}
                  </span>
                  {w.mastery && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        background: mastColor,
                        color: "#fff",
                        padding: "0.1rem 0.45rem",
                        borderRadius: 3,
                        fontWeight: 600,
                      }}
                      title={MASTERY_RULES[w.mastery] ?? ""}
                    >
                      {w.mastery}
                    </span>
                  )}
                  {w.is_magic && (
                    <span className="badge badge-artifact" style={{ fontSize: "0.65rem" }}>
                      Magic
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
                        <strong style={{ color: "var(--muted)" }}>Damage</strong>
                        <br />
                        {w.damage_die} {w.damage_type}
                        {w.versatile_damage && (
                          <>
                            <br />
                            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                              {w.versatile_damage} {w.damage_type} (two-handed)
                            </span>
                          </>
                        )}
                      </div>
                      {w.weapon_range && (
                        <div>
                          <strong style={{ color: "var(--muted)" }}>Range</strong>
                          <br />
                          {w.weapon_range} ft
                        </div>
                      )}
                      <div>
                        <strong style={{ color: "var(--muted)" }}>Cost</strong>
                        <br />
                        {w.value_gp > 0 ? `${w.value_gp} GP` : "—"}
                      </div>
                    </div>

                    {w.weapon_properties && w.weapon_properties.length > 0 && (
                      <div style={{ marginBottom: "0.75rem" }}>
                        <strong style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                          Properties
                        </strong>
                        <div
                          style={{
                            display: "flex",
                            gap: "0.3rem",
                            flexWrap: "wrap",
                            marginTop: "0.25rem",
                          }}
                        >
                          {w.weapon_properties.map((p) => (
                            <span
                              key={p}
                              className="badge badge-draft"
                              style={{ fontSize: "0.7rem" }}
                              title={PROPERTY_RULES[p] ?? ""}
                            >
                              {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {w.mastery && (
                      <div
                        style={{
                          padding: "0.5rem 0.7rem",
                          background: "rgba(0,0,0,0.2)",
                          borderLeft: `3px solid ${mastColor}`,
                          borderRadius: 4,
                          fontSize: "0.85rem",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <strong style={{ color: mastColor }}>Mastery — {w.mastery}.</strong>{" "}
                        {MASTERY_RULES[w.mastery]}
                      </div>
                    )}

                    {w.description && (
                      <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.9rem" }}>
                        {w.description}
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
