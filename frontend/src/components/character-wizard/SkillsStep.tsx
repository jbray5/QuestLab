import { useState } from "react";

import type { BuilderClass, BuilderOptions } from "../../api/characterBuilder";
import Fold from "./Fold";
import { ABILITY_NAMES, armorClass, fmt, profBonus, type OriginPickState } from "./rules";

/**
 * Skills and gear (Plan 74, Plan 128). A Human's screen used to be one 2,000 px page on a phone
 * (skills, then ten Origin feats, then the gear: persona run 3), so each decision is now its own
 * fold-out section with a one-line summary, and finishing one opens the next.
 */

type Opts = BuilderOptions;

interface Props {
  opts: Opts;
  cls: BuilderClass;
  klass: string;
  level: number;
  species: string;
  speciesRow: Opts["species"][number] | undefined;
  bg: Opts["backgrounds"][number] | undefined;
  skills: string[];
  setSkills: (v: string[]) => void;
  originFeat: string;
  setOriginFeat: (v: string) => void;
  originPicks: OriginPickState;
  setOriginPicks: (v: OriginPickState) => void;
  kit: string;
  setKit: (v: string) => void;
  finalScores: Record<string, number>;
  startFeats: string[];
  activeSub: string | null;
}

export default function SkillsStep(p: Props) {
  const { opts, cls, klass, level, species, speciesRow, bg, skills, setSkills, originFeat, setOriginFeat, originPicks, setOriginPicks, kit, setKit } = p;
  const bonusN = speciesRow?.bonus_skill_choices ?? 0;
  const bonusFrom = speciesRow?.bonus_skill_from;
  const allowedN = cls.skills.choose + bonusN;
  const bgSkills = bg?.skills ?? [];
  const classPicks = skills.filter((s) => !bgSkills.includes(s));
  const offListPicked = classPicks.filter((x) => !cls.skills.from.includes(x)).length;
  const versatile = !!speciesRow?.bonus_origin_feat;
  const skilled = versatile && originFeat === "Skilled";
  const skilledLeft = skilled ? 3 - originPicks.skills.length : 0;

  const sections = ["skills", ...(versatile ? ["feat"] : []), ...(cls.kits.length ? ["gear"] : [])];
  const incomplete = (k: string) =>
    k === "skills" ? classPicks.length < allowedN : k === "feat" ? !originFeat || skilledLeft > 0 : !kit;
  const [open, setOpen] = useState<string | null>(() => sections.find(incomplete) ?? sections[0]);
  const after = (k: string) => sections.slice(sections.indexOf(k) + 1).find(incomplete) ?? null;

  const chip = (s: string) => {
    const fromBg = bgSkills.includes(s);
    const onList = cls.skills.from.includes(s);
    const allowed = onList || skills.includes(s) || (bonusN > offListPicked && (!bonusFrom || bonusFrom.includes(s)));
    const on = skills.includes(s) || fromBg;
    const full = classPicks.length >= allowedN && !skills.includes(s);
    return (
      <button type="button" key={s} aria-pressed={on} className={`cc-chip ${on ? "on" : ""}`} disabled={fromBg || !allowed || full}
        onClick={() => {
          const next = on ? skills.filter((x) => x !== s) : [...skills, s];
          setSkills(next);
          if (!on && next.filter((x) => !bgSkills.includes(x)).length >= allowedN) setOpen(after("skills"));
        }}>
        {s} <small>{fromBg ? "from background" : ABILITY_NAMES[opts.skills[s]] ?? opts.skills[s]}</small>
      </button>
    );
  };
  const others = Object.keys(opts.skills).filter((s) => !cls.skills.from.includes(s));
  const trained = new Set([...skills, ...bgSkills]);

  return (
    <>
      <h2>Skills and gear</h2>
      <p className="note">
        Skills are what you&rsquo;re trained at: you add your proficiency bonus ({fmt(profBonus(level))} at level {level}) to those checks.
        {bg ? ` ${bg.name} already gives ${bg.skills.join(" and ")}.` : ""}
      </p>

      <Fold id="cc-sk-skills" title="Skills" open={open === "skills"} onToggle={() => setOpen(open === "skills" ? null : "skills")}
        done={!incomplete("skills")} summary={classPicks.length ? `${classPicks.join(", ")}${classPicks.length < allowedN ? ` · ${allowedN - classPicks.length} left` : ""}` : `Pick ${allowedN}`}>
        <span className="lbl" style={{ marginTop: 0 }}>{klass} skills: pick {cls.skills.choose}</span>
        <div className="cc-chips">{cls.skills.from.map(chip)}</div>
        {others.length > 0 && (
          <>
            <span className="lbl">
              {bonusN > 0 ? `${species} adds one more${bonusFrom ? `: ${bonusFrom.join(", ")}` : ", any skill"}` : `Not on the ${klass} list`}
            </span>
            <div className="cc-chips">{others.map(chip)}</div>
          </>
        )}
      </Fold>

      {versatile && (
        <Fold id="cc-sk-feat" title="Origin feat" open={open === "feat"} onToggle={() => setOpen(open === "feat" ? null : "feat")}
          done={!incomplete("feat")} summary={originFeat ? (skilledLeft > 0 ? `Skilled · pick ${skilledLeft} more skill${skilledLeft === 1 ? "" : "s"}` : originFeat) : "Choose one (Versatile)"}>
          <p className="note" style={{ marginTop: 0 }}>Humans are Versatile: pick one Origin feat, a small talent of your own.</p>
          <div className="cc-cards">
            {opts.origin_feats.map((f) => {
              // A feat is taken once unless it says otherwise (Magic Initiate, Skilled).
              const fromBg = bg?.feat.split(" (")[0] === f.name && !opts.feats.find((x) => x.name === f.name)?.repeatable;
              return (
                <button type="button" key={f.name} aria-pressed={originFeat === f.name} className={`cc-card ${originFeat === f.name ? "on" : ""}`} disabled={fromBg}
                  onClick={() => {
                    setOriginFeat(f.name);
                    setOriginPicks({ choice: "", spells: [], skills: [] });
                    if (f.name !== "Skilled") setOpen(after("feat"));
                  }}>
                  <b>{f.name}</b><small className={fromBg ? "why" : undefined}>{fromBg ? `${bg?.name} already gives it.` : f.blurb}</small>
                </button>
              );
            })}
          </div>
          {originFeat === "Magic Initiate" && <p className="note">You pick Magic Initiate&rsquo;s list and spells on the Spells step.</p>}
          {skilled && (
            <>
              <span className="lbl">Skilled: pick 3 more skills ({originPicks.skills.length} of 3)</span>
              <div className="cc-chips">
                {Object.keys(opts.skills).filter((s) => !trained.has(s) || originPicks.skills.includes(s)).map((s) => {
                  const on = originPicks.skills.includes(s);
                  return (
                    <button type="button" key={s} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && originPicks.skills.length >= 3}
                      onClick={() => {
                        const next = on ? originPicks.skills.filter((x) => x !== s) : [...originPicks.skills, s];
                        setOriginPicks({ ...originPicks, skills: next });
                        if (!on && next.length >= 3) setOpen(after("feat"));
                      }}>
                      {s} <small>{ABILITY_NAMES[opts.skills[s]] ?? opts.skills[s]}</small>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Fold>
      )}

      {cls.kits.length > 0 && (
        <Fold id="cc-sk-gear" title="Starting gear" open={open === "gear"} onToggle={() => setOpen(open === "gear" ? null : "gear")}
          done={!incomplete("gear")} summary={kit || "Pick one"}>
          <div className="cc-cards">
            {cls.kits.map((k) => {
              const preview = armorClass(opts, klass, p.finalScores, k, p.startFeats, p.activeSub);
              return (
                <button type="button" key={k.name} aria-pressed={kit === k.name} className={`cc-card ${kit === k.name ? "on" : ""}`} onClick={() => setKit(k.name)}>
                  <b>{k.name}</b>
                  <small>{[...k.items, k.armor, k.shield ? "Shield" : null].filter(Boolean).join(", ")}</small>
                  <small style={{ color: "var(--muted)" }}>Armor Class <span className="num">{preview.ac}</span> with this gear</small>
                  {preview.warning && <small className="why">{preview.warning}</small>}
                </button>
              );
            })}
          </div>
        </Fold>
      )}
    </>
  );
}
