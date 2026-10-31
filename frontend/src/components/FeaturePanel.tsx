import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, Moon, Plus, Sparkles, Tent, X, Zap } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../api/client";
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
  /** The subclass, so the always-on list refreshes when it changes. */
  characterSubclass?: string | null;
  /** Start expanded (used inside the character sheet). */
  defaultOpen?: boolean;
  /** Hide mutating controls (Plan 26 player-view foundation). */
  readOnly?: boolean;
}

/** One class or subclass feature at the PC's level (GET /characters/{id}/class-features). */
interface ClassFeatureLine {
  name: string;
  level: number;
  source: "class" | "subclass";
  note: string;
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

/** Above this many uses a counter reads better as a number than as a row of pips. */
const POOL_AT = 10;
/** Lay on Hands is a pool of hit points at every level: spent in any amount, often 5 at once. */
const HP_POOL = "lay on hands";

/** "Channel Divinity (Paladin)" and "Channel Divinity" are the same feature for the lists. */
function sameFeature(name: string): string {
  return name.toLowerCase().split(" (")[0].split(" — ")[0].trim();
}

/**
 * Per-PC class-feature panel (Plans 00021, 128).
 *
 * Tracked features first, with use pips (filled = available, hollow = spent;
 * click filled to spend, hollow to undo) or, for a pool like Lay on Hands, the
 * points left with spend and undo buttons. Per-PC short/long rest buttons
 * restore them. Below: everything else the PC has at its level (Extra Attack,
 * Weapon Mastery, auras) with a plain-words note each. The catalog picker at
 * the bottom is class-scoped and level-capped to the PC.
 */
export default function FeaturePanel({
  characterId,
  characterClass,
  characterLevel,
  characterName,
  characterSubclass = null,
  defaultOpen = false,
  readOnly = false,
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

  const { data: everything = [] } = useQuery({
    queryKey: ["class-features", characterId, characterLevel, characterSubclass],
    queryFn: () => api.get<ClassFeatureLine[]>(`/characters/${characterId}/class-features`, { quiet: true }),
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

  // The always-on list leaves out what the tracked rows above already show;
  // their notes become the tracked rows' tooltips instead.
  const notes = useMemo(() => {
    const byName = new Map<string, string>();
    for (const f of everything) byName.set(sameFeature(f.name), f.note);
    return byName;
  }, [everything]);
  const passive = useMemo(() => {
    const tracked = new Set(known.map((f) => sameFeature(f.feature_name)));
    return everything.filter((f) => !tracked.has(sameFeature(f.name)));
  }, [everything, known]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["features", characterId] });
    qc.invalidateQueries({ queryKey: ["class-features", characterId] });
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

  const syncMutation = useMutation({
    mutationFn: () => featuresApi.sync(characterId),
    onSuccess: (out) => {
      setError(null);
      setRestStatus(
        out.granted.length > 0
          ? `Added ${out.granted.join(", ")}`
          : `Nothing to add: ${characterClass} ${characterLevel} has no tracked features yet.`,
      );
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

  // A pool spends several points in one call (?amount=).
  const spendPoolMutation = useMutation({
    mutationFn: ({ cfId, points }: { cfId: string; points: number }) =>
      featuresApi.spend(characterId, cfId, points),
    onSuccess: () => refresh(),
    onError: (e: Error) => {
      setError(e.message);
      refresh();
    },
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

  const busy =
    readOnly || spendMutation.isPending || restoreMutation.isPending || spendPoolMutation.isPending;

  function renderUses(row: CharacterFeature, filled: number) {
    const hpPool = sameFeature(row.feature_name) === HP_POOL;
    if (hpPool || row.max_uses > POOL_AT) {
      return (
        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flexWrap: "wrap" }}>
          <span className="num" style={{ fontWeight: 600 }} title={`${filled} of ${row.max_uses} points left`}>
            {filled}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}> / {row.max_uses}</span>
          </span>
          <button
            type="button"
            className="btn btn-secondary"
            style={SMALL_BTN}
            disabled={busy || filled <= 0}
            onClick={() => spendMutation.mutate(row.id)}
            title="Spend 1 point"
            aria-label={`Spend 1 point of ${row.feature_name}`}
          >
            <Minus size={14} />
          </button>
          {hpPool && (
            <button
              type="button"
              className="btn btn-secondary"
              style={SMALL_BTN}
              disabled={busy || filled < 5}
              onClick={() => spendPoolMutation.mutate({ cfId: row.id, points: 5 })}
              title="Spend 5 points"
              aria-label={`Spend 5 points of ${row.feature_name}`}
            >
              <span className="num">−5</span>
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={SMALL_BTN}
            disabled={busy || row.uses_spent <= 0}
            onClick={() => restoreMutation.mutate(row.id)}
            title="Give 1 point back"
            aria-label={`Give 1 point of ${row.feature_name} back`}
          >
            <Plus size={14} />
          </button>
        </div>
      );
    }
    return (
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
              className="ql-s6-pip"
              disabled={readOnly}
              style={pipStyle(isFilled, 13)}
            />
          );
        })}
      </div>
    );
  }

  function renderFeatureRow(row: CharacterFeature) {
    const filled = Math.max(0, row.max_uses - row.uses_spent);
    return (
      <div key={row.id} style={{ ...PANEL_ROW_STYLE, flexWrap: "wrap" }}>
        <span
          style={{ flex: "1 1 8rem", minWidth: 0, fontWeight: 500 }}
          title={notes.get(sameFeature(row.feature_name))}
        >
          {row.feature_name}
        </span>

        {/* Uses, recovery and remove travel together, so a narrow screen wraps them as one. */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto" }}>
          {row.max_uses > 0 ? (
            renderUses(row, filled)
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

          {!readOnly && (
            <button
              className="btn btn-ghost ql-s6-sq"
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
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="ql-s6" style={PANEL_STYLE}>
      <div style={PANEL_HEAD_STYLE} onClick={() => setOpen((p) => !p)}>
        <h4 style={PANEL_TITLE_STYLE}>
          <Zap size={16} style={{ color: "var(--muted)" }} />
          Features
          {open && known.length + passive.length > 0 && (
            <span className="num" style={{ color: "var(--muted)", fontWeight: 400 }}>
              {known.length + passive.length}
            </span>
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
          {!readOnly && (
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
          )}

          {isLoading && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Loading…
            </p>
          )}
          {!isLoading && known.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "flex-start" }}>
              <p className="text-muted text-sm" style={{ margin: 0 }}>
                No features with uses on this sheet yet. Add the ones a {characterClass} has at
                level <span className="num">{characterLevel}</span>, then track their uses here.
              </p>
              {!readOnly && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={SMALL_BTN}
                  onClick={() => syncMutation.mutate()}
                  disabled={syncMutation.isPending}
                >
                  <Sparkles size={14} /> Add the level {characterLevel} features
                </button>
              )}
            </div>
          )}
          {!isLoading && known.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {known.map(renderFeatureRow)}
            </div>
          )}

          {/* Everything else at this level: always on, nothing to count. */}
          {passive.length > 0 && (
            <div style={{ marginTop: "0.75rem" }}>
              <p style={{ margin: "0 0 0.35rem", fontSize: "0.8125rem", color: "var(--text2)", fontWeight: 600 }}>
                Always on at level <span className="num">{characterLevel}</span>
              </p>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                {passive.map((f) => (
                  <li
                    key={`${f.level}-${f.name}`}
                    style={{ display: "flex", flexDirection: "column", gap: "0.1rem", fontSize: "0.875rem" }}
                  >
                    <span style={{ display: "flex", alignItems: "baseline", gap: "0.45rem", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: "var(--text)" }}>{f.name}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                        {f.source === "subclass" ? "Subclass, level " : "Level "}
                        <span className="num">{f.level}</span>
                      </span>
                    </span>
                    <span style={{ color: "var(--text2)", lineHeight: 1.4 }}>{f.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Catalog picker */}
          {!readOnly && (
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
                      {search
                        ? "No matches."
                        : known.length > 0
                          ? "Every tracked feature for this level is on the sheet."
                          : "No tracked features for this class and level."}
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
          )}
        </div>
      )}
    </div>
  );
}
