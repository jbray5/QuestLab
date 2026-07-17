import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { playApi, type GearRow } from "../api/play";
import { RARITY_COLORS, typeEmoji } from "../components/store/storeTheme";

/**
 * CharacterView — the character screen (Plan 48), /play/:pcId/character.
 *
 * A Diablo-style paper-doll: a persistent character model in the centre,
 * flanked by equipment slots that fill instantly with item art as the
 * player equips gear. The model itself is a stable likeness that does NOT
 * regenerate when gear changes — a separate, optional button repaints it
 * only when the player wants to change how their character looks. Same
 * capability URL as the player sheet; no login.
 */

// Slot layout — left column beside the model, right column on the other side.
const LEFT_SLOTS: { key: string; label: string; icon: string }[] = [
  { key: "head", label: "Head", icon: "🪖" },
  { key: "body", label: "Body", icon: "🥋" },
  { key: "hands", label: "Hands", icon: "🧤" },
  { key: "feet", label: "Feet", icon: "🥾" },
];
const RIGHT_SLOTS: { key: string; label: string; icon: string }[] = [
  { key: "main_hand", label: "Main Hand", icon: "⚔️" },
  { key: "off_hand", label: "Off Hand", icon: "🛡️" },
  { key: "back", label: "Cloak", icon: "🧥" },
  { key: "neck", label: "Neck", icon: "📿" },
  { key: "ring", label: "Ring", icon: "💍" },
];

const FORGE_CSS = `
.forge-root {
  min-height: 100vh;
  background: radial-gradient(ellipse at 50% -10%, #241a38 0%, #0d0a16 55%, #06050a 100%);
  color: #e6ddc8; font-family: Georgia, 'Times New Roman', serif; padding-bottom: 3rem;
}
.forge-inner { max-width: 1060px; margin: 0 auto; padding: 0 1rem; }
.forge-title {
  font-family: Cinzel, Georgia, serif; letter-spacing: 0.1em;
  font-size: clamp(1.5rem, 4vw, 2.3rem); margin: 1.1rem 0 0; color: #f0e6c8;
  text-shadow: 0 2px 14px #000;
}
.forge-sub { color: #b3a789; font-style: italic; font-size: 0.95rem; }
.doll {
  display: grid; grid-template-columns: 92px minmax(0, 1fr) 92px; gap: 12px;
  align-items: start; margin-top: 1.1rem;
}
@media (max-width: 560px) { .doll { grid-template-columns: 68px 1fr 68px; gap: 7px; } }
.slot-col { display: flex; flex-direction: column; gap: 12px; }
.slot {
  aspect-ratio: 1; border-radius: 12px; border: 1px solid rgba(240,230,200,0.16);
  background: rgba(20,16,30,0.7); position: relative; cursor: default;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.slot.filled { border-color: #d6af36; box-shadow: inset 0 0 20px rgba(214,175,54,0.12); cursor: pointer; }
.slot.hint { border-color: rgba(214,175,54,0.5); border-style: dashed; }
.slot img { width: 100%; height: 100%; object-fit: cover; }
.slot .ghost { font-size: 1.5rem; opacity: 0.28; }
.slot .lbl {
  position: absolute; bottom: 2px; left: 0; right: 0; text-align: center;
  font-size: 0.52rem; letter-spacing: 0.05em; text-transform: uppercase;
  color: #9a9078; background: linear-gradient(transparent, rgba(6,5,10,0.85)); padding-top: 8px;
}
.slot .rm {
  position: absolute; top: 2px; right: 4px; font-size: 0.7rem; color: #e6ddc8;
  opacity: 0; transition: opacity 0.12s;
}
.slot.filled:hover .rm { opacity: 0.9; }
.model {
  border-radius: 16px; border: 1px solid rgba(240,230,200,0.16); overflow: hidden;
  aspect-ratio: 2/3; position: relative;
  background:
    radial-gradient(ellipse at 50% 92%, rgba(214,175,54,0.16), transparent 60%),
    radial-gradient(ellipse at 50% 30%, rgba(90,70,140,0.35), #0a0812 70%);
  display: flex; align-items: flex-end; justify-content: center;
}
.model img { width: 100%; height: 100%; object-fit: contain; display: block; filter: drop-shadow(0 12px 18px rgba(0,0,0,0.6)); }
.model .ph { font-size: 5rem; opacity: 0.35; margin-bottom: 20%; }
.model.busy::after {
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(120deg, transparent 30%, rgba(224,192,77,0.16) 50%, transparent 70%);
  background-size: 250% 100%; animation: forge-sheen 1.6s linear infinite;
}
@keyframes forge-sheen { from { background-position: 120% 0; } to { background-position: -120% 0; } }
.forge-h2 {
  font-family: Cinzel, Georgia, serif; font-size: 1rem; letter-spacing: 0.1em;
  color: #d6c390; margin: 1.4rem 0 0.5rem; text-transform: uppercase;
}
.pack { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; }
.pack-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 10px;
  border: 1px solid rgba(240,230,200,0.12); background: rgba(28,23,42,0.55);
}
.pack-item.eq { cursor: pointer; }
.pack-item.eq:hover { border-color: rgba(214,175,54,0.45); }
.pack-item.carried { opacity: 0.72; }
.pack-img {
  width: 38px; height: 38px; border-radius: 7px; background: #131019; flex: none; overflow: hidden;
  display: flex; align-items: center; justify-content: center; font-size: 1.2rem;
}
.pack-img img { width: 100%; height: 100%; object-fit: cover; }
.pack-name { font-size: 0.86rem; color: #f0e6c8; line-height: 1.15; }
.pack-meta { font-size: 0.66rem; letter-spacing: 0.04em; text-transform: uppercase; }
.forge-textarea {
  width: 100%; min-height: 90px; border-radius: 10px; padding: 10px 12px;
  background: rgba(240,230,200,0.06); border: 1px solid rgba(240,230,200,0.2);
  color: #e6ddc8; font-family: inherit; font-size: 0.92rem; line-height: 1.45; resize: vertical;
}
.forge-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 8px; }
.forge-btn {
  padding: 8px 16px; border-radius: 10px; cursor: pointer;
  font-family: Cinzel, Georgia, serif; font-size: 0.92rem; letter-spacing: 0.06em;
  color: #1c1508; background: linear-gradient(180deg, #e8c95c, #c9a136);
  border: 1px solid #f0e0a0;
}
.forge-btn:disabled { opacity: 0.55; cursor: default; }
.forge-save { font-size: 0.82rem; color: #b3a789; background: none;
  border: 1px solid rgba(240,230,200,0.25); border-radius: 8px; padding: 6px 12px; cursor: pointer; }
.forge-save:hover { color: #f0e6c8; }
.forge-note { font-size: 0.76rem; color: #8f8672; }
.forge-back { color: #b3a789; text-decoration: none; font-size: 0.85rem; }
.forge-back:hover { color: #f0e6c8; }
`;

