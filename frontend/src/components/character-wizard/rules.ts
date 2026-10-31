import type {
  Ability,
  BuilderFeat,
  BuilderOptions,
  BuilderSpell,
  ChoiceKind,
  ChoiceOption,
  MasteryWeapon,
} from "../../api/characterBuilder";

/**
 * The wizard's rule math (Plan 74, Plan 126) — a mirror of the server's, so each step can
 * show what a choice gives and why a pick is locked. The server (character_builder_service +
 * feat_rules) re-checks everything on Create; this file only previews.
 */

export const ABILITIES: Ability[] = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
export const ABILITY_NAMES: Record<string, string> = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};
export const ASI = "Ability Score Improvement";
export const BOOK = "__book";

export const mod = (v: number) => Math.floor((v - 10) / 2);
export const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
export const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
export const profBonus = (level: number) => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);

/** "STR", "DEX" → "Strength or Dexterity" (plain words, Plan 122). */
export const abilityWords = (list: string[], joiner = " or ") => list.map((a) => ABILITY_NAMES[a] ?? a).join(joiner);

/** [4, 6, 8] → "4, 6 and 8". */
export function andList(items: (string | number)[]): string {
  const w = items.map(String);
  return w.length <= 1 ? w.join("") : `${w.slice(0, -1).join(", ")} and ${w[w.length - 1]}`;
}

/** A feature's plain-words note, preferring the class-specific one ("Monk: Unarmored Defense"). */
export function featureNote(opts: BuilderOptions, klass: string, name: string): string | undefined {
  return opts.feature_notes[`${klass}: ${name}`] ?? opts.feature_notes[name];
}

// ── Spells ───────────────────────────────────────────────────────────────────

export function cantripCap(opts: BuilderOptions, klass: string, level: number): number {
  const sc = opts.classes[klass]?.spellcasting;
  if (!sc?.cantrips_base) return 0;
  return sc.cantrips_base + (level >= 4 ? 1 : 0) + (level >= 10 ? 1 : 0);
}

export function spellCap(opts: BuilderOptions, klass: string, level: number): number {
  const sc = opts.classes[klass]?.spellcasting;
  return sc ? sc.prepared[Math.max(1, Math.min(20, level)) - 1] : 0;
}

/** Highest spell level castable (2024: half casters reach 2nd at 5, 3rd at 9...). */
export function maxSpellLevel(opts: BuilderOptions, klass: string, level: number): number {
  if (!opts.classes[klass]?.spellcasting) return 0;
  if (klass === "Paladin" || klass === "Ranger") return Math.min(5, Math.floor((Math.max(1, level) + 3) / 4));
  if (klass === "Warlock") return Math.min(5, Math.floor((level + 1) / 2));
  return Math.min(9, Math.floor((level + 1) / 2));
}

/** The level at which the next spell level opens, or null at the top. */
export function nextSpellLevelAt(opts: BuilderOptions, klass: string, level: number): { spellLevel: number; at: number } | null {
  const now = maxSpellLevel(opts, klass, level);
  for (let l = level + 1; l <= 20; l++) {
    const m = maxSpellLevel(opts, klass, l);
    if (m > now) return { spellLevel: m, at: l };
  }
  return null;
}

// ── Feats and Ability Score Improvements ─────────────────────────────────────

export const baseFeatName = (entry: string) => entry.split(" (")[0].trim();
const featSet = (feats: string[]) => new Set(feats.map((f) => baseFeatName(f).toLowerCase()));

export function isCaster(opts: BuilderOptions, klass: string, subclass: string | null): boolean {
  if (opts.classes[klass]?.spellcasting) return true;
  const sub = (subclass ?? "").toLowerCase();
  return opts.caster_subclasses.some((s) => sub.includes(s.toLowerCase()));
}

export function armorTraining(opts: BuilderOptions, klass: string, feats: string[]): Set<string> {
  const out = new Set(opts.classes[klass]?.armor ?? []);
  const names = featSet(feats);
  if (names.has("lightly armored")) { out.add("light"); out.add("shields"); }
  if (names.has("moderately armored")) { out.add("medium"); out.add("shields"); }
  if (names.has("heavily armored")) out.add("heavy");
  // Plan 128 — Divine Order (Protector) and Primal Order (Warden) train armor too.
  for (const key of ["divine_order", "primal_order"]) {
    for (const o of opts.choice_kinds?.[key]?.options ?? []) {
      if (o.armor && names.has(choiceEntry(opts, key, o.name).toLowerCase())) o.armor.forEach((a) => out.add(a));
    }
  }
  return out;
}

