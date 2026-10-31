/**
 * Shared Lamplit looks for the per-PC panels (inventory, spells, features,
 * loot) — Plan 121. Plain style objects so the panels stay component-only
 * files for React Fast Refresh.
 */
import type { CSSProperties } from "react";

/** The disclosure panel: a hairline-bordered block on the card's surface. */
export const PANEL_STYLE: CSSProperties = {
  marginTop: "0.5rem",
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.55rem 0.75rem",
};

/** The panel's clickable header row. */
export const PANEL_HEAD_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  cursor: "pointer",
  userSelect: "none",
};

/** The panel's title text. */
export const PANEL_TITLE_STYLE: CSSProperties = {
  margin: 0,
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: "0.45rem",
  fontSize: "0.9375rem",
  fontWeight: 600,
  color: "var(--text)",
};

/** One row inside a panel (an item, a spell, a feature). */
export const PANEL_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.35rem 0.55rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontSize: "0.875rem",
};

/** A small on/off toggle button (Equip, Attune, Prep): lit while on. */
export function toggleStyle(on: boolean): CSSProperties {
  return {
    fontSize: "0.8125rem",
    padding: "0.15rem 0.5rem",
    minHeight: 0,
    background: on ? "var(--accent-active)" : "transparent",
    color: on ? "var(--accent-active-text)" : "var(--text2)",
    borderColor: on ? "var(--accent-line)" : "var(--border2)",
  };
}

/** A compact secondary button inside a panel row. */
export const SMALL_BTN: CSSProperties = {
  fontSize: "0.8125rem",
  padding: "0.15rem 0.5rem",
  minHeight: 0,
};

/** An icon-only remove button (X) at the end of a row. */
export const REMOVE_BTN: CSSProperties = {
  padding: "0.2rem",
  minHeight: 0,
  border: "none",
  color: "var(--muted)",
};

/**
 * A resource pip (spell slot, feature use): teal while available, hollow
 * once spent — the same teal as healthy HP.
 */
export function pipStyle(filled: boolean, size = 14): CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: "50%",
    border: `1.5px solid ${filled ? "var(--teal)" : "var(--border2)"}`,
    background: filled ? "var(--teal)" : "transparent",
    cursor: "pointer",
    padding: 0,
    flexShrink: 0,
  };
}

/** Conventional D&D rarity colors via the .badge-* rarity classes. */
export function rarityClass(rarity: string | null | undefined): string {
  const key = (rarity ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (key === "veryrare") return "badge badge-very-rare";
  if (["uncommon", "rare", "legendary", "artifact"].includes(key)) return `badge badge-${key}`;
  return "badge badge-common";
}

/** "VeryRare" → "Very rare" for display. */
export function rarityLabel(rarity: string | null | undefined): string {
  const r = (rarity ?? "").replace(/([a-z])([A-Z])/g, "$1 $2");
  return r ? r.charAt(0).toUpperCase() + r.slice(1).toLowerCase() : "";
}
