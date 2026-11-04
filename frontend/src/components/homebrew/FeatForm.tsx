import { useId, useState } from "react";

import {
  homebrewApi,
  type AbilityCode,
  type FeatCategory,
  type HomebrewFeat,
  type HomebrewFeatInput,
  type PowerAttack,
} from "../../api/homebrew";
import { useIsCompact } from "../../hooks/useIsCompact";
import { EPIC_BOON_LEVEL, FEAT_KINDS, POWER_WEAPONS, powerAttackLine } from "../../lib/feats";
import FormFrame, { FormSection, SaveBar, ToggleChip } from "./FormFrame";
import type { HomebrewFormMode } from "./RaceForm";
import { ABILITY_LIST, ERR, HINT, RULES_PICKS, rulesOfPick, rulesPickOf, type RulesPick } from "./options";

/**
 * FeatForm (Plan 135) — a DM's homebrew feat: make one, copy one, or change their own.
 *
 * James (beta, a 2014 table) found the free 2014 rules have one feat, Grappler, and wanted to
 * write his own. A feat has a name, the rules it's for, a kind, one line for the builder's
 * card, the full text, a prerequisite (shown, never checked), an optional +1 to an ability,
 * whether it can be taken again, and an optional power attack (a penalty to hit for extra
 * damage, offered as a toggle on the sheet's attacks). The server checks the same limits
 * (domain/homebrew.py) and the name rules (a 409, shown above the save button).
 */

type Plus = "none" | "any" | "choose";

interface Draft {
  name: string;
  rules: RulesPick;
  kind: FeatCategory;
  blurb: string;
  description: string;
  prerequisite: string;
  plus: Plus;
  abilities: AbilityCode[];
  repeatable: boolean;
  power: boolean;
  toHit: number;
  damage: string;
  weapons: PowerAttack["weapons"];
}

type Problems = Record<string, string>;

const BLANK: Draft = {
  name: "",
  rules: "both",
  kind: "general",
  blurb: "",
  description: "",
  prerequisite: "",
  plus: "none",
  abilities: [],
  repeatable: false,
  power: false,
  toHit: -5,
  damage: "10",
  weapons: "ranged",
};

const TITLES: Record<HomebrewFormMode, string> = { new: "New feat", copy: "Copy and edit", edit: "Edit feat" };

const PENALTIES = Array.from({ length: 10 }, (_, i) => -(i + 1));

const KIND_HINTS: Record<FeatCategory, string> = {
  general: "Taken in place of an Ability Score Improvement (level 4, 8 and so on).",
  origin:
    "A small talent, like the 2024 Origin feats. Characters take it in place of an Ability Score Improvement; in 2014 games it works like any other feat.",
  fighting_style:
    "Offered where a Fighter, Paladin or Ranger picks a Fighting Style. In 2024 games a character with that feature can also take it in place of an Ability Score Improvement.",
  epic_boon: `Offered from level ${EPIC_BOON_LEVEL}, in place of that level's Ability Score Improvement.`,
};

const PLUS_PICKS: readonly (readonly [Plus, string])[] = [
  ["none", "None"],
  ["any", "Any ability"],
  ["choose", "Choose abilities"],
];

function fromFeat(f: HomebrewFeat, name: string): Draft {
  const list = Array.isArray(f.asi_options) ? f.asi_options : [];
  return {
    name,
    rules: rulesPickOf(f.ruleset),
    kind: f.category,
    blurb: f.blurb,
    description: f.description,
    prerequisite: f.prerequisite,
    plus: f.asi_options === "any" ? "any" : list.length ? "choose" : "none",
    abilities: list,
    repeatable: f.repeatable,
    power: !!f.power_attack,
    toHit: f.power_attack?.to_hit ?? -5,
    damage: String(f.power_attack?.damage ?? 10),
    weapons: f.power_attack?.weapons ?? "ranged",
  };
}

