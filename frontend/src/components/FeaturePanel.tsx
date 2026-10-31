import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Moon, Tent, X, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { featuresApi } from "../api/features";
import { restApi } from "../api/rest";
import type { CharacterFeature } from "../api/types";
import {
  PANEL_HEAD_STYLE,
  PANEL_ROW_STYLE,
  PANEL_STYLE,
  PANEL_TITLE_STYLE,
  REMOVE_BTN,
  SMALL_BTN,
  pipStyle,
} from "./character-sheet/panelStyles";

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

/** Compact recovery text — "short rest +1" = regain one use per short rest (2024). */
const RECOVERY_LABEL: Record<string, string> = {
  none: "—",
  short: "short rest",
  long: "long rest",
  short_one: "short rest +1",
  per_turn: "each turn",
};

/** The plain sentence behind each recovery label (hover/tap). */
const RECOVERY_HELP: Record<string, string> = {
  none: "Always on: no uses to track",
  short: "All uses come back after a short or long rest",
  long: "Uses come back after a long rest",
  short_one: "One use comes back after each short rest",
  per_turn: "Usable once each turn",
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
      <div key={row.id} style={PANEL_ROW_STYLE}>
        <span style={{ flex: 1, minWidth: 0, fontWeight: 500 }}>{row.feature_name}</span>

        {row.max_uses > 0 ? (
          <div
            style={{ display: "flex", gap: "0.25rem", alignItems: "center", flexWrap: "wrap" }}
            title={`${filled} of ${row.max_uses} uses left`}
          >
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
                  aria-label={isFilled ? `Spend a use of ${row.feature_name}` : `Restore a use of ${row.feature_name}`}
                  style={pipStyle(isFilled, 13)}
                />
              );
            })}
          </div>
        ) : (
          <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>passive</span>
        )}

        <span
          style={{
            fontSize: "0.75rem",
            color: "var(--muted)",
            minWidth: 52,
            textAlign: "right",
          }}
          title={RECOVERY_HELP[row.recovery]}
        >
          {RECOVERY_LABEL[row.recovery] ?? row.recovery}
        </span>

        <button
          className="btn btn-ghost"
          style={REMOVE_BTN}
          onClick={() => {
            if (window.confirm(`Forget ${row.feature_name} for ${characterName}?`)) {
              forgetMutation.mutate(row.id);
            }
          }}
          title="Remove this feature"
          aria-label={`Remove ${row.feature_name}`}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div style={PANEL_STYLE}>
      <div style={PANEL_HEAD_STYLE} onClick={() => setOpen((p) => !p)}>
        <h4 style={PANEL_TITLE_STYLE}>
          <Zap size={16} style={{ color: "var(--muted)" }} />
          Features
          {open && known.length > 0 && (
            <span className="num" style={{ color: "var(--muted)", fontWeight: 400 }}>{known.length}</span>
          )}
        </h4>
        {open ? (
          <ChevronDown size={16} style={{ color: "var(--muted)" }} />
        ) : (
          <ChevronRight size={16} style={{ color: "var(--muted)" }} />
        )}
      </div>

      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          {error && (
            <p style={{ color: "var(--danger-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              {error}
            </p>
          )}
          {restStatus && (
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                color: "var(--teal-text)",
                fontSize: "0.875rem",
                marginBottom: "0.5rem",
              }}
            >
              <Check size={14} /> {restStatus}
            </p>
          )}

          {/* Per-PC rest buttons */}
          <div className="flex gap-2" style={{ marginBottom: "0.5rem", flexWrap: "wrap" }}>
            <button
              className="btn btn-secondary"
              style={SMALL_BTN}
              onClick={() => shortRestMutation.mutate()}
              disabled={shortRestMutation.isPending}
              title="Restore short-rest features (and Warlock pact slots)"
            >
              <Tent size={14} /> Short rest
            </button>
            <button
              className="btn btn-secondary"
              style={SMALL_BTN}
              onClick={() => longRestMutation.mutate()}
              disabled={longRestMutation.isPending}
              title="Restore all features, slots, and HP"
            >
              <Moon size={14} /> Long rest
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
              paddingTop: "0.6rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <input
              placeholder={`Search ${characterClass} features to learn…`}
              aria-label={`Search ${characterClass} features to learn`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", fontSize: "0.875rem" }}
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
                      fontSize: "0.875rem",
                      padding: "0.25rem 0.55rem",
                      minHeight: 0,
                      border: "none",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                      whiteSpace: "normal",
                    }}
                    title={f.description}
                  >
                    <span style={{ flex: 1 }}>+ {f.name}</span>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {f.recovery === "none" ? "passive" : RECOVERY_LABEL[f.recovery] ?? f.recovery}
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