function Slot({
  def,
  item,
  hint,
  onUnequip,
}: {
  def: { key: string; label: string; icon: string };
  item: GearRow | undefined;
  hint: boolean;
  onUnequip: (id: string) => void;
}) {
  const cls = item ? "slot filled" : hint ? "slot hint" : "slot";
  return (
    <div
      className={cls}
      title={item ? `${item.name} — tap to unequip` : def.label}
      onClick={() => item && onUnequip(item.character_item_id)}
    >
      {item ? (
        item.image_url ? (
          <img src={item.image_url} alt={item.name} loading="lazy" />
        ) : (
          <span className="ghost" style={{ opacity: 0.8 }}>
            {typeEmoji(item.item_type)}
          </span>
        )
      ) : (
        <span className="ghost">{def.icon}</span>
      )}
      {item && <span className="rm">✕</span>}
      <span className="lbl">{def.label}</span>
    </div>
  );
}

function Doll({ pcId, model, busy }: { pcId: string; model: string | null; busy: boolean }) {
  const qc = useQueryClient();
  const gearKey = ["forge-gear", pcId];
  const { data: gear = [] } = useQuery({ queryKey: gearKey, queryFn: () => playApi.gear(pcId) });
  const equipMut = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => playApi.setEquipped(pcId, id, on),
    onSuccess: () => void qc.invalidateQueries({ queryKey: gearKey }),
  });

  const equippedInSlot = (key: string) => gear.find((g) => g.slot === key && g.equipped);
  const pack = gear.filter((g) => !g.equipped);
  const selectedSlots = new Set(pack.filter((g) => g.slot).map((g) => g.slot));

  return (
    <div>
      <div className="doll">
        <div className="slot-col">
          {LEFT_SLOTS.map((def) => (
            <Slot
              key={def.key}
              def={def}
              item={equippedInSlot(def.key)}
              hint={selectedSlots.has(def.key) && !equippedInSlot(def.key)}
              onUnequip={(id) => equipMut.mutate({ id, on: false })}
            />
          ))}
        </div>
        <div className={busy ? "model busy" : "model"}>
          {model ? <img src={model} alt="Your character" /> : <span className="ph">🧍</span>}
        </div>
        <div className="slot-col">
          {RIGHT_SLOTS.map((def) => (
            <Slot
              key={def.key}
              def={def}
              item={equippedInSlot(def.key)}
              hint={selectedSlots.has(def.key) && !equippedInSlot(def.key)}
              onUnequip={(id) => equipMut.mutate({ id, on: false })}
            />
          ))}
        </div>
      </div>

      <h2 className="forge-h2">🎒 Pack</h2>
      {pack.length === 0 ? (
        <p style={{ color: "#8f8672", fontSize: "0.86rem" }}>
          Everything you own is equipped — loot and market buys land here.
        </p>
      ) : (
        <div className="pack">
          {pack.map((g) => {
            const canEquip = !!g.slot;
            return (
              <div
                key={g.character_item_id}
                className={`pack-item ${canEquip ? "eq" : "carried"}`}
                title={
                  canEquip
                    ? `Tap to equip → ${g.slot?.replace("_", " ")}`
                    : `${g.name} — carried in your pack`
                }
                onClick={() => canEquip && equipMut.mutate({ id: g.character_item_id, on: true })}
              >
                <div className="pack-img">
                  {g.image_url ? <img src={g.image_url} alt={g.name} loading="lazy" /> : typeEmoji(g.item_type)}
                </div>
                <div>
                  <div className="pack-name">
                    {g.name}
                    {g.quantity > 1 ? ` ×${g.quantity}` : ""}
                  </div>
                  <div className="pack-meta" style={{ color: RARITY_COLORS[g.rarity] ?? "#9a9aac" }}>
                    {canEquip ? g.slot?.replace("_", " ") : "carried"}
                    {g.rarity !== "Common" ? ` · ${g.rarity.replace("VeryRare", "Very Rare")}` : ""}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
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

  // Seed the textarea once the PC loads — reset during render (the sanctioned
  // derived-state pattern; an effect would cascade a second render).
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
          Summoning your character…
        </div>
      </div>
    );
  }

  // The model is a stable likeness: prefer the forged hero, then the board
  // standee, then the portrait. It never changes when gear is equipped.
  const model = pc.hero_url || pc.figure_url || pc.portrait_url || null;

  return (
    <div className="forge-root">
      <style>{FORGE_CSS}</style>
      <div className="forge-inner">
        <h1 className="forge-title">{pc.character_name}</h1>
        <div className="forge-sub">
          Level {pc.level} {pc.race} {pc.character_class}
          {pc.subclass ? ` · ${pc.subclass}` : ""} — played by {pc.player_name}
        </div>

        <Doll pcId={pcId as string} model={model} busy={forgeMut.isPending} />

        <h2 className="forge-h2">✍ How your character looks</h2>
        <textarea
          className="forge-textarea"
          placeholder="Hair, eyes, build, scars, bearing… this describes your character, not their gear. Equipment shows in the slots above."
          value={draft ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1500}
        />
        <div className="forge-row">
          <button
            className="forge-save"
            disabled={appearanceMut.isPending || draft === null}
            onClick={() => draft !== null && appearanceMut.mutate(draft)}
          >
            {saved ? "✓ saved" : "Save description"}
          </button>
          <button className="forge-btn" disabled={forgeMut.isPending} onClick={() => forgeMut.mutate()}>
            {forgeMut.isPending ? "⚒ Painting…" : "✨ Regenerate model"}
          </button>
          <span className="forge-note">
            {forgeError
              ? forgeError
              : forgeMut.isPending
                ? "Repainting your character — about half a minute."
                : "Only changes how your character looks — your gear stays where it is."}
          </span>
        </div>

        <p style={{ marginTop: "1.8rem" }}>
          <Link className="forge-back" to={`/play/${pcId}`}>
            ← back to your sheet
          </Link>
        </p>
      </div>
    </div>
  );
}