export function hasFightingStyle(opts: BuilderOptions, klass: string, level: number, feats: string[]): boolean {
  const at = opts.fighting_style_level[klass];
  if (at !== undefined && level >= at) return true;
  const styles = new Set(opts.feats.filter((f) => f.category === "fighting_style").map((f) => f.name.toLowerCase()));
  return [...featSet(feats)].some((n) => styles.has(n));
}

export interface FeatCheck { ok: boolean; reason: string | null }

/** Mirrors levelup_2024.feat_qualifies, in plain words. */
export function featQualifies(
  f: BuilderFeat,
  ctx: { scores: Record<string, number>; caster: boolean; training: Set<string>; style: boolean; feats: string[] },
): FeatCheck {
  if (!f.repeatable && featSet(ctx.feats).has(f.name.toLowerCase())) return { ok: false, reason: "You already have it." };
  const need = f.prereq.any_ability;
  if (need && !Object.entries(need).some(([a, v]) => (ctx.scores[a] ?? 0) >= v)) {
    const words = Object.entries(need).map(([a, v]) => `${ABILITY_NAMES[a] ?? a} ${v}`);
    return { ok: false, reason: `Needs ${words.join(" or ")} (you have ${Object.keys(need).map((a) => `${ABILITY_NAMES[a] ?? a} ${ctx.scores[a]}`).join(", ")}).` };
  }
  if (f.prereq.spellcasting && !ctx.caster) return { ok: false, reason: "Needs a class that casts spells." };
  if (f.prereq.armor && !ctx.training.has(f.prereq.armor)) {
    return { ok: false, reason: f.prereq.armor === "shields" ? "Needs shield training." : `Needs ${f.prereq.armor} armor training.` };
  }
  if (f.prereq.fighting_style && !ctx.style) return { ok: false, reason: "Needs the Fighting Style feature (Fighter 1, Paladin and Ranger 2)." };
  return { ok: true, reason: null };
}

export const asiAllowed = (f: BuilderFeat): string[] | null =>
  f.asi_options === "any" ? [...ABILITIES] : f.asi_options;

export interface PickState {
  name: string; // "" | feat name | BOOK
  bookName: string;
  mode: "2" | "11";
  asi: Record<string, number>;
  choice: string;
  spells: string[];
  skills: string[];
  expertise: string[];
}

export const emptyPick = (): PickState => ({ name: "", bookName: "", mode: "2", asi: {}, choice: "", spells: [], skills: [], expertise: [] });

export interface FeatRow { feat: BuilderFeat; check: FeatCheck; popular: boolean }

export interface LevelContext {
  level: number;
  scores: Record<string, number>; // before this pick
  feats: string[];
  saves: string[];
  skills: Record<string, number>;
  rows: FeatRow[];
  problem: string | null;
}

export interface Walk {
  contexts: LevelContext[];
  scores: Record<string, number>;
  feats: string[];
  saves: string[];
  skills: Record<string, number>;
  featSpells: string[];
  summary: string[];
  problem: string | null; // first problem across levels
}

/** Pool of spells a feat's spell pick may take. */
export function featSpellPool(opts: BuilderOptions, spec: BuilderFeat["spell_picks"][number], choice: string) {
  return opts.spells.filter(
    (s) => s.level === spec.level && (!spec.schools || spec.schools.includes(s.school)) && (!spec.list_from_choice || s.classes.includes(choice)),
  );
}

/**
 * Walk the improvement levels in order, the way the server does: each pick sees the scores,
 * feats, saves and skills the build has at that level, then changes them.
 */
