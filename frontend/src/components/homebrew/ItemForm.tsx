import { useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { itemsApi } from "../../api/items";
import type { ItemWrite, MagicItem } from "../../api/items";
import { useIsCompact } from "../../hooks/useIsCompact";
import { DICE_RE } from "../../lib/homebrew";

/**
 * ItemForm (Plan 132): a DM's own magic item, magic weapon or plain weapon.
 *
 * - "new" starts blank; "copy" prefills from any catalog row and saves a NEW
 *   homebrew row (the original never changes); "edit" changes the DM's own row.
 * - Weapons: "Based on" an SRD weapon fills in the damage, properties and range.
 *   A magic weapon's +1/+2/+3 is saved as `properties.bonus` ("+1", the PHB
 *   seed's form), which the attack preview adds to the hit and damage rolls.
 * - The limits mirror the server's ItemCreate: name 1–200, type up to 100,
 *   description up to 10,000, damage like 1d8 or 2d6+1 (or a flat number).
 *
 * The page supplies the frame: a card on desktop, a PhoneSheet on a phone.
 */
export type ItemFormMode =
  | { kind: "new" }
  | { kind: "copy"; from: MagicItem }
  | { kind: "edit"; item: MagicItem };

const TYPES: { label: string; value: string }[] = [
  { label: "Weapon", value: "Weapon" },
  { label: "Armor", value: "Armor" },
  { label: "Wondrous item", value: "Wondrous Item" },
  { label: "Potion", value: "Potion" },
  { label: "Ring", value: "Ring" },
  { label: "Rod", value: "Rod" },
  { label: "Staff", value: "Staff" },
  { label: "Wand", value: "Wand" },
  { label: "Scroll", value: "Scroll" },
  { label: "Other", value: "Other" },
];

const RARITIES: [string, string][] = [
  ["Common", "Common"],
  ["Uncommon", "Uncommon"],
  ["Rare", "Rare"],
  ["VeryRare", "Very rare"],
  ["Legendary", "Legendary"],
  ["Artifact", "Artifact"],
];

const CATEGORIES = ["Simple Melee", "Simple Ranged", "Martial Melee", "Martial Ranged"];

const DAMAGE_TYPES = [
  "slashing",
  "piercing",
  "bludgeoning",
  "acid",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "poison",
  "psychic",
  "radiant",
  "thunder",
];

const WEAPON_PROPS = [
  "Ammunition",
  "Finesse",
  "Heavy",
  "Light",
  "Loading",
  "Reach",
  "Thrown",
  "Two-Handed",
  "Versatile",
];

const PROP_HINTS: Record<string, string> = {
  Ammunition: "Needs arrows, bolts or the like; has a range",
  Finesse: "Uses Strength or Dexterity, whichever is better",
  Heavy: "Small creatures fight clumsily with it",
  Light: "Good for fighting with a weapon in each hand",
  Loading: "One shot per action, whatever extra attacks you have",
  Reach: "Hits from 10 feet away instead of 5",
  Thrown: "Can be thrown; has a range",
  "Two-Handed": "Needs both hands",
  Versatile: "Bigger damage die in two hands",
};

const FLAT_RE = /^\s*\d{1,3}\s*$/;

interface Draft {
  name: string;
  type: string;
  /** The type's own words when `type` is "Other" ("Adventuring Gear"). */
  otherType: string;
  /** The "(…)" part of a catalog type, kept on copy and edit: "plate", "any sword", "longsword". */
  typeDetail: string;
  rarity: string;
  attunement: boolean;
  value: string;
  magic: boolean;
  description: string;
  /** The SRD weapon picked under "Based on" (its id), when picked in this form. */
  baseId: string;
  category: string;
  damageDie: string;
  damageType: string;
  props: string[];
  versatile: string;
  range: string;
  mastery: string | null;
  bonus: number;
  /** Every other `properties` key, carried through untouched ("charges", "damage_bonus"…). */
  extra: Record<string, unknown>;
}

type Errors = Partial<Record<keyof Draft | "form", string>>;

function splitType(itemType: string): { head: string; detail: string } {
  const m = /^([^()]*?)\s*\((.*)\)\s*$/.exec(itemType);
  return m ? { head: m[1].trim(), detail: m[2].trim() } : { head: itemType.trim(), detail: "" };
}

function readBonus(raw: unknown): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0;
}

