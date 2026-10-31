import { useState } from "react";
import { AI_ON } from "../lib/flags";
import { zoomable } from "../lib/lightbox";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  CircleDot,
  Footprints,
  Gem,
  Hand,
  HardHat,
  Layers,
  Lock,
  Pin,
  Share2,
  Shield,
  Shirt,
  Store,
  Sword,
  type LucideIcon,
} from "lucide-react";

import { playApi, type GearRow } from "../api/play";
import { rarityClass, rarityLabel, typeIcon } from "../components/store/storeTheme";
import { renderLegendCard, shareLegendCard } from "../lib/legendCard";
import { Monogram } from "./player/ui";

/**
 * CharacterView — "Your look and gear" (Plan 48), /play/:pcId/character.
 *
 * A paper-doll: the character's picture in the centre, flanked by equipment
 * slots that fill as the player equips gear, with the pack below. The picture
 * is a stable likeness that does NOT change when gear changes. Same
 * capability URL as the player sheet; no login. Plan 122: Lamplit, plain
 * labels under every slot, explicit Equip / Take off buttons, and a way back
 * to the phone's Character tab at the top and the bottom.
 */

type SlotDef = { key: string; label: string; icon: LucideIcon };

// Slot layout — left column beside the model, right column on the other side.
const LEFT_SLOTS: SlotDef[] = [
  { key: "head", label: "Head", icon: HardHat },
  { key: "body", label: "Body", icon: Shirt },
  { key: "hands", label: "Hands", icon: Hand },
  { key: "feet", label: "Feet", icon: Footprints },
];
const RIGHT_SLOTS: SlotDef[] = [
  { key: "main_hand", label: "Main hand", icon: Sword },
  { key: "off_hand", label: "Off hand", icon: Shield },
  { key: "back", label: "Cloak", icon: Layers },
  { key: "neck", label: "Neck", icon: Gem },
  { key: "ring", label: "Ring", icon: CircleDot },
];
const SLOT_NAMES: Record<string, string> = Object.fromEntries(
  [...LEFT_SLOTS, ...RIGHT_SLOTS].map((d) => [d.key, d.label.toLowerCase()]),
);

const CSS = `
.cv-root { min-height: 100dvh; background: var(--bg); color: var(--text); font-family: var(--font-ui); padding-bottom: 3rem; }
.cv-inner { max-width: 640px; margin: 0 auto; padding: 0 16px; }
.cv-back { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font-size: 0.9375rem; font-weight: 500; color: var(--accent-text); text-decoration: none; }
.cv-back:hover { color: var(--accent-hover); text-decoration: none; }
.cv-head { display: flex; align-items: center; gap: 12px; margin: 4px 0 4px; }
.cv-name { font-family: var(--font-story); font-weight: 700; font-size: 1.5rem; line-height: 1.15; margin: 0; }
.cv-sub { color: var(--muted); font-size: 0.875rem; }
.cv-h2 { font-size: 1.05rem; font-weight: 600; margin: 24px 0 8px; }
.cv-help { font-size: 0.875rem; color: var(--text2); margin: 0 0 10px; }
.cv-doll { display: grid; grid-template-columns: 72px minmax(0, 1fr) 72px; gap: 10px; align-items: start; }
.cv-slots { display: flex; flex-direction: column; gap: 8px; }
.cv-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; padding: 0; background: none; border: none; color: inherit; font: inherit; }
.cv-slot-box {
  width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--border); background: var(--surface);
  display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--muted);
}
.cv-slot-box img { width: 100%; height: 100%; object-fit: cover; }
button.cv-slot { cursor: pointer; }
button.cv-slot .cv-slot-box { border-color: var(--accent-line); background: var(--accent-soft); color: var(--accent-text); }
.cv-slot.hint .cv-slot-box { border-style: dashed; border-color: var(--border2); }
.cv-slot-cap { font-size: 0.75rem; line-height: 1.2; color: var(--muted); text-align: center; width: 72px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
button.cv-slot .cv-slot-cap { color: var(--text); }
.cv-model {
  border-radius: 14px; border: 1px solid var(--border); overflow: hidden; aspect-ratio: 2/3;
  background: var(--surface); display: flex; align-items: center; justify-content: center; position: relative;
}
.cv-model img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cv-model.busy { opacity: 0.6; }
.cv-list { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 2px 12px; }
.cv-item { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.cv-item:last-child { border-bottom: none; }
.cv-thumb { width: 44px; height: 44px; flex: none; border-radius: 10px; background: var(--surface2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden; color: var(--muted); }
.cv-thumb img { width: 100%; height: 100%; object-fit: cover; }
.cv-item-name { font-weight: 600; font-size: 0.9375rem; line-height: 1.25; }
.cv-item-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 0.8125rem; color: var(--text2); margin-top: 2px; }
.cv-empty { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; color: var(--text2); font-size: 0.9375rem; }
.cv-pics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cv-pic { border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
.cv-pic .im { aspect-ratio: 3/4; display: flex; align-items: center; justify-content: center; overflow: hidden; background: var(--surface2); }
.cv-pic .im img { width: 100%; height: 100%; object-fit: contain; }
.cv-pic .im.face img { object-fit: cover; }
.cv-pic .cap { font-size: 0.75rem; color: var(--text2); padding: 6px 8px 8px; line-height: 1.25; }
.cv-chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 8px 0 4px; }
.cv-chip {
  display: inline-flex; align-items: center; min-height: 40px; font: inherit; font-size: 0.875rem; color: var(--text2);
  background: transparent; border: 1px solid var(--border2); border-radius: 999px; padding: 4px 12px; cursor: pointer;
}
.cv-chip:hover { background: var(--surface3); color: var(--text); }
@media (pointer: coarse) { .cv-chip { min-height: 44px; } }
.cv-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.cv-note { font-size: 0.8125rem; color: var(--muted); }
@media (max-width: 380px) { .cv-doll { grid-template-columns: 64px minmax(0, 1fr) 64px; gap: 8px; } .cv-slot-box { width: 56px; height: 56px; } .cv-slot-cap { width: 64px; } }
`;