export function walkImprovements(
  opts: BuilderOptions,
  klass: string,
  levels: number[],
  subclass: string | null,
  start: { scores: Record<string, number>; feats: string[]; saves: string[]; skills: Record<string, number> },
  picks: Record<number, PickState>,
): Walk {
  const scores = { ...start.scores };
  const feats = [...start.feats];
  const saves = [...start.saves];
  const skills = { ...start.skills };
  const featSpells: string[] = [];
  const summary: string[] = [];
  const contexts: LevelContext[] = [];
  const popular = opts.popular_feats[klass] ?? [];
  const caster = isCaster(opts, klass, subclass);
  let first: string | null = null;

  for (const level of levels) {
    const ctx = { scores: { ...scores }, caster, training: armorTraining(opts, klass, feats), style: hasFightingStyle(opts, klass, level, feats), feats: [...feats] };
    const rows: FeatRow[] = opts.feats.map((f) => ({ feat: f, check: featQualifies(f, ctx), popular: popular.includes(f.name) }));
    const context: LevelContext = { level, scores: { ...scores }, feats: [...feats], saves: [...saves], skills: { ...skills }, rows, problem: null };
    contexts.push(context);
    const p = picks[level] ?? emptyPick();
    const fail = (msg: string) => { context.problem = msg; if (!first) first = `Level ${level}: ${msg}`; };
    const spent = Object.values(p.asi).reduce((a, b) => a + b, 0);
    const capHit = Object.entries(p.asi).find(([a, v]) => v && scores[a] + v > 20);

    if (!p.name) { fail("choose +2/+1 or a feat."); continue; }
    if (p.name === BOOK) {
      if (!p.bookName.trim()) { fail("type the feat's name."); continue; }
      if (spent > 1) { fail("a feat from your book gives at most +1."); continue; }
      if (capHit) { fail(`${ABILITY_NAMES[capHit[0]]} is ${scores[capHit[0]]}, and 20 is the most.`); continue; }
      for (const [a, v] of Object.entries(p.asi)) scores[a] += v;
      feats.push(p.bookName.trim());
      summary.push(`Level ${level}: ${p.bookName.trim()} (from your book)`);
      continue;
    }
    const row = rows.find((r) => r.feat.name === p.name);
    if (!row) { fail("pick a feat from the list."); continue; }
    if (!row.check.ok) { fail(`${row.feat.name}: ${row.check.reason}`); continue; }
    const f = row.feat;
    const allowed = asiAllowed(f);
    if (f.name === ASI && spent !== 2) { fail(p.mode === "2" ? "pick the ability that gets +2." : "pick two abilities for +1 each."); continue; }
    if (f.name !== ASI && allowed && spent !== 1) { fail(`pick the ability ${f.name} raises by 1.`); continue; }
    if (capHit) { fail(`${ABILITY_NAMES[capHit[0]]} is ${scores[capHit[0]]}, and 20 is the most.`); continue; }
    if (f.choice && !p.choice) { fail(`pick a ${f.choice.label.toLowerCase()} for ${f.name}.`); continue; }
    if (f.save_prof) {
      const a = Object.keys(p.asi).find((k) => p.asi[k]);
      if (a && saves.includes(a)) { fail(`you already have ${ABILITY_NAMES[a]} saves: pick another ability.`); continue; }
    }
    const total = f.spell_picks.reduce((n, s) => n + s.count, 0);
    if (total && p.spells.length < total && f.spell_picks.some((s) => featSpellPool(opts, s, p.choice).length > 0)) {
      fail(`pick ${total - p.spells.length} more spell${total - p.spells.length > 1 ? "s" : ""} for ${f.name}.`); continue;
    }
    if (f.skill_pick && p.skills.length < f.skill_pick.count) {
      fail(`pick ${f.skill_pick.count - p.skills.length} more skill${f.skill_pick.count - p.skills.length > 1 ? "s" : ""} for ${f.name}.`); continue;
    }
    const clash = f.skill_pick && p.skills.find((s) => (skills[s] ?? 0) >= (f.skill_pick!.upgrade ? 2 : 1));
    if (clash) { fail(`you already have ${clash}: pick another skill.`); continue; }
    if (f.expertise_pick && p.expertise.length < f.expertise_pick) { fail(`pick a skill for expertise.`); continue; }

    for (const [a, v] of Object.entries(p.asi)) scores[a] += v;
    const label = f.choice ? `${f.name} (${p.choice})` : f.name;
    if (f.name !== ASI) feats.push(label);
    if (f.save_prof) { const a = Object.keys(p.asi).find((k) => p.asi[k]); if (a) saves.push(a); }
    for (const s of p.skills) skills[s] = (skills[s] ?? 0) >= 1 ? 2 : 1;
    for (const s of p.expertise) skills[s] = 2;
    featSpells.push(...f.fixed_spells, ...p.spells);
    const gained = Object.entries(p.asi).filter(([, v]) => v).map(([a, v]) => `+${v} ${ABILITY_NAMES[a]}`).join(", ");
    summary.push(`Level ${level}: ${label}${gained ? ` (${gained})` : ""}`);
  }
  return { contexts, scores, feats, saves, skills, featSpells, summary, problem: first };
}

