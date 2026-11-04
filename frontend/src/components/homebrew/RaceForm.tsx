import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import {
  homebrewApi,
  type AbilityCode,
  type HomebrewRace,
  type HomebrewRaceInput,
  type RaceTemplate,
} from "../../api/homebrew";
import { useIsCompact } from "../../hooks/useIsCompact";
import FormFrame, { FormSection, SaveBar, ToggleChip } from "./FormFrame";
import {
  ABILITY_LIST,
  DARKVISION,
  ERR,
  HINT,
  MAX_RACE_BONUS,
  RULES_PICKS,
  SKILL_LIST,
  rulesOfPick,
  rulesPickOf,
  type RulesPick,
} from "./options";

/**
 * RaceForm (Plan 133) — a DM's homebrew race: make one (blank, or from an SRD race), copy
 * one, or change their own.
 *
 * Every field the builder uses: size, speed, ability bonuses (2014 games; in the 2024 rules
 * the background gives them), "+1s of the player's choice", fixed skills and skills of
 * choice, darkvision, extra hit points per level, languages and traits. Checks mirror the
 * server's (domain/homebrew.py) so a save fails only on what the server alone knows: a name
 * that is already taken, or a race characters use being renamed.
 */

export type HomebrewFormMode = "new" | "copy" | "edit";

interface TraitRow {
  id: number;
  name: string;
  text: string;
}

interface Draft {
  name: string;
  rules: RulesPick;
  size: "Small" | "Medium";
  speed: number;
  bonuses: Record<AbilityCode, number>;
  choose: number;
  exclude: AbilityCode[];
  skills: string[];
  skillChoice: number;
  darkvision: number;
  hpPerLevel: number;
  languages: string;
  traits: TraitRow[];
  /** The next trait row id. */
  seq: number;
}

type Problems = Record<string, string>;

const NO_BONUSES: Record<AbilityCode, number> = { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 };

const BLANK: Draft = {
  name: "",
  rules: "both",
  size: "Medium",
  speed: 30,
  bonuses: NO_BONUSES,
  choose: 0,
  exclude: [],
  skills: [],
  skillChoice: 0,
  darkvision: 0,
  hpPerLevel: 0,
  languages: "",
  traits: [],
  seq: 1,
};

const TITLES: Record<HomebrewFormMode, string> = { new: "New race", copy: "Copy and edit", edit: "Edit race" };

/** A draft from a homebrew race or an SRD template; `name` replaces the source's name. */
function fromSource(src: HomebrewRace | RaceTemplate, name: string): Draft {
  const bonuses = { ...NO_BONUSES };
  for (const [code] of ABILITY_LIST) bonuses[code] = Math.min(2, Math.max(0, src.ability_bonuses[code] ?? 0));
  const traits = src.traits.map((t, i) => ({ id: i + 1, name: t.name, text: t.text }));
  return {
    name,
    rules: rulesPickOf(src.ruleset),
    size: src.size === "Small" ? "Small" : "Medium",
    speed: src.speed,
    bonuses,
    choose: src.ability_choice?.choose ?? 0,
    exclude: src.ability_choice?.exclude ?? [],
    skills: src.skills.filter((s) => (SKILL_LIST as readonly string[]).includes(s)),
    skillChoice: Math.min(4, src.skill_choice),
    darkvision: src.darkvision ?? 0,
    hpPerLevel: Math.min(2, src.hp_per_level),
    languages: src.languages,
    traits,
    seq: traits.length + 1,
  };
}

function bonusTotal(d: Draft): number {
  return Object.values(d.bonuses).reduce((a, b) => a + b, 0) + d.choose;
}

function usedTraits(d: Draft): TraitRow[] {
  return d.traits.filter((t) => t.name.trim() || t.text.trim());
}

function check(d: Draft): Problems {
  const p: Problems = {};
  if (!d.name.trim()) p.name = "A name is needed.";
  else if (d.name.trim().length > 100) p.name = "Too long (100 characters at most).";
  if (!Number.isFinite(d.speed) || d.speed < 10 || d.speed > 60 || d.speed % 5 !== 0) {
    p.speed = "Speed is 10 to 60 feet, in steps of 5.";
  }
  if (d.rules !== "2024") {
    const total = bonusTotal(d);
    if (total > MAX_RACE_BONUS) {
      p.bonuses = `A race gives at most +${MAX_RACE_BONUS} in all, counting the player's picks. This one gives +${total}.`;
    }
    if (d.choose > 0 && 6 - d.exclude.length < d.choose) {
      p.exclude = `Leave at least ${d.choose} abilities for the player to pick from.`;
    }
  }
  if (d.languages.trim().length > 200) p.languages = "Too long (200 characters at most).";
  const used = usedTraits(d);
  if (used.length > 20) p.traits = "At most 20 traits.";
  for (const t of used) {
    if (!t.name.trim()) p[`trait_${t.id}`] = "Give this trait a name.";
    else if (t.name.trim().length > 80) p[`trait_${t.id}`] = "The name is too long (80 characters at most).";
    else if (t.text.trim().length > 1000) p[`trait_${t.id}`] = "The text is too long (1000 characters at most).";
  }
  return p;
}

