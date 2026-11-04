import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { campaignsApi } from "../api/campaigns";
import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import PhoneSheet from "../components/PhoneSheet";
import { MineChip } from "../components/HomebrewChip";
import { useIsCompact } from "../hooks/useIsCompact";
import { RULESETS, rulesetOf, type Ruleset } from "../lib/ruleset";

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
  // Plan 135 — the 2014 Lance; its rule is in the text.
  Special: "A rule of its own, written out in the text below.",
};

// Plan 135 — the viewer's last 2024/2014 pick on this page, per browser.
const RULES_KEY = "ql-weapons-rules";

/** The remembered pick, or null (none yet, or storage blocked). */
function storedRules(): Ruleset | null {
  try {
    const value = window.localStorage.getItem(RULES_KEY);
    return value === "2014" || value === "2024" ? value : null;
  } catch {
    return null;
  }
}

/** Remember the pick; a private window simply forgets it. */
function rememberRules(r: Ruleset): void {
  try {
    window.localStorage.setItem(RULES_KEY, r);
  } catch {
    // Storage blocked: the switch still works for this visit.
  }
}

/** "VeryRare" → "Very rare". */
function rarityLabel(rarity: string): string {
  return rarity === "VeryRare" ? "Very rare" : rarity;
}

/** "Weapon (any sword)" → "Any sword", "Weapon (any)" → "Any weapon"; "" for a plain "Weapon". */
function baseType(itemType: string): string {
  const match = /\(([^)]*)\)/.exec(itemType ?? "");
  const inside = match ? match[1].trim() : "";
  if (!inside) return "";
  if (inside.toLowerCase() === "any") return "Any weapon";
  return inside.charAt(0).toUpperCase() + inside.slice(1);
}

/** A magic weapon's attunement in plain words: "Needed (by a paladin)", "Not needed". */
function attunementText(w: MagicItem): string {
  if (!w.attunement_required) return "Not needed";
  const by = w.properties?.attunement_by;
  return typeof by === "string" && by ? `Needed (by a ${by})` : "Needed";
}

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

/** Mastery and Magic tags (no mastery on the 2014 rules, Plan 135). */
function WeaponTags({ w, showMastery }: { w: MagicItem; showMastery: boolean }) {
  return (
    <>
      {showMastery && w.mastery && (
        <span className="pill" style={{ color: "var(--text)" }} title={MASTERY_RULES[w.mastery] ?? ""}>
          {w.mastery}
        </span>
      )}
      {w.is_magic && <span className="badge badge-rare">Magic</span>}
    </>
  );
}

/**
 * Damage, range, cost, properties, the mastery rule and the description. A magic weapon
 * also shows its base weapon, rarity and attunement; one written against a kind of weapon
 * ("any sword") has no dice of its own, so it shows the base weapon in their place.
 */