// ── The derived sheet ────────────────────────────────────────────────────────

export interface Derived {
  hp: number;
  hpLines: string[];
  ac: number;
  acHow: string;
  pb: number;
  saves: { ability: string; bonus: number; prof: boolean }[];
  skills: { name: string; bonus: number; rank: number }[];
  passivePerception: number;
  initiative: number;
  slots: string | null;
  warnings: string[];
}

export function armorClass(
  opts: BuilderOptions,
  klass: string,
  scores: Record<string, number>,
  kit: { armor: string | null; shield: boolean } | undefined,
  feats: string[],
  subclass: string | null,
): { ac: number; how: string; warning: string | null } {
  const dex = mod(scores.DEX);
  const names = featSet(feats);
  let ac: number;
  let how: string;
  let warning: string | null = null;
  const armor = kit?.armor && opts.armor[kit.armor] ? opts.armor[kit.armor] : null;
  if (armor && kit?.armor) {
    let cap = armor.dex_cap;
    if (armor.category === "medium" && names.has("medium armor master")) cap = 3;
    const dexPart = cap === null ? dex : Math.min(dex, cap);
    ac = armor.base + dexPart;
    how = `${kit.armor} ${armor.base}` + (cap === 0 ? "" : ` + Dexterity ${fmt(dexPart)}${cap !== null && dex > cap ? ` (at most ${cap})` : ""}`);
    const defense = opts.feats.filter((f) => f.ac_bonus_in_armor && names.has(f.name.toLowerCase()));
    for (const f of defense) { ac += f.ac_bonus_in_armor; how += ` + ${f.name} ${f.ac_bonus_in_armor}`; }
    if (armor.str_min && scores.STR < armor.str_min) warning = `${kit.armor} wants Strength ${armor.str_min} (you have ${scores.STR}): your speed drops by 10 ft. until then.`;
  } else {
    ac = 10 + dex;
    how = `No armor: 10 + Dexterity ${fmt(dex)}`;
    if (klass === "Barbarian") { ac += mod(scores.CON); how += ` + Constitution ${fmt(mod(scores.CON))} (Unarmored Defense)`; }
    else if (klass === "Monk" && !kit?.shield) { ac += mod(scores.WIS); how += ` + Wisdom ${fmt(mod(scores.WIS))} (Unarmored Defense)`; }
    const extra = subclass ? opts.unarmored_ac_subclass[subclass] : undefined;
    if (extra && 10 + dex + mod(scores[extra]) > ac) {
      ac = 10 + dex + mod(scores[extra]);
      how = `No armor: 10 + Dexterity ${fmt(dex)} + ${ABILITY_NAMES[extra]} ${fmt(mod(scores[extra]))} (${subclass})`;
    }
  }
  if (kit?.shield) { ac += 2; how += " + shield 2"; }
  return { ac, how: `${how} = ${ac}`, warning };
}

/** The trait or feature behind a per-level hit point bonus, by species or subclass. */
const TRAIT_NAMES: Record<string, string> = {
  Dwarf: "Dwarven Toughness",
  "Draconic Sorcery": "Draconic Resilience",
  "Draconic Bloodline": "Draconic Resilience",
};