function toDraft(mode: ItemFormMode): Draft {
  const src = mode.kind === "edit" ? mode.item : mode.kind === "copy" ? mode.from : null;
  if (!src) {
    return {
      name: "",
      type: "Wondrous Item",
      otherType: "",
      typeDetail: "",
      rarity: "Uncommon",
      attunement: false,
      value: "0",
      magic: true,
      description: "",
      baseId: "",
      category: "",
      damageDie: "",
      damageType: "slashing",
      props: [],
      versatile: "",
      range: "",
      mastery: null,
      bonus: 0,
      extra: {},
    };
  }
  const { head, detail } = splitType(src.item_type);
  const known = TYPES.find((t) => t.value !== "Other" && t.value.toLowerCase() === head.toLowerCase());
  const extra: Record<string, unknown> = { ...(src.properties ?? {}) };
  // A copy is the DM's own; the book it came from no longer describes it.
  if (mode.kind === "copy") delete extra.source;
  return {
    name: mode.kind === "copy" ? `${src.name} (copy)` : src.name,
    type: known ? known.value : "Other",
    otherType: known ? "" : src.item_type,
    typeDetail: known ? detail : "",
    rarity: src.rarity,
    attunement: src.attunement_required,
    value: String(src.value_gp ?? 0),
    magic: src.is_magic,
    description: src.description ?? "",
    baseId: "",
    category: src.weapon_category ?? "",
    damageDie: src.damage_die ?? "",
    damageType: src.damage_type ?? "slashing",
    props: src.weapon_properties ?? [],
    versatile: src.versatile_damage ?? "",
    range: src.weapon_range ?? "",
    mastery: src.mastery,
    bonus: readBonus(extra.bonus),
    extra,
  };
}

function hasRange(d: Draft): boolean {
  return d.category.includes("Ranged") || d.props.includes("Thrown") || d.props.includes("Ammunition");
}

function damageOk(v: string): boolean {
  return DICE_RE.test(v) || FLAT_RE.test(v);
}

function validate(d: Draft): Errors {
  const e: Errors = {};
  const name = d.name.trim();
  if (!name) e.name = "Give it a name.";
  else if (name.length > 200) e.name = "Keep the name to 200 characters.";
  if (d.type === "Other" && d.otherType.trim().length > 100) e.otherType = "Keep this to 100 characters.";
  if (d.description.length > 10000) e.description = "Keep the description to 10,000 characters.";
  if (!/^\d{1,7}$/.test(d.value.trim() || "0")) e.value = "A whole number of gold pieces, 0 or more.";
  if (d.type === "Weapon") {
    if (!d.category) e.category = "Pick a base weapon above, or choose a category.";
    if (!d.damageDie.trim()) e.damageDie = "Pick a base weapon above, or enter its damage, like 1d8.";
    else if (!damageOk(d.damageDie)) e.damageDie = "Dice like 1d8 or 2d6+1, or a flat number.";
    if (d.props.includes("Versatile")) {
      if (!d.versatile.trim()) e.versatile = "Versatile needs a two-handed damage die, like 1d10.";
      else if (!damageOk(d.versatile)) e.versatile = "Dice like 1d10, or a flat number.";
    }
    if (hasRange(d) && d.range.trim().length > 40) e.range = "Keep the range short, like 20/60.";
  }
  return e;
}

