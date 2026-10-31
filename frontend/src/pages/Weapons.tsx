import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import PhoneSheet from "../components/PhoneSheet";
import { useIsCompact } from "../hooks/useIsCompact";

// Keeps a checkbox its native size inside .ql-filters (which sizes inputs to 100%).
const CHECK: React.CSSProperties = { width: "auto", flex: "none", margin: 0 };

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

/** "Martial Melee" → "Martial melee" (sentence case). */
function categoryLabel(category: string | null): string {
  if (!category) return "";
  return category.charAt(0) + category.slice(1).toLowerCase();
}

/** Damage dice in mono, the type in words, the two-handed die spelled out. */
function Damage({ w }: { w: MagicItem }) {
  return (
    <>
      <span className="num">{w.damage_die}</span> {w.damage_type}
      {w.versatile_damage ? (
        <>
          {" "}
          (<span className="num">{w.versatile_damage}</span> two-handed)
        </>
      ) : null}
    </>
  );
}

/** Mastery and Magic tags. */
function WeaponTags({ w }: { w: MagicItem }) {
  return (
    <>
      {w.mastery && (
        <span className="pill" style={{ color: "var(--text)" }} title={MASTERY_RULES[w.mastery] ?? ""}>
          {w.mastery}
        </span>
      )}
      {w.is_magic && <span className="badge badge-rare">Magic</span>}
    </>
  );
}