export function derive(args: {
  opts: BuilderOptions;
  klass: string;
  level: number;
  species: string;
  subclass: string | null; // active (at or above its level)
  scores: Record<string, number>;
  feats: string[];
  saves: string[];
  skills: Record<string, number>;
  kit: { armor: string | null; shield: boolean } | undefined;
  speed: number;
}): Derived {
  const { opts, klass, level, species, subclass, scores, feats, saves, skills, kit } = args;
  const cls = opts.classes[klass];
  const con = mod(scores.CON);
  const die = cls.hit_die;
  const first = Math.max(1, die + con);
  const later = Math.max(1, Math.floor(die / 2) + 1 + con);
  const hpLines = [`Level 1: d${die} at its most (${die}) + Constitution ${fmt(con)} = ${first}`];
  let hp = first;
  if (level > 1) {
    hp += later * (level - 1);
    hpLines.push(`Level${level > 2 ? `s 2–${level}` : " 2"}: ${level - 1} × (${Math.floor(die / 2) + 1} + Constitution ${fmt(con)}) = ${later * (level - 1)}`);
  }
  const names = featSet(feats);
  const extras: [string, number][] = [];
  for (const [sp, n] of Object.entries(opts.hp_per_level_species)) if (species.toLowerCase().startsWith(sp.toLowerCase())) extras.push([TRAIT_NAMES[sp] ?? `${sp} trait`, n]);
  for (const f of opts.feats) if (f.hp_per_level && names.has(f.name.toLowerCase())) extras.push([f.name, f.hp_per_level]);
  for (const [sc, n] of Object.entries(opts.hp_per_level_subclass)) if (subclass && subclass.toLowerCase().includes(sc.toLowerCase())) extras.push([TRAIT_NAMES[sc] ?? sc, n]);
  for (const [label, n] of extras) { hp += n * level; hpLines.push(`${label}: +${n} × ${level} levels = ${n * level}`); }
  hp = Math.max(1, hp);

  const { ac, how, warning } = armorClass(opts, klass, scores, kit, feats, subclass);
  const pb = profBonus(level);
  const saveRows = Object.keys(ABILITY_NAMES).map((a) => ({ ability: a, prof: saves.includes(a), bonus: mod(scores[a]) + (saves.includes(a) ? pb : 0) }));
  const skillRows = Object.entries(opts.skills).map(([name, a]) => {
    const rank = skills[name] ?? 0;
    return { name, rank, bonus: mod(scores[a]) + pb * rank };
  });
  const perception = skillRows.find((s) => s.name === "Perception");
  const raw = opts.spell_slots[klass]?.[level - 1] ?? {};
  let slots: string | null = null;
  if ("pact" in raw) slots = `${raw.pact} Pact Magic slot${raw.pact > 1 ? "s" : ""} of ${ordinal(raw.level)} level (back on a Short Rest)`;
  else if (Object.keys(raw).length) slots = Object.entries(raw).map(([l, n]) => `${ordinal(Number(l))}: ${n}`).join(" · ");
  return {
    hp,
    hpLines,
    ac,
    acHow: how,
    pb,
    saves: saveRows,
    skills: skillRows,
    passivePerception: 10 + (perception?.bonus ?? mod(scores.WIS)),
    initiative: mod(scores.DEX) + (names.has("alert") ? pb : 0),
    slots,
    warnings: warning ? [warning] : [],
  };
}

// ── Plan 128: the class's own choices ────────────────────────────────────────
// Mirrors levelup_2024.class_choice_counts and feat_rules.apply_class_choices.

/** Value from a [from level, value] table: the last row at or below `level`. */
export function stepAt<T>(level: number, table: [number, T][] | undefined): T | undefined {
  let out: T | undefined;
  for (const [at, v] of table ?? []) if (level >= at) out = v;
  return out;
}

/** How many picks each class choice has at `level` (a subclass's table adds to its class's). */
export function choiceCounts(opts: BuilderOptions, klass: string, level: number, subclass: string | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const table of [opts.class_choices?.[klass] ?? {}, subclass ? opts.subclass_choices?.[subclass] ?? {} : {}]) {
    for (const [key, steps] of Object.entries(table)) {
      const n = stepAt(level, steps) ?? 0;
      if (n) out[key] = (out[key] ?? 0) + n;
    }
  }
  return out;
}

/** How a class choice is written in `feats`: "Divine Order: Protector". */
export function choiceEntry(opts: BuilderOptions, key: string, name: string): string {
  const k = opts.choice_kinds?.[key];
  return `${k?.record ?? k?.label ?? key}: ${name}`;
}

/** The listed options of a choice (Fighting Style: the catalog's style feats plus class extras). */
export function choiceOptions(opts: BuilderOptions, klass: string, key: string): ChoiceOption[] {
  const k = opts.choice_kinds?.[key];
  if (!k) return [];
  if (k.kind === "feat") {
    return [
      ...opts.feats.filter((f) => f.category === "fighting_style").map((f) => ({ name: f.name, blurb: f.blurb, srd: f.srd })),
      ...(opts.fighting_style_extras?.[klass] ?? []),
    ];
  }
  return k.options ?? [];
}

/** Weapons this class may name for Weapon Mastery. */
export function masteryWeaponOk(opts: BuilderOptions, klass: string, w: MasteryWeapon): boolean {
  const rule = opts.weapon_mastery_filter?.[klass];
  const cat = w.category.toLowerCase();
  if (rule === "melee") return cat.endsWith("melee");
  if (rule === "finesse_or_light") return cat.startsWith("simple") || w.properties.some((p) => ["finesse", "light"].includes(p.toLowerCase()));
  return true;
}

