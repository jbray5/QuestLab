// storeTheme — shared styling + helpers for the player marketplace pages
// (Plan 47; Lamplit restyle Plan 122). Lives outside the page components so
// react-refresh stays happy.
import { createElement, type ReactElement } from "react";
import {
  Apple,
  Backpack,
  Coins,
  FlaskConical,
  Gem,
  ScrollText,
  Shield,
  Sparkles,
  Sword,
  Wand,
  type LucideIcon,
} from "lucide-react";

/** The index.css rarity badge for an item rarity (colors players already know). */
export function rarityClass(rarity: string): string {
  const key = rarity.replace(/\s+/g, "").toLowerCase();
  const map: Record<string, string> = {
    uncommon: "badge-uncommon",
    rare: "badge-rare",
    veryrare: "badge-very-rare",
    legendary: "badge-legendary",
    artifact: "badge-artifact",
  };
  return `badge ${map[key] ?? "badge-common"}`;
}

/** "VeryRare" → "Very rare". */
export function rarityLabel(rarity: string): string {
  return rarity === "VeryRare" ? "Very rare" : rarity;
}

const TYPE_ICON: [RegExp, LucideIcon][] = [
  [/weapon|sword|bow|axe/i, Sword],
  [/armor|shield/i, Shield],
  [/potion|elixir|oil/i, FlaskConical],
  [/scroll/i, ScrollText],
  [/ring/i, Gem],
  [/wand|rod|staff/i, Wand],
  [/provisions|food|drink/i, Apple],
  [/trinket|curio/i, Coins],
  [/wondrous/i, Sparkles],
];

/** A line icon (an element, not a component) for an item category, for items without a picture. */
export function typeIcon(itemType: string, size = 20): ReactElement {
  let icon: LucideIcon = Backpack;
  for (const [re, match] of TYPE_ICON) {
    if (re.test(itemType)) {
      icon = match;
      break;
    }
  }
  return createElement(icon, { size, "aria-hidden": true });
}

export const STORE_CSS = `
.store-root {
  min-height: 100dvh;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-ui);
  padding-bottom: 4rem;
}
.store-inner { max-width: 1060px; margin: 0 auto; padding: 0 16px; }
.store-nav { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: center; padding: 8px 0 4px; }
.store-back {
  display: inline-flex; align-items: center; gap: 4px; min-height: 44px;
  color: var(--accent-text); font-size: 0.9375rem; font-weight: 500; text-decoration: none;
}
.store-back:hover { color: var(--accent-hover); text-decoration: none; }
.store-hero { border-radius: 14px; overflow: hidden; border: 1px solid var(--border); margin-top: 8px; }
.store-hero img { width: 100%; max-height: 260px; object-fit: cover; display: block; }
.store-eyebrow { font-size: 0.875rem; color: var(--muted); margin: 12px 0 2px; }
.store-title { font-family: var(--font-story); font-weight: 700; font-size: clamp(1.6rem, 6vw, 2.2rem); line-height: 1.15; margin: 0 0 4px; color: var(--text); }
.store-sub { color: var(--text2); font-size: 0.9375rem; }
.store-blurb { font-family: var(--font-story); font-size: 1.05rem; color: var(--story-text); max-width: 640px; line-height: 1.5; margin: 10px 0 0; }
.store-panel {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 12px 14px; display: flex; flex-direction: column; gap: 8px;
}
.store-purse { margin-top: 14px; }
.store-purse-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.store-purse-coins { font-size: 1.05rem; font-weight: 600; }
.store-label { font-size: 0.8125rem; color: var(--muted); }
.store-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.store-chip {
  display: inline-flex; align-items: center; gap: 6px; min-height: 40px;
  background: transparent; border: 1px solid var(--border2); color: var(--text2);
  border-radius: 999px; padding: 4px 14px; font-size: 0.875rem; font-family: inherit; cursor: pointer;
}
.store-chip:hover { background: var(--surface3); color: var(--text); }
.store-chip.on { background: var(--accent-active); border-color: var(--accent-edge); color: var(--accent-active-text); }
.store-search-wrap { position: relative; margin: 16px 0 10px; max-width: 420px; }
.store-search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); pointer-events: none; }
.store-search { padding-left: 38px !important; min-height: 44px; }
.store-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); gap: 10px;
}
.store-card {
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px;
  padding: 12px; display: flex; gap: 12px; min-width: 0;
}
.store-thumb {
  width: 64px; height: 64px; flex: none; border-radius: 10px; overflow: hidden;
  background: var(--surface2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; color: var(--muted);
}
.store-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.store-card-body { display: flex; flex-direction: column; gap: 4px; flex: 1; min-width: 0; }
.store-card h3 { margin: 0; font-size: 1rem; font-weight: 600; color: var(--text); line-height: 1.25; }
.store-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 0.8125rem; color: var(--text2); }
.store-pitch { font-family: var(--font-story); font-style: italic; color: var(--story-text); font-size: 0.95rem; line-height: 1.4; }
.store-desc {
  color: var(--text2); font-size: 0.875rem; line-height: 1.45; text-align: left;
  background: none; border: none; padding: 0; font-family: inherit; cursor: pointer;
}
.store-desc.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
.store-foot { margin-top: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.store-price { font-weight: 600; font-size: 1rem; color: var(--text); }
.store-price.barter { font-family: var(--font-ui); font-style: italic; font-weight: 500; font-size: 0.9rem; color: var(--text2); }
.store-stock { font-size: 0.8125rem; color: var(--amber-text); }
.store-stock.out { color: var(--muted); }
.store-note { font-size: 0.8125rem; color: var(--muted); }
.store-note.err { color: var(--danger-text); }
.trade-bar { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.trade-sell-row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  width: 100%; min-height: 48px; padding: 8px 12px; border-radius: 10px;
  background: var(--surface2); border: 1px solid var(--border);
  color: var(--text); font-family: inherit; font-size: 0.9375rem; cursor: pointer; text-align: left;
}
.trade-sell-row:hover { border-color: var(--border2); }
.trade-sell-row:disabled { opacity: 0.5; cursor: default; }
.store-toast {
  position: fixed; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); left: 16px; right: 16px;
  max-width: 480px; margin: 0 auto; display: flex; align-items: center; gap: 10px;
  background: var(--teal-soft); border: 1px solid #2B4A44; color: var(--text);
  border-radius: 12px; padding: 12px 14px; font-size: 0.9375rem; z-index: 50;
}
.market-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
  gap: 10px; margin-top: 16px;
}
.market-card {
  display: flex; flex-direction: column; text-decoration: none; color: inherit;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
  transition: border-color 0.15s;
}
.market-card:hover { border-color: var(--border2); text-decoration: none; color: inherit; }
.market-card-img { aspect-ratio: 21/9; background: var(--surface2); border-bottom: 1px solid var(--border); }
.market-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.market-card-body { padding: 12px 14px; display: flex; align-items: center; gap: 12px; }
.market-card-icon {
  width: 44px; height: 44px; flex: none; border-radius: 10px; background: var(--surface2);
  border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--accent-text);
}
.market-card h3 { margin: 0 0 2px; font-family: var(--font-story); font-weight: 700; color: var(--text); font-size: 1.15rem; }
`;