/** Damage, range, cost, properties, the mastery rule and the description. */
function WeaponDetail({ w, phone }: { w: MagicItem; phone: boolean }) {
  return (
    <>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: "0.6rem 1rem",
          fontSize: "0.875rem",
          marginBottom: "0.75rem",
        }}
      >
        <div>
          <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Damage</div>
          <span className="num">{w.damage_die}</span> {w.damage_type}
          {w.versatile_damage && (
            <div style={{ fontSize: "0.8125rem", color: "var(--text2)" }}>
              <span className="num">{w.versatile_damage}</span> {w.damage_type} (two-handed)
            </div>
          )}
        </div>
        {w.weapon_range && (
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Range</div>
            <span className="num">{w.weapon_range}</span> ft
          </div>
        )}
        <div>
          <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Cost</div>
          {w.value_gp > 0 ? (
            <>
              <span className="num">{w.value_gp}</span> gp
            </>
          ) : (
            "—"
          )}
        </div>
      </div>

      {w.weapon_properties && w.weapon_properties.length > 0 && (
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Properties</div>
          {phone ? (
            // No hover on a phone: each property's rule is written out.
            <ul style={{ margin: "0.25rem 0 0", paddingLeft: "1.1rem", fontSize: "0.875rem" }}>
              {w.weapon_properties.map((p) => (
                <li key={p} style={{ marginBottom: "0.2rem" }}>
                  <strong style={{ fontWeight: 600 }}>{p}.</strong>{" "}
                  <span style={{ color: "var(--text2)" }}>{PROPERTY_RULES[p] ?? ""}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
              {w.weapon_properties.map((p) => (
                <span key={p} className="pill" title={PROPERTY_RULES[p] ?? ""}>
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {w.mastery && (
        <div
          style={{
            padding: "0.5rem 0.7rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: "0.875rem",
            marginBottom: "0.5rem",
          }}
        >
          <strong style={{ color: "var(--text)", fontWeight: 600 }}>Mastery: {w.mastery}.</strong>{" "}
          <span style={{ color: "var(--text2)" }}>{MASTERY_RULES[w.mastery]}</span>
        </div>
      )}

      {w.description && (
        <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.9375rem", lineHeight: 1.6 }}>
          {w.description}
        </p>
      )}
    </>
  );
}

export default function Weapons() {
  const phone = useIsCompact(640);
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
      <h1>Weapons</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        D&amp;D 5e (2024 rules) SRD weapons with 2024 Mastery properties.{" "}
        <span className="num">{weapons.length}</span> weapons in catalog.
      </p>

      {/* Filter bar: search on its own row on a phone, the selects two to a row. */}
      <div
        className={phone ? "card ql-filters" : "card"}
        style={
          phone
            ? { marginBottom: "1rem" }
            : { display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1rem" }
        }
      >
        <div className="ql-filter-wide" style={{ flex: "2 1 200px" }}>
          <label htmlFor="weapon-search">Search</label>
          <input
            id="weapon-search"
            placeholder="Weapon name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <label htmlFor="weapon-category">Category</label>
          <select
            id="weapon-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as (typeof CATEGORIES)[number])}
            style={{ width: "100%" }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All categories" : categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label htmlFor="weapon-mastery">Mastery</label>
          <select
            id="weapon-mastery"
            value={mastery}
            onChange={(e) => setMastery(e.target.value as (typeof MASTERIES)[number])}
            style={{ width: "100%" }}
          >
            {MASTERIES.map((m) => (
              <option key={m} value={m}>
                {m === "All" ? "All masteries" : m}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label htmlFor="weapon-property">Property</label>
          <select
            id="weapon-property"
            value={propertyFilter}
            onChange={(e) => setPropertyFilter(e.target.value as (typeof PROPERTIES)[number])}
            style={{ width: "100%" }}
          >
            {PROPERTIES.map((p) => (
              <option key={p} value={p}>
                {p === "All" ? "Any property" : p}
              </option>
            ))}
          </select>
        </div>
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            fontSize: "0.875rem",
            margin: 0,
            cursor: "pointer",
            minHeight: phone ? 44 : undefined,
            alignSelf: phone ? "end" : undefined,
          }}
        >
          <input type="checkbox" style={CHECK} checked={showMagicOnly} onChange={(e) => setShowMagicOnly(e.target.checked)} />
          Magic only
        </label>
      </div>

      {isLoading && <p className="text-muted">Loading weapons…</p>}
      {!isLoading && weapons.length === 0 && (
        <div className="card">
          <p className="text-muted" style={{ margin: 0 }}>
            No weapons match. Try another name, category, mastery or property.
          </p>
        </div>
      )}

      {/* Weapon list: rows open in place on desktop, in a bottom sheet on a phone. */}
      {!isLoading && weapons.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {weapons.map((w) => {
            const isOpen = !phone && selected?.id === w.id;
            return (
              <div
                key={w.id}
                style={{
                  background: "var(--surface)",
                  border: `1px solid ${isOpen ? "var(--border2)" : "var(--border)"}`,
                  borderRadius: 8,
                  overflow: "hidden",
                }}
              >
                {phone ? (
                  <button
                    type="button"
                    onClick={() => setSelected(w)}
                    style={{
                      width: "100%",
                      minHeight: 52,
                      background: "transparent",
                      border: "none",
                      padding: "0.6rem 0.75rem 0.6rem 0.9rem",
                      textAlign: "left",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      color: "var(--text)",
                      fontSize: "1rem",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.5rem" }}>
                        <span className="story" style={{ fontWeight: 700, fontSize: "1.05rem", minWidth: 0 }}>
                          {w.name}
                        </span>
                        <span style={{ fontSize: "0.875rem", color: "var(--text2)", flexShrink: 0 }}>
                          <span className="num">{w.damage_die}</span>
                          {w.versatile_damage ? (
                            <span style={{ color: "var(--muted)" }}>
                              {" / "}
                              <span className="num">{w.versatile_damage}</span>
                            </span>
                          ) : null}
                        </span>
                      </span>
                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.3rem 0.5rem", marginTop: "0.15rem", fontSize: "0.8125rem", color: "var(--muted)" }}>
                        <span>
                          {categoryLabel(w.weapon_category)}
                          {w.damage_type ? ` · ${w.damage_type}` : ""}
                        </span>
                        <WeaponTags w={w} />
                      </span>
                    </span>
                    <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)" }} />
                  </button>
                ) : (
                  <button
                    onClick={() => setSelected(isOpen ? null : w)}
                    aria-expanded={isOpen}
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
                      color: "var(--text)",
                    }}
                  >
                    <span className="story" style={{ fontWeight: 700, fontSize: "1.05rem", flex: 1 }}>
                      {w.name}
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text2)" }}>
                      <Damage w={w} />
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {categoryLabel(w.weapon_category)}
                    </span>
                    <WeaponTags w={w} />
                  </button>
                )}

                {isOpen && (
                  <div
                    style={{
                      padding: "0.75rem 1rem 1rem",
                      borderTop: "1px solid var(--border)",
                      background: "var(--surface2)",
                    }}
                  >
                    <WeaponDetail w={w} phone={false} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {phone && selected && (
        <PhoneSheet title={selected.name} onClose={() => setSelected(null)}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem", marginBottom: "0.75rem" }}>
            {selected.weapon_category && <span className="pill">{categoryLabel(selected.weapon_category)}</span>}
            <WeaponTags w={selected} />
          </div>
          <WeaponDetail w={selected} phone />
        </PhoneSheet>
      )}
    </div>
  );
}
