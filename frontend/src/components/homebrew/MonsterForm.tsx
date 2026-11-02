import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";

import type { Monster, MonsterAbility } from "../../api/types";
import { monstersApi, type MonsterInput } from "../../api/monsters";
import { DICE_RE } from "../../lib/homebrew";
import { useIsCompact } from "../../hooks/useIsCompact";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import PhoneSheet from "../PhoneSheet";

/**
 * MonsterForm (Plan 132) — a DM's own monster: a blank "New monster", a "Copy and
 * edit" of any stat block (saved as a new homebrew row; the original never changes),
 * or an edit of their own homebrew.
 *
 * It writes the exact JSON the SRD rows use, so the stat block, the encounter
 * builder, combat and the arena read homebrew the same way. Traits and actions are
 * `{name, desc}` rows; an attack row's text opens with the SRD's own line,
 * "+4 to hit, 1d6+2 slashing", which is what the arena reads to roll it.
 *
 * Checks mirror the server's (domain/monster.py): required fields, lengths, CR from
 * VALID_CRS, scores 1–30, dice like "4d8+4". CR fills in XP and the proficiency
 * bonus; the HP average follows the hit dice until the DM types their own.
 *
 * Phones: a PhoneSheet with the save bar pinned to its bottom. Desktop: a dialog.
 */

export type MonsterFormMode = "new" | "copy" | "edit";

interface Props {
  mode: MonsterFormMode;
  /** The stat block to copy, or the DM's own one to edit. Ignored for "new". */
  source?: Monster | null;
  onClose: () => void;
  onSaved: (monster: Monster) => void;
}

// ── Rules tables (mirroring the server) ────────────────────────────────────────

const SIZES = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"];

const CREATURE_TYPES = [
  "Aberration",
  "Beast",
  "Celestial",
  "Construct",
  "Dragon",
  "Elemental",
  "Fey",
  "Fiend",
  "Giant",
  "Humanoid",
  "Monstrosity",
  "Ooze",
  "Plant",
  "Undead",
];

/** domain/monster.py VALID_CRS, with the XP of integrations/dnd_rules/encounter_math.py CR_TO_XP. */
const CR_XP: Record<string, number> = {
  "0": 10,
  "1/8": 25,
  "1/4": 50,
  "1/2": 100,
  "1": 200,
  "2": 450,
  "3": 700,
  "4": 1100,
  "5": 1800,
  "6": 2300,
  "7": 2900,
  "8": 3900,
  "9": 5000,
  "10": 5900,
  "11": 7200,
  "12": 8400,
  "13": 10000,
  "14": 11500,
  "15": 13000,
  "16": 15000,
  "17": 18000,
  "18": 20000,
  "19": 22000,
  "20": 25000,
  "21": 33000,
  "22": 41000,
  "23": 50000,
  "24": 62000,
  "25": 75000,
  "26": 90000,
  "27": 105000,
  "28": 120000,
  "29": 135000,
  "30": 155000,
};
const CRS = Object.keys(CR_XP);

/** domain/enums.py DamageType. */
const DAMAGE_TYPES = [
  "Acid",
  "Bludgeoning",
  "Cold",
  "Fire",
  "Force",
  "Lightning",
  "Necrotic",
  "Piercing",
  "Poison",
  "Psychic",
  "Radiant",
  "Slashing",
  "Thunder",
];

const CONDITIONS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
];

type Ability = "str" | "dex" | "con" | "int" | "wis" | "cha";
const ABILITIES: Array<{ key: Ability; short: string; name: string }> = [
  { key: "str", short: "STR", name: "Strength" },
  { key: "dex", short: "DEX", name: "Dexterity" },
  { key: "con", short: "CON", name: "Constitution" },
  { key: "int", short: "INT", name: "Intelligence" },
  { key: "wis", short: "WIS", name: "Wisdom" },
  { key: "cha", short: "CHA", name: "Charisma" },
];

const SKILLS: Record<string, Ability> = {
  acrobatics: "dex",
  "animal handling": "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  "sleight of hand": "dex",
  stealth: "dex",
  survival: "wis",
};

const SPEEDS = ["walk", "fly", "swim", "climb", "burrow"] as const;
type SpeedKey = (typeof SPEEDS)[number];
const SENSES = ["darkvision", "blindsight", "tremorsense", "truesight"] as const;
type SenseKey = (typeof SENSES)[number];

type SectionKey =
  | "traits"
  | "actions"
  | "bonus_actions"
  | "reactions"
  | "legendary_actions"
  | "lair_actions";

const SECTIONS: Array<{ key: SectionKey; title: string; one: string; hint: string; attack: boolean }> = [
  {
    key: "traits",
    title: "Traits",
    one: "trait",
    hint: "Always on, like Amphibious or Pack Tactics.",
    attack: false,
  },
  {
    key: "actions",
    title: "Actions",
    one: "action",
    hint: 'What it does on its turn. For several attacks, add one named "Multiattack" that says how many ("Two claw attacks.").',
    attack: true,
  },
  { key: "bonus_actions", title: "Bonus actions", one: "bonus action", hint: "", attack: true },
  { key: "reactions", title: "Reactions", one: "reaction", hint: "", attack: true },
  {
    key: "legendary_actions",
    title: "Legendary actions",
    one: "legendary action",
    hint: 'Taken at the end of another creature\'s turn. Put a cost in the name: "Wing Attack (Costs 2 Actions)".',
    attack: true,
  },
  {
    key: "lair_actions",
    title: "Lair actions",
    one: "lair action",
    hint: "What the lair does on initiative count 20.",
    attack: false,
  },
];

// ── Small helpers ──────────────────────────────────────────────────────────────

