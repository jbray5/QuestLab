import { useId, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import {
  homebrewApi,
  type DieSize,
  type HomebrewSubclass,
  type HomebrewSubclassInput,
  type SubclassResource,
  type UsesFormula,
} from "../../api/homebrew";
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
 *
 * Plan 135: up to 4 counters (Superiority Dice): each arrives at a level, refills on a short
 * or long rest, and has uses by level (or uses that follow the proficiency bonus, the level or
 * an ability) and, optionally, a die by level. The sheet and the phone show them.
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

/** One "from level N: a number" row of a counter's uses. The number stays text while typed. */
interface UsesRow {
  id: number;
  level: number;
  uses: string;
}

/** One "from level N: this die" row of a counter's die. */
interface DieRow {
  id: number;
  level: number;
  die: DieSize;
}

/** A counter (Plan 135) as the form edits it. */
interface CounterRow {
  id: number;
  name: string;
  /** The level it arrives at. */
  level: number;
  recovery: "short" | "long";
  /** "table": uses by level; "formula": uses that follow the character. */
  mode: "table" | "formula";
  uses: UsesRow[];
  formula: UsesFormula;
  dice: DieRow[];
  text: string;
}

interface Draft {
  name: string;
  cls: string;
  rules: RulesPick;
  blurb: string;
  features: FeatureRow[];
  prepared: PreparedRow[];
  counters: CounterRow[];
  seq: number;
}

type Problems = Record<string, string>;

const LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);

const BLANK: Draft = { name: "", cls: "", rules: "both", blurb: "", features: [], prepared: [], counters: [], seq: 1 };

// Plan 135 — the server's limits for counters (domain/homebrew.py SubclassResource).
const MAX_COUNTERS = 4;
const MAX_COUNTER_USES = 50;
const DICE: DieSize[] = ["d4", "d6", "d8", "d10", "d12"];
const FORMULAS: [UsesFormula, string][] = [
  ["prof_bonus", "the proficiency bonus"],
  ["prof_x2", "twice the proficiency bonus"],
  ["level", "the character's level"],
  ["half_level", "half the level (rounded down)"],
  ["STR", "the Strength modifier"],
  ["DEX", "the Dexterity modifier"],
  ["CON", "the Constitution modifier"],
  ["INT", "the Intelligence modifier"],
  ["WIS", "the Wisdom modifier"],
  ["CHA", "the Charisma modifier"],
];
function byLevel<T extends { level: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.level - b.level);
}

/** The row in effect at `level`: the one at the highest listed level not above it (as the server reads it). */
function rowAt<T extends { level: number }>(rows: T[], level: number): T | undefined {
  return byLevel(rows)
    .filter((r) => r.level <= level)
    .pop();
}

/** A saved counter as form rows; `next` hands out the form's row ids. */
function counterFrom(r: SubclassResource, next: () => number): CounterRow {
  const uses = Object.entries(r.uses ?? {}).map(([level, n]) => ({ id: next(), level: Number(level), uses: String(n) }));
  const dice = Object.entries(r.die ?? {}).map(([level, die]) => ({ id: next(), level: Number(level), die }));
  return {
    id: next(),
    name: r.name,
    level: r.level,
    recovery: r.recovery,
    mode: r.uses_formula ? "formula" : "table",
    // A formula counter keeps a starter table, in case the DM switches to "by level".
    uses: uses.length ? uses : [{ id: next(), level: r.level, uses: "2" }],
    formula: r.uses_formula ?? "prof_bonus",
    dice,
    text: r.text ?? "",
  };
}

/**
 * What the sheet will show, from the rows as typed: "4 × d8 at level 3 · 5 × d8 at 7 · 5 × d10
 * at 10", or "from level 7, as many as the proficiency bonus (at least 1); d8 at level 7, then
 * d10 at 10".
 */
function counterPreview(c: CounterRow): string {
  const levels = new Set<number>([c.level]);
  if (c.mode === "table") for (const r of c.uses) if (r.level > c.level) levels.add(r.level);
  for (const r of c.dice) if (r.level > c.level) levels.add(r.level);
  const sorted = [...levels].sort((a, b) => a - b);
  const parts: string[] = [];
  let last: string | undefined;
  for (const level of sorted) {
    const die = rowAt(c.dice, level)?.die;
    const text =
      c.mode === "table"
        ? `${rowAt(c.uses, level)?.uses.trim() || "?"}${die ? ` × ${die}` : ""}`
        : die ?? "no die";
    if (text !== last) parts.push(parts.length ? `${text} at ${level}` : `${text} at level ${level}`);
    last = text;
  }
  if (c.mode === "table") return parts.join(" · ");
  const words = FORMULAS.find(([value]) => value === c.formula)?.[1] ?? "";
  const dice = c.dice.length ? `; ${parts.join(", then ")}` : "";
  return `from level ${c.level}, as many as ${words} (at least 1)${dice}`;
}

