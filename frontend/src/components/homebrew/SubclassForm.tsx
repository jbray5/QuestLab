import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { homebrewApi, type HomebrewSubclass, type HomebrewSubclassInput } from "../../api/homebrew";
import { useIsCompact } from "../../hooks/useIsCompact";
import FormFrame, { FormSection, SaveBar, ToggleChip } from "./FormFrame";
import type { HomebrewFormMode } from "./RaceForm";
import {
  CLASS_LIST,
  ERR,
  HINT,
  RULES_PICKS,
  rulesOfPick,
  rulesPickOf,
  subclassLevel,
  subclassLevelHint,
  type RulesPick,
} from "./options";

/**
 * SubclassForm (Plan 133) — a DM's homebrew subclass for one class: make one, copy one, or
 * change their own.
 *
 * Name, class, rules, a short blurb, features by level (each with a name and what it does;
 * sorted by level when saved) and, optionally, spells that are always prepared from a level
 * on. The level-up guide shows each feature at its level, and the sheet lists them.
 */

interface FeatureRow {
  id: number;
  level: number;
  name: string;
  text: string;
}

interface PreparedRow {
  id: number;
  level: number;
  /** One spell name per line. */
  spells: string;
}

interface Draft {
  name: string;
  cls: string;
  rules: RulesPick;
  blurb: string;
  features: FeatureRow[];
  prepared: PreparedRow[];
  seq: number;
}

type Problems = Record<string, string>;

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

const BLANK: Draft = { name: "", cls: "", rules: "both", blurb: "", features: [], prepared: [], seq: 1 };

const TITLES: Record<HomebrewFormMode, string> = { new: "New subclass", copy: "Copy and edit", edit: "Edit subclass" };