/** The extra damage as a whole number, or null when it isn't one. */
function damageOf(text: string): number | null {
  const t = text.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

function check(d: Draft): Problems {
  const p: Problems = {};
  const name = d.name.trim();
  if (!name) p.name = "A name is needed.";
  else if (name.length > 100) p.name = "Too long (100 characters at most).";
  // The sheet writes a feat with a pick as "Name (pick)", so brackets would read as one.
  else if (/[()]/.test(name)) p.name = "Leave out brackets: the sheet reads \"Name (something)\" as a feat with a choice.";
  if (d.blurb.trim().length > 300) p.blurb = "Too long (300 characters at most).";
  if (d.description.trim().length > 3000) p.description = "Too long (3000 characters at most).";
  if (d.prerequisite.trim().length > 200) p.prerequisite = "Too long (200 characters at most).";
  if (d.plus === "choose" && d.abilities.length === 0) p.plus = "Pick at least one ability, or choose None.";
  if (d.power) {
    const dmg = damageOf(d.damage);
    if (dmg === null || dmg < 1 || dmg > 20) p.damage = "Extra damage is a whole number from 1 to 20.";
  }
  return p;
}

function toInput(d: Draft): HomebrewFeatInput {
  const order = ABILITY_LIST.map(([code]) => code);
  return {
    name: d.name.trim(),
    ruleset: rulesOfPick(d.rules),
    category: d.kind,
    blurb: d.blurb.trim(),
    description: d.description.trim(),
    prerequisite: d.prerequisite.trim(),
    asi_options:
      d.plus === "none" ? null : d.plus === "any" ? "any" : order.filter((a) => d.abilities.includes(a)),
    repeatable: d.repeatable,
    power_attack: d.power ? { to_hit: d.toHit, damage: damageOf(d.damage) ?? 10, weapons: d.weapons } : null,
  };
}

export default function FeatForm({
  mode,
  from,
  onClose,
  onSaved,
}: {
  mode: HomebrewFormMode;
  /** The feat to copy or edit; null for a blank form. */
  from: HomebrewFeat | null;
  onClose: () => void;
  onSaved: (feat: HomebrewFeat) => void;
}) {
  const phone = useIsCompact(640);
  const [initial] = useState<Draft>(() =>
    from ? fromFeat(from, mode === "copy" ? `Copy of ${from.name}`.slice(0, 100) : from.name) : BLANK,
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;

  const problems = check(draft);
  const shown: Problems = tried ? problems : {};
  const problemCount = Object.keys(problems).length;
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
    setServerError(null);
  }

  function requestClose() {
    if (saving) return;
    if (!dirty || window.confirm("Close without saving? Your changes will be lost.")) onClose();
  }

  async function save() {
    setTried(true);
    if (problemCount > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      const body = toInput(draft);
      const saved = mode === "edit" && from ? await homebrewApi.updateFeat(from.id, body) : await homebrewApi.createFeat(body);
      onSaved(saved);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't save the feat. Try again.");
      setSaving(false);
    }
  }

  const legend: React.CSSProperties = {
    fontSize: "0.875rem",
    fontWeight: 500,
    color: "var(--text2)",
    padding: 0,
    marginBottom: "0.3rem",
  };
  const chips: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: "0.4rem" };
  const checkRow: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.55rem",
    margin: 0,
    cursor: "pointer",
    color: "var(--text)",
    fontSize: "0.9375rem",
    minHeight: phone ? 44 : 32,
  };
  const damage = damageOf(draft.damage);

  const body = (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p style={{ ...HINT, marginTop: 0 }}>
        Only you can change it. Characters in your campaigns can take it in place of an Ability Score Improvement, when
        they&rsquo;re made or when they level up.
      </p>

      <FormSection title="The basics">
        <div className="form-group">
          <label htmlFor={id("name")}>Name</label>
          <input
            id={id("name")}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            maxLength={100}
            placeholder="e.g. Deadeye"
            aria-invalid={!!shown.name}
            aria-describedby={shown.name ? undefined : id("name-hint")}
            data-autofocus={!phone || undefined}
          />
          {shown.name ? (
            <p style={ERR}>{shown.name}</p>
          ) : (
            <p id={id("name-hint")} style={HINT}>
              Not the name of a rules feat, or of another of your feats.
            </p>
          )}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem", minWidth: 0 }}>
          <legend style={legend}>Rules</legend>
          <div role="radiogroup" aria-label="Rules" style={chips}>
            {RULES_PICKS.map(([value, label]) => (
              <ToggleChip key={value} on={draft.rules === value} onClick={() => patch({ rules: value })} phone={phone}>
                {label}
              </ToggleChip>
            ))}
          </div>
          <p style={HINT}>
            {draft.rules === "both" ? "It shows in 2014 and 2024 campaigns." : `It shows only in ${draft.rules} campaigns.`}
          </p>
        </fieldset>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem", minWidth: 0 }}>
          <legend style={legend}>Kind</legend>
          <div role="radiogroup" aria-label="Kind" style={chips}>
            {FEAT_KINDS.map(([value, label]) => (
              <ToggleChip key={value} on={draft.kind === value} onClick={() => patch({ kind: value })} phone={phone}>
                {label}
              </ToggleChip>
            ))}
          </div>
          <p style={HINT}>{KIND_HINTS[draft.kind]}</p>
        </fieldset>
        <div className="form-group">
          <label htmlFor={id("blurb")}>
            In one line <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id={id("blurb")}
            value={draft.blurb}
            maxLength={300}
            onChange={(e) => patch({ blurb: e.target.value.replace(/\s*\n\s*/g, " ") })}
            placeholder="What the character builder shows on the feat's card"
            aria-invalid={!!shown.blurb}
          />
          {shown.blurb ? (
            <p style={ERR}>{shown.blurb}</p>
          ) : (
            <p style={HINT}>Left empty, the card shows the start of the full text.</p>
          )}
        </div>
      </FormSection>

      <FormSection title="What it does">
        <div className="form-group">
          <label htmlFor={id("description")}>The full text</label>
          <textarea
            id={id("description")}
            value={draft.description}
            rows={phone ? 6 : 7}
            maxLength={3000}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Everything the feat does, as your players should read it."
            style={{ resize: "vertical", lineHeight: 1.5 }}
            aria-invalid={!!shown.description}
          />
          {shown.description && <p style={ERR}>{shown.description}</p>}
        </div>
        <div className="form-group">
          <label htmlFor={id("prerequisite")}>
            Prerequisite <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            id={id("prerequisite")}
            value={draft.prerequisite}
            maxLength={200}
            onChange={(e) => patch({ prerequisite: e.target.value })}
            placeholder="e.g. Dexterity 13 or higher"
            aria-invalid={!!shown.prerequisite}
          />
          {shown.prerequisite ? (
            <p style={ERR}>{shown.prerequisite}</p>
          ) : (
            <p style={HINT}>Players see it before they pick. The app doesn&rsquo;t check it.</p>
          )}
        </div>
      </FormSection>

      <FormSection title="+1 to an ability" hint="Most feats give +1 to one ability. The player picks which; no score goes above 20.">
        <div role="radiogroup" aria-label="+1 to an ability" style={chips}>
          {PLUS_PICKS.map(([value, label]) => (
            <ToggleChip key={value} on={draft.plus === value} onClick={() => patch({ plus: value })} phone={phone}>
              {label}
            </ToggleChip>
          ))}
        </div>
        {draft.plus === "choose" && (
          <>
            <p style={{ ...HINT, margin: "0.6rem 0 0.35rem" }}>The player picks one of these:</p>
            <div style={chips}>
              {ABILITY_LIST.map(([code, word]) => {
                const on = draft.abilities.includes(code);
                return (
                  <ToggleChip
                    key={code}
                    on={on}
                    phone={phone}
                    label={word}
                    onClick={() =>
                      patch({ abilities: on ? draft.abilities.filter((a) => a !== code) : [...draft.abilities, code] })
                    }
                  >
                    {code}
                  </ToggleChip>
                );
              })}
            </div>
          </>
        )}
        {shown.plus && <p style={ERR}>{shown.plus}</p>}
        <label style={{ ...checkRow, marginTop: "0.75rem" }}>
          <input type="checkbox" checked={draft.repeatable} onChange={(e) => patch({ repeatable: e.target.checked })} />
          Can be taken more than once
        </label>
      </FormSection>

      <FormSection
        title="Power attack (optional)"
        hint="Before an attack, the player can take a penalty to hit for extra damage, like the old Sharpshooter (−5 / +10)."
      >
        <label style={checkRow}>
          <input type="checkbox" checked={draft.power} onChange={(e) => patch({ power: e.target.checked })} />
          This feat has a power attack
        </label>
        {draft.power && (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
              <div className="form-group" style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label htmlFor={id("to-hit")}>Penalty to hit</label>
                <select id={id("to-hit")} value={draft.toHit} onChange={(e) => patch({ toHit: Number(e.target.value) })}>
                  {PENALTIES.map((n) => (
                    <option key={n} value={n}>
                      −{Math.abs(n)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ flex: "1 1 140px", minWidth: 0 }}>
                <label htmlFor={id("damage")}>Extra damage</label>
                <input
                  id={id("damage")}
                  inputMode="numeric"
                  value={draft.damage}
                  onChange={(e) => patch({ damage: e.target.value })}
                  aria-invalid={!!shown.damage}
                  placeholder="10"
                />
              </div>
            </div>
            {shown.damage && <p style={{ ...ERR, margin: "-0.4rem 0 0.6rem" }}>{shown.damage}</p>}
            <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.5rem", minWidth: 0 }}>
              <legend style={legend}>With</legend>
              <div role="radiogroup" aria-label="Which weapons" style={chips}>
                {POWER_WEAPONS.map(([value, label]) => (
                  <ToggleChip key={value} on={draft.weapons === value} onClick={() => patch({ weapons: value })} phone={phone}>
                    {label}
                  </ToggleChip>
                ))}
              </div>
            </fieldset>
            {damage !== null && damage >= 1 && damage <= 20 && (
              <p style={HINT}>
                On the sheet: a toggle for {powerAttackLine({ to_hit: draft.toHit, damage, weapons: draft.weapons })}.
              </p>
            )}
          </div>
        )}
      </FormSection>
    </form>
  );

  return (
    <FormFrame
      title={TITLES[mode]}
      onClose={requestClose}
      footer={
        <SaveBar
          phone={phone}
          problems={tried ? problemCount : 0}
          serverError={serverError}
          saving={saving}
          saveLabel={mode === "edit" ? "Save changes" : "Save feat"}
          onCancel={requestClose}
          onSave={() => void save()}
          onFixName={() => document.getElementById(id("name"))?.focus()}
        />
      }
    >
      {body}
    </FormFrame>
  );
}