function Slot({
  def,
  item,
  hint,
  onUnequip,
}: {
  def: SlotDef;
  item: GearRow | undefined;
  hint: boolean;
  onUnequip: (id: string) => void;
}) {
  if (!item) {
    const Icon = def.icon;
    return (
      <div className={hint ? "cv-slot hint" : "cv-slot"} title={hint ? `${def.label}: something in your pack fits here` : def.label}>
        <span className="cv-slot-box">
          <Icon size={22} />
        </span>
        <span className="cv-slot-cap">{def.label}</span>
      </div>
    );
  }
  return (
    <button
      type="button"
      className="cv-slot"
      aria-label={`${def.label}: ${item.name}. Tap to take it off.`}
      title={`${item.name}: tap to take it off`}
      onClick={() => onUnequip(item.character_item_id)}
    >
      <span className="cv-slot-box">
        {item.image_url ? <img src={item.image_url} alt="" loading="lazy" /> : typeIcon(item.item_type, 24)}
      </span>
      <span className="cv-slot-cap">{item.name}</span>
    </button>
  );
}

function Doll({ pcId, campaignId, model, name, busy }: { pcId: string; campaignId: string; model: string | null; name: string; busy: boolean }) {
  const qc = useQueryClient();
  const gearKey = ["forge-gear", pcId];
  const { data: gear = [], isLoading } = useQuery({ queryKey: gearKey, queryFn: () => playApi.gear(pcId) });
  const setEquipped = (id: string, on: boolean) => playApi.setEquipped(pcId, id, on);
  const refetch = () => qc.invalidateQueries({ queryKey: gearKey });

  const equipMut = useMutation({ mutationFn: (id: string) => setEquipped(id, false), onSuccess: refetch });
  // Equip with a swap: one item per slot. If the target slot is already
  // filled, unequip the occupant first so nothing is left double-equipped.
  const swapMut = useMutation({
    mutationFn: async (g: GearRow) => {
      const occupant = gear.find((x) => x.slot === g.slot && x.equipped && x.character_item_id !== g.character_item_id);
      if (occupant) await setEquipped(occupant.character_item_id, false);
      await setEquipped(g.character_item_id, true);
    },
    onSuccess: refetch,
  });
  const working = equipMut.isPending || swapMut.isPending;

  // The item shown in each slot cell (first equipped item mapped there).
  const slotItem = (key: string) => gear.find((g) => g.slot === key && g.equipped);
  const shown = new Set(
    [...LEFT_SLOTS, ...RIGHT_SLOTS].map((d) => slotItem(d.key)?.character_item_id).filter(Boolean),
  );
  // Pack = everything not currently occupying a slot cell. Overflow-equipped
  // items (e.g. a second weapon) land here flagged "equipped" so they stay
  // visible and toggleable instead of vanishing.
  const pack = gear.filter((g) => !shown.has(g.character_item_id));
  const wantSlots = new Set(pack.filter((g) => g.slot && !g.equipped).map((g) => g.slot));

  const renderSlot = (def: SlotDef) => (
    <Slot
      key={def.key}
      def={def}
      item={slotItem(def.key)}
      hint={wantSlots.has(def.key) && !slotItem(def.key)}
      onUnequip={(id) => equipMut.mutate(id)}
    />
  );

  return (
    <div>
      <p className="cv-help">Tap something you wear to take it off. Tap Equip on anything in your pack to put it on.</p>
      <div className="cv-doll">
        <div className="cv-slots">{LEFT_SLOTS.map(renderSlot)}</div>
        <div className={busy ? "cv-model busy" : "cv-model"}>
          {model ? <img src={model} {...zoomable(model, name)} alt={name} /> : <Monogram name={name} size={96} />}
        </div>
        <div className="cv-slots">{RIGHT_SLOTS.map(renderSlot)}</div>
      </div>

      <h2 className="cv-h2">In your pack</h2>
      {isLoading ? (
        <p className="cv-note">Opening your pack…</p>
      ) : pack.length === 0 ? (
        <div className="cv-empty">
          <span>{gear.length === 0 ? "You don't carry anything yet." : "Everything you own is equipped."} Loot from your DM and market buys land here.</span>
          <Link className="cv-back" to={`/market/${campaignId}?pc=${pcId}`} style={{ alignSelf: "flex-start" }}>
            <Store size={18} /> Visit the market
          </Link>
        </div>
      ) : (
        <div className="cv-list">
          {pack.map((g) => {
            const canEquip = !!g.slot;
            return (
              <div key={g.character_item_id} className="cv-item">
                <div className="cv-thumb">
                  {g.image_url ? <img src={g.image_url} alt="" loading="lazy" /> : typeIcon(g.item_type, 20)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cv-item-name">
                    {g.name}
                    {g.quantity > 1 ? <span className="num" style={{ fontWeight: 500, color: "var(--text2)" }}> ×{g.quantity}</span> : ""}
                  </div>
                  <div className="cv-item-meta">
                    {g.equipped ? (
                      <span className="pill pill-teal">Equipped</span>
                    ) : canEquip ? (
                      <span>Goes on: {SLOT_NAMES[g.slot ?? ""] ?? g.slot?.replace("_", " ")}</span>
                    ) : (
                      <span>Carried</span>
                    )}
                    {g.rarity !== "Common" && <span className={rarityClass(g.rarity)}>{rarityLabel(g.rarity)}</span>}
                  </div>
                </div>
                {g.equipped ? (
                  <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} disabled={working} onClick={() => equipMut.mutate(g.character_item_id)}>
                    Take off
                  </button>
                ) : canEquip ? (
                  <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={working} onClick={() => swapMut.mutate(g)}>
                    Equip
                  </button>
                ) : null}
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
  const { data: pc, isError } = useQuery({
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

  // "Render me wearing this" — the identity-preserving image-to-image that
  // paints the equipped gear onto the persistent model.
  const dressMut = useMutation({
    mutationFn: () => playApi.dressModel(pcId as string),
    onSuccess: () => {
      setForgeError(null);
      void qc.invalidateQueries({ queryKey: pcKey });
    },
    onError: (err: Error) => setForgeError(err.message),
  });

  // "New base look" — regenerates the base identity from the description
  // (clears any dressed render server-side).
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
  // Plan 62 — the full identity chain: one press, every surface.
  const identityMut = useMutation({
    mutationFn: async () => {
      if (draft !== null && draft !== (pc?.appearance ?? "")) {
        await playApi.setAppearance(pcId as string, draft);
      }
      return playApi.forgeIdentity(pcId as string);
    },
    onSuccess: () => {
      setForgeError(null);
      void qc.invalidateQueries({ queryKey: pcKey });
    },
    onError: (err: Error) => setForgeError(err.message),
  });
  // Legend Cards (Plan 68) — the share loop.
  const [cardState, setCardState] = useState<"idle" | "busy" | "shared" | "downloaded" | "failed">(
    "idle",
  );
  async function makeLegendCard() {
    if (!pc) return;
    setCardState("busy");
    try {
      const artUrl = pc.loadout_url || pc.hero_url || pc.figure_url || pc.portrait_url;
      if (!artUrl) throw new Error("no art");
      let campaign = "";
      try {
        campaign = (await playApi.campaignName(pcId as string)).name;
      } catch {
        /* card works without the campaign line */
      }
      const blob = await renderLegendCard({
        name: pc.character_name,
        subtitle: `Level ${pc.level} ${pc.race} ${pc.character_class}${pc.subclass ? ` · ${pc.subclass}` : ""}`,
        campaign,
        subclass: pc.subclass,
        artUrl,
      });
      setCardState(await shareLegendCard(blob, pc.character_name));
    } catch {
      setCardState("failed");
    }
    window.setTimeout(() => setCardState("idle"), 3500);
  }

  // Golden base (Plan 62 follow-up): pin the render you love.
  const lockMut = useMutation({
    mutationFn: (locked: boolean) => playApi.setHeroLock(pcId as string, locked),
    onSuccess: () => {
      setForgeError(null);
      void qc.invalidateQueries({ queryKey: pcKey });
    },
    onError: (err: Error) => setForgeError(err.message),
  });
  const busy = dressMut.isPending || forgeMut.isPending || identityMut.isPending;
  const sheetPath = `/play/${pcId}?tab=character`;
  const backLink = (
    <Link className="cv-back" to={sheetPath}>
      <ChevronLeft size={18} /> Back to your sheet
    </Link>
  );

  if (!pc) {
    return (
      <div className="cv-root">
        <style>{CSS}</style>
        <div className="cv-inner">
          {backLink}
          <p style={{ paddingTop: "28vh", textAlign: "center", color: "var(--text2)" }}>
            {isError ? "We couldn't open this character. Ask your DM for a fresh link." : "Opening your character…"}
          </p>
        </div>
      </div>
    );
  }

  // Show the dressed render if the player has made one, else the base model
  // (board standee / portrait as last resorts). The dressed render only
  // changes when they deliberately press "Render me wearing this".
  const model = pc.loadout_url || pc.hero_url || pc.figure_url || pc.portrait_url || null;
  const subline = [`Level ${pc.level} ${pc.race} ${pc.character_class}`, pc.subclass, pc.player_name ? `played by ${pc.player_name}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="cv-root">
      <style>{CSS}</style>
      <div className="cv-inner">
        <nav aria-label="Back" style={{ paddingTop: 8 }}>{backLink}</nav>
        <div className="cv-head">
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--muted)" }}>Your look and gear</p>
            <h1 className="cv-name">{pc.character_name}</h1>
            <div className="cv-sub">{subline}</div>
          </div>
        </div>

        <h2 className="cv-h2">What you&rsquo;re wearing</h2>
        <Doll pcId={pcId as string} campaignId={pc.campaign_id} model={model} name={pc.character_name} busy={busy} />

        {AI_ON && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: 14, width: "100%", minHeight: 48, whiteSpace: "normal" }}
            disabled={busy}
            onClick={() => identityMut.mutate()}
          >
            {identityMut.isPending
              ? "Updating your model, portrait and board mini (a minute or two)…"
              : "Update my look: model, portrait and board mini"}
          </button>
        )}
        {forgeError && (
          <p style={{ color: "var(--danger-text)", fontSize: "0.875rem", marginTop: 6 }}>{forgeError}</p>
        )}

        {(model || pc.portrait_url || pc.figure_url) && (<>
        <h2 className="cv-h2">Where you appear</h2>
        <div className="cv-pics">
          <div className="cv-pic">
            <div className="im">
              {model ? <img src={model} {...zoomable(model, `${pc.character_name}: model`)} alt="Your model" /> : <Monogram name={pc.character_name} size={56} />}
            </div>
            <div className="cap">Your picture</div>
          </div>
          <div className="cv-pic">
            <div className="im face">
              {pc.portrait_url ? <img src={pc.portrait_url} {...zoomable(pc.portrait_url, `${pc.character_name}: portrait`)} alt="Your portrait" /> : <Monogram name={pc.character_name} size={56} />}
            </div>
            <div className="cap">Sheet and DM screen</div>
          </div>
          <div className="cv-pic">
            <div className="im">
              {pc.figure_url ? <img src={pc.figure_url} alt="Your board mini" /> : <Monogram name={pc.character_name} size={56} />}
            </div>
            <div className="cap">Mini on the table</div>
          </div>
        </div>
        {model && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 10, minHeight: 44 }}
            disabled={cardState === "busy"}
            onClick={() => void makeLegendCard()}
            title="Makes a story-sized card of your character to post"
          >
            {cardState === "shared" || cardState === "downloaded" ? <Check size={16} /> : <Share2 size={16} />}
            {cardState === "busy"
              ? "Making your card…"
              : cardState === "shared"
                ? "Shared"
                : cardState === "downloaded"
                  ? "Saved. Post it!"
                  : cardState === "failed"
                    ? "Couldn't make the card. Try again"
                    : "Share a legend card"}
          </button>
        )}
        </>)}

        <h2 className="cv-h2">How your character looks</h2>
        <p className="cv-help">Hair, eyes, build, scars, bearing: who your character is, in a few words.</p>
        <textarea
          aria-label="How your character looks"
          rows={4}
          placeholder="e.g. Silver braided hair, a scar through one eyebrow, a weathered green cloak"
          value={draft ?? ""}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1500}
          style={{ resize: "vertical", lineHeight: 1.45 }}
        />
        <div className="cv-chips" aria-label="Add a detail">
          {["battle-scarred", "silver braided hair", "glowing runic tattoos", "weathered cloak", "regal bearing", "mismatched eyes", "soot-streaked", "hung with charms"].map((c) => (
            <button
              type="button"
              key={c}
              className="cv-chip"
              onClick={() => setDraft((d) => ((d ?? "").trim() ? `${(d ?? "").trim()}, ${c}` : c))}
            >
              + {c}
            </button>
          ))}
        </div>
        <div className="cv-row">
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 44 }}
            disabled={appearanceMut.isPending || draft === null}
            onClick={() => draft !== null && appearanceMut.mutate(draft)}
          >
            {saved ? <><Check size={16} /> Saved</> : "Save description"}
          </button>
          {AI_ON && (
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => dressMut.mutate()}>
              {dressMut.isPending ? "Dressing…" : "Gear only"}
            </button>
          )}
          {!pc.hero_locked && AI_ON && (
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={busy} onClick={() => forgeMut.mutate()}>
              {forgeMut.isPending ? "Repainting…" : "New base look"}
            </button>
          )}
          {pc.hero_url && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 44 }}
              disabled={lockMut.isPending}
              title={
                pc.hero_locked
                  ? "Unlock to allow a new base look"
                  : "Pin this base — gear and portraits keep deriving from it, and it can't be re-rolled"
              }
              onClick={() => lockMut.mutate(!pc.hero_locked)}
            >
              {pc.hero_locked ? <><Lock size={16} /> Base look locked</> : <><Pin size={16} /> Lock this look</>}
            </button>
          )}
        </div>
        {AI_ON && (
          <p className="cv-note" style={{ marginTop: 8 }}>
            {pc.hero_locked
              ? "Your base look is pinned: gear and portraits build on it, and it can't be accidentally re-rolled."
              : "New base look rebuilds the character from your description (then re-render your gear)."}
          </p>
        )}

        <nav aria-label="Back" style={{ marginTop: 28 }}>{backLink}</nav>
      </div>
    </div>
  );
}