export interface ChoiceState { picks: string[]; book: string[] }
export type ChoicePicks = Record<string, ChoiceState>;
export const emptyChoice = (): ChoiceState => ({ picks: [], book: [] });

export interface ChoiceSection {
  key: string;
  spec: ChoiceKind;
  count: number;
  state: ChoiceState;
  /** The skills it could pick from, as the build stands (expertise: trained ones). */
  skillPool: string[];
  problem: string | null;
}

export interface ChoiceWalk {
  sections: ChoiceSection[];
  feats: string[];
  skills: Record<string, number>;
  extraCantrips: number;
  cantripLists: string[];
  land: string | null;
  summary: string[];
  /** Invocations that need a damaging (or attack) cantrip: checked on the Spells step. */
  needsCantrip: { name: string; want: "damage" | "attack" }[];
  problem: string | null;
}

const KIND_ORDER: Record<string, number> = { skill: 0, expertise: 1, feat: 2, option: 3, weapon: 4 };
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function missingLine(kind: string, n: number, count: number): string {
  if (count === 1 && n === 1) return "choose one.";
  if (kind === "weapon") return `choose ${plural(n, "more kind")} of weapon.`;
  if (kind === "expertise") return `choose ${plural(n, "more skill")} you're trained in.`;
  if (kind === "skill") return `choose ${plural(n, "more skill")}.`;
  return `choose ${n} more.`;
}

/**
 * Walk the class choices the way the server does: new skills first, then Expertise, then the
 * Fighting Style, the listed options and the weapon kinds. Returns what they add to the sheet,
 * and the first thing still to do.
 */
export function walkClassChoices(
  opts: BuilderOptions,
  klass: string,
  level: number,
  subclass: string | null,
  start: { feats: string[]; skills: Record<string, number> },
  picks: ChoicePicks,
): ChoiceWalk {
  const counts = choiceCounts(opts, klass, level, subclass);
  const feats = [...start.feats];
  const skills = { ...start.skills };
  const summary: string[] = [];
  const needsCantrip: ChoiceWalk["needsCantrip"] = [];
  let extraCantrips = 0;
  const cantripLists: string[] = [];
  let land: string | null = null;
  let first: string | null = null;
  const keys = Object.keys(counts).sort(
    (a, b) => (KIND_ORDER[opts.choice_kinds[a]?.kind] ?? 9) - (KIND_ORDER[opts.choice_kinds[b]?.kind] ?? 9),
  );
  const sections: ChoiceSection[] = [];
  for (const key of keys) {
    const spec = opts.choice_kinds[key];
    const count = counts[key];
    const state = picks[key] ?? emptyChoice();
    const listed = state.picks;
    const book = spec.book ? state.book.map((b) => b.trim()).filter(Boolean) : [];
    const classSkills = opts.classes[klass]?.skills.from ?? [];
    const pool = spec.pool === "class" ? classSkills : spec.pool ?? Object.keys(opts.skills);
    const skillPool = spec.kind === "expertise"
      ? pool.filter((s) => (skills[s] ?? 0) === 1 || listed.includes(s))
      : pool.filter((s) => !(skills[s] ?? 0) || listed.includes(s));
    const section: ChoiceSection = { key, spec, count, state, skillPool, problem: null };
    sections.push(section);
    const fail = (msg: string) => { section.problem = msg; if (!first) first = `${spec.label}: ${msg}`; };
    const total = listed.length + book.length;
    if (total < count) fail(missingLine(spec.kind, count - total, count));
    else if (total > count) fail(`a level ${level} ${klass} chooses ${count}. Take ${total - count} off.`);

    if (spec.kind === "skill" || spec.kind === "expertise") {
      for (const s of listed) {
        const have = skills[s] ?? 0;
        if (spec.kind === "expertise") {
          if (have < 1) { fail(`you're not trained in ${s} now: pick another skill.`); continue; }
          skills[s] = 2;
        } else {
          if (have >= 1) { fail(`you're already trained in ${s}: pick another skill.`); continue; }
          skills[s] = 1;
        }
      }
      if (listed.length) summary.push(`${spec.label}: ${listed.join(", ")}`);
      continue;
    }
    if (spec.kind === "weapon") {
      for (const n of listed) feats.push(choiceEntry(opts, key, n));
      if (listed.length) summary.push(`${spec.label}: ${listed.join(", ")}`);
      continue;
    }
    const options = choiceOptions(opts, klass, key);
    for (const n of listed) {
      const o = options.find((x) => x.name === n);
      if (!o) continue;
      if (o.level && level < o.level) fail(`${n} needs Warlock level ${o.level}.`);
      if (o.requires && !listed.includes(o.requires)) fail(`${n} needs ${o.requires}.`);
      if (o.cantrip) needsCantrip.push({ name: n, want: o.cantrip });
      if (o.cantrips) {
        extraCantrips += o.cantrips.count;
        if (!cantripLists.includes(o.cantrips.list)) cantripLists.push(o.cantrips.list);
      }
      if (key === "land") land = n;
      feats.push(spec.kind === "feat" && !o.cantrips ? n : choiceEntry(opts, key, n));
    }
    for (const b of book) feats.push(spec.kind === "feat" ? b : choiceEntry(opts, key, b));
    if (listed.length || book.length) summary.push(`${spec.label}: ${[...listed, ...book].join(", ")}`);
  }
  return { sections, feats, skills, extraCantrips, cantripLists, land, summary, needsCantrip, problem: first };
}

