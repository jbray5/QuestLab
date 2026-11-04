import type { BuilderOptions, BuilderSpellcasting } from "../../api/characterBuilder";
import HomebrewChip from "../HomebrewChip";
import { ABILITY_NAMES, abilityWords, andList, cantripCap, featureNote, fmt, homebrewSubclass, maxSpellLevel, ordinal, choiceCounts, spellCap, spellbookSize, stepAt, subclassFeatureNote } from "./rules";

/**
 * Plan 133 — the mark on the campaign DM's own race or subclass: "Yours" for the DM building,
 * "Your table's" for a player on the join link.
 */
export function HomebrewTag({ dm }: { dm: boolean }) {
  if (dm) return <HomebrewChip title="Your homebrew: only your campaigns see it" />;
  return (
    <span className="pill pill-teal" title="Your DM made this for your table" style={{ fontSize: "0.75rem" }}>
      Your table&rsquo;s
    </span>
  );
}

/**
 * Plan 131 — how a 2014 class gets its leveled spells, in words: "4 known", "Wisdom modifier +
 * level prepared", or a Wizard's spellbook. Null when the class uses the 2024 prepared table.
 */
function spells2014(opts: Opts, klass: string, level: number, sc: BuilderSpellcasting): string | null {
  if (sc.prepared) return null;
  const first = sc.first_level ?? 1;
  if (level < first) return `none yet: a ${klass}'s spells start at level ${first}`;
  const ability = ABILITY_NAMES[sc.ability];
  const top = `up to ${ordinal(Math.max(1, maxSpellLevel(opts, klass, level)))} level`;
  if (sc.kind === "known") return `${spellCap(opts, klass, level)} known, ${top}`;
  const half = sc.prepared_formula === "half_level";
  const prep = `${ability} modifier + ${half ? `half your level (${Math.floor(level / 2)})` : `your level (${level})`} prepared each day, at least 1`;
  if (sc.spellbook) return `a spellbook of ${spellbookSize(opts, klass, level)} spells, ${top}; ${prep}`;
  return `${prep}, ${top}`;
}

/**
 * "What does this give me?" panels for the wizard (Plan 126, DESIGN.md §0): plain words next
 * to the choice they explain, worked out for the level being built.
 */

const ASI = "Ability Score Improvement";
const SUB_MARK = "Subclass feature";

type Opts = BuilderOptions;

/** A species' traits; a trait that arrives later ("(level 5)") says so when the build is below it. */
export function SpeciesTraits({ row, level }: { row: Opts["species"][number]; level: number }) {
  return (
    <ul className="traits">
      {row.traits.map((t) => {
        const m = /\(level (\d+)\)/.exec(t);
        const later = m && level < Number(m[1]);
        return (
          <li key={t} className={later ? "later" : undefined}>
            {t}{later ? ` Comes at level ${m![1]}.` : ""}
          </li>
        );
      })}
    </ul>
  );
}