function fromSubclass(s: HomebrewSubclass, name: string): Draft {
  const features = s.features.map((f, i) => ({ id: i + 1, level: f.level, name: f.name, text: f.text }));
  const prepared = Object.entries(s.always_prepared ?? {}).map(([level, spells], i) => ({
    id: features.length + i + 1,
    level: Number(level),
    spells: spells.join("\n"),
  }));
  return {
    name,
    cls: s.character_class,
    rules: rulesPickOf(s.ruleset),
    blurb: s.blurb,
    features,
    prepared,
    seq: features.length + prepared.length + 1,
  };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function usedFeatures(d: Draft): FeatureRow[] {
  return d.features.filter((f) => f.name.trim() || f.text.trim());
}

function check(d: Draft): Problems {
  const p: Problems = {};
  if (!d.name.trim()) p.name = "A name is needed.";
  else if (d.name.trim().length > 100) p.name = "Too long (100 characters at most).";
  if (!d.cls) p.cls = "Pick the class this subclass is for.";
  if (d.blurb.trim().length > 300) p.blurb = "Too long (300 characters at most).";
  const used = usedFeatures(d);
  if (used.length > 40) p.features = "At most 40 features.";
  for (const f of used) {
    if (!f.name.trim()) p[`feature_${f.id}`] = "Give this feature a name.";
    else if (f.name.trim().length > 80) p[`feature_${f.id}`] = "The name is too long (80 characters at most).";
    else if (f.text.trim().length > 2000) p[`feature_${f.id}`] = "The text is too long (2000 characters at most).";
  }
  const perLevel = new Map<number, number>();
  for (const r of d.prepared) {
    const names = lines(r.spells);
    if (names.some((n) => n.length > 120)) p[`prepared_${r.id}`] = "A spell name is too long (120 characters at most).";
    perLevel.set(r.level, (perLevel.get(r.level) ?? 0) + names.length);
  }
  for (const r of d.prepared) {
    if ((perLevel.get(r.level) ?? 0) > 10) p[`prepared_${r.id}`] = "At most 10 always-prepared spells at one level.";
  }
  return p;
}

function toInput(d: Draft): HomebrewSubclassInput {
  const prepared: Record<string, string[]> = {};
  for (const r of d.prepared) {
    const names = lines(r.spells);
    if (!names.length) continue;
    const key = String(r.level);
    prepared[key] = [...(prepared[key] ?? []), ...names];
  }
  return {
    name: d.name.trim(),
    character_class: d.cls,
    ruleset: rulesOfPick(d.rules),
    blurb: d.blurb.trim(),
    features: usedFeatures(d)
      .map((f) => ({ level: f.level, name: f.name.trim(), text: f.text.trim() }))
      .sort((a, b) => a.level - b.level),
    always_prepared: Object.keys(prepared).length ? prepared : null,
  };
}

export default function SubclassForm({
  mode,
  from,
  onClose,
  onSaved,
}: {
  mode: HomebrewFormMode;
  /** The subclass to copy or edit; null for a blank form. */
  from: HomebrewSubclass | null;
  onClose: () => void;
  onSaved: (subclass: HomebrewSubclass) => void;
}) {
  const phone = useIsCompact(640);
  const [initial] = useState<Draft>(() =>
    from ? fromSubclass(from, mode === "copy" ? `${from.name} (copy)`.slice(0, 100) : from.name) : BLANK,
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
      const saved =
        mode === "edit" && from ? await homebrewApi.updateSubclass(from.id, body) : await homebrewApi.createSubclass(body);
      onSaved(saved);
    } catch (e) {
      setServerError(e instanceof Error ? e.message : "Couldn't save the subclass. Try again.");
      setSaving(false);
    }
  }

  const rowCard = (problem?: string): React.CSSProperties => ({
    border: `1px solid ${problem ? "var(--danger-line)" : "var(--border)"}`,
    borderRadius: 10,
    padding: "0.6rem",
    marginBottom: "0.6rem",
    background: "var(--surface2)",
  });
  const removeBtn: React.CSSProperties = {
    minWidth: 44,
    minHeight: phone ? 44 : 36,
    padding: "0.45rem",
    flexShrink: 0,
    justifyContent: "center",
  };
  const levelSelect = (value: number, label: string, onChange: (n: number) => void) => (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: phone ? 112 : 104, flexShrink: 0 }}
    >
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          Level {l}
        </option>
      ))}
    </select>
  );
  const firstLevel = draft.cls ? subclassLevelHint(draft.cls, rulesOfPick(draft.rules)) : null;

  const body = (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p style={{ ...HINT, marginTop: 0 }}>
        Only you can change it. Characters of its class in your campaigns can pick it, and the level-up guide shows each
        feature when they reach its level.
      </p>

      <FormSection title="The basics">
        <div className="form-group">
          <label htmlFor={id("name")}>Name</label>
          <input
            id={id("name")}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
            maxLength={100}
            placeholder="e.g. Oath of the Triforce"
            aria-invalid={!!shown.name}
            data-autofocus={!phone || undefined}
          />
          {shown.name && <p style={ERR}>{shown.name}</p>}
        </div>
        <div className="form-group">
          <label htmlFor={id("cls")}>Class</label>
          <select id={id("cls")} value={draft.cls} onChange={(e) => patch({ cls: e.target.value })} aria-invalid={!!shown.cls}>
            <option value="">Pick a class…</option>
            {CLASS_LIST.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {shown.cls ? <p style={ERR}>{shown.cls}</p> : firstLevel && <p style={HINT}>{firstLevel}</p>}
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
            {draft.rules === "both" ? "It shows in 2014 and 2024 campaigns." : `It shows only in ${draft.rules} campaigns.`}
          </p>
        </fieldset>
        <div className="form-group">
          <label htmlFor={id("blurb")}>
            In a sentence <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
          </label>
          <textarea
            id={id("blurb")}
            value={draft.blurb}
            rows={2}
            maxLength={300}
            onChange={(e) => patch({ blurb: e.target.value })}
            placeholder="What players see when they choose a subclass"
            style={{ resize: "vertical", lineHeight: 1.5 }}
            aria-invalid={!!shown.blurb}
          />
          {shown.blurb && <p style={ERR}>{shown.blurb}</p>}
        </div>
      </FormSection>

      <FormSection title="Features" hint="Each one arrives at its level. They're sorted by level when you save.">
        {draft.features.map((f, i) => {
          const problem = shown[`feature_${f.id}`];
          const set = (p: Partial<FeatureRow>) =>
            patch({ features: draft.features.map((x) => (x.id === f.id ? { ...x, ...p } : x)) });
          return (
            <div key={f.id} style={rowCard(problem)}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem", flexWrap: phone ? "wrap" : undefined }}>
                {levelSelect(f.level, `Feature ${i + 1} level`, (level) => set({ level }))}
                <input
                  aria-label={`Feature ${i + 1} name`}
                  value={f.name}
                  maxLength={80}
                  onChange={(e) => set({ name: e.target.value })}
                  placeholder="Name, e.g. Triforce Strike"
                  style={{ fontWeight: 600, flex: 1, minWidth: phone ? "100%" : 0, order: phone ? 3 : undefined }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => patch({ features: draft.features.filter((x) => x.id !== f.id) })}
                  aria-label={`Remove ${f.name.trim() || `feature ${i + 1}`}`}
                  title="Remove this feature"
                  style={{ ...removeBtn, marginLeft: phone ? "auto" : undefined }}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              <textarea
                aria-label={`Feature ${i + 1} text`}
                value={f.text}
                rows={3}
                maxLength={2000}
                onChange={(e) => set({ text: e.target.value })}
                placeholder="What it does"
                style={{ resize: "vertical", lineHeight: 1.5, width: "100%" }}
              />
              {problem && <p style={ERR}>{problem}</p>}
            </div>
          );
        })}
        {draft.features.length < 40 && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: phone ? 44 : undefined }}
            onClick={() => {
              const last = draft.features[draft.features.length - 1];
              const rules = rulesOfPick(draft.rules);
              const start = !draft.cls
                ? 3
                : rules
                  ? subclassLevel(draft.cls, rules)
                  : Math.min(subclassLevel(draft.cls, "2014"), subclassLevel(draft.cls, "2024"));
              patch({
                features: [...draft.features, { id: draft.seq, level: last ? last.level : start, name: "", text: "" }],
                seq: draft.seq + 1,
              });
            }}
          >
            <Plus size={15} aria-hidden /> Add a feature
          </button>
        )}
        {shown.features && <p style={ERR}>{shown.features}</p>}
      </FormSection>

      <FormSection
        title="Always-prepared spells (optional)"
        hint="Spells a character of this subclass always has ready from a level on, and that don't count against their prepared spells. One spell name per line, spelled as in the spell list."
      >
        {draft.prepared.map((r, i) => {
          const problem = shown[`prepared_${r.id}`];
          return (
            <div key={r.id} style={rowCard(problem)}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>From</span>
                  {levelSelect(r.level, `Spells ${i + 1} level`, (level) =>
                    patch({ prepared: draft.prepared.map((x) => (x.id === r.id ? { ...x, level } : x)) }),
                  )}
                </div>
                <textarea
                  aria-label={`Always-prepared spells from level ${r.level}`}
                  value={r.spells}
                  rows={3}
                  onChange={(e) =>
                    patch({ prepared: draft.prepared.map((x) => (x.id === r.id ? { ...x, spells: e.target.value } : x)) })
                  }
                  placeholder={"Bless\nShield of Faith"}
                  style={{ resize: "vertical", lineHeight: 1.5, flex: 1, minWidth: 0 }}
                />
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => patch({ prepared: draft.prepared.filter((x) => x.id !== r.id) })}
                  aria-label={`Remove the level ${r.level} spells`}
                  title="Remove these spells"
                  style={removeBtn}
                >
                  <Trash2 size={16} aria-hidden />
                </button>
              </div>
              {problem && <p style={ERR}>{problem}</p>}
            </div>
          );
        })}
        <button
          type="button"
          className="btn btn-secondary"
          style={{ minHeight: phone ? 44 : undefined }}
          onClick={() => {
            const used = new Set(draft.prepared.map((r) => r.level));
            const next = [3, 5, 9, 13, 17].find((l) => !used.has(l)) ?? 1;
            patch({ prepared: [...draft.prepared, { id: draft.seq, level: next, spells: "" }], seq: draft.seq + 1 });
          }}
        >
          <Plus size={15} aria-hidden /> Add spells at a level
        </button>
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
          saveLabel={mode === "edit" ? "Save changes" : "Save subclass"}
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