// ── Plan 128: spells ─────────────────────────────────────────────────────────

export interface AlwaysSpell { name: string; source: string }

/** Spells always prepared at `level` (free, off the count): class, subclass and Circle land. */
export function alwaysPrepared(opts: BuilderOptions, klass: string, level: number, subclass: string | null, land: string | null): AlwaysSpell[] {
  const out: AlwaysSpell[] = [];
  const seen = new Set<string>();
  const add = (names: string[], source: string) => names.forEach((n) => { if (!seen.has(n.toLowerCase())) { seen.add(n.toLowerCase()); out.push({ name: n, source }); } });
  const byLevel = (t: Record<string, string[]> | undefined) => Object.entries(t ?? {}).map(([l, n]) => [Number(l), n] as const).sort((a, b) => a[0] - b[0]);
  for (const [at, names] of byLevel(opts.always_prepared_class?.[klass])) {
    if (level >= at) add(names, opts.always_prepared_source?.[`${klass}:${at}`] ?? opts.always_prepared_source?.[klass] ?? klass);
  }
  if (subclass) for (const [at, names] of byLevel(opts.always_prepared_subclass?.[subclass])) if (level >= at) add(names, subclass);
  if (subclass === "Circle of the Land" && land) for (const [at, names] of byLevel(opts.land_spells?.[land])) if (level >= at) add(names, `Circle of the Land (${land})`);
  return out;
}

export function extraSpellLists(opts: BuilderOptions, klass: string, level: number): string[] {
  const out: string[] = [];
  for (const [at, lists] of Object.entries(opts.extra_spell_lists?.[klass] ?? {})) if (level >= Number(at)) lists.forEach((l) => { if (!out.includes(l)) out.push(l); });
  return out;
}

export interface SpellPlan {
  caster: boolean;
  always: AlwaysSpell[];
  alwaysSet: Set<string>;
  cantripCap: number;
  spellCap: number;
  maxLevel: number;
  cantripLists: string[];
  spellLists: string[];
  cantripPool: BuilderSpell[];
  spellPool: BuilderSpell[];
  /** What must be picked: the cap, or every spell the catalog has if fewer. */
  needCantrips: number;
  needSpells: number;
}

export function spellPlan(opts: BuilderOptions, klass: string, level: number, subclass: string | null, choices: ChoiceWalk | null): SpellPlan {
  const always = alwaysPrepared(opts, klass, level, subclass, choices?.land ?? null);
  const alwaysSet = new Set(always.map((a) => a.name.toLowerCase()));
  const sc = opts.classes[klass]?.spellcasting;
  const extra = choices?.extraCantrips ?? 0;
  const caster = !!sc || extra > 0;
  const cantripCapN = (sc ? cantripCap(opts, klass, level) : 0) + extra;
  const spellCapN = sc ? spellCap(opts, klass, level) : 0;
  const maxLevel = sc ? maxSpellLevel(opts, klass, level) : 0;
  const cantripLists = [...new Set([klass, ...(choices?.cantripLists ?? [])])];
  const spellLists = [klass, ...extraSpellLists(opts, klass, level)];
  const onList = (s: BuilderSpell, lists: string[]) => s.classes.some((c) => lists.includes(c));
  const cantripPool = cantripCapN ? opts.spells.filter((s) => s.level === 0 && onList(s, cantripLists) && !alwaysSet.has(s.name.toLowerCase())) : [];
  const spellPool = spellCapN ? opts.spells.filter((s) => s.level >= 1 && s.level <= maxLevel && onList(s, spellLists) && !alwaysSet.has(s.name.toLowerCase())) : [];
  return {
    caster, always, alwaysSet, cantripCap: cantripCapN, spellCap: spellCapN, maxLevel, cantripLists, spellLists, cantripPool, spellPool,
    needCantrips: Math.min(cantripCapN, cantripPool.length), needSpells: Math.min(spellCapN, spellPool.length),
  };
}