/** The class at the chosen level: hit points, saves, training, spells, and every feature so far. */
export function ClassExplainer({ opts, klass, level, subclass }: { opts: Opts; klass: string; level: number; subclass: string | null }) {
  const cls = opts.classes[klass];
  if (!cls) return null;
  const table = opts.class_features[klass] ?? {};
  const subTable = subclass ? opts.subclass_features[subclass] : undefined;
  // Plan 133 — the DM's own subclass: its features are all here, so no "read it in your book".
  const own = homebrewSubclass(opts, klass, subclass);
  const levels = Object.keys(table).map(Number).filter((l) => l <= level).sort((a, b) => a - b);
  const asis = (opts.asi_levels[klass] ?? []).filter((l) => l <= level);
  const avg = Math.floor(cls.hit_die / 2) + 1;
  const armor = cls.armor.filter((a) => a !== "shields");
  const sc = cls.spellcasting;
  const nextLevel = Object.keys(table).map(Number).filter((l) => l > level).sort((a, b) => a - b)[0];
  // Plan 128 — the numbers the class tracks, worked out for this level ("Channel Divinity uses 2").
  const scales = (opts.class_scales?.[klass] ?? [])
    .map(({ label, table }) => [label, stepAt(level, table)] as const)
    .filter(([, v]) => v !== undefined);
  const choices = Object.entries(choiceCounts(opts, klass, level, subclass)).map(([key, n]) => {
    const label = opts.choice_kinds?.[key]?.label ?? key;
    return n > 1 ? `${label} (${n})` : label;
  });
  const nextNames = nextLevel
    ? (table[String(nextLevel)] ?? []).flatMap((n) => (n === SUB_MARK ? subTable?.[String(nextLevel)] ?? ["a subclass feature"] : [n]))
    : [];

  return (
    <div className="panel">
      <div className="phead">What a level {level} {klass} gets</div>
      <div className="row"><span>Hit points</span><span>d{cls.hit_die}: <span className="num">{cls.hit_die}</span> at level 1, then <span className="num">{avg}</span> a level, each plus your Constitution modifier</span></div>
      <div className="row"><span>Saving throws</span><span>Trained in {abilityWords(cls.saves, " and ")}</span></div>
      <div className="row"><span>Armor</span><span>{armor.length ? `${andList(armor)} armor${cls.armor.includes("shields") ? " and shields" : ""}` : "None: you fight unarmored"}</span></div>
      <div className="row"><span>Skills</span><span>Choose <span className="num">{cls.skills.choose}</span> from the {klass} list</span></div>
      {sc && (
        <div className="row"><span>Spells</span><span>
          Cast with {ABILITY_NAMES[sc.ability]}: {cantripCap(opts, klass, level) ? <><span className="num">{cantripCap(opts, klass, level)}</span> cantrips, </> : null}
          {spells2014(opts, klass, level, sc) ?? (
            <><span className="num">{spellCap(opts, klass, level)}</span> prepared, up to {ordinal(Math.max(1, maxSpellLevel(opts, klass, level)))} level</>
          )}. You pick them on the Spells step
        </span></div>
      )}
      {scales.length > 0 && (
        <div className="row"><span>At level {level}</span><span>{scales.map(([l, v]) => `${l}: ${v}`).join(" · ")}</span></div>
      )}
      {choices.length > 0 && (
        <div className="row"><span>Class choices</span><span>{andList(choices)}: you choose {choices.length > 1 ? "them" : "it"} after skills</span></div>
      )}
      {asis.length > 0 && (
        <div className="row"><span>Improvements</span><span>{asis.length === 1 ? "One" : asis.length} Ability Score Improvement{asis.length > 1 ? "s" : ""} (level{asis.length > 1 ? "s" : ""} {andList(asis)}): you choose {asis.length > 1 ? "them" : "it"} after skills</span></div>
      )}
      <div className="phead">Class features</div>
      {levels.map((l) => (
        <div key={l}>
          {(table[String(l)] ?? []).filter((n) => n !== ASI).map((n) => {
            if (n === SUB_MARK) {
              const names = subTable?.[String(l)];
              if (own && !names) return null; // the DM's subclass adds nothing at this level
              return (
                <div key={`${l}-${n}`} className="feat-row">
                  <b>{names ? names.join(", ") : "Subclass feature"}<span className="lv">level {l}</span></b>
                  <span>{names ? `From your subclass (${subclass}).` : "Your subclass adds something here: read it in your book."}</span>
                </div>
              );
            }
            if (n.endsWith(" Subclass")) {
              const names = (subTable?.[String(l)] ?? []).join(", ");
              return (
                <div key={`${l}-${n}`} className="feat-row">
                  <b>{subclass ?? "Subclass"}<span className="lv">level {l}</span></b>
                  <span>{subclass ? names || (own ? own.blurb || "Your table's subclass." : "Your specialty: play it from your book.") : "Your specialty: choose it above, or later."}</span>
                </div>
              );
            }
            const note = featureNote(opts, klass, n);
            return (
              <div key={`${l}-${n}`} className="feat-row">
                <b>{n}<span className="lv">level {l}</span></b>
                {note && <span>{note}</span>}
              </div>
            );
          })}
        </div>
      ))}
      {nextLevel && nextNames.length > 0 && (
        <div className="feat-row">
          <span>Next, at level {nextLevel}: {nextNames.filter((n) => n !== ASI).join(", ") || "an Ability Score Improvement"}{nextNames.includes(ASI) && nextNames.length > 1 ? ", and an Ability Score Improvement" : ""}.</span>
        </div>
      )}
    </div>
  );
}