function WeaponDetail({ w, phone, showMastery }: { w: MagicItem; phone: boolean; showMastery: boolean }) {
  const base = w.is_magic ? baseType(w.item_type) : "";
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
        {w.damage_die && (
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Damage</div>
            <span className="num">{w.damage_die}</span> {w.damage_type}
            {w.versatile_damage && (
              <div style={{ fontSize: "0.8125rem", color: "var(--text2)" }}>
                <span className="num">{w.versatile_damage}</span> {w.damage_type} (two-handed)
              </div>
            )}
          </div>
        )}
        {base && (
          <div>
            <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Base weapon</div>
            {base}
          </div>
        )}
        {w.is_magic && (
          <>
            <div>
              <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Rarity</div>
              {rarityLabel(w.rarity)}
            </div>
            <div>
              <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>Attunement</div>
              {attunementText(w)}
            </div>
          </>
        )}
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

      {showMastery && w.mastery && (
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
  // Plan 135 — the 2024/2014 switch: the viewer's remembered pick, else 2014 when every
  // campaign this DM runs plays 2014, else 2024. Waits for the campaign list (usually cached).
  const [rulesPick, setRulesPick] = useState<Ruleset | null>(storedRules);
  const { data: campaigns, isPending: campaignsPending } = useQuery({
    queryKey: ["campaigns"],
    queryFn: campaignsApi.list,
  });
  const allOld = !!campaigns && campaigns.length > 0 && campaigns.every((c) => rulesetOf(c.ruleset) === "2014");
  const rules: Ruleset | null = rulesPick ?? (campaignsPending ? null : allOld ? "2014" : "2024");
  const showMastery = rules === "2024";

  const params = useMemo(
    () => ({
      q: search.trim() || undefined,
      category: category === "All" ? undefined : category,
      // Mastery is a 2024 rule: a pick left over from 2024 is not sent for 2014.
      mastery: mastery === "All" || rules !== "2024" ? undefined : mastery,
      property_name: propertyFilter === "All" ? undefined : propertyFilter,
      is_magic: showMagicOnly ? true : undefined,
      ruleset: rules ?? undefined,
    }),
    [search, category, mastery, propertyFilter, showMagicOnly, rules],
  );

  const { data: weapons = [], isLoading: weaponsLoading } = useQuery({
    queryKey: ["weapons", params],
    queryFn: () => itemsApi.listWeapons(params),
    enabled: rules !== null,
  });
  const isLoading = rules === null || weaponsLoading;

  function pickRules(r: Ruleset) {
    setRulesPick(r);
    rememberRules(r);
  }

  return (
    <div className="fade-in">
      <h1>Weapons</h1>
      <p className="text-muted" style={{ marginBottom: "1rem" }}>
        {rules === "2014"
          ? "SRD weapons (2014 rules) and magic weapons."
          : "SRD weapons (2024 rules) with their mastery properties, and magic weapons."}{" "}
        {!isLoading && (
          <>
            <span className="num">{weapons.length}</span> in the catalog.
          </>
        )}
      </p>

      {/* Plan 135 — which edition's weapon rules the list follows. */}
      <div style={{ marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <span id="weapon-rules-label" className="text-sm" style={{ fontWeight: 600 }}>
            Rules
          </span>
          <div role="radiogroup" aria-labelledby="weapon-rules-label" style={{ display: "inline-flex", gap: "0.35rem" }}>
            {RULESETS.map((r) => {
              const on = rules === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => pickRules(r)}
                  className={on ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ minHeight: phone ? 44 : undefined, minWidth: 72, justifyContent: "center" }}
                >
                  {r}
                </button>
              );
            })}
          </div>
        </div>
        {rules === "2014" && (
          <p className="text-sm text-muted" style={{ margin: "0.4rem 0 0" }}>
            2014 rules: no weapon mastery, and no musket or pistol.
          </p>
        )}
      </div>

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
        {showMastery && (
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
        )}
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
            No weapons match. Try another name, category, {showMastery ? "mastery " : ""}or property.
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
                          {w.name} <MineChip createdBy={w.created_by_email} />
                        </span>
                        <span style={{ fontSize: "0.875rem", color: "var(--text2)", flexShrink: 0 }}>
                          {w.damage_die ? <span className="num">{w.damage_die}</span> : rarityLabel(w.rarity)}
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
                          {w.weapon_category ? categoryLabel(w.weapon_category) : baseType(w.item_type)}
                          {w.damage_type ? ` · ${w.damage_type}` : ""}
                        </span>
                        <WeaponTags w={w} showMastery={showMastery} />
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
                      {w.name} <MineChip createdBy={w.created_by_email} />
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text2)" }}>
                      {w.damage_die ? <Damage w={w} /> : baseType(w.item_type)}
                    </span>
                    <span style={{ fontSize: "0.8125rem", color: "var(--muted)", whiteSpace: "nowrap" }}>
                      {w.weapon_category ? categoryLabel(w.weapon_category) : rarityLabel(w.rarity)}
                    </span>
                    <WeaponTags w={w} showMastery={showMastery} />
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
                    <WeaponDetail w={w} phone={false} showMastery={showMastery} />
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
            <WeaponTags w={selected} showMastery={showMastery} />
          </div>
          <WeaponDetail w={selected} phone showMastery={showMastery} />
        </PhoneSheet>
      )}
    </div>
  );
}
