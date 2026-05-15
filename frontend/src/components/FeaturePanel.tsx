import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { featuresApi } from "../api/features";
import { restApi } from "../api/rest";
import type { CharacterFeature } from "../api/types";

interface Props {
  characterId: string;
  characterClass: string;
  characterLevel: number;
  characterName: string;
  /** Start expanded (used inside the character sheet). */
  defaultOpen?: boolean;
  /** Hide mutating controls (Plan 26 player-view foundation). */
  readOnly?: boolean;
}

const RECOVERY_COLOR: Record<string, string> = {
  short: "#64b5f6",
  long: "#a78bfa",
  none: "var(--muted)",
  per_turn: "var(--gold)",
};

/**
 * Per-PC class-feature panel (Plan 00021).
 *
 * Lists features the PC knows with use pips (filled = available, hollow =
 * spent). Click filled to spend, click hollow to undo. Per-PC short/long
 * rest buttons restore the relevant features (and HP/slots on long rest).
 *
 * Catalog picker at the bottom is class-scoped + level-capped to the PC.
 */
export default function FeaturePanel({
  characterId,
  characterClass,
  characterLevel,
  characterName,
  defaultOpen = false,
  readOnly: _readOnly = false,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [restStatus, setRestStatus] = useState<string | null>(null);

  const { data: known = [], isLoading } = useQuery({
    queryKey: ["features", characterId],
    queryFn: () => featuresApi.list(characterId),
    enabled: open,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ["features-catalog", characterClass, characterLevel],
    queryFn: () =>
      featuresApi.listCatalog({
        character_class: characterClass,
        max_level: characterLevel,
      }),
    enabled: open,
  });

  // Hide features the PC already has.
  const knownIdSet = useMemo(
    () => new Set(known.map((f) => f.feature_id)),
    [known],
  );
  const pickerHits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog
      .filter((f) => !knownIdSet.has(f.id))
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [catalog, knownIdSet, search]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["features", characterId] });
    // Slot pips on the spell panel may have moved if Warlock pact slots
    // restored on short rest, and HP changed on long rest.
    qc.invalidateQueries({ queryKey: ["spell-slots", characterId] });
    qc.invalidateQueries({ queryKey: ["characters"] });
  }

  const learnMutation = useMutation({
    mutationFn: (featureId: string) =>
      featuresApi.learn(characterId, { feature_id: featureId }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const spendMutation = useMutation({
    mutationFn: (cfId: string) => featuresApi.spend(characterId, cfId),
    onSuccess: () => refresh(),
  });

  const restoreMutation = useMutation({
    mutationFn: (cfId: string) => featuresApi.restore(characterId, cfId),
    onSuccess: () => refresh(),
  });

  const forgetMutation = useMutation({
    mutationFn: (cfId: string) => featuresApi.forget(characterId, cfId),
    onSuccess: () => refresh(),
  });

  const shortRestMutation = useMutation({
    mutationFn: () => restApi.shortRestPc(characterId),
    onSuccess: (summary) => {
      const parts = [
        summary.features_restored.length > 0
          ? `${summary.features_restored.length} feature(s) restored`
          : null,
        summary.slot_levels_restored.length > 0
          ? `pact slots restored`
          : null,
      ].filter(Boolean);
      setRestStatus(parts.length > 0 ? `Short rest: ${parts.join(", ")}` : "Short rest: nothing to restore");
      refresh();
    },
  });

  const longRestMutation = useMutation({
    mutationFn: () => restApi.longRestPc(characterId),
    onSuccess: (summary) => {
      const parts = [
        summary.features_restored.length > 0
          ? `${summary.features_restored.length} feature(s)`
          : null,
        summary.slot_levels_restored.length > 0 ? `all spell slots` : null,
        summary.hp_restored > 0 ? `+${summary.hp_restored} HP` : null,
      ].filter(Boolean);
      setRestStatus(
        parts.length > 0 ? `Long rest: ${parts.join(", ")}` : "Long rest: already at full",
      );
      refresh();
    },
  });

  function renderFeatureRow(row: CharacterFeature) {
    const filled = Math.max(0, row.max_uses - row.uses_spent);
    return (
      <div
        key={row.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          padding: "0.35rem 0.55rem",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          fontSize: "0.82rem",
        }}
      >
        <span style={{ flex: 1, fontWeight: 600 }}>{row.feature_name}</span>

        {row.max_uses > 0 ? (
          <div style={{ display: "flex", gap: "0.2rem", alignItems: "center" }}>
            {Array.from({ length: row.max_uses }).map((_, i) => {
              const isFilled = i < filled;
              return (
                <button
                  key={i}
                  onClick={() =>
                    isFilled
                      ? spendMutation.mutate(row.id)
                      : restoreMutation.mutate(row.id)
                  }
                  title={isFilled ? "Click to spend" : "Click to restore"}
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: "50%",
                    border: `1px solid ${RECOVERY_COLOR[row.recovery] ?? "var(--gold)"}`,
                    background: isFilled
                      ? RECOVERY_COLOR[row.recovery] ?? "var(--gold)"
                      : "transparent",
                    cursor: "pointer",
                    padding: 0,
                  }}
                />
              );
            })}
          </div>
        ) : (
          <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>passive</span>
        )}

        <span
          style={{
            fontSize: "0.65rem",
            color: RECOVERY_COLOR[row.recovery] ?? "var(--muted)",
            textTransform: "uppercase",
            minWidth: 36,
            textAlign: "right",
          }}
        >
          {row.recovery === "none" ? "—" : row.recovery}
        </span>

        <button
          className="btn btn-ghost"
          style={{
            fontSize: "0.6rem",
            padding: "0.1rem 0.35rem",
            opacity: 0.5,
          }}
          onClick={() => {
            if (window.confirm(`Forget ${row.feature_name} for ${characterName}?`)) {
              forgetMutation.mutate(row.id);
            }
          }}
          title="Remove this feature"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "0.5rem" }}>
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((p) => !p)}
      >
        <h4 style={{ margin: 0, fontSize: "0.9rem" }}>
          ⚡ Features{open && known.length > 0 ? ` (${known.length})` : ""}
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
          {restStatus && (
            <p
              style={{
                color: "var(--green2, #4caf50)",
                fontSize: "0.78rem",
                marginBottom: "0.5rem",
              }}
            >
              ✓ {restStatus}
            </p>
          )}

          {/* Per-PC rest buttons */}
          <div className="flex gap-2" style={{ marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.6rem" }}
              onClick={() => shortRestMutation.mutate()}
              disabled={shortRestMutation.isPending}
              title="Restore short-rest features (and Warlock pact slots)"
            >
              ⛺ Short rest
            </button>
            <button
              className="btn btn-secondary"
              style={{ fontSize: "0.7rem", padding: "0.25rem 0.6rem" }}
              onClick={() => longRestMutation.mutate()}
              disabled={longRestMutation.isPending}
              title="Restore all features, slots, and HP"
            >
              🌙 Long rest
            </button>
          </div>

          {isLoading && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Loading…
            </p>
          )}
          {!isLoading && known.length === 0 && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No features learned yet. Use the search below.
            </p>
          )}
          {!isLoading && known.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {known.map(renderFeatureRow)}
            </div>
          )}

          {/* Catalog picker */}
          <div
            style={{
              marginTop: "0.75rem",
              paddingTop: "0.5rem",
              borderTop: "1px dashed var(--border)",
            }}
          >
            <input
              placeholder={`Search ${characterClass} features to learn…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", fontSize: "0.8rem" }}
            />
            {(search.trim().length >= 1 || pickerHits.length <= 10) && (
              <div
                style={{
                  marginTop: "0.4rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  maxHeight: 240,
                  overflowY: "auto",
                }}
              >
                {pickerHits.length === 0 && (
                  <p className="text-muted text-sm">
                    {search ? "No matches." : "No more catalog features available."}
                  </p>
                )}
                {pickerHits.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => learnMutation.mutate(f.id)}
                    disabled={learnMutation.isPending}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.25rem 0.5rem",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                    }}
                    title={f.description}
                  >
                    <span style={{ flex: 1 }}>+ {f.name}</span>
                    <span
                      style={{
                        fontSize: "0.6rem",
                        color: RECOVERY_COLOR[f.recovery] ?? "var(--muted)",
                        textTransform: "uppercase",
                      }}
                    >
                      {f.recovery === "none" ? "passive" : f.recovery}
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
