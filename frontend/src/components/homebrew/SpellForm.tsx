import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { spellsApi } from "../../api/spells";
import type { Spell, SpellInput } from "../../api/types";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useIsCompact } from "../../hooks/useIsCompact";
import { DICE_RE } from "../../lib/homebrew";
import PhoneSheet from "../PhoneSheet";

/**
 * SpellForm (Plan 132) — a DM's homebrew spell: make one, copy one, or change their own.
 *
 * Every `SpellCreate` field, in the order a spell block reads. Checks mirror the server's
 * (required texts, lengths, dice like 1d8 or 2d6+3) so a save fails only on what the
 * server alone knows: a name the DM can already see, or a lost connection. A bottom sheet
 * on a phone, a centred dialog on a laptop. Homebrew has no edition (Plan 131), so it shows
 * under both 2014 and 2024; the form says so.
 */

export type SpellFormMode = "new" | "copy" | "edit";

export const SPELL_SCHOOLS = [
  "Abjuration",
  "Conjuration",
  "Divination",
  "Enchantment",
  "Evocation",
  "Illusion",
  "Necromancy",
  "Transmutation",
] as const;

/** The 12 SRD classes, for "who can learn it". */
export const SRD_CLASSES = [
  "Barbarian",
  "Bard",
  "Cleric",
  "Druid",
  "Fighter",
  "Monk",
  "Paladin",
  "Ranger",
  "Rogue",
  "Sorcerer",
  "Warlock",
  "Wizard",
] as const;

const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

const ABILITIES = [
  ["STR", "Strength"],
  ["DEX", "Dexterity"],
  ["CON", "Constitution"],
  ["INT", "Intelligence"],
  ["WIS", "Wisdom"],
  ["CHA", "Charisma"],
] as const;

// Suggestions only: any wording is fine (the SRD itself mixes "Action" and "1 action").
const CASTING_TIMES = ["Action", "Bonus Action", "Reaction", "1 minute", "10 minutes", "1 hour"];
const RANGES = ["Self", "Touch", "30 feet", "60 feet", "90 feet", "120 feet", "150 feet", "Sight"];
const DURATIONS = [
  "Instantaneous",
  "1 round",
  "1 minute",
  "10 minutes",
  "1 hour",
  "8 hours",
  "24 hours",
  "Concentration, up to 1 minute",
  "Concentration, up to 10 minutes",
  "Concentration, up to 1 hour",
  "Until dispelled",
];

// The server's limits (domain/spell.py SpellCreate).
const MAX = { name: 120, school: 40, casting_time: 400, range: 120, duration: 120, material: 600, dice: 40 };

interface Draft {
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  v: boolean;
  s: boolean;
  m: boolean;
  material: string;
  duration: string;
  ritual: boolean;
  concentration: boolean;
  description: string;
  higher: string;
  dice: string;
  damageType: string;
  save: string;
  attack: string;
  classes: string[];
}

type Field = keyof Draft;
type Problems = Partial<Record<Field, string>>;

const BLANK: Draft = {
  name: "",
  level: 1,
  school: "Evocation",
  casting_time: "Action",
  range: "",
  v: true,
  s: true,
  m: false,
  material: "",
  duration: "Instantaneous",
  ritual: false,
  concentration: false,
  description: "",
  higher: "",
  dice: "",
  damageType: "",
  save: "",
  attack: "",
  classes: [],
};

function fromSpell(s: Spell, mode: SpellFormMode): Draft {
  const copyName = s.created_by_email ? `${s.name} (copy)` : `${s.name} (homebrew)`;
  return {
    name: mode === "copy" ? copyName.slice(0, MAX.name) : s.name,
    level: s.level,
    school: s.school,
    casting_time: s.casting_time,
    range: s.range,
    v: s.components_v,
    s: s.components_s,
    m: !!s.components_m,
    material: s.components_m ?? "",
    duration: s.duration,
    ritual: s.is_ritual,
    concentration: s.is_concentration,
    description: s.description,
    higher: s.higher_levels ?? "",
    dice: s.damage_dice ?? "",
    damageType: s.damage_type ?? "",
    save: (s.save_ability ?? "").toUpperCase(),
    attack: (s.attack_type ?? "").toLowerCase(),
    classes: s.classes.filter((c) => (SRD_CLASSES as readonly string[]).includes(c)),
  };
}

