// storeTheme — shared styling + helpers for the player marketplace pages
// (Plan 47). Lives outside the page components so react-refresh stays happy.

export const RARITY_COLORS: Record<string, string> = {
  Common: "#9a9aac",
  Uncommon: "#58b368",
  Rare: "#4a90d9",
  VeryRare: "#9c5fd4",
  Legendary: "#e0a93d",
  Artifact: "#d4593f",
};

const TYPE_EMOJI: [RegExp, string][] = [
  [/weapon|sword|bow|axe/i, "⚔️"],
  [/armor|shield/i, "🛡️"],
  [/potion|elixir|oil/i, "🧪"],
  [/scroll/i, "📜"],
  [/ring/i, "💍"],
  [/wand|rod|staff/i, "🪄"],
  [/provisions|food|drink/i, "🍞"],
  [/trinket|curio/i, "🪙"],
  [/wondrous/i, "✨"],
];

/** Pick a placeholder emoji for an item category. */
export function typeEmoji(itemType: string): string {
  for (const [re, emoji] of TYPE_EMOJI) if (re.test(itemType)) return emoji;
  return "🎒";
}

export const STORE_CSS = `
.store-root {
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% -10%, #1d1830 0%, #0b0a14 55%, #060609 100%);
  color: #e6ddc8;
  font-family: Georgia, 'Times New Roman', serif;
  padding-bottom: 4rem;
}
.store-inner { max-width: 1060px; margin: 0 auto; padding: 0 1rem; }
.store-hero { position: relative; border-radius: 0 0 18px 18px; overflow: hidden; }
.store-hero img { width: 100%; max-height: 320px; object-fit: cover; display: block; }
.store-hero::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(to bottom, rgba(6,6,9,0.1) 40%, rgba(6,6,9,0.92) 100%);
}
.store-title {
  font-family: Cinzel, Georgia, serif; letter-spacing: 0.1em;
  font-size: clamp(1.6rem, 4.5vw, 2.6rem); margin: 0.9rem 0 0.1rem; color: #f0e6c8;
  text-shadow: 0 2px 14px #000;
}
.store-sub { color: #b3a789; font-size: 0.95rem; font-style: italic; }
.store-blurb { color: #cfc4a9; max-width: 640px; line-height: 1.5; }
.store-chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 1rem 0 1.2rem; }
.store-chip {
  background: rgba(240,230,200,0.06); border: 1px solid rgba(240,230,200,0.22);
  color: #cfc4a9; border-radius: 999px; padding: 4px 14px; font-size: 0.82rem;
  cursor: pointer; font-family: inherit;
}
.store-chip.on { background: rgba(214,175,54,0.22); border-color: #d6af36; color: #f0e6c8; }
.store-search {
  background: rgba(240,230,200,0.07); border: 1px solid rgba(240,230,200,0.22);
  color: #e6ddc8; border-radius: 10px; padding: 8px 14px; font-size: 0.95rem;
  font-family: inherit; width: min(100%, 340px);
}
.store-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(228px, 1fr)); gap: 16px;
}
.store-card {
  background: linear-gradient(180deg, rgba(38,32,54,0.85), rgba(20,17,28,0.95));
  border: 1px solid rgba(240,230,200,0.14); border-radius: 14px; overflow: hidden;
  display: flex; flex-direction: column; transition: transform 0.15s ease, border-color 0.15s ease;
}
.store-card:hover { transform: translateY(-3px); border-color: rgba(214,175,54,0.55); }
.store-card-img { aspect-ratio: 1; background: #131019; display: flex; align-items: center; justify-content: center; }
.store-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.store-card-img .ph { font-size: 3.4rem; opacity: 0.5; }
.store-card-body { padding: 0.7rem 0.85rem 0.85rem; display: flex; flex-direction: column; gap: 5px; flex: 1; }
.store-card h3 { margin: 0; font-size: 1.02rem; color: #f0e6c8; font-family: Cinzel, Georgia, serif; letter-spacing: 0.02em; }
.store-meta { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; }
.store-pitch { font-style: italic; color: #b3a789; font-size: 0.83rem; line-height: 1.35; }
.store-desc { color: #cfc4a9; font-size: 0.83rem; line-height: 1.4; }
.store-desc.clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; cursor: pointer; }
.store-foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; padding-top: 6px; }
.store-price {
  font-family: Cinzel, Georgia, serif; color: #e0c04d; font-size: 1rem;
  text-shadow: 0 1px 6px rgba(224,169,61,0.35);
}
.store-stock { font-size: 0.72rem; color: #c98a5a; }
.store-back { color: #b3a789; text-decoration: none; font-size: 0.85rem; }
.store-back:hover { color: #f0e6c8; }
.store-purse {
  display: inline-block; margin-top: 0.6rem; padding: 5px 14px; border-radius: 999px;
  background: rgba(224,192,77,0.1); border: 1px solid rgba(224,192,77,0.4);
  color: #e0c04d; font-size: 0.9rem;
}
.store-buy {
  margin-top: 7px; padding: 7px 0; width: 100%; border-radius: 9px; cursor: pointer;
  font-family: Cinzel, Georgia, serif; font-size: 0.86rem; letter-spacing: 0.05em;
  color: #1c1508; background: linear-gradient(180deg, #e8c95c, #c9a136);
  border: 1px solid #f0e0a0;
}
.store-buy:disabled { opacity: 0.45; cursor: default; }
.store-note { margin-top: 6px; font-size: 0.72rem; color: #8f8672; font-style: italic; }
.store-note.err { color: #d4776a; }
.store-toast {
  position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
  background: rgba(20,16,30,0.95); border: 1px solid #d6af36; color: #f0e6c8;
  border-radius: 12px; padding: 10px 22px; font-size: 0.95rem; z-index: 50;
  box-shadow: 0 4px 24px rgba(0,0,0,0.5);
}
.market-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 18px; margin-top: 1.4rem;
}
.market-card {
  display: block; text-decoration: none; color: inherit;
  background: linear-gradient(180deg, rgba(38,32,54,0.85), rgba(20,17,28,0.95));
  border: 1px solid rgba(240,230,200,0.14); border-radius: 14px; overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.market-card:hover { transform: translateY(-3px); border-color: rgba(214,175,54,0.55); }
.market-card-img { aspect-ratio: 21/9; background: #131019; display: flex; align-items: center; justify-content: center; }
.market-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; }
.market-card-body { padding: 0.75rem 0.9rem 0.9rem; }
.market-card h3 { margin: 0 0 3px; font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: 1.08rem; }
`;
