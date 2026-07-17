import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { playApi, type GearRow } from "../api/play";
import { RARITY_COLORS, typeEmoji } from "../components/store/storeTheme";

/**
 * CharacterView — the Character Forge (Plan 48), /play/:pcId/character.
 *
 * The player's BG3-style character screen: a tall hero render, their real
 * inventory as equippable gear, appearance notes in their own words, and
 * the ✨ Forge button that repaints the hero wearing what they equipped.
 * Same capability URL as the player view; no login.
 */

const FORGE_CSS = `
.forge-root {
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% -10%, #241a38 0%, #0d0a16 55%, #06050a 100%);
  color: #e6ddc8;
  font-family: Georgia, 'Times New Roman', serif;
  padding-bottom: 3rem;
}
.forge-inner { max-width: 1040px; margin: 0 auto; padding: 0 1rem; }
.forge-title {
  font-family: Cinzel, Georgia, serif; letter-spacing: 0.1em;
  font-size: clamp(1.5rem, 4vw, 2.3rem); margin: 1.1rem 0 0; color: #f0e6c8;
  text-shadow: 0 2px 14px #000;
}
.forge-sub { color: #b3a789; font-style: italic; font-size: 0.95rem; }
.forge-grid { display: grid; grid-template-columns: minmax(280px, 420px) 1fr; gap: 22px; margin-top: 1.2rem; }
@media (max-width: 760px) { .forge-grid { grid-template-columns: 1fr; } }
.forge-hero {
  position: relative; border-radius: 16px; overflow: hidden;
  border: 1px solid rgba(240,230,200,0.18); background: #100d18;
  aspect-ratio: 2/3; display: flex; align-items: center; justify-content: center;
}
.forge-hero img { width: 100%; height: 100%; object-fit: cover; display: block; }
.forge-hero .ph { font-size: 5rem; opacity: 0.35; }
.forge-hero.busy::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(224,192,77,0.18) 50%, transparent 70%);
  background-size: 250% 100%;
  animation: forge-sheen 1.6s linear infinite;
}
@keyframes forge-sheen { from { background-position: 120% 0; } to { background-position: -120% 0; } }
.forge-btn {
  width: 100%; margin-top: 12px; padding: 12px; border-radius: 12px; cursor: pointer;
  font-family: Cinzel, Georgia, serif; font-size: 1.05rem; letter-spacing: 0.08em;
  color: #1c1508; background: linear-gradient(180deg, #e8c95c, #c9a136);
  border: 1px solid #f0e0a0; box-shadow: 0 2px 18px rgba(224,192,77,0.35);
}
.forge-btn:disabled { opacity: 0.55; cursor: default; }
.forge-note { font-size: 0.78rem; color: #8f8672; margin-top: 6px; text-align: center; }
.forge-section h2 {
  font-family: Cinzel, Georgia, serif; font-size: 1.05rem; letter-spacing: 0.1em;
  color: #d6c390; margin: 1.1rem 0 0.5rem; text-transform: uppercase;
}
.gear-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px;
  border: 1px solid rgba(240,230,200,0.12); margin-bottom: 6px; cursor: pointer;
  background: rgba(28,23,42,0.6); transition: border-color 0.12s ease, background 0.12s ease;
}
.gear-row:hover { border-color: rgba(214,175,54,0.4); }
.gear-row.on {
  border-color: #d6af36; background: rgba(214,175,54,0.13);
  box-shadow: inset 0 0 18px rgba(214,175,54,0.08);
}
.gear-img {
  width: 44px; height: 44px; border-radius: 8px; background: #131019; flex: none;
  display: flex; align-items: center; justify-content: center; font-size: 1.4rem;
  overflow: hidden;
}
.gear-img img { width: 100%; height: 100%; object-fit: cover; }
.gear-name { font-size: 0.95rem; color: #f0e6c8; }
.gear-meta { font-size: 0.7rem; letter-spacing: 0.05em; text-transform: uppercase; }
.gear-state { margin-left: auto; font-size: 0.75rem; color: #b3a789; flex: none; }
.forge-textarea {
  width: 100%; min-height: 110px; border-radius: 10px; padding: 10px 12px;
  background: rgba(240,230,200,0.06); border: 1px solid rgba(240,230,200,0.2);
  color: #e6ddc8; font-family: inherit; font-size: 0.92rem; line-height: 1.45; resize: vertical;
}
.forge-save { margin-top: 6px; font-size: 0.8rem; color: #b3a789; background: none;
  border: 1px solid rgba(240,230,200,0.25); border-radius: 8px; padding: 4px 12px; cursor: pointer; }
.forge-save:hover { color: #f0e6c8; }
.forge-back { color: #b3a789; text-decoration: none; font-size: 0.85rem; }
.forge-back:hover { color: #f0e6c8; }
`;