function check(d: Draft): Problems {
  const p: Problems = {};
  const need = (f: Field, value: string, label: string, max?: number) => {
    if (!value.trim()) p[f] = `${label} is needed.`;
    else if (max && value.trim().length > max) p[f] = `${label} is too long (${max} characters at most).`;
  };
  need("name", d.name, "A name", MAX.name);
  need("school", d.school, "A school", MAX.school);
  need("casting_time", d.casting_time, "Casting time", MAX.casting_time);
  need("range", d.range, "Range", MAX.range);
  need("duration", d.duration, "Duration", MAX.duration);
  need("description", d.description, "What the spell does");
  if (d.m && !d.material.trim()) p.material = "Say what the material is, or untick Material.";
  else if (d.material.trim().length > MAX.material) p.material = `Too long (${MAX.material} characters at most).`;
  // Forgiving: "4 d8 + 2" is fine (spaces go when it's saved).
  if (d.dice.trim() && !DICE_RE.test(d.dice.replace(/\s+/g, ""))) p.dice = "Dice like 1d8, 3d6 or 2d6+3.";
  return p;
}

function toInput(d: Draft): SpellInput {
  const orNull = (v: string) => v.trim() || null;
  return {
    name: d.name.trim(),
    level: d.level,
    school: d.school.trim(),
    casting_time: d.casting_time.trim(),
    range: d.range.trim(),
    components_v: d.v,
    components_s: d.s,
    components_m: d.m ? d.material.trim() : null,
    duration: d.duration.trim(),
    is_ritual: d.ritual,
    is_concentration: d.concentration,
    description: d.description.trim(),
    higher_levels: orNull(d.higher),
    damage_dice: d.dice.trim() ? d.dice.replace(/\s+/g, "").toLowerCase() : null,
    damage_type: orNull(d.damageType),
    save_ability: orNull(d.save),
    attack_type: orNull(d.attack),
    classes: SRD_CLASSES.filter((c) => d.classes.includes(c)),
  };
}

