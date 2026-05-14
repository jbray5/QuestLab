import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { spellcastingApi } from "../api/spellcasting";
import { spellsApi } from "../api/spells";
import type { CharacterSpell, Spell } from "../api/types";

interface Props {
  characterId: string;
  characterClass: string;
  characterName: string;
}

/**
 * Per-PC spell panel (Plan 00020).
 *
 * Collapsed by default. Shows slot pips (filled = available, hollow = used),
 * known spells grouped by level, and a class-scoped spell-picker. Cast button
 * lets the DM spend a slot of any available level when casting a spell of
 * that level or lower.
 */
export default function SpellPanel({
  characterId,
  characterClass,
  characterName,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: known = [], isLoading: knownLoading } = useQuery({
    queryKey: ["character-spells", characterId],
    queryFn: () => spellcastingApi.listSpells(characterId),
    enabled: open,
  });

  const { data: slotState } = useQuery({
    queryKey: ["spell-slots", characterId],
    queryFn: () => spellcastingApi.slotState(characterId),
    enabled: open,
  });

  // Class-scoped spell catalog for the picker; capped to <= highest castable level.
  const maxCastableLevel = useMemo(() => {
    if (!slotState) return 9;
    const levels = Object.keys(slotState.levels)
      .map((k) => parseInt(k, 10))
      .filter((n) => !Number.isNaN(n));
    return levels.length > 0 ? Math.max(...levels) : 9;
  }, [slotState]);

  const { data: classSpells = [] } = useQuery({
    queryKey: ["class-spells", characterClass, maxCastableLevel],
    queryFn: () =>
      spellsApi.list({
        class_name: characterClass,
      }),
    enabled: open,
  });

  // Lookup of every spell the PC knows so we can render names + levels.
  const knownSpellIds = useMemo(() => known.map((k) => k.spell_id), [known]);
  const { data: knownSpellDetails = [] } = useQuery({
    queryKey: ["known-spell-details", characterId, knownSpellIds.join(",")],
    queryFn: async () =>
      Promise.all(knownSpellIds.map((id) => spellsApi.get(id))),
    enabled: open && knownSpellIds.length > 0,
  });

  const spellsById: Record<string, Spell> = useMemo(() => {
    const m: Record<string, Spell> = {};
    for (const s of knownSpellDetails) m[s.id] = s;
    return m;
  }, [knownSpellDetails]);

  // Filter the picker to spells not already known + matching the search.
  const knownIdSet = useMemo(() => new Set(knownSpellIds), [knownSpellIds]);
  const pickerHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return classSpells
      .filter((s) => !knownIdSet.has(s.id))
      .filter((s) => s.level <= maxCastableLevel)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [classSpells, knownIdSet, maxCastableLevel, search]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["character-spells", characterId] });
    qc.invalidateQueries({ queryKey: ["spell-slots", characterId] });
  }

  const learnMutation = useMutation({
    mutationFn: (spellId: string) =>
      spellcastingApi.learn(characterId, { spell_id: spellId, prepared: true }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const togglePreparedMutation = useMutation({
    mutationFn: (vars: { rowId: string; prepared: boolean }) =>
      spellcastingApi.updateSpell(characterId, vars.rowId, {
        prepared: vars.prepared,
      }),
    onSuccess: () => refresh(),
  });

  const forgetMutation = useMutation({
    mutationFn: (rowId: string) => spellcastingApi.forget(characterId, rowId),
    onSuccess: () => refresh(),
  });

  const expendMutation = useMutation({
    mutationFn: (level: number) => spellcastingApi.expend(characterId, level),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (level: number) => spellcastingApi.restore(characterId, level),
    onSuccess: () => refresh(),
  });

  const longRestMutation = useMutation({
    mutationFn: () => spellcastingApi.longRest(characterId),
    onSuccess: () => refresh(),
  });

  // Group known spells by level (use the spell details lookup, fall back to 0).
  const knownByLevel: Record<number, CharacterSpell[]> = useMemo(() => {
    const g: Record<number, CharacterSpell[]> = {};
    for (const k of known) {
      const s = spellsById[k.spell_id];
      const lvl = s ? s.level : 0;
      if (!g[lvl]) g[lvl] = [];
      g[lvl].push(k);
    }
    return g;
  }, [known, spellsById]);

  const slotLevels = slotState
    ? Object.keys(slotState.levels)
        .map((k) => parseInt(k, 10))
        .sort((a, b) => a - b)
    : [];

  return (
    <div className="card" style={{ marginTop: "0.5rem" }}>
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((p) => !p)}
      >
        <h4 style={{ margin: 0, fontSize: "0.9rem" }}>
          📖 Spells{open && known.length > 0 ? ` (${known.length})` : ""}
        </h4>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {open ? "▾" : "▸"}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          {error && (
            <p style={{ color: "var(--red)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              {error}
            </p>
          )}

          {/* Slot pips */}
          {slotLevels.length === 0 ? (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              {characterClass} has no spell slots at this level.
            </p>
          ) : (
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "0.5rem",
              }}
            >
              {slotLevels.map((lvl) => {
                const s = slotState!.levels[String(lvl)];
                return (
                  <div
                    key={lvl}
                    style={{
                      display: "flex",
                      gap: "0.25rem",
                      alignItems: "center",
                      padding: "0.25rem 0.4rem",
                      background: "var(--surface2)",
                      borderRadius: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        color: "var(--gold)",
                        fontWeight: 700,
                        minWidth: 16,
                      }}
                    >
                      L{lvl}
                    </span>
                    {/* Filled pips for remaining; hollow for used */}
                    {Array.from({ length: s.max }).map((_, i) => {
                      const filled = i < s.remaining;
                      return (
                        <button
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (filled) expendMutation.mutate(lvl);
                            else restoreMutation.mutate(lvl);
                          }}
                          title={filled ? "Click to spend" : "Click to restore"}
                          style={{
                            width: 14,
                            height: 14,
                            borderRadius: "50%",
                            border: "1px solid var(--gold)",
                            background: filled ? "var(--gold)" : "transparent",
                            cursor: "pointer",
                            padding: 0,
                          }}
                        />
                      );
                    })}
                  </div>
                );
              })}
              <button
                className="btn btn-ghost"
                style={{ fontSize: "0.65rem", padding: "0.15rem 0.5rem" }}
                onClick={() => longRestMutation.mutate()}
                disabled={longRestMutation.isPending}
                title="Restore all spell slots"
              >
                🌙 Long rest
              </button>
            </div>
          )}

          {/* Known spells grouped by level */}
          {knownLoading && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Loading…
            </p>
          )}
          {!knownLoading && known.length === 0 && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No spells learned yet.
            </p>
          )}

          {Object.keys(knownByLevel)
            .map((k) => parseInt(k, 10))
            .sort((a, b) => a - b)
            .map((lvl) => (
              <div key={lvl} style={{ marginTop: "0.5rem" }}>
                <strong
                  style={{
                    fontSize: "0.7rem",
                    color: "var(--gold)",
                    display: "block",
                    marginBottom: "0.25rem",
                  }}
                >
                  {lvl === 0 ? "Cantrips" : `Level ${lvl}`}
                </strong>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  {knownByLevel[lvl].map((row) => {
                    const s = spellsById[row.spell_id];
                    const name = s?.name ?? row.spell_id.slice(0, 8) + "…";
                    return (
                      <div
                        key={row.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          padding: "0.3rem 0.5rem",
                          background: "var(--surface2)",
                          border: "1px solid var(--border)",
                          borderRadius: 4,
                          fontSize: "0.8rem",
                        }}
                      >
                        <span
                          style={{ flex: 1, opacity: row.prepared ? 1 : 0.6 }}
                          title={s?.description ?? ""}
                        >
                          {name}
                        </span>
                        {lvl > 0 && (
                          <button
                            className="btn btn-secondary"
                            style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}
                            onClick={() => expendMutation.mutate(lvl)}
                            title={`Spend a Lvl ${lvl} slot`}
                          >
                            Cast
                          </button>
                        )}
                        <button
                          className={`btn ${row.prepared ? "btn-primary" : "btn-ghost"}`}
                          style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}
                          onClick={() =>
                            togglePreparedMutation.mutate({
                              rowId: row.id,
                              prepared: !row.prepared,
                            })
                          }
                          title={
                            row.prepared
                              ? "Prepared (click to unprepare)"
                              : "Click to prepare"
                          }
                        >
                          {row.prepared ? "Prepped" : "Prep"}
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{
                            fontSize: "0.65rem",
                            padding: "0.15rem 0.4rem",
                            opacity: 0.5,
                          }}
                          onClick={() => {
                            if (window.confirm(`Forget ${name} for ${characterName}?`)) {
                              forgetMutation.mutate(row.id);
                            }
                          }}
                          title="Forget this spell"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

          {/* Spell picker */}
          <div
            style={{
              marginTop: "0.75rem",
              paddingTop: "0.5rem",
              borderTop: "1px dashed var(--border)",
            }}
          >
            <input
              placeholder={`Search ${characterClass} spells to learn…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", fontSize: "0.8rem" }}
            />
            {search.trim().length >= 1 && (
              <div
                style={{
                  marginTop: "0.4rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  maxHeight: 220,
                  overflowY: "auto",
                }}
              >
                {pickerHits.length === 0 && (
                  <p className="text-muted text-sm">No matches.</p>
                )}
                {pickerHits.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => learnMutation.mutate(s.id)}
                    disabled={learnMutation.isPending}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.45rem",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>+ {s.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.65rem" }}>
                      {s.level === 0 ? "Cantrip" : `Lvl ${s.level} ${s.school}`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