function crNumber(cr: string): number {
  if (cr.includes("/")) {
    const [a, b] = cr.split("/").map(Number);
    return b ? a / b : 0;
  }
  return Number(cr) || 0;
}

/** Proficiency bonus by CR: +2 up to CR 4, then +1 every four CRs. */
function pbForCr(cr: string): number {
  const n = crNumber(cr);
  if (n < 5) return 2;
  return Math.min(9, 2 + Math.floor((n - 1) / 4));
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/** "4", "+4", "-1" → the number; anything else → null. */
function int(s: string): number | null {
  const t = s.replace(/\s+/g, "");
  return /^[+-]?\d{1,6}$/.test(t) ? parseInt(t, 10) : null;
}

/** Average of "NdM+K", rounded down as the stat blocks do; null when not dice. */
function averageHp(formula: string): number | null {
  if (!DICE_RE.test(formula)) return null;
  const m = /(\d+)d(\d+)\s*(?:([+-])\s*(\d+))?/i.exec(formula);
  if (!m) return null;
  const bonus = m[3] ? (m[3] === "-" ? -1 : 1) * Number(m[4]) : 0;
  return Math.max(1, Math.floor((Number(m[1]) * (Number(m[2]) + 1)) / 2) + bonus);
}

let nextId = 1;
function newId(): number {
  return nextId++;
}

// ── Ability rows (traits, actions…) ────────────────────────────────────────────

interface Row {
  id: number;
  name: string;
  /** The text; for an attack, whatever follows the damage. */
  desc: string;
  attack: boolean;
  toHit: string;
  dice: string;
  /** Lower-case, as the SRD lines write it ("slashing"). */
  dtype: string;
  /** The punctuation an SRD line had between its damage and the rest; "" for new rows. */
  sep: string;
}

/** The SRD's attack line: "+4 to hit, 1d6+2 slashing" and whatever follows. */
const ATTACK_LINE = /^\s*([+-]\s*\d{1,2}) to hit, (\d{1,2}d\d{1,3}(?:\s*[+-]\s*\d{1,3})?) ([A-Za-z]+)\b([\s\S]*)$/;

function blankRow(attack: boolean): Row {
  return { id: newId(), name: "", desc: "", attack, toHit: "", dice: "", dtype: "slashing", sep: "" };
}

function parseRow(a: MonsterAbility, attackable: boolean): Row {
  const row: Row = { ...blankRow(false), name: a.name ?? "", desc: a.desc ?? "" };
  if (!attackable) return row;
  const m = ATTACK_LINE.exec(a.desc ?? "");
  if (!m || !DAMAGE_TYPES.some((d) => d.toLowerCase() === m[3].toLowerCase())) return row;
  const rest = m[4];
  // What joins the damage to the rest ("; ", " damage. "), kept so the line round-trips.
  const sep = /^(?:\s+damage\b)?[\s;,.]*/i.exec(rest)?.[0] ?? "";
  return {
    ...row,
    attack: true,
    toHit: m[1].replace(/\s+/g, ""),
    dice: m[2].replace(/\s+/g, ""),
    dtype: m[3].toLowerCase(),
    desc: rest.slice(sep.length),
    sep,
  };
}

function rowIsEmpty(r: Row): boolean {
  return !r.name.trim() && !r.desc.trim() && (!r.attack || (!r.toHit.trim() && !r.dice.trim()));
}

/** The row as the stat block stores it: `{name, desc}`, attack line first. */
function rowToAbility(r: Row): MonsterAbility {
  const name = r.name.trim();
  const extra = r.desc.trim();
  if (!r.attack) return { name, desc: extra };
  const head = `${signed(int(r.toHit) ?? 0)} to hit, ${r.dice.replace(/\s+/g, "")} ${r.dtype}`;
  if (!extra) {
    // Keep an SRD line's closing " damage." but never a dangling "; ".
    const close = (/damage/i.test(r.sep) ? " damage" : "") + (r.sep.includes(".") ? "." : "");
    return { name, desc: head + close };
  }
  // A new row: "plus 2d6 fire" runs on; a sentence ("DC 13 …") follows "damage." so the
  // arena still reads the damage type (it wants a bare word after the dice).
  if (r.sep) return { name, desc: `${head}${r.sep}${extra}` };
  if (/^(plus|or|and)\b|^[(+]/i.test(extra)) return { name, desc: `${head} ${extra}` };
  return { name, desc: `${head} damage. ${extra.charAt(0).toUpperCase()}${extra.slice(1)}` };
}

function rowError(r: Row): string | null {
  if (!r.name.trim()) return "Give it a name.";
  if (r.attack) {
    const hit = int(r.toHit);
    if (hit === null || hit < -5 || hit > 30) return 'To hit is a number, like "+5".';
    if (!DICE_RE.test(r.dice)) return 'Damage is dice, like "1d6+2".';
  } else if (!r.desc.trim()) {
    return "Say what it does.";
  }
  return null;
}

// ── The form's state ───────────────────────────────────────────────────────────

interface SkillRow {
  id: number;
  skill: string;
  bonus: string;
}

interface FormState {
  name: string;
  size: string;
  creature_type: string;
  alignment: string;
  challenge_rating: string;
  xp: string;
  proficiency_bonus: string;
  ac: string;
  ac_notes: string;
  hp_formula: string;
  hp_average: string;
  /** The DM typed their own average; stop following the dice. */
  hpTouched: boolean;
  speed: Record<SpeedKey, string>;
  /** Speed keys the form has no field for, kept as they were. */
  speedExtra: Record<string, number>;
  scores: Record<Ability, string>;
  saves: Record<Ability, string>;
  skills: SkillRow[];
  damage_resistances: string[];
  damage_immunities: string[];
  condition_immunities: string[];
  senses: Record<SenseKey, string>;
  passive: string;
  /** Sense keys the form has no field for, kept as they were. */
  sensesExtra: Record<string, number | string>;
  languages: string;
  rows: Record<SectionKey, Row[]>;
}

const emptyAbilities = (v: string): Record<Ability, string> => ({
  str: v,
  dex: v,
  con: v,
  int: v,
  wis: v,
  cha: v,
});

function blankForm(): FormState {
  return {
    name: "",
    size: "Medium",
    creature_type: "Humanoid",
    alignment: "",
    challenge_rating: "1",
    xp: String(CR_XP["1"]),
    proficiency_bonus: "2",
    ac: "",
    ac_notes: "",
    hp_formula: "",
    hp_average: "",
    hpTouched: false,
    speed: { walk: "30", fly: "", swim: "", climb: "", burrow: "" },
    speedExtra: {},
    scores: emptyAbilities("10"),
    saves: emptyAbilities(""),
    skills: [],
    damage_resistances: [],
    damage_immunities: [],
    condition_immunities: [],
    senses: { darkvision: "", blindsight: "", tremorsense: "", truesight: "" },
    passive: "",
    sensesExtra: {},
    languages: "",
    rows: {
      traits: [],
      actions: [blankRow(true)],
      bonus_actions: [],
      reactions: [],
      legendary_actions: [],
      lair_actions: [],
    },
  };
}

function fromMonster(m: Monster, mode: MonsterFormMode): FormState {
  const speed: Record<SpeedKey, string> = { walk: "", fly: "", swim: "", climb: "", burrow: "" };
  const speedExtra: Record<string, number> = {};
  for (const [k, v] of Object.entries(m.speed ?? {})) {
    if ((SPEEDS as readonly string[]).includes(k)) speed[k as SpeedKey] = String(v);
    else speedExtra[k] = v;
  }
  const senses: Record<SenseKey, string> = { darkvision: "", blindsight: "", tremorsense: "", truesight: "" };
  const sensesExtra: Record<string, number | string> = {};
  let passive = "";
  for (const [k, v] of Object.entries(m.senses ?? {})) {
    if (k === "passive_perception") passive = String(v);
    else if ((SENSES as readonly string[]).includes(k) && typeof v === "number") senses[k as SenseKey] = String(v);
    else sensesExtra[k] = v;
  }
  const saves = emptyAbilities("");
  for (const [k, v] of Object.entries(m.saving_throws ?? {})) {
    const key = k.toLowerCase().slice(0, 3) as Ability;
    if (key in saves) saves[key] = String(v);
  }
  const rows = {} as Record<SectionKey, Row[]>;
  for (const s of SECTIONS) rows[s.key] = (m[s.key] ?? []).map((a) => parseRow(a, s.attack));
  const name = mode === "copy" ? `${m.name} (copy)`.slice(0, 200) : m.name;
  return {
    name,
    size: m.size,
    creature_type: m.creature_type,
    alignment: m.alignment ?? "",
    challenge_rating: m.challenge_rating,
    xp: String(m.xp),
    proficiency_bonus: String(m.proficiency_bonus),
    ac: String(m.ac),
    ac_notes: m.ac_notes ?? "",
    hp_formula: m.hp_formula,
    hp_average: String(m.hp_average),
    hpTouched: averageHp(m.hp_formula) !== m.hp_average,
    speed,
    speedExtra,
    scores: {
      str: String(m.score_str),
      dex: String(m.score_dex),
      con: String(m.score_con),
      int: String(m.score_int),
      wis: String(m.score_wis),
      cha: String(m.score_cha),
    },
    saves,
    skills: Object.entries(m.skills ?? {}).map(([k, v]) => ({
      id: newId(),
      skill: k.toLowerCase().replace(/_/g, " "),
      bonus: String(v),
    })),
    damage_resistances: [...(m.damage_resistances ?? [])],
    damage_immunities: [...(m.damage_immunities ?? [])],
    condition_immunities: [...(m.condition_immunities ?? [])],
    senses,
    passive,
    sensesExtra,
    languages: m.languages ?? "",
    rows,
  };
}

function scoreOf(f: FormState, a: Ability): number {
  const n = int(f.scores[a]);
  return n === null ? 10 : n;
}

function pbOf(f: FormState): number {
  return int(f.proficiency_bonus) ?? pbForCr(f.challenge_rating);
}

/** 10 + Perception: the skill's bonus when it has one, else the Wisdom modifier. */
function autoPassive(f: FormState): number {
  const perception = f.skills.find((s) => s.skill === "perception");
  const bonus = perception ? int(perception.bonus) : null;
  return 10 + (bonus ?? mod(scoreOf(f, "wis")));
}

type Errors = Record<string, string>;

function validate(f: FormState): Errors {
  const e: Errors = {};
  if (!f.name.trim()) e.name = "Give your monster a name.";
  else if (f.name.trim().length > 200) e.name = "Keep the name to 200 characters.";
  if (f.alignment.length > 100) e.alignment = "Keep the alignment to 100 characters.";
  if (!CRS.includes(f.challenge_rating)) e.challenge_rating = "Pick a challenge rating.";
  const xp = int(f.xp);
  if (xp === null || xp < 0) e.xp = "XP is 0 or more.";
  const pb = int(f.proficiency_bonus);
  if (pb === null || pb < 2 || pb > 9) e.proficiency_bonus = "From +2 to +9.";
  const ac = int(f.ac);
  if (ac === null || ac < 1 || ac > 30) e.ac = "Armor Class is a number from 1 to 30.";
  if (f.ac_notes.length > 200) e.ac_notes = "Keep it to 200 characters.";
  if (!f.hp_formula.trim()) e.hp_formula = 'Hit dice are required, like "4d8+4".';
  else if (!DICE_RE.test(f.hp_formula) || f.hp_formula.length > 50)
    e.hp_formula = 'Hit dice look like "4d8+4".';
  const hp = int(f.hp_average);
  if (hp === null || hp < 1) e.hp_average = "Hit points are 1 or more.";
  for (const k of SPEEDS) {
    const raw = f.speed[k].trim();
    const n = int(raw);
    if (raw && (n === null || n < 0 || n > 1000)) e[`speed_${k}`] = "Feet, like 30.";
  }
  for (const a of ABILITIES) {
    const n = int(f.scores[a.key]);
    if (n === null || n < 1 || n > 30) e[`score_${a.key}`] = "1 to 30.";
    const raw = f.saves[a.key].trim();
    const s = int(raw);
    if (raw && (s === null || s < -10 || s > 30)) e[`save_${a.key}`] = 'Like "+4".';
  }
  for (const s of f.skills) {
    const n = int(s.bonus);
    if (n === null || n < -10 || n > 30) e[`skill_${s.id}`] = 'A bonus, like "+4".';
  }
  for (const k of SENSES) {
    const raw = f.senses[k].trim();
    const n = int(raw);
    if (raw && (n === null || n < 0 || n > 10000)) e[`sense_${k}`] = "Feet, like 60.";
  }
  if (f.passive.trim()) {
    const n = int(f.passive);
    if (n === null || n < 0 || n > 50) e.passive = "A number, like 12.";
  }
  if (f.languages.length > 500) e.languages = "Keep it to 500 characters.";
  for (const s of SECTIONS) {
    for (const r of f.rows[s.key]) {
      if (rowIsEmpty(r)) continue;
      const msg = rowError(r);
      if (msg) e[`row_${r.id}`] = msg;
    }
  }
  return e;
}

function toPayload(f: FormState, mode: MonsterFormMode, source: Monster | null | undefined): MonsterInput {
  const speed: Record<string, number> = { walk: int(f.speed.walk) ?? 0 };
  for (const k of SPEEDS) {
    if (k === "walk") continue;
    const n = int(f.speed[k]);
    if (n && n > 0) speed[k] = n;
  }
  for (const [k, v] of Object.entries(f.speedExtra)) if (!(k in speed)) speed[k] = v;

  const saves: Record<string, number> = {};
  for (const a of ABILITIES) {
    const n = int(f.saves[a.key]);
    if (f.saves[a.key].trim() && n !== null) saves[a.key] = n;
  }
  const skills: Record<string, number> = {};
  for (const s of f.skills) {
    const n = int(s.bonus);
    if (n !== null) skills[s.skill] = n;
  }
  const senses: Record<string, number | string> = {};
  for (const k of SENSES) {
    const n = int(f.senses[k]);
    if (n && n > 0) senses[k] = n;
  }
  for (const [k, v] of Object.entries(f.sensesExtra)) if (!(k in senses)) senses[k] = v;
  senses.passive_perception = int(f.passive) ?? autoPassive(f);

  const list = (key: SectionKey): MonsterAbility[] | null => {
    const out = f.rows[key].filter((r) => !rowIsEmpty(r)).map(rowToAbility);
    return out.length ? out : null;
  };

  const payload: MonsterInput = {
    name: f.name.trim(),
    source: "Homebrew",
    size: f.size,
    creature_type: f.creature_type,
    alignment: f.alignment.trim() || null,
    ac: int(f.ac) ?? 10,
    ac_notes: f.ac_notes.trim() || null,
    hp_average: int(f.hp_average) ?? 1,
    hp_formula: f.hp_formula.replace(/\s+/g, ""),
    speed,
    score_str: scoreOf(f, "str"),
    score_dex: scoreOf(f, "dex"),
    score_con: scoreOf(f, "con"),
    score_int: scoreOf(f, "int"),
    score_wis: scoreOf(f, "wis"),
    score_cha: scoreOf(f, "cha"),
    saving_throws: Object.keys(saves).length ? saves : null,
    skills: Object.keys(skills).length ? skills : null,
    damage_resistances: f.damage_resistances,
    damage_immunities: f.damage_immunities,
    condition_immunities: f.condition_immunities.length ? f.condition_immunities : null,
    senses,
    languages: f.languages.trim() || null,
    challenge_rating: f.challenge_rating,
    xp: int(f.xp) ?? 0,
    proficiency_bonus: int(f.proficiency_bonus) ?? 2,
    traits: list("traits"),
    actions: list("actions"),
    bonus_actions: list("bonus_actions"),
    reactions: list("reactions"),
    legendary_actions: list("legendary_actions"),
    lair_actions: list("lair_actions"),
  };
  // A copy keeps the original's art, so it looks the same on the table.
  if (mode === "copy" && source) {
    payload.image_url = source.image_url;
    payload.model_url = source.model_url;
  }
  return payload;
}

// ── The component ──────────────────────────────────────────────────────────────

export default function MonsterForm({ mode, source, onClose, onSaved }: Props) {
  const phone = useIsCompact(640);
  const [form, setForm] = useState<FormState>(() =>
    mode !== "new" && source ? fromMonster(source, mode) : blankForm(),
  );
  const [dirty, setDirty] = useState(false);
  const [tried, setTried] = useState(false);

  const save = useMutation({
    mutationFn: (payload: MonsterInput) =>
      mode === "edit" && source ? monstersApi.save(source.id, payload) : monstersApi.create(payload),
    onSuccess: (m) => onSaved(m),
  });

  const errors = validate(form);
  const shown: Errors = tried ? errors : {};
  const errorCount = Object.keys(errors).length;

  function update(fn: (f: FormState) => FormState) {
    setForm(fn);
    setDirty(true);
  }

  function requestClose() {
    if (save.isPending) return;
    if (!dirty || window.confirm("Close without saving? Your changes will be lost.")) onClose();
  }

  function submit() {
    setTried(true);
    if (errorCount > 0) return;
    save.mutate(toPayload(form, mode, source));
  }

  const pb = pbOf(form);
  const autoHp = averageHp(form.hp_formula);
  const cols = (n: number): React.CSSProperties => ({
    display: "grid",
    gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`,
    gap: "0 0.75rem",
  });

  const title =
    mode === "edit" && source
      ? `Edit ${source.name}`
      : mode === "copy" && source
        ? `Copy of ${source.name}`
        : "New monster";

  const body = (
    <div className="ql-tap">
      <p className="text-sm" style={{ color: "var(--muted)", marginTop: 0, marginBottom: "1rem" }}>
        {mode === "copy"
          ? "Saving makes a new monster of your own. The original stays as it is."
          : "Your own monster: only you see it, in 2014 and 2024 campaigns alike."}
      </p>

      {/* ── Basics ── */}
      <SectionHead title="Basics" />
      <Field id="mf-name" label="Name" required error={shown.name}>
        <input
          id="mf-name"
          className="story"
          value={form.name}
          maxLength={200}
          data-autofocus={mode !== "edit" ? true : undefined}
          onFocus={(e) => mode === "copy" && e.currentTarget.select()}
          onChange={(e) => update((f) => ({ ...f, name: e.target.value }))}
          placeholder="e.g. Bog Hag"
          style={{ fontSize: "1.1rem", fontWeight: 700 }}
        />
      </Field>
      <div style={cols(2)}>
        <Field id="mf-size" label="Size">
          <select id="mf-size" value={form.size} onChange={(e) => update((f) => ({ ...f, size: e.target.value }))}>
            {SIZES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </Field>
        <Field id="mf-type" label="Type">
          <select
            id="mf-type"
            value={form.creature_type}
            onChange={(e) => update((f) => ({ ...f, creature_type: e.target.value }))}
          >
            {CREATURE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field id="mf-alignment" label="Alignment" error={shown.alignment}>
        <input
          id="mf-alignment"
          value={form.alignment}
          maxLength={100}
          onChange={(e) => update((f) => ({ ...f, alignment: e.target.value }))}
          placeholder="e.g. neutral evil"
        />
      </Field>
      <div style={cols(3)}>
        <Field id="mf-cr" label="Challenge" hint="Sets XP and bonus" error={shown.challenge_rating}>
          <select
            id="mf-cr"
            value={form.challenge_rating}
            onChange={(e) => {
              const cr = e.target.value;
              update((f) => ({
                ...f,
                challenge_rating: cr,
                xp: String(CR_XP[cr] ?? 0),
                proficiency_bonus: String(pbForCr(cr)),
              }));
            }}
          >
            {CRS.map((c) => (
              <option key={c} value={c}>
                CR {c}
              </option>
            ))}
          </select>
        </Field>
        <Field id="mf-xp" label="XP" error={shown.xp}>
          <input
            id="mf-xp"
            inputMode="numeric"
            value={form.xp}
            onChange={(e) => update((f) => ({ ...f, xp: e.target.value }))}
          />
        </Field>
        <Field id="mf-pb" label="Prof. bonus" title="Proficiency bonus" error={shown.proficiency_bonus}>
          <input
            id="mf-pb"
            inputMode="numeric"
            value={form.proficiency_bonus}
            onChange={(e) => update((f) => ({ ...f, proficiency_bonus: e.target.value }))}
          />
        </Field>
      </div>

      {/* ── Defenses ── */}
      <SectionHead title="Defenses" />
      <div style={{ ...cols(2), gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)" }}>
        <Field id="mf-ac" label="Armor Class" required error={shown.ac}>
          <input
            id="mf-ac"
            inputMode="numeric"
            value={form.ac}
            onChange={(e) => update((f) => ({ ...f, ac: e.target.value }))}
            placeholder="e.g. 13"
          />
        </Field>
        <Field id="mf-ac-notes" label="Armor notes" error={shown.ac_notes}>
          <input
            id="mf-ac-notes"
            value={form.ac_notes}
            maxLength={200}
            onChange={(e) => update((f) => ({ ...f, ac_notes: e.target.value }))}
            placeholder="e.g. natural armor"
          />
        </Field>
      </div>
      <div style={cols(2)}>
        <Field id="mf-hp-formula" label="Hit dice" required error={shown.hp_formula}>
          <input
            id="mf-hp-formula"
            value={form.hp_formula}
            maxLength={50}
            onChange={(e) => {
              const formula = e.target.value;
              update((f) => {
                const avg = averageHp(formula);
                return {
                  ...f,
                  hp_formula: formula,
                  hp_average: !f.hpTouched && avg !== null ? String(avg) : f.hp_average,
                };
              });
            }}
            placeholder="e.g. 4d8+4"
          />
        </Field>
        <Field
          id="mf-hp"
          label="Hit points"
          hint={form.hpTouched ? "Your number" : "The dice's average"}
          required
          error={shown.hp_average}
        >
          <input
            id="mf-hp"
            inputMode="numeric"
            value={form.hp_average}
            onChange={(e) => update((f) => ({ ...f, hp_average: e.target.value, hpTouched: true }))}
          />
        </Field>
      </div>
      {form.hpTouched && autoHp !== null && String(autoHp) !== form.hp_average.trim() && (
        <p className="text-sm" style={{ marginTop: "-0.5rem", marginBottom: "1rem", color: "var(--muted)" }}>
          The dice average {autoHp}.{" "}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: "0.2rem 0.6rem", fontSize: "0.8125rem" }}
            onClick={() => update((f) => ({ ...f, hp_average: String(autoHp), hpTouched: false }))}
          >
            Use {autoHp}
          </button>
        </p>
      )}
      <FieldLabel>Speed (feet)</FieldLabel>
      <div style={cols(phone ? 3 : 5)}>
        {SPEEDS.map((k) => (
          <Field key={k} id={`mf-speed-${k}`} label={cap(k)} small error={shown[`speed_${k}`]}>
            <input
              id={`mf-speed-${k}`}
              inputMode="numeric"
              value={form.speed[k]}
              onChange={(e) => update((f) => ({ ...f, speed: { ...f.speed, [k]: e.target.value } }))}
              placeholder={k === "walk" ? "30" : "—"}
            />
          </Field>
        ))}
      </div>

      {/* ── Ability scores ── */}
      <SectionHead title="Ability scores" />
      <div style={cols(phone ? 3 : 6)}>
        {ABILITIES.map((a) => {
          const n = int(form.scores[a.key]);
          return (
            <Field
              key={a.key}
              id={`mf-score-${a.key}`}
              label={a.short}
              title={a.name}
              small
              hint={n !== null && n >= 1 && n <= 30 ? `mod ${signed(mod(n))}` : undefined}
              error={shown[`score_${a.key}`]}
            >
              <input
                id={`mf-score-${a.key}`}
                inputMode="numeric"
                value={form.scores[a.key]}
                onChange={(e) => update((f) => ({ ...f, scores: { ...f.scores, [a.key]: e.target.value } }))}
                style={{ textAlign: "center" }}
              />
            </Field>
          );
        })}
      </div>

      {/* ── Proficiencies and senses ── */}
      <SectionHead title="Proficiencies and senses" />
      <FieldLabel>Saving throws</FieldLabel>
      <p className="text-sm" style={{ color: "var(--muted)", margin: "0 0 0.5rem" }}>
        Only the saves it's good at. The grey number is its modifier plus its proficiency bonus ({signed(pb)}).
      </p>
      <div style={cols(phone ? 3 : 6)}>
        {ABILITIES.map((a) => (
          <Field key={a.key} id={`mf-save-${a.key}`} label={a.short} title={`${a.name} save`} small error={shown[`save_${a.key}`]}>
            <input
              id={`mf-save-${a.key}`}
              value={form.saves[a.key]}
              onChange={(e) => update((f) => ({ ...f, saves: { ...f.saves, [a.key]: e.target.value } }))}
              placeholder={signed(mod(scoreOf(form, a.key)) + pb)}
              style={{ textAlign: "center" }}
            />
          </Field>
        ))}
      </div>

      <FieldLabel>Skills</FieldLabel>
      {form.skills.map((s) => {
        const options = s.skill in SKILLS ? Object.keys(SKILLS) : [s.skill, ...Object.keys(SKILLS)];
        return (
          <div key={s.id} style={{ marginBottom: "0.5rem" }}>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <select
                aria-label="Skill"
                value={s.skill}
                onChange={(e) => {
                  const skill = e.target.value;
                  update((f) => ({
                    ...f,
                    skills: f.skills.map((x) =>
                      x.id === s.id ? { ...x, skill, bonus: skillBonus(f, skill) } : x,
                    ),
                  }));
                }}
                style={{ flex: 2, minWidth: 0 }}
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {cap(o)}
                  </option>
                ))}
              </select>
              <input
                aria-label={`${cap(s.skill)} bonus`}
                value={s.bonus}
                onChange={(e) =>
                  update((f) => ({
                    ...f,
                    skills: f.skills.map((x) => (x.id === s.id ? { ...x, bonus: e.target.value } : x)),
                  }))
                }
                style={{ flex: 1, minWidth: 0, textAlign: "center" }}
              />
              <RemoveButton
                label={`Remove ${cap(s.skill)}`}
                onClick={() => update((f) => ({ ...f, skills: f.skills.filter((x) => x.id !== s.id) }))}
              />
            </div>
            {shown[`skill_${s.id}`] && <FieldError>{shown[`skill_${s.id}`]}</FieldError>}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginBottom: "1rem" }}
        onClick={() =>
          update((f) => {
            const used = new Set(f.skills.map((s) => s.skill));
            const skill = Object.keys(SKILLS).find((k) => !used.has(k)) ?? "perception";
            return { ...f, skills: [...f.skills, { id: newId(), skill, bonus: skillBonus(f, skill) }] };
          })
        }
      >
        <Plus size={16} aria-hidden /> Add a skill
      </button>

      <ChipPicker
        id="mf-resist"
        label="Damage resistances"
        hint="Takes half damage"
        options={DAMAGE_TYPES}
        value={form.damage_resistances}
        onChange={(v) => update((f) => ({ ...f, damage_resistances: v }))}
      />
      <ChipPicker
        id="mf-immune"
        label="Damage immunities"
        hint="Takes no damage"
        options={DAMAGE_TYPES}
        value={form.damage_immunities}
        onChange={(v) => update((f) => ({ ...f, damage_immunities: v }))}
      />
      <ChipPicker
        id="mf-cond"
        label="Condition immunities"
        options={CONDITIONS}
        value={form.condition_immunities}
        onChange={(v) => update((f) => ({ ...f, condition_immunities: v }))}
      />

      <FieldLabel>Senses (feet)</FieldLabel>
      <div style={cols(phone ? 2 : 5)}>
        {SENSES.map((k) => (
          <Field key={k} id={`mf-sense-${k}`} label={cap(k)} small error={shown[`sense_${k}`]}>
            <input
              id={`mf-sense-${k}`}
              inputMode="numeric"
              value={form.senses[k]}
              onChange={(e) => update((f) => ({ ...f, senses: { ...f.senses, [k]: e.target.value } }))}
              placeholder="—"
            />
          </Field>
        ))}
        <Field id="mf-passive" label="Passive Perception" small error={shown.passive}>
          <input
            id="mf-passive"
            inputMode="numeric"
            value={form.passive}
            onChange={(e) => update((f) => ({ ...f, passive: e.target.value }))}
            placeholder={String(autoPassive(form))}
          />
        </Field>
      </div>
      <Field id="mf-languages" label="Languages" error={shown.languages}>
        <input
          id="mf-languages"
          value={form.languages}
          maxLength={500}
          onChange={(e) => update((f) => ({ ...f, languages: e.target.value }))}
          placeholder="e.g. Common, Sylvan (blank for none)"
        />
      </Field>

      {/* ── Traits and actions ── */}
      {SECTIONS.map((s) => (
        <AbilityRows
          key={s.key}
          title={s.title}
          one={s.one}
          hint={s.hint}
          attackable={s.attack}
          rows={form.rows[s.key]}
          errors={shown}
          onChange={(rows) => update((f) => ({ ...f, rows: { ...f.rows, [s.key]: rows } }))}
        />
      ))}
    </div>
  );

  const footer = (
    <>
      {tried && errorCount > 0 && (
        <p role="alert" style={{ color: "var(--danger-text)", fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
          {errorCount === 1 ? "One thing needs a fix" : `${errorCount} things need a fix`}: see the red notes above.
        </p>
      )}
      {save.isError && (
        <p role="alert" style={{ color: "var(--danger-text)", fontSize: "0.875rem", margin: "0 0 0.5rem" }}>
          {(save.error as Error)?.message || "That didn't save. Try again."}
        </p>
      )}
      <div className="ql-tap" style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={requestClose} disabled={save.isPending}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={submit}
          disabled={save.isPending}
          style={phone ? { flex: 1 } : undefined}
        >
          {save.isPending ? "Saving…" : mode === "edit" ? "Save changes" : "Save as my monster"}
        </button>
      </div>
    </>
  );

  if (phone) {
    return (
      <PhoneSheet title={title} onClose={requestClose}>
        {body}
        <div
          style={{
            position: "sticky",
            bottom: "-1rem",
            margin: "1rem -1rem -1rem",
            padding: "0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            zIndex: 1,
          }}
        >
          {footer}
        </div>
      </PhoneSheet>
    );
  }

  return (
    <DesktopDialog title={title} onClose={requestClose} footer={footer}>
      {body}
    </DesktopDialog>
  );
}

/** A proficient skill's bonus, "+4": the ability modifier plus the proficiency bonus. */
function skillBonus(f: FormState, skill: string): string {
  const ability = SKILLS[skill] ?? "wis";
  return signed(mod(scoreOf(f, ability)) + pbOf(f));
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Pieces ─────────────────────────────────────────────────────────────────────

function DesktopDialog({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box, { onEscape: onClose });
  // No close on a backdrop click: a long form shouldn't vanish on a stray click.
  return createPortal(
    <div style={overlayStyle}>
      <div ref={box} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} className="fade-in" style={boxStyle}>
        <header style={headerStyle}>
          <h2 data-dialog-title tabIndex={-1} className="story" style={{ margin: 0, fontSize: "1.35rem", minWidth: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{ width: 36, height: 36, minHeight: 0, padding: 0, flexShrink: 0 }}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>{children}</div>
        <footer style={footerStyle}>{footer}</footer>
      </div>
    </div>,
    document.body,
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ margin: "1.25rem 0 0.6rem" }}>
      <h3
        style={{
          color: "var(--text)",
          fontSize: "1.05rem",
          fontWeight: 600,
          borderBottom: "1px solid var(--accent-line)",
          paddingBottom: "0.25rem",
          margin: 0,
        }}
      >
        {title}
      </h3>
      {hint && (
        <p className="text-sm" style={{ color: "var(--muted)", margin: "0.35rem 0 0" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text2)", margin: "0 0 0.35rem" }}>{children}</p>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <small style={{ display: "block", color: "var(--danger-text)", fontSize: "0.8125rem", marginTop: "0.2rem" }}>{children}</small>;
}

function Field({
  id,
  label,
  title,
  hint,
  error,
  required,
  small,
  children,
}: {
  id: string;
  label: string;
  title?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="form-group" style={small ? { marginBottom: "0.75rem" } : undefined}>
      <label htmlFor={id} title={title} style={small ? { fontSize: "0.8125rem" } : undefined}>
        {label}
        {required && <span style={{ color: "var(--muted)" }}> *</span>}
      </label>
      {children}
      {error ? (
        <FieldError>{error}</FieldError>
      ) : hint ? (
        <small style={{ display: "block", color: "var(--muted)", fontSize: "0.8125rem", marginTop: "0.2rem" }}>{hint}</small>
      ) : null}
    </div>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{ minWidth: 44, padding: "0.45rem", flexShrink: 0 }}
    >
      <Trash2 size={16} aria-hidden />
    </button>
  );
}

/** Pick from a list; the picks show as chips with a remove button each. */
function ChipPicker({
  id,
  label,
  hint,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const left = options.filter((o) => !value.includes(o));
  return (
    <div className="form-group">
      <label htmlFor={id}>
        {label}
        {hint && <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {hint}</span>}
      </label>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.4rem" }}>
          {value.map((v) => (
            <button
              key={v}
              type="button"
              className="btn btn-ghost"
              onClick={() => onChange(value.filter((x) => x !== v))}
              aria-label={`Remove ${v}`}
              title={`Remove ${v}`}
              style={{
                padding: "0.25rem 0.6rem",
                fontSize: "0.875rem",
                background: "var(--accent-soft)",
                color: "var(--accent-text)",
                borderColor: "var(--accent-line)",
              }}
            >
              {v} <X size={14} aria-hidden />
            </button>
          ))}
        </div>
      )}
      {left.length > 0 && (
        <select
          id={id}
          value=""
          onChange={(e) => e.target.value && onChange([...value, e.target.value])}
        >
          <option value="">{value.length ? "Add another…" : "None. Add one…"}</option>
          {left.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function AbilityRows({
  title,
  one,
  hint,
  attackable,
  rows,
  errors,
  onChange,
}: {
  title: string;
  one: string;
  hint: string;
  attackable: boolean;
  rows: Row[];
  errors: Errors;
  onChange: (rows: Row[]) => void;
}) {
  const set = (id: number, patch: Partial<Row>) => onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <>
      <SectionHead title={title} hint={hint || undefined} />
      {rows.map((r, i) => {
        const err = errors[`row_${r.id}`];
        const preview = r.attack && !rowError(r) ? rowToAbility(r).desc : null;
        return (
          <div
            key={r.id}
            style={{
              border: `1px solid ${err ? "var(--danger-line)" : "var(--border)"}`,
              borderRadius: 10,
              padding: "0.75rem",
              marginBottom: "0.75rem",
              background: "var(--surface2)",
            }}
          >
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.5rem" }}>
              <input
                aria-label={`${cap(one)} ${i + 1} name`}
                value={r.name}
                maxLength={120}
                onChange={(e) => set(r.id, { name: e.target.value })}
                placeholder={attackable ? "Name, e.g. Claw" : "Name, e.g. Pack Tactics"}
                style={{ fontWeight: 600, flex: 1, minWidth: 0 }}
              />
              <RemoveButton label={`Remove ${r.name.trim() || `this ${one}`}`} onClick={() => onChange(rows.filter((x) => x.id !== r.id))} />
            </div>
            {attackable && (
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 44, margin: 0, cursor: "pointer" }}>
                <input type="checkbox" checked={r.attack} onChange={(e) => set(r.id, { attack: e.target.checked })} />
                It's an attack (to hit and damage)
              </label>
            )}
            {r.attack && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1fr) minmax(0, 1.3fr)",
                  gap: "0 0.5rem",
                  marginTop: "0.25rem",
                }}
              >
                <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                  <label htmlFor={`mf-hit-${r.id}`} style={{ fontSize: "0.8125rem" }}>
                    To hit
                  </label>
                  <input
                    id={`mf-hit-${r.id}`}
                    value={r.toHit}
                    onChange={(e) => set(r.id, { toHit: e.target.value })}
                    placeholder="+4"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                  <label htmlFor={`mf-dice-${r.id}`} style={{ fontSize: "0.8125rem" }}>
                    Damage
                  </label>
                  <input
                    id={`mf-dice-${r.id}`}
                    value={r.dice}
                    onChange={(e) => set(r.id, { dice: e.target.value })}
                    placeholder="1d6+2"
                  />
                </div>
                <div className="form-group" style={{ marginBottom: "0.5rem" }}>
                  <label htmlFor={`mf-dtype-${r.id}`} style={{ fontSize: "0.8125rem" }}>
                    Type
                  </label>
                  <select id={`mf-dtype-${r.id}`} value={r.dtype} onChange={(e) => set(r.id, { dtype: e.target.value })}>
                    {DAMAGE_TYPES.map((d) => (
                      <option key={d} value={d.toLowerCase()}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            <textarea
              aria-label={r.attack ? `${cap(one)} ${i + 1}: anything after the damage` : `${cap(one)} ${i + 1}: what it does`}
              value={r.desc}
              maxLength={2000}
              rows={r.attack ? 2 : 3}
              onChange={(e) => set(r.id, { desc: e.target.value })}
              placeholder={
                r.attack
                  ? 'Anything else (optional), e.g. "plus 2d6 fire" or "DC 13 Strength save or knocked prone."'
                  : "What it does, in your words."
              }
              style={{ resize: "vertical" }}
            />
            {preview && (
              <small style={{ display: "block", color: "var(--muted)", fontSize: "0.8125rem", marginTop: "0.35rem" }}>
                Reads: <em>{preview}</em>
              </small>
            )}
            {err && <FieldError>{err}</FieldError>}
          </div>
        );
      })}
      <button
        type="button"
        className="btn btn-ghost"
        style={{ marginBottom: "0.5rem" }}
        onClick={() => onChange([...rows, blankRow(attackable && one === "action")])}
      >
        <Plus size={16} aria-hidden /> Add {/^[aeiou]/.test(one) ? "an" : "a"} {one}
      </button>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  background: "rgba(5, 8, 7, 0.8)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2rem 1rem",
  overflowY: "auto",
};

const boxStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 12,
  maxWidth: 760,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100dvh - 4rem)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "0.85rem 1.25rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "0.75rem",
};

const footerStyle: React.CSSProperties = {
  padding: "0.7rem 1.25rem",
  borderTop: "1px solid var(--border)",
  background: "var(--surface)",
};