/** "Bards", "Bards and Clerics", "Bards, Clerics and Wizards". */
function andList(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const TITLES: Record<SpellFormMode, string> = {
  new: "New spell",
  copy: "Copy and edit",
  edit: "Edit spell",
};

export default function SpellForm({
  mode,
  from,
  onClose,
  onSaved,
}: {
  mode: SpellFormMode;
  /** The spell to copy or edit; null for a blank form. */
  from: Spell | null;
  onClose: () => void;
  onSaved: (spell: Spell) => void;
}) {
  const phone = useIsCompact(640);
  const [draft, setDraft] = useState<Draft>(() => (from ? fromSpell(from, mode) : BLANK));
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;

  const problems = check(draft);
  const shown: Problems = tried ? problems : {};
  const problemCount = Object.keys(problems).length;

  function set<K extends Field>(field: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [field]: value }));
    setServerError(null);
  }

  function toggleClass(c: string) {
    setDraft((d) => ({
      ...d,
      classes: d.classes.includes(c) ? d.classes.filter((x) => x !== c) : [...d.classes, c],
    }));
  }

  async function save() {
    setTried(true);
    if (problemCount > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      const body = toInput(draft);
      const saved =
        mode === "edit" && from
          ? await spellsApi.update(from.id, body)
          : await spellsApi.create({ ...body, source: "Homebrew" });
      onSaved(saved);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't save the spell. Try again.");
      setSaving(false);
    }
  }

  const hint: React.CSSProperties = { margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--muted)" };
  const err: React.CSSProperties = { margin: "0.25rem 0 0", fontSize: "0.8125rem", color: "var(--danger-text)" };
  const row: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: phone ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "0 0.75rem",
  };
  const checkRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    minHeight: phone ? 44 : 34,
    margin: 0,
    cursor: "pointer",
    fontSize: "0.9375rem",
    color: "var(--text)",
  };
  const section: React.CSSProperties = {
    fontFamily: "var(--font-ui)",
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--text2)",
    margin: "1.25rem 0 0.5rem",
    paddingBottom: "0.3rem",
    borderBottom: "1px solid var(--border)",
  };

  /** A text field with its label, suggestions, and its problem once Save was tried. */
  const text = (
    f: "name" | "casting_time" | "range" | "duration",
    label: string,
    opts: { list?: string[]; autoFocus?: boolean } = {},
  ) => (
    <div className="form-group">
      <label htmlFor={id(f)}>{label}</label>
      <input
        id={id(f)}
        value={draft[f]}
        onChange={(e) => set(f, e.target.value)}
        list={opts.list ? id(`${f}-list`) : undefined}
        maxLength={MAX[f]}
        aria-invalid={!!shown[f]}
        aria-describedby={shown[f] ? id(`${f}-err`) : undefined}
        data-autofocus={opts.autoFocus || undefined}
      />
      {opts.list && (
        <datalist id={id(`${f}-list`)}>
          {opts.list.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
      {shown[f] && (
        <p id={id(`${f}-err`)} style={err}>
          {shown[f]}
        </p>
      )}
    </div>
  );

  const body = (
    <form
      className={phone ? "ql-tap" : undefined}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p style={{ ...hint, marginTop: 0, marginBottom: "0.75rem" }}>
        Your homebrew works with both rules editions, so it shows under 2014 and 2024. Only you see it.
      </p>

      <h3 style={{ ...section, marginTop: 0 }}>The basics</h3>
      {text("name", "Name", { autoFocus: !phone })}
      <div style={row}>
        <div className="form-group">
          <label htmlFor={id("level")}>Level</label>
          <select id={id("level")} value={draft.level} onChange={(e) => set("level", Number(e.target.value))}>
            <option value={0}>Cantrip</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((l) => (
              <option key={l} value={l}>
                Level {l}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={id("school")}>School of magic</label>
          <select id={id("school")} value={draft.school} onChange={(e) => set("school", e.target.value)}>
            {!(SPELL_SCHOOLS as readonly string[]).includes(draft.school) && draft.school && (
              <option value={draft.school}>{draft.school}</option>
            )}
            {SPELL_SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3 style={section}>Casting</h3>
      <div style={row}>
        {text("casting_time", "Casting time", { list: CASTING_TIMES })}
        {text("range", "Range", { list: RANGES })}
      </div>
      {text("duration", "Duration", { list: DURATIONS })}

      <fieldset style={{ border: "none", padding: 0, margin: "0 0 0.5rem" }}>
        <legend style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", marginBottom: "0.1rem" }}>
          Components
        </legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0 1.25rem" }}>
          <label style={checkRow}>
            <input type="checkbox" checked={draft.v} onChange={(e) => set("v", e.target.checked)} />
            Verbal (V)
          </label>
          <label style={checkRow}>
            <input type="checkbox" checked={draft.s} onChange={(e) => set("s", e.target.checked)} />
            Somatic (S)
          </label>
          <label style={checkRow}>
            <input type="checkbox" checked={draft.m} onChange={(e) => set("m", e.target.checked)} />
            Material (M)
          </label>
        </div>
      </fieldset>
      {draft.m && (
        <div className="form-group">
          <label htmlFor={id("material")}>The material</label>
          <input
            id={id("material")}
            value={draft.material}
            onChange={(e) => set("material", e.target.value)}
            maxLength={MAX.material}
            aria-invalid={!!shown.material}
          />
          {shown.material && <p style={err}>{shown.material}</p>}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", marginBottom: "0.5rem" }}>
        <label style={checkRow}>
          <input type="checkbox" checked={draft.concentration} onChange={(e) => set("concentration", e.target.checked)} />
          <span>
            Concentration{" "}
            <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>· ends if the caster loses focus</span>
          </span>
        </label>
        <label style={checkRow}>
          <input type="checkbox" checked={draft.ritual} onChange={(e) => set("ritual", e.target.checked)} />
          <span>
            Ritual{" "}
            <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>· can be cast without a slot, 10 minutes slower</span>
          </span>
        </label>
      </div>

      <h3 style={section}>What it does</h3>
      <div className="form-group">
        <label htmlFor={id("description")}>Description</label>
        <textarea
          id={id("description")}
          rows={phone ? 6 : 7}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
          aria-invalid={!!shown.description}
          style={{ resize: "vertical", lineHeight: 1.5 }}
        />
        {shown.description && <p style={err}>{shown.description}</p>}
      </div>
      <div className="form-group">
        <label htmlFor={id("higher")}>
          {draft.level === 0 ? "As the caster gains levels" : "With a higher-level slot"}{" "}
          <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
        </label>
        <textarea
          id={id("higher")}
          rows={3}
          value={draft.higher}
          onChange={(e) => set("higher", e.target.value)}
          style={{ resize: "vertical", lineHeight: 1.5 }}
        />
      </div>

      <h3 style={section}>Rolls (optional)</h3>
      <p style={{ ...hint, marginTop: 0, marginBottom: "0.75rem" }}>
        Fill these in and a player&apos;s phone can roll the attack and damage, or call for the saving throw.
      </p>
      <div style={row}>
        <div className="form-group">
          <label htmlFor={id("dice")}>Damage dice</label>
          <input
            id={id("dice")}
            value={draft.dice}
            onChange={(e) => set("dice", e.target.value)}
            placeholder="2d6+3"
            maxLength={MAX.dice}
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={!!shown.dice}
          />
          {shown.dice && <p style={err}>{shown.dice}</p>}
        </div>
        <div className="form-group">
          <label htmlFor={id("damageType")}>Damage type</label>
          <select id={id("damageType")} value={draft.damageType} onChange={(e) => set("damageType", e.target.value)}>
            <option value="">None</option>
            {!(DAMAGE_TYPES as readonly string[]).includes(draft.damageType) && draft.damageType && (
              <option value={draft.damageType}>{draft.damageType}</option>
            )}
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={id("attack")}>Spell attack</label>
          <select id={id("attack")} value={draft.attack} onChange={(e) => set("attack", e.target.value)}>
            <option value="">No attack roll</option>
            <option value="ranged">Ranged spell attack</option>
            <option value="melee">Melee spell attack</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={id("save")}>Saving throw</label>
          <select id={id("save")} value={draft.save} onChange={(e) => set("save", e.target.value)}>
            <option value="">No saving throw</option>
            {ABILITIES.map(([code, word]) => (
              <option key={code} value={code}>
                {word}
              </option>
            ))}
          </select>
        </div>
      </div>

      <h3 style={section}>Who can learn it</h3>
      <div role="group" aria-label="Classes" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {SRD_CLASSES.map((c) => {
          const on = draft.classes.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggleClass(c)}
              className={on ? "btn btn-secondary" : "btn btn-ghost"}
              style={{
                minHeight: phone ? 44 : 36,
                padding: "0.35rem 0.8rem",
                border: `1px solid ${on ? "var(--accent-line)" : "var(--border2)"}`,
                background: on ? "var(--accent-soft)" : "transparent",
                color: on ? "var(--accent-text)" : "var(--text2)",
                fontWeight: on ? 600 : 400,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>
      <p style={hint}>
        {draft.classes.length === 0
          ? "Spell pickers offer it only to the classes you pick. With none picked, no character can learn it."
          : `${andList(SRD_CLASSES.filter((c) => draft.classes.includes(c)).map((c) => `${c}s`))} can learn it.`}
      </p>

      {/* Save */}
      <div style={{ marginTop: "1.25rem" }}>
        {tried && problemCount > 0 && (
          <p role="alert" style={{ ...err, margin: "0 0 0.6rem" }}>
            {problemCount === 1 ? "One thing to fix above." : `${problemCount} things to fix above.`}
          </p>
        )}
        {serverError && (
          <p role="alert" style={{ ...err, margin: "0 0 0.6rem" }}>
            {serverError}
            {/* A name clash (409) is fixed at the top of the form: one tap back to it. */}
            {/own name/i.test(serverError) && (
              <>
                {" "}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => document.getElementById(id("name"))?.focus()}
                  style={{ minHeight: phone ? 44 : undefined, padding: "0.2rem 0.5rem", fontSize: "0.875rem" }}
                >
                  Change the name
                </button>
              </>
            )}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ minHeight: 44, flex: phone ? 1 : undefined }}>
            {saving ? "Saving…" : mode === "edit" ? "Save changes" : "Save spell"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose} style={{ minHeight: 44 }}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );

  if (phone) {
    return (
      <PhoneSheet title={TITLES[mode]} onClose={onClose}>
        {body}
      </PhoneSheet>
    );
  }
  return (
    <FormDialog title={TITLES[mode]} onClose={onClose}>
      {body}
    </FormDialog>
  );
}

/** The laptop version: a centred dialog with the same focus rules as a sheet. */
function FormDialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(boxRef, { onEscape: onClose });
  return createPortal(
    <>
      <div className="ql-sheet-backdrop" onClick={onClose} />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ql-quiet-focus"
        style={{
          position: "fixed",
          zIndex: 9001,
          inset: 0,
          margin: "auto",
          width: "min(680px, calc(100vw - 2rem))",
          height: "fit-content",
          maxHeight: "calc(100dvh - 2rem)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          padding: "1rem 1.25rem 1.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2
            id={titleId}
            data-dialog-title
            tabIndex={-1}
            className="story ql-quiet-focus"
            style={{ margin: 0, fontSize: "1.35rem", flex: 1 }}
          >
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Close"
            onClick={onClose}
            style={{ minWidth: 36, minHeight: 36, padding: 0, justifyContent: "center" }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