/**
 * What a subclass adds, level by level, up to the build's level (later ones say when).
 * Plan 133: the DM's own subclass shows its blurb and each feature in the DM's words.
 */
export function SubclassFeatures({ opts, klass, subclass, level }: { opts: Opts; klass: string; subclass: string; level: number }) {
  const table = opts.subclass_features[subclass];
  const own = homebrewSubclass(opts, klass, subclass);
  if (!table && own) {
    return (
      <div className="panel pad">
        {own.blurb && <p className="note" style={{ marginTop: 0 }}>{own.blurb}</p>}
        <p className="note" style={{ margin: 0 }}>No features written for {subclass} yet.</p>
      </div>
    );
  }
  if (!table) return null;
  const levels = Object.keys(table).map(Number).sort((a, b) => a - b);
  const now = levels.filter((l) => l <= level);
  const later = levels.filter((l) => l > level);
  return (
    <div className="panel">
      <div className="phead">What {subclass} gives by level {level}</div>
      {own?.blurb && <div className="feat-row"><span style={{ marginTop: 0 }}>{own.blurb}</span></div>}
      {now.flatMap((l) => (table[String(l)] ?? []).map((n) => {
        const note = subclassFeatureNote(opts, klass, subclass, n);
        return (
          <div key={`${l}-${n}`} className="feat-row">
            <b>{n}<span className="lv">level {l}</span></b>
            {note && <span>{note}</span>}
          </div>
        );
      }))}
      {later.length > 0 && (
        <div className="feat-row">
          <span>Later: {later.map((l) => `${(table[String(l)] ?? []).join(", ")} at level ${l}`).join("; ")}.</span>
        </div>
      )}
    </div>
  );
}

/** A background's skills, tool, Origin feat (with what the feat does) and ability bonus. */
export function BackgroundExplainer({ opts, bg }: { opts: Opts; bg: Opts["backgrounds"][number] }) {
  // Plan 131 — a 2014 background: skills, languages and a feature; no feat, tool or bonus.
  if (!bg.feat) {
    return (
      <div className="panel">
        <div className="phead">What {bg.name} gives</div>
        <div className="row"><span>Skills</span><span>{bg.skills.join(" and ")}</span></div>
        {bg.tool && <div className="row"><span>Tool</span><span>{bg.tool}</span></div>}
        {!!bg.languages && <div className="row"><span>Languages</span><span>{bg.languages} of your choice</span></div>}
        {bg.feature && <div className="row"><span>Feature</span><span>{bg.feature}</span></div>}
      </div>
    );
  }
  const featName = bg.feat.split(" (")[0];
  const feat = opts.origin_feats.find((f) => f.name === featName);
  return (
    <div className="panel">
      <div className="phead">What {bg.name} gives</div>
      <div className="row"><span>Skills</span><span>{bg.skills.join(" and ")}</span></div>
      <div className="row"><span>Origin feat</span><span>{bg.feat}{feat ? `: ${feat.blurb}` : ""}</span></div>
      <div className="row"><span>Tool</span><span>{bg.tool}</span></div>
      <div className="row"><span>Ability bonus</span><span>{fmt(2)} and {fmt(1)}, or {fmt(1)} to each of {abilityWords(bg.abilities, ", ")}</span></div>
    </div>
  );
}
