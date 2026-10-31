import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { spellsApi } from "../api/spells";
import type { Spell } from "../api/types";
import PhoneSheet from "../components/PhoneSheet";
import { useIsCompact } from "../hooks/useIsCompact";

// Keeps a checkbox its native size inside .ql-filters (which sizes inputs to 100%).
const CHECK: React.CSSProperties = { width: "auto", flex: "none", margin: 0 };

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

/** A muted label over its value, for the spell's casting facts. */
function Fact({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div style={wide ? { gridColumn: "1 / -1" } : undefined}>
      <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>{label}</div>
      <div style={{ color: "var(--text)" }}>{children}</div>
    </div>
  );
}

/** Ritual and Concentration tags, spelled out. */
function SpellTags({ s }: { s: Spell }) {
  return (
    <>
      {s.is_ritual && <span className="pill">Ritual</span>}
      {s.is_concentration && (
        <span className="pill pill-amber" title="Ends if the caster loses concentration">
          Concentration
        </span>
      )}
    </>
  );
}

/** Casting time, range, components, duration, classes, the numbers and the rules text. */
function SpellDetail({ s }: { s: Spell }) {
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
        <Fact label="Casting time">{s.casting_time}</Fact>
        <Fact label="Range">{s.range}</Fact>
        <Fact label="Components">{componentsString(s)}</Fact>
        <Fact label="Duration">{s.duration}</Fact>
        {s.classes.length > 0 && (
          <Fact label="Classes" wide>
            {s.classes.join(", ")}
          </Fact>
        )}
      </div>

      {(s.damage_dice || s.save_ability || s.attack_type) && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.35rem 1rem",
            padding: "0.5rem 0.7rem",
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: "0.875rem",
            marginBottom: "0.75rem",
          }}
        >
          {s.damage_dice && (
            <span>
              <span style={{ color: "var(--muted)" }}>Damage</span>{" "}
              <span className="num" style={{ color: "var(--text)" }}>{s.damage_dice}</span>
              {s.damage_type ? ` ${s.damage_type}` : ""}
            </span>
          )}
          {s.attack_type && (
            <span>
              <span style={{ color: "var(--muted)" }}>Attack</span> {s.attack_type}
            </span>
          )}
          {s.save_ability && (
            <span>
              <span style={{ color: "var(--muted)" }}>Saving throw</span> {s.save_ability}
            </span>
          )}
        </div>
      )}

      <p style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.9375rem", lineHeight: 1.6 }}>
        {s.description}
      </p>

      {s.higher_levels && (
        <p
          style={{
            whiteSpace: "pre-wrap",
            marginTop: "0.6rem",
            marginBottom: 0,
            fontSize: "0.875rem",
            color: "var(--text2)",
          }}
        >
          <strong style={{ color: "var(--text)", fontWeight: 600 }}>At higher levels.</strong>{" "}
          {s.higher_levels}
        </p>
      )}
    </>
  );
}

export default function Spells() {
  const phone = useIsCompact(640);
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

  // Checkbox rows: a full 44 px tap row on a phone.
  const checkLabel: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.4rem",
    fontSize: "0.875rem",
    margin: 0,
    cursor: "pointer",
    minHeight: phone ? 44 : undefined,
  };

  return (
    <div className="fade-in">
      <h1>Spells</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        D&amp;D 5e (2024 rules) SRD spell reference. <span className="num">{spells.length}</span>{" "}
        spells in catalog.
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
          <label htmlFor="spell-search">Search</label>
          <input
            id="spell-search"
            placeholder="Spell name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div style={{ flex: "1 1 110px" }}>
          <label htmlFor="spell-level">Level</label>
          <select
            id="spell-level"
            value={level}
            onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}
            style={{ width: "100%" }}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === "All" ? "All levels" : l === "Cantrip" ? "Cantrip" : `Level ${l}`}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 130px" }}>
          <label htmlFor="spell-school">School</label>
          <select
            id="spell-school"
            value={school}
            onChange={(e) => setSchool(e.target.value as (typeof SCHOOLS)[number])}
            style={{ width: "100%" }}
          >
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s === "All" ? "All schools" : s}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: "1 1 120px" }}>
          <label htmlFor="spell-class">Class</label>
          <select
            id="spell-class"
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value as (typeof CLASSES)[number])}
            style={{ width: "100%" }}
          >
            {CLASSES.map((c) => (
              <option key={c} value={c}>
                {c === "All" ? "All classes" : c}
              </option>
            ))}
          </select>
        </div>
        <div
          className="ql-filter-wide"
          style={{ display: "flex", gap: phone ? "0 1.25rem" : "0.5rem", flexDirection: phone ? "row" : "column", flexWrap: "wrap" }}
        >
          <label style={checkLabel}>
            <input type="checkbox" style={CHECK} checked={showRituals} onChange={(e) => setShowRituals(e.target.checked)} />
            Rituals only
          </label>
          <label style={checkLabel}>
            <input
              type="checkbox"
              style={CHECK}
              checked={showConcentration}
              onChange={(e) => setShowConcentration(e.target.checked)}
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

      {/* Spell list: rows open in place on desktop, in a bottom sheet on a phone. */}
      {!isLoading && spells.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {spells.map((s) => {
            const isOpen = !phone && selected?.id === s.id;
            return (
              <div
                key={s.id}
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
                    onClick={() => setSelected(s)}
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
                      <span className="story" style={{ display: "block", fontWeight: 700, fontSize: "1.05rem" }}>
                        {s.name}
                      </span>
                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.3rem 0.5rem", marginTop: "0.15rem", fontSize: "0.8125rem", color: "var(--muted)" }}>
                        <span>
                          {levelLabel(s.level)} · {s.school}
                        </span>
                        <SpellTags s={s} />
                      </span>
                    </span>
                    <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)" }} />
                  </button>
                ) : (
                  <button
                    onClick={() => setSelected(isOpen ? null : s)}
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
                    <span style={{ color: "var(--muted)", minWidth: 75, fontSize: "0.8125rem" }}>
                      {levelLabel(s.level)}
                    </span>
                    <span className="story" style={{ flex: 1, fontWeight: 700, fontSize: "1.05rem" }}>
                      {s.name}
                    </span>
                    <span className="pill">{s.school}</span>
                    <SpellTags s={s} />
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
                    <SpellDetail s={s} />
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
            <span className="pill">{levelLabel(selected.level)}</span>
            <span className="pill">{selected.school}</span>
            <SpellTags s={selected} />
          </div>
          <SpellDetail s={selected} />
        </PhoneSheet>
      )}
    </div>
  );
}