function toPayload(d: Draft): ItemWrite {
  const weapon = d.type === "Weapon";
  const itemType =
    d.type === "Other" ? d.otherType.trim() || "Other" : d.typeDetail ? `${d.type} (${d.typeDetail})` : d.type;
  const properties: Record<string, unknown> = { ...d.extra };
  if (weapon) {
    if (d.magic && d.bonus > 0) properties.bonus = `+${d.bonus}`;
    else delete properties.bonus;
  }
  return {
    name: d.name.trim(),
    rarity: d.rarity,
    item_type: itemType,
    description: d.description.trim() || null,
    attunement_required: d.attunement,
    value_gp: parseInt(d.value.trim() || "0", 10),
    is_magic: d.magic,
    properties: Object.keys(properties).length ? properties : null,
    weapon_category: weapon ? d.category || null : null,
    damage_die: weapon ? d.damageDie.trim() || null : null,
    damage_type: weapon ? d.damageType || null : null,
    weapon_properties: weapon ? d.props : null,
    versatile_damage: weapon && d.props.includes("Versatile") ? d.versatile.trim() || null : null,
    weapon_range: weapon && hasRange(d) ? d.range.trim() || null : null,
    mastery: weapon ? d.mastery : null,
  };
}

const SECTION: React.CSSProperties = {
  fontSize: "0.8125rem",
  fontWeight: 600,
  color: "var(--text2)",
  margin: "1.25rem 0 0.6rem",
  paddingBottom: "0.3rem",
  borderBottom: "1px solid var(--border)",
};

const ERR: React.CSSProperties = { color: "var(--danger-text)", fontSize: "0.8125rem", margin: "0.3rem 0 0" };
const HINT: React.CSSProperties = { color: "var(--muted)", fontSize: "0.8125rem", margin: "0.3rem 0 0" };