// ── Plan 128: Origin feats with their own picks ──────────────────────────────

export const MAGIC_INITIATE = "Magic Initiate";
export interface OriginPickState { choice: string; spells: string[]; skills: string[] }
export const emptyOrigin = (): OriginPickState => ({ choice: "", spells: [], skills: [] });

/** "Magic Initiate (Cleric)" → { feat: "Magic Initiate", list: "Cleric" }. */
export function splitFeat(entry: string): { feat: string; list: string | null } {
  const feat = entry.split(" (")[0];
  const m = /\(([^)]+)\)/.exec(entry);
  return { feat, list: m ? m[1] : null };
}

export interface MiNeed {
  source: "background" | "species";
  /** Where it comes from, in words: "Acolyte" or "Versatile". */
  from: string;
  list: string;
  /** The background names the list; a Human's Versatile feat picks it. */
  fixed: boolean;
  state: OriginPickState;
  cantrips: BuilderSpell[];
  firsts: BuilderSpell[];
  needCantrips: number;
  needFirsts: number;
  problem: string | null;
}

/** Magic Initiate's picks: two cantrips and one level 1 spell from its list. */
export function miNeed(opts: BuilderOptions, source: MiNeed["source"], from: string, fixedList: string | null, state: OriginPickState, otherList: string | null): MiNeed {
  const list = fixedList ?? state.choice;
  const cantrips = list ? opts.spells.filter((s) => s.level === 0 && s.classes.includes(list)) : [];
  const firsts = list ? opts.spells.filter((s) => s.level === 1 && s.classes.includes(list)) : [];
  const needCantrips = Math.min(2, cantrips.length);
  const needFirsts = Math.min(1, firsts.length);
  const pickedC = state.spells.filter((n) => cantrips.some((s) => s.name === n)).length;
  const pickedF = state.spells.filter((n) => firsts.some((s) => s.name === n)).length;
  let problem: string | null = null;
  if (!list) problem = "Magic Initiate: pick its spell list.";
  else if (!fixedList && otherList && list === otherList) problem = `Magic Initiate: your background already uses the ${list} list. Pick another.`;
  else if (pickedC < needCantrips) problem = `Magic Initiate: pick ${plural(needCantrips - pickedC, "more cantrip")} from the ${list} list.`;
  else if (pickedF < needFirsts) problem = `Magic Initiate: pick a level 1 spell from the ${list} list.`;
  return { source, from, list: list ?? "", fixed: !!fixedList, state, cantrips, firsts, needCantrips, needFirsts, problem };
}

/** What each weapon mastery property does, in a line (our words). */
export const MASTERY_NOTES: Record<string, string> = {
  Cleave: "Once a turn, a melee hit lets you swing at a second creature next to the first.",
  Graze: "A miss still deals damage equal to your ability modifier.",
  Nick: "The extra attack from a light weapon is part of your Attack action, not your bonus action.",
  Push: "A hit can push a Large or smaller creature 10 ft. away.",
  Sap: "The creature you hit has disadvantage on its next attack.",
  Slow: "A hit cuts the creature's speed by 10 ft. until your next turn.",
  Topple: "A hit can knock the creature prone (it makes a Constitution save).",
  Vex: "A hit gives you advantage on your next attack against that creature.",
};

/** A spell's opening lines for the picker: whole sentences up to ~160 characters, else cut at a word. */
export function spellSummary(text: string | undefined, limit = 160): string {
  const flat = (text ?? "").split("\n")[0].replace(/\s+/g, " ").trim();
  let out = "";
  for (const sentence of flat.match(/[^.!?]+[.!?]*\s*/g) ?? []) {
    if (out.length + sentence.length > limit) break;
    out += sentence;
  }
  out = out.trim();
  if (out.length < 40) out = flat.length <= limit ? flat : `${flat.slice(0, limit - 1).replace(/\s+\S*$/, "")}…`;
  return out;
}