const TITLES: Record<HomebrewFormMode, string> = { new: "New subclass", copy: "Copy and edit", edit: "Edit subclass" };

function fromSubclass(s: HomebrewSubclass, name: string): Draft {
  const features = s.features.map((f, i) => ({ id: i + 1, level: f.level, name: f.name, text: f.text }));
  const prepared = Object.entries(s.always_prepared ?? {}).map(([level, spells], i) => ({
    id: features.length + i + 1,
    level: Number(level),
    spells: spells.join("\n"),
  }));
  let seq = features.length + prepared.length + 1;
  const next = () => seq++;
  const counters = (s.resources ?? []).map((r) => counterFrom(r, next));
  return {
    name,
    cls: s.character_class,
    rules: rulesPickOf(s.ruleset),
    blurb: s.blurb,
    features,
    prepared,
    counters,
    seq,
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
  checkCounters(d.counters, p);
  return p;
}

/** The server's counter rules (SubclassResource), said first by the form. */
function checkCounters(counters: CounterRow[], p: Problems) {
  if (counters.length > MAX_COUNTERS) p.counters = `At most ${MAX_COUNTERS} counters.`;
  const names = new Map<string, number>();
  for (const c of counters) {
    const key = c.name.trim().toLowerCase();
    if (key) names.set(key, (names.get(key) ?? 0) + 1);
  }
  for (const c of counters) {
    const name = c.name.trim();
    if (!name) p[`counter_${c.id}`] = "Give this counter a name.";
    else if (name.length > 80) p[`counter_${c.id}`] = "The name is too long (80 characters at most).";
    else if ((names.get(name.toLowerCase()) ?? 0) > 1) p[`counter_${c.id}`] = `Two counters are called ${name}. Give each its own name.`;
    else if (c.text.trim().length > 1000) p[`counter_${c.id}`] = "The text is too long (1000 characters at most).";
    if (c.mode === "table") {
      const levels = c.uses.map((r) => r.level);
      if (c.uses.some((r) => !/^\d+$/.test(r.uses.trim()) || Number(r.uses) < 1 || Number(r.uses) > MAX_COUNTER_USES)) {
        p[`counter_${c.id}_uses`] = `Each number of uses is a whole number from 1 to ${MAX_COUNTER_USES}.`;
      } else if (new Set(levels).size !== levels.length) {
        p[`counter_${c.id}_uses`] = "Each level can be listed once in the uses.";
      } else if (!levels.includes(c.level)) {
        p[`counter_${c.id}_uses`] = `It arrives at level ${c.level}, so its uses need a number at level ${c.level}.`;
      }
    }
    const dieLevels = c.dice.map((r) => r.level);
    if (new Set(dieLevels).size !== dieLevels.length) p[`counter_${c.id}_die`] = "Each level can be listed once in the die sizes.";
  }
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
    resources: d.counters.map((c) => ({
      name: c.name.trim(),
      level: c.level,
      recovery: c.recovery,
      uses: c.mode === "table" ? Object.fromEntries(byLevel(c.uses).map((r) => [String(r.level), Number(r.uses)])) : null,
      uses_formula: c.mode === "formula" ? c.formula : null,
      die: c.dice.length ? Object.fromEntries(byLevel(c.dice).map((r) => [String(r.level), r.die])) : null,
      text: c.text.trim(),
    })),
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
      // Wide enough for "Level 15" (104 px cut two-digit levels short on a desktop).
      style={{ width: 116, flexShrink: 0 }}
    >
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          Level {l}
        </option>
      ))}
    </select>
  );
  const firstLevel = draft.cls ? subclassLevelHint(draft.cls, rulesOfPick(draft.rules)) : null;

  /** The level a new feature or counter starts at: the class's subclass level. */
  function startLevel(): number {
    const rules = rulesOfPick(draft.rules);
    if (!draft.cls) return 3;
    return rules ? subclassLevel(draft.cls, rules) : Math.min(subclassLevel(draft.cls, "2014"), subclassLevel(draft.cls, "2024"));
  }

  function setCounter(id: number, p: Partial<CounterRow>) {
    patch({ counters: draft.counters.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  }

  /** A new arrival level carries the uses (and die) row that sat at the old one. */
  function setArrival(c: CounterRow, level: number) {
    const uses = c.uses.some((r) => r.level === level) ? c.uses : c.uses.map((r) => (r.level === c.level ? { ...r, level } : r));
    const dice = c.dice.some((r) => r.level === level) ? c.dice : c.dice.map((r) => (r.level === c.level ? { ...r, level } : r));
    setCounter(c.id, { level, uses, dice });
  }

  /** The next free level a few levels above the highest row, for a new row. */
  function nextLevel(c: CounterRow, rows: { level: number }[]): number | null {
    const used = new Set(rows.map((r) => r.level));
    const top = Math.max(c.level, ...rows.map((r) => r.level));
    for (const level of [top + 4, ...LEVELS.filter((l) => l > top), ...LEVELS]) {
      if (level >= 1 && level <= 20 && !used.has(level)) return level;
    }
    return null;
  }

  function renderCounter(c: CounterRow, i: number) {
    const label = c.name.trim() || `Counter ${i + 1}`;
    const problem = shown[`counter_${c.id}`];
    const usesProblem = shown[`counter_${c.id}_uses`];
    const dieProblem = shown[`counter_${c.id}_die`];
    const small: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--muted)", flexShrink: 0 };
    const sub: React.CSSProperties = { fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", margin: "0.6rem 0 0.3rem" };
    const lastUses = byLevel(c.uses).pop();
    const lastDie = byLevel(c.dice).pop();
    return (
      <div key={c.id} style={rowCard(problem || usesProblem || dieProblem)}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
          <input
            aria-label={`Counter ${i + 1} name`}
            value={c.name}
            maxLength={80}
            onChange={(e) => setCounter(c.id, { name: e.target.value })}
            placeholder="Name, e.g. Sheikah Dice"
            style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => patch({ counters: draft.counters.filter((x) => x.id !== c.id) })}
            aria-label={`Remove ${label}`}
            title="Remove this counter"
            style={removeBtn}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        </div>
        {problem && <p style={{ ...ERR, marginBottom: "0.4rem" }}>{problem}</p>}

        <div style={{ display: "flex", gap: "0.5rem 1rem", alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={small}>Arrives at</span>
            {levelSelect(c.level, `${label} arrives at level`, (level) => setArrival(c, level))}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <span style={small}>Refills on</span>
            <div role="radiogroup" aria-label={`${label} refills on`} style={{ display: "flex", gap: "0.4rem" }}>
              <ToggleChip on={c.recovery === "short"} onClick={() => setCounter(c.id, { recovery: "short" })} phone={phone} label="Refills on a short or long rest">
                Short rest
              </ToggleChip>
              <ToggleChip on={c.recovery === "long"} onClick={() => setCounter(c.id, { recovery: "long" })} phone={phone} label="Refills on a long rest">
                Long rest
              </ToggleChip>
            </div>
          </div>
        </div>

        <p style={sub}>Uses</p>
        <div role="radiogroup" aria-label={`${label} uses`} style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
          <ToggleChip on={c.mode === "table"} onClick={() => setCounter(c.id, { mode: "table" })} phone={phone}>
            By level
          </ToggleChip>
          <ToggleChip on={c.mode === "formula"} onClick={() => setCounter(c.id, { mode: "formula" })} phone={phone}>
            Follows the character
          </ToggleChip>
        </div>
        {c.mode === "table" ? (
          <>
            {byLevel(c.uses).map((r) => (
              <div key={r.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
                <span style={small}>From</span>
                {levelSelect(r.level, `${label} uses from level`, (level) =>
                  setCounter(c.id, { uses: c.uses.map((x) => (x.id === r.id ? { ...x, level } : x)) }),
                )}
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_COUNTER_USES}
                  aria-label={`${label} uses from level ${r.level}`}
                  value={r.uses}
                  onChange={(e) => setCounter(c.id, { uses: c.uses.map((x) => (x.id === r.id ? { ...x, uses: e.target.value } : x)) })}
                  className="num"
                  style={{ width: 72, flexShrink: 0 }}
                />
                <span style={small}>uses</span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={c.uses.length <= 1}
                  onClick={() => setCounter(c.id, { uses: c.uses.filter((x) => x.id !== r.id) })}
                  aria-label={`Remove the level ${r.level} uses`}
                  title="Remove this level"
                  style={{ ...removeBtn, marginLeft: "auto" }}
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
            ))}
            {nextLevel(c, c.uses) !== null && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: phone ? 44 : undefined }}
                onClick={() => {
                  const level = nextLevel(c, c.uses) ?? 20;
                  const more = String(Math.min(MAX_COUNTER_USES, (Number(lastUses?.uses) || 1) + 1));
                  setCounter(c.id, { uses: [...c.uses, { id: draft.seq, level, uses: more }] });
                  patch({ seq: draft.seq + 1 });
                }}
              >
                <Plus size={15} aria-hidden /> More at a higher level
              </button>
            )}
            {usesProblem && <p style={ERR}>{usesProblem}</p>}
          </>
        ) : (
          <select
            aria-label={`${label} uses follow`}
            value={c.formula}
            onChange={(e) => setCounter(c.id, { formula: e.target.value as UsesFormula })}
            style={{ maxWidth: "100%" }}
          >
            {FORMULAS.map(([value, words]) => (
              <option key={value} value={value}>
                As many as {words}
              </option>
            ))}
          </select>
        )}

        <p style={sub}>
          Die <span style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</span>
        </p>
        {byLevel(c.dice).map((r) => (
          <div key={r.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.35rem" }}>
            <span style={small}>From</span>
            {levelSelect(r.level, `${label} die from level`, (level) =>
              setCounter(c.id, { dice: c.dice.map((x) => (x.id === r.id ? { ...x, level } : x)) }),
            )}
            <select
              aria-label={`${label} die from level ${r.level}`}
              value={r.die}
              onChange={(e) => setCounter(c.id, { dice: c.dice.map((x) => (x.id === r.id ? { ...x, die: e.target.value as DieSize } : x)) })}
              style={{ width: 80, flexShrink: 0 }}
            >
              {DICE.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setCounter(c.id, { dice: c.dice.filter((x) => x.id !== r.id) })}
              aria-label={`Remove the level ${r.level} die`}
              title="Remove this die size"
              style={{ ...removeBtn, marginLeft: "auto" }}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
        {nextLevel(c, c.dice) !== null && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: phone ? 44 : undefined }}
            onClick={() => {
              const level = c.dice.length ? (nextLevel(c, c.dice) ?? 20) : c.level;
              const die = lastDie ? DICE[Math.min(DICE.length - 1, DICE.indexOf(lastDie.die) + 1)] : "d8";
              setCounter(c.id, { dice: [...c.dice, { id: draft.seq, level, die }] });
              patch({ seq: draft.seq + 1 });
            }}
          >
            <Plus size={15} aria-hidden /> {c.dice.length ? "A bigger die at a higher level" : "Add a die"}
          </button>
        )}
        {dieProblem && <p style={ERR}>{dieProblem}</p>}

        <textarea
          aria-label={`${label} text`}
          value={c.text}
          rows={2}
          maxLength={1000}
          onChange={(e) => setCounter(c.id, { text: e.target.value })}
          placeholder="What a use does, in your words (optional)"
          style={{ resize: "vertical", lineHeight: 1.5, width: "100%", marginTop: "0.6rem" }}
        />
        <p style={HINT}>On the sheet: {counterPreview(c)}</p>
      </div>
    );
  }

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
              patch({
                features: [...draft.features, { id: draft.seq, level: last ? last.level : startLevel(), name: "", text: "" }],
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

      <FormSection
        title="Counters (optional)"
        hint={
          <>
            Dice or uses a character spends and a rest refills; the sheet and the phone show each one from its level
            on. Like Superiority Dice: 4 at level 3, 5 at 7, 6 at 15; d8, then d10 at 10.
          </>
        }
      >
        {draft.counters.map((c, i) => renderCounter(c, i))}
        {draft.counters.length < MAX_COUNTERS && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ minHeight: phone ? 44 : undefined }}
            onClick={() => {
              const level = startLevel();
              patch({
                counters: [
                  ...draft.counters,
                  {
                    id: draft.seq,
                    name: "",
                    level,
                    recovery: "short",
                    mode: "table",
                    uses: [{ id: draft.seq + 1, level, uses: "2" }],
                    formula: "prof_bonus",
                    dice: [],
                    text: "",
                  },
                ],
                seq: draft.seq + 2,
              });
            }}
          >
            <Plus size={15} aria-hidden /> Add a counter
          </button>
        )}
        {shown.counters && <p style={ERR}>{shown.counters}</p>}
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
