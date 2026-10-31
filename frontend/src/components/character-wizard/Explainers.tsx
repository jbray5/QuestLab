import type { BuilderOptions } from "../../api/characterBuilder";
import { ABILITY_NAMES, abilityWords, andList, cantripCap, featureNote, fmt, maxSpellLevel, ordinal, spellCap } from "./rules";

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
  const levels = Object.keys(table).map(Number).filter((l) => l <= level).sort((a, b) => a - b);
  const asis = (opts.asi_levels[klass] ?? []).filter((l) => l <= level);
  const avg = Math.floor(cls.hit_die / 2) + 1;
  const armor = cls.armor.filter((a) => a !== "shields");
  const sc = cls.spellcasting;
  const nextLevel = Object.keys(table).map(Number).filter((l) => l > level).sort((a, b) => a - b)[0];
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
          <span className="num">{spellCap(opts, klass, level)}</span> prepared, up to {ordinal(Math.max(1, maxSpellLevel(opts, klass, level)))} level
        </span></div>
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
              return (
                <div key={`${l}-${n}`} className="feat-row">
                  <b>{names ? names.join(", ") : "Subclass feature"}<span className="lv">level {l}</span></b>
                  <span>{names ? `From your subclass (${subclass}).` : "Your subclass adds something here: read it in your book."}</span>
                </div>
              );
            }
            if (n.endsWith(" Subclass")) {
              return (
                <div key={`${l}-${n}`} className="feat-row">
                  <b>{subclass ?? "Subclass"}<span className="lv">level {l}</span></b>
                  <span>{subclass ? (subTable?.[String(l)] ?? []).join(", ") || "Your specialty: play it from your book." : "Your specialty: choose it above, or later."}</span>
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

/** What an SRD subclass adds, level by level, up to the build's level (later ones say when). */
export function SubclassFeatures({ opts, klass, subclass, level }: { opts: Opts; klass: string; subclass: string; level: number }) {
  const table = opts.subclass_features[subclass];
  if (!table) return null;
  const levels = Object.keys(table).map(Number).sort((a, b) => a - b);
  const now = levels.filter((l) => l <= level);
  const later = levels.filter((l) => l > level);
  return (
    <div className="panel">
      <div className="phead">What {subclass} gives by level {level}</div>
      {now.flatMap((l) => (table[String(l)] ?? []).map((n) => {
        const note = featureNote(opts, klass, n);
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