export default function ItemForm({
  mode,
  onSaved,
  onCancel,
}: {
  mode: ItemFormMode;
  onSaved: (item: MagicItem) => void;
  onCancel: () => void;
}) {
  const phone = useIsCompact(640);
  const uid = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(mode));
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const isWeapon = draft.type === "Weapon";

  // The SRD weapons a homebrew weapon can be based on (the shared catalog only).
  const { data: bases = [] } = useQuery({
    queryKey: ["weapons", "srd-bases"],
    queryFn: () => itemsApi.listWeapons({ is_magic: false }),
    enabled: isWeapon,
    staleTime: 5 * 60_000,
    select: (rows: MagicItem[]) => rows.filter((w) => !w.created_by_email),
  });
  // On copy and edit the base reads back from the type ("Weapon (longsword)").
  const baseId =
    draft.baseId || bases.find((w) => w.name.toLowerCase() === draft.typeDetail.toLowerCase())?.id || "";

  const save = useMutation({
    mutationFn: (payload: ItemWrite) =>
      mode.kind === "edit" ? itemsApi.update(mode.item.id, payload) : itemsApi.create(payload),
    onSuccess: (item) => onSaved(item),
    onError: (e: Error) => setServerError(e.message),
  });

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
    // A refusal from the server (a taken name…) is stale once the DM changes something.
    if (serverError) setServerError(null);
  }

  function setType(type: string) {
    // The "(…)" detail belongs to the old type ("plate" means nothing on a ring).
    setDraft((d) => ({ ...d, type, typeDetail: "", baseId: "" }));
  }

  function pickBase(id: string) {
    const w = bases.find((b) => b.id === id);
    if (!w) {
      setDraft((d) => ({ ...d, baseId: "", typeDetail: "" }));
      return;
    }
    setDraft((d) => ({
      ...d,
      baseId: w.id,
      typeDetail: w.name.toLowerCase(),
      category: w.weapon_category ?? "",
      damageDie: w.damage_die ?? "",
      damageType: w.damage_type ?? "slashing",
      props: w.weapon_properties ?? [],
      versatile: w.versatile_damage ?? "",
      range: w.weapon_range ?? "",
      mastery: w.mastery,
    }));
    setErrors((e) => ({ ...e, category: undefined, damageDie: undefined, versatile: undefined }));
  }

  function toggleProp(p: string) {
    set("props", draft.props.includes(p) ? draft.props.filter((x) => x !== p) : [...draft.props, p]);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length) return;
    save.mutate(toPayload(draft));
  }

  const id = (k: string) => `${uid}-${k}`;
  const twoCol: React.CSSProperties = phone
    ? {}
    : { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0 0.9rem" };
  const tap: React.CSSProperties = phone ? { minHeight: 44 } : {};
  const check: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    margin: 0,
    cursor: "pointer",
    color: "var(--text)",
    fontSize: "0.9375rem",
    ...(phone ? { minHeight: 44 } : { minHeight: 32 }),
  };
  const errCount = Object.values(errors).filter(Boolean).length;

  return (
    <form onSubmit={submit} noValidate>
      <div className="form-group">
        <label htmlFor={id("name")}>Name</label>
        <input
          id={id("name")}
          value={draft.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={200}
          placeholder="Moonblade"
          aria-invalid={!!errors.name}
          style={tap}
          data-autofocus
        />
        {errors.name && <p style={ERR}>{errors.name}</p>}
      </div>

      <div style={twoCol}>
        <div className="form-group">
          <label htmlFor={id("type")}>Type</label>
          <select id={id("type")} value={draft.type} onChange={(e) => setType(e.target.value)} style={tap}>
            {TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={id("rarity")}>Rarity</label>
          <select id={id("rarity")} value={draft.rarity} onChange={(e) => set("rarity", e.target.value)} style={tap}>
            {RARITIES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {draft.type === "Other" && (
        <div className="form-group">
          <label htmlFor={id("other")}>What kind of thing is it?</label>
          <input
            id={id("other")}
            value={draft.otherType}
            onChange={(e) => set("otherType", e.target.value)}
            maxLength={100}
            placeholder="Adventuring gear, a key, a map…"
            style={tap}
          />
          {errors.otherType && <p style={ERR}>{errors.otherType}</p>}
        </div>
      )}

      <div style={twoCol}>
        <div className="form-group">
          <label htmlFor={id("value")}>Value in gold pieces</label>
          <input
            id={id("value")}
            inputMode="numeric"
            value={draft.value}
            onChange={(e) => set("value", e.target.value)}
            aria-invalid={!!errors.value}
            style={tap}
          />
          {errors.value && <p style={ERR}>{errors.value}</p>}
        </div>
        <div className="form-group" style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <label style={check}>
            <input type="checkbox" checked={draft.magic} onChange={(e) => set("magic", e.target.checked)} />
            Magic item
          </label>
          <label style={check}>
            <input
              type="checkbox"
              checked={draft.attunement}
              onChange={(e) => set("attunement", e.target.checked)}
            />
            Needs attunement
          </label>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={id("desc")}>What it does</label>
        <textarea
          id={id("desc")}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          rows={phone ? 5 : 6}
          maxLength={10000}
          placeholder="In your own words: what it looks like and what it does at the table."
          style={{ resize: "vertical" }}
        />
        {errors.description && <p style={ERR}>{errors.description}</p>}
      </div>

      {isWeapon && (
        <>
          <h3 style={SECTION}>Weapon</h3>
          <div className="form-group">
            <label htmlFor={id("base")}>Based on</label>
            <select id={id("base")} value={baseId} onChange={(e) => pickBase(e.target.value)} style={tap}>
              <option value="">None: I'll fill it in</option>
              {bases.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p style={HINT}>Fills in the damage, properties and range from the rules weapon.</p>
          </div>

          {draft.magic && (
            <div className="form-group">
              <span id={id("bonus")} style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", marginBottom: "0.3rem" }}>
                Magic bonus
              </span>
              <div role="group" aria-labelledby={id("bonus")} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={draft.bonus === n}
                    className={`btn ${draft.bonus === n ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => set("bonus", n)}
                    style={{ minWidth: 56, ...tap }}
                  >
                    {n === 0 ? "None" : `+${n}`}
                  </button>
                ))}
              </div>
              <p style={HINT}>Added to attack and damage rolls with it.</p>
            </div>
          )}

          <div style={twoCol}>
            <div className="form-group">
              <label htmlFor={id("die")}>Damage</label>
              <input
                id={id("die")}
                value={draft.damageDie}
                onChange={(e) => set("damageDie", e.target.value)}
                maxLength={20}
                placeholder="1d8"
                aria-invalid={!!errors.damageDie}
                style={tap}
              />
              {errors.damageDie ? (
                <p style={ERR}>{errors.damageDie}</p>
              ) : (
                <p style={HINT}>Its own dice; the wielder's modifier is added at the table.</p>
              )}
            </div>
            <div className="form-group">
              <label htmlFor={id("dtype")}>Damage type</label>
              <select id={id("dtype")} value={draft.damageType} onChange={(e) => set("damageType", e.target.value)} style={tap}>
                {DAMAGE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor={id("cat")}>Category</label>
            <select
              id={id("cat")}
              value={draft.category}
              onChange={(e) => set("category", e.target.value)}
              aria-invalid={!!errors.category}
              style={tap}
            >
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category && <p style={ERR}>{errors.category}</p>}
          </div>

          <fieldset className="form-group" style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
            <legend style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", marginBottom: "0.3rem", padding: 0 }}>
              Properties
            </legend>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: phone ? "repeat(2, minmax(0, 1fr))" : "repeat(3, minmax(0, 1fr))",
                gap: "0 0.75rem",
              }}
            >
              {WEAPON_PROPS.map((p) => (
                <label key={p} style={check} title={PROP_HINTS[p]}>
                  <input type="checkbox" checked={draft.props.includes(p)} onChange={() => toggleProp(p)} />
                  {p}
                </label>
              ))}
            </div>
          </fieldset>

          <div style={twoCol}>
            {draft.props.includes("Versatile") && (
              <div className="form-group">
                <label htmlFor={id("vers")}>Damage in two hands</label>
                <input
                  id={id("vers")}
                  value={draft.versatile}
                  onChange={(e) => set("versatile", e.target.value)}
                  maxLength={20}
                  placeholder="1d10"
                  aria-invalid={!!errors.versatile}
                  style={tap}
                />
                {errors.versatile && <p style={ERR}>{errors.versatile}</p>}
              </div>
            )}
            {hasRange(draft) && (
              <div className="form-group">
                <label htmlFor={id("range")}>Range in feet (normal/long)</label>
                <input
                  id={id("range")}
                  value={draft.range}
                  onChange={(e) => set("range", e.target.value)}
                  maxLength={40}
                  placeholder="20/60"
                  style={tap}
                />
                {errors.range && <p style={ERR}>{errors.range}</p>}
              </div>
            )}
          </div>

          {draft.mastery && (
            <p style={{ ...HINT, marginTop: 0, marginBottom: "1rem" }}>
              Weapon mastery: <strong style={{ color: "var(--text2)" }}>{draft.mastery}</strong>, kept from the base
              weapon. It only applies in 2024 rules campaigns.
            </p>
          )}
        </>
      )}

      {serverError && (
        <p role="alert" style={{ ...ERR, fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
          {serverError}
        </p>
      )}
      {errCount > 0 && (
        <p role="alert" style={{ ...ERR, fontSize: "0.875rem", margin: "0 0 0.75rem" }}>
          {errCount === 1 ? "One field needs a fix" : `${errCount} fields need a fix`}: see the notes above.
        </p>
      )}

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={save.isPending}
          style={phone ? { flex: 1, minHeight: 44 } : undefined}
        >
          {save.isPending ? "Saving…" : mode.kind === "edit" ? "Save changes" : "Save item"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} style={phone ? { minHeight: 44 } : undefined}>
          Cancel
        </button>
      </div>
      {mode.kind !== "edit" && (
        <p style={{ ...HINT, marginTop: "0.6rem" }}>
          Only you see your homebrew. It works in both 2014 and 2024 rules campaigns.
        </p>
      )}
    </form>
  );
}