function GearList({ pcId }: { pcId: string }) {
  const qc = useQueryClient();
  const gearKey = ["forge-gear", pcId];
  const { data: gear = [] } = useQuery({
    queryKey: gearKey,
    queryFn: () => playApi.gear(pcId),
  });

  const equipMut = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => playApi.setEquipped(pcId, id, on),
    onSuccess: () => void qc.invalidateQueries({ queryKey: gearKey }),
  });

  if (gear.length === 0) {
    return (
      <p style={{ color: "#8f8672", fontSize: "0.88rem" }}>
        Your pack is empty — gear you buy or loot appears here, ready to equip.
      </p>
    );
  }
  return (
    <div>
      {gear.map((g: GearRow) => (
        <div
          key={g.character_item_id}
          className={g.equipped ? "gear-row on" : "gear-row"}
          onClick={() => equipMut.mutate({ id: g.character_item_id, on: !g.equipped })}
          title={g.equipped ? "Tap to unequip" : "Tap to equip — the Forge paints what you wear"}
        >
          <div className="gear-img">
            {g.image_url ? <img src={g.image_url} alt={g.name} loading="lazy" /> : typeEmoji(g.item_type)}
          </div>
          <div>
            <div className="gear-name">
              {g.name}
              {g.quantity > 1 ? ` ×${g.quantity}` : ""}
            </div>
            <div className="gear-meta" style={{ color: RARITY_COLORS[g.rarity] ?? "#9a9aac" }}>
              {g.item_type}
              {g.rarity !== "Common" ? ` · ${g.rarity.replace("VeryRare", "Very Rare")}` : ""}
              {g.attuned ? " · attuned" : ""}
            </div>
          </div>
          <span className="gear-state">{g.equipped ? "⚔ equipped" : "in pack"}</span>
        </div>
      ))}
    </div>
  );
}

export default function CharacterView() {
  const { pcId } = useParams<{ pcId: string }>();
  const qc = useQueryClient();
  const pcKey = ["forge-pc", pcId];
  const { data: pc } = useQuery({
    queryKey: pcKey,
    queryFn: () => playApi.get(pcId as string),
    enabled: !!pcId,
  });

  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [forgeError, setForgeError] = useState<string | null>(null);

  // Seed the textarea once the PC loads — state reset during render
  // (the sanctioned derived-state pattern; effects would cascade).
  const [seededFor, setSeededFor] = useState<string | null>(null);
  if (pc && seededFor !== pc.id) {
    setSeededFor(pc.id);
    setDraft(pc.appearance ?? "");
  }

  const appearanceMut = useMutation({
    mutationFn: (text: string) => playApi.setAppearance(pcId as string, text),
    onSuccess: () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1500);
      void qc.invalidateQueries({ queryKey: pcKey });
    },
  });

  const forgeMut = useMutation({
    mutationFn: async () => {
      // Save any unsaved appearance first so the render matches the words.
      if (draft !== null && draft !== (pc?.appearance ?? "")) {
        await playApi.setAppearance(pcId as string, draft);
      }
      return playApi.forgeHero(pcId as string);
    },
    onSuccess: () => {
      setForgeError(null);
      void qc.invalidateQueries({ queryKey: pcKey });
    },
    onError: (err: Error) => setForgeError(err.message),
  });

  if (!pc) {
    return (
      <div className="forge-root">
        <style>{FORGE_CSS}</style>
        <div className="forge-inner" style={{ paddingTop: "30vh", textAlign: "center", color: "#6b6b7a" }}>
          Stoking the forge…
        </div>
      </div>
    );
  }

  const heroSrc = pc.hero_url || pc.figure_url || pc.portrait_url || null;

  return (
    <div className="forge-root">
      <style>{FORGE_CSS}</style>
      <div className="forge-inner">
        <h1 className="forge-title">{pc.character_name}</h1>
        <div className="forge-sub">
          Level {pc.level} {pc.race} {pc.character_class}
          {pc.subclass ? ` · ${pc.subclass}` : ""} — played by {pc.player_name}
        </div>
        <div className="forge-grid">
          <div>
            <div className={forgeMut.isPending ? "forge-hero busy" : "forge-hero"}>
              {heroSrc ? <img src={heroSrc} alt={pc.character_name} /> : <span className="ph">🛡️</span>}
            </div>
            <button
              className="forge-btn"
              disabled={forgeMut.isPending}
              onClick={() => forgeMut.mutate()}
            >
              {forgeMut.isPending ? "⚒ Forging…" : "✨ Forge the portrait"}
            </button>
            <div className="forge-note">
              {forgeError
                ? forgeError
                : forgeMut.isPending
                  ? "The smiths are at work — about half a minute."
                  : "Paints your character wearing what you've equipped, looking how you've described."}
            </div>
          </div>
          <div className="forge-section">
            <h2>⚔ Equipment</h2>
            <GearList pcId={pcId as string} />
            <h2>✍ Appearance — in your own words</h2>
            <textarea
              className="forge-textarea"
              placeholder="Hair, eyes, build, scars, how they carry themselves… the Forge paints what you write."
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1500}
            />
            <button
              className="forge-save"
              disabled={appearanceMut.isPending || draft === null}
              onClick={() => draft !== null && appearanceMut.mutate(draft)}
            >
              {saved ? "✓ saved" : "Save appearance"}
            </button>
            <p style={{ marginTop: "1.6rem" }}>
              <Link className="forge-back" to={`/play/${pcId}`}>
                ← back to your sheet
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