function toInput(d: Draft): HomebrewRaceInput {
  const oldRules = d.rules !== "2024";
  const bonuses: Partial<Record<AbilityCode, number>> = {};
  if (oldRules) for (const [code] of ABILITY_LIST) if (d.bonuses[code] > 0) bonuses[code] = d.bonuses[code];
  return {
    name: d.name.trim(),
    ruleset: rulesOfPick(d.rules),
    size: d.size,
    speed: d.speed,
    ability_bonuses: bonuses,
    ability_choice: oldRules && d.choose > 0 ? { choose: d.choose, amount: 1, exclude: d.exclude } : null,
    skills: SKILL_LIST.filter((s) => d.skills.includes(s)),
    skill_choice: d.skillChoice,
    traits: usedTraits(d).map((t) => ({ name: t.name.trim(), text: t.text.trim() })),
    languages: d.languages.trim(),
    hp_per_level: d.hpPerLevel,
    darkvision: d.darkvision || null,
  };
}

export default function RaceForm({
  mode,
  from,
  onClose,
  onSaved,
}: {
  mode: HomebrewFormMode;
  /** The race to copy or edit; null for a blank form. */
  from: HomebrewRace | null;
  onClose: () => void;
  onSaved: (race: HomebrewRace) => void;
}) {
  const phone = useIsCompact(640);
  const [initial] = useState<Draft>(() =>
    from ? fromSource(from, mode === "copy" ? `${from.name} (copy)`.slice(0, 100) : from.name) : BLANK,
  );
  const [draft, setDraft] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [startedFrom, setStartedFrom] = useState("");
  const uid = useId();
  const id = (f: string) => `${uid}-${f}`;

  // A new race may start from an SRD one (the server lays them out as homebrew races).
  const { data: templates = [] } = useQuery({
    queryKey: ["homebrew-race-templates"],
    queryFn: homebrewApi.raceTemplates,
    enabled: mode === "new",
    staleTime: Infinity,
  });

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

  function startFrom(key: string) {
    setStartedFrom(key);
    const t = templates.find((x) => `${x.ruleset}:${x.name}` === key);
    if (t) {
      setDraft((d) => fromSource(t, d.name));
      setServerError(null);
    }
  }

  async function save() {
    setTried(true);
    if (problemCount > 0) return;
    setSaving(true);
    setServerError(null);
    try {
      const body = toInput(draft);
      const saved = mode === "edit" && from ? await homebrewApi.updateRace(from.id, body) : await homebrewApi.createRace(body);
      onSaved(saved);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't save the race. Try again.");
      setSaving(false);
    }
  }

  const twoCol: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: phone ? "1fr" : "repeat(2, minmax(0, 1fr))",
    gap: "0 0.75rem",
  };
  const total = bonusTotal(draft);
  const byRules = (r: string) => templates.filter((t) => t.ruleset === r);

  const body = (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p style={{ ...HINT, marginTop: 0 }}>
        Only you can change it. Players pick it when they build a character in any of your campaigns.
      </p>

      {mode === "new" && templates.length > 0 && (
        <div className="form-group" style={{ marginTop: "0.75rem" }}>
          <label htmlFor={id("start")}>
            Start from a rules race <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <select id={id("start")} value={startedFrom} onChange={(e) => startFrom(e.target.value)}>
            <option value="">A blank race</option>
            {["2014", "2024"].map((r) => (
              <optgroup key={r} label={`${r} rules`}>
                {byRules(r).map((t) => (
                  <option key={`${r}:${t.name}`} value={`${r}:${t.name}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <p style={HINT}>Fills in the form from that race. Give yours its own name.</p>
        </div>
      )}

      <FormSection title="The basics">
        <div className="form-group">
          <label htmlFor={id("name")}>Name</label>
          <input
            id={id("name")}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            maxLength={100}
            placeholder="e.g. Hylian"
            aria-invalid={!!shown.name}
            data-autofocus={!phone || undefined}
          />
          {shown.name && <p style={ERR}>{shown.name}</p>}
        </div>
        <fieldset style={{ border: 0, padding: 0, margin: "0 0 0.75rem", minWidth: 0 }}>
          <legend style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", padding: 0, marginBottom: "0.3rem" }}>
            Rules
          </legend>
          <div role="radiogroup" aria-label="Rules" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {RULES_PICKS.map(([value, label]) => (
              <ToggleChip key={value} on={draft.rules === value} onClick={() => patch({ rules: value })} phone={phone}>
                {label}
              </ToggleChip>
            ))}
          </div>
          <p style={HINT}>
            {draft.rules === "both"
              ? "It shows in 2014 and 2024 campaigns."
              : `It shows only in ${draft.rules} campaigns.`}
          </p>
        </fieldset>
        <div style={twoCol}>
          <div className="form-group">
            <label htmlFor={id("size")}>Size</label>
            <select id={id("size")} value={draft.size} onChange={(e) => patch({ size: e.target.value as Draft["size"] })}>
              <option value="Medium">Medium</option>
              <option value="Small">Small</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={id("speed")}>Speed (feet)</label>
            <input
              id={id("speed")}
              type="number"
              inputMode="numeric"
              min={10}
              max={60}
              step={5}
              value={Number.isFinite(draft.speed) ? draft.speed : ""}
              onChange={(e) => patch({ speed: e.target.value === "" ? NaN : Number(e.target.value) })}
              aria-invalid={!!shown.speed}
            />
            {shown.speed && <p style={ERR}>{shown.speed}</p>}
          </div>
        </div>
      </FormSection>

      <FormSection
        title="Ability bonuses"
        hint={
          draft.rules === "2024"
            ? undefined
            : "Used in 2014 games. In the 2024 rules a character's background gives the ability bonuses, so 2024 characters skip these."
        }
      >
        {draft.rules === "2024" ? (
          <p style={{ ...HINT, marginTop: 0 }}>
            In the 2024 rules a character&apos;s background gives the ability bonuses, so a 2024 race has none. Choose
            Both or 2014 only to add them.
          </p>
        ) : (
          <>
            <div style={{ ...twoCol, gap: "0.4rem 1.25rem" }}>
              {ABILITY_LIST.map(([code, word]) => (
                <div key={code} style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                  <span style={{ flex: 1, minWidth: 0, fontSize: "0.9375rem" }}>{word}</span>
                  <div role="radiogroup" aria-label={`${word} bonus`} style={{ display: "flex", gap: "0.25rem" }}>
                    {[0, 1, 2].map((n) => (
                      <ToggleChip
                        key={n}
                        on={draft.bonuses[code] === n}
                        onClick={() => patch({ bonuses: { ...draft.bonuses, [code]: n } })}
                        phone={phone}
                        label={`${word} +${n}`}
                      >
                        <span className="num">+{n}</span>
                      </ToggleChip>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="form-group" style={{ marginTop: "0.75rem" }}>
              <label htmlFor={id("choose")}>Plus +1s the player picks</label>
              <select id={id("choose")} value={draft.choose} onChange={(e) => patch({ choose: Number(e.target.value) })}>
                <option value={0}>None</option>
                <option value={1}>One +1 of the player&apos;s choice</option>
                <option value={2}>Two +1s, on different abilities</option>
                <option value={3}>Three +1s, on different abilities</option>
              </select>
            </div>
            {draft.choose > 0 && (
              <div className="form-group">
                <span style={{ display: "block", fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", marginBottom: "0.3rem" }}>
                  Not on <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
                </span>
                <div role="group" aria-label="Abilities the player can't pick" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                  {ABILITY_LIST.map(([code, word]) => {
                    const on = draft.exclude.includes(code);
                    return (
                      <ToggleChip
                        key={code}
                        on={on}
                        phone={phone}
                        label={`Not on ${word}`}
                        onClick={() =>
                          patch({ exclude: on ? draft.exclude.filter((x) => x !== code) : [...draft.exclude, code] })
                        }
                      >
                        {code}
                      </ToggleChip>
                    );
                  })}
                </div>
                {shown.exclude && <p style={ERR}>{shown.exclude}</p>}
              </div>
            )}
            <p style={shown.bonuses ? ERR : HINT}>
              {shown.bonuses ?? (
                <>
                  <span className="num">+{total}</span> of at most <span className="num">+{MAX_RACE_BONUS}</span>, counting
                  the player&apos;s picks.
                </>
              )}
            </p>
          </>
        )}
      </FormSection>

      <FormSection title="Skills" hint="Skills every character of this race is trained in.">
        <div role="group" aria-label="Skills" style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
          {SKILL_LIST.map((s) => {
            const on = draft.skills.includes(s);
            return (
              <ToggleChip
                key={s}
                on={on}
                phone={phone}
                onClick={() => patch({ skills: on ? draft.skills.filter((x) => x !== s) : [...draft.skills, s] })}
              >
                {s}
              </ToggleChip>
            );
          })}
        </div>
        <div className="form-group" style={{ marginTop: "0.75rem" }}>
          <label htmlFor={id("skillChoice")}>Plus skills the player picks</label>
          <select id={id("skillChoice")} value={draft.skillChoice} onChange={(e) => patch({ skillChoice: Number(e.target.value) })}>
            <option value={0}>None</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "One skill of the player's choice" : `${n} skills of the player's choice`}
              </option>
            ))}
          </select>
        </div>
      </FormSection>

      <FormSection title="Senses, toughness and languages">
        <div style={twoCol}>
          <div className="form-group">
            <label htmlFor={id("darkvision")}>Darkvision</label>
            <select id={id("darkvision")} value={draft.darkvision} onChange={(e) => patch({ darkvision: Number(e.target.value) })}>
              {DARKVISION.map((ft) => (
                <option key={ft} value={ft}>
                  {ft === 0 ? "None" : `${ft} feet`}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor={id("hp")}>Extra hit points</label>
            <select id={id("hp")} value={draft.hpPerLevel} onChange={(e) => patch({ hpPerLevel: Number(e.target.value) })}>
              <option value={0}>None</option>
              <option value={1}>+1 every level</option>
              <option value={2}>+2 every level</option>
            </select>
            <p style={HINT}>Like a Hill Dwarf&apos;s toughness.</p>
          </div>
        </div>
        <div className="form-group">
          <label htmlFor={id("languages")}>Languages</label>
          <input
            id={id("languages")}
            value={draft.languages}
            onChange={(e) => patch({ languages: e.target.value })}
            maxLength={200}
            placeholder="e.g. Common and Hylian"
            aria-invalid={!!shown.languages}
          />
          {shown.languages && <p style={ERR}>{shown.languages}</p>}
        </div>
      </FormSection>

      <FormSection title="Traits" hint="What makes this race special, in your own words. They go on the character sheet.">
        {draft.traits.map((t, i) => {
          const problem = shown[`trait_${t.id}`];
          const set = (p: Partial<TraitRow>) =>
            patch({ traits: draft.traits.map((x) => (x.id === t.id ? { ...x, ...p } : x)) });
          return (
            <div
              key={t.id}
              style={{
                border: `1px solid ${problem ? "var(--danger-line)" : "var(--border)"}`,
                borderRadius: 10,
                padding: "0.6rem",
                marginBottom: "0.6rem",
                background: "var(--surface2)",
              }}
            >
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
                <input
                  aria-label={`Trait ${i + 1} name`}
                  value={t.name}
                  maxLength={80}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Name, e.g. Hylian Ears"
                  style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => patch({ traits: draft.traits.filter((x) => x.id !== t.id) })}
                  aria-label={`Remove ${t.name.trim() || `trait ${i + 1}`}`}
                  title="Remove this trait"
                  style={{ minWidth: 44, minHeight: phone ? 44 : 36, padding: "0.45rem", flexShrink: 0, justifyContent: "center" }}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              <textarea
                aria-label={`Trait ${i + 1} text`}
                value={t.text}
                rows={2}
                maxLength={1000}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="What it does"
                style={{ resize: "vertical", lineHeight: 1.5, width: "100%" }}
              />
              {problem && <p style={ERR}>{problem}</p>}
            </div>
          );
        })}
        {draft.traits.length < 20 && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: phone ? 44 : undefined }}
            onClick={() =>
              patch({ traits: [...draft.traits, { id: draft.seq, name: "", text: "" }], seq: draft.seq + 1 })
            }
          >
            <Plus size={15} aria-hidden /> Add a trait
          </button>
        )}
        {shown.traits && <p style={ERR}>{shown.traits}</p>}
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
          saveLabel={mode === "edit" ? "Save changes" : "Save race"}
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
