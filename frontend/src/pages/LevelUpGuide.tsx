import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dices } from "lucide-react";

import { playApi } from "../api/play";
import type { LevelUpChoices, LevelUpFeat, LevelUpPlan, LevelUpResult, LevelUpSpell } from "../api/play";
import Confetti from "../components/Confetti";

/**
 * LevelUpGuide (Plan 115) — /play/:pcId/level-up
 *
 * The DM grants a level; this walks the player through their own choices for it, one step
 * per screen, phone-first, in the character creator's look. Every number shown here is the
 * server's: the page previews, the server validates and writes.
 */

const ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"] as const;
const ABILITY_NAMES: Record<string, string> = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma",
};
const ASI = "Ability Score Improvement";
const BOOK = "__book";
type Armor = "none" | "light" | "medium" | "heavy";

const CSS = `
.lu { min-height: 100dvh; padding: 16px 16px calc(140px + env(safe-area-inset-bottom, 0px)); color: var(--text);
  font-family: var(--font-ui); background: var(--bg); }
.lu-inner { max-width: 640px; margin: 0 auto; }
.lu h1 { font-size: clamp(1.5rem, 6.5vw, 1.9rem); color: var(--text); margin: 4px 0 2px; }
.lu .sub { color: var(--text2); margin: 0 0 12px; font-size: 0.9375rem; }
.lu .steps { display: flex; gap: 4px; margin-bottom: 18px; }
.lu .steps i { flex: 1; height: 4px; border-radius: 2px; background: var(--border2); }
.lu .steps i.on { background: var(--accent); }
.lu h2 { font-size: 1.25rem; color: var(--text); margin: 0 0 10px; }
.lu label, .lu .lbl { display: block; font-size: 0.875rem; font-weight: 500; color: var(--text2); margin: 16px 0 6px; }
.lu input[type=text] { min-height: 44px; }
.lu-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 170px), 1fr)); gap: 8px; }
.lu-card { text-align: left; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text);
  padding: 10px 12px; cursor: pointer; font: inherit; min-height: 56px; display: flex; flex-direction: column; gap: 3px; }
.lu-card:hover:not(:disabled) { border-color: var(--border2); }
.lu-card.on { border-color: var(--accent-edge); background: var(--accent-soft); }
.lu-card:disabled { opacity: 0.45; cursor: not-allowed; }
.lu-card b { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 1rem; font-weight: 600; color: var(--text); }
.lu-card small { color: var(--text2); font-size: 0.8125rem; line-height: 1.35; display: block; }
.lu-card .plus { color: var(--accent-text); font-weight: 500; }
.lu-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lu-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; border: 1px solid var(--border2); border-radius: 999px;
  padding: 4px 14px; background: transparent; color: var(--text); font: inherit; font-size: 0.9375rem; cursor: pointer; }
.lu-chip:hover:not(:disabled) { background: var(--surface3); }
.lu-chip.on { border-color: var(--accent-edge); background: var(--accent-active); color: var(--accent-active-text); }
.lu-chip:disabled { opacity: 0.4; cursor: not-allowed; }
.lu-chip small { color: var(--muted); font-size: 0.75rem; }
.lu-chip.on small { color: inherit; opacity: 0.8; }
.lu-chip.die { min-width: 48px; justify-content: center; font-family: var(--font-mono); font-weight: 600; }
@media (pointer: coarse) { .lu-chip { min-height: 44px; } }
.lu .panel { border: 1px solid var(--border); border-radius: 14px; padding: 4px 14px; background: var(--surface); margin: 8px 0; }
.lu .panel.pad { padding: 12px 14px; }
.lu .new { padding: 10px 0; border-bottom: 1px solid var(--border); }
.lu .new:last-child { border-bottom: 0; }
.lu .new b { display: block; font-weight: 600; color: var(--text); font-size: 1rem; }
.lu .new span { display: block; color: var(--text2); font-size: 0.9rem; margin-top: 2px; }
.lu ul.plain { margin: 4px 0 0; padding-left: 1.1rem; color: var(--text2); font-size: 0.9375rem; }
.lu ul.plain li { margin: 0.3rem 0; }
.lu .big { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-weight: 600; font-size: 2.2rem; color: var(--text); text-align: center; margin: 16px 0 0; }
.lu .big-cap { text-align: center; font-size: 0.875rem; color: var(--muted); margin: 0 0 8px; }
.lu .note { color: var(--muted); font-size: 0.875rem; margin: 8px 0; }
.lu .err { color: var(--danger-text); margin: 8px 0; }
.lu .warn { color: var(--amber-text); font-size: 0.9rem; margin: 8px 0; }
.lu .row { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 0.9375rem; }
.lu .row:last-child { border-bottom: 0; }
.lu .row span:first-child { color: var(--muted); flex: none; }
.lu .row span:last-child { color: var(--text); text-align: right; }
.lu .row span:only-child { color: var(--text); text-align: left; }
.lu-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; background: #131816; border-top: 1px solid var(--border);
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
.lu-nav-inner { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
.lu-nav-row { display: flex; gap: 8px; }
.lu-nav-row .btn { flex: 1; min-height: 48px; }
.lu .hint { font-size: 0.875rem; color: var(--text2); }
`;

const mod = (v: number) => Math.floor((v - 10) / 2);
const fmt = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
const ordinal = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);

function toggle(list: string[], name: string, cap: number): string[] {
  if (list.includes(name)) return list.filter((x) => x !== name);
  if (cap <= 1) return [name];
  return list.length >= cap ? list : [...list, name];
}

export default function LevelUpGuide() {
  const { pcId = "" } = useParams<{ pcId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: plan, error, isLoading, refetch } = useQuery({
    queryKey: ["level-up", pcId],
    queryFn: () => playApi.levelUpPlan(pcId),
    retry: false,
  });
  const [result, setResult] = useState<LevelUpResult | null>(null);

  if (isLoading) return <Shell><p className="sub" style={{ marginTop: 24 }}>Opening your level-up…</p></Shell>;
  if (result) {
    return (
      <Done
        result={result}
        onSheet={() => navigate(`/play/${pcId}`)}
        onNext={() => { setResult(null); void refetch(); }}
      />
    );
  }
  if (error || !plan) {
    return (
      <Shell>
        <h1 style={{ marginTop: 24 }}>No level-up waiting</h1>
        <p className="sub">
          When your DM says you level up, they grant it from their screen. A &ldquo;You reached level&rdquo; card then
          appears on your phone&rsquo;s Now screen; tap it to come back here and choose what you gain.
        </p>
        <button type="button" className="btn btn-primary" style={{ minHeight: 48 }} onClick={() => navigate(`/play/${pcId}`)}>
          Back to my sheet
        </button>
      </Shell>
    );
  }
  return (
    <Guide
      key={`${plan.pc_id}-${plan.to_level}`}
      plan={plan}
      onCancel={() => navigate(`/play/${pcId}`)}
      onDone={(res) => {
        setResult(res);
        // A level touches nearly everything on the sheet (DC, saves, skills, slots, features).
        void qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(pcId) });
      }}
    />
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="lu"><style>{CSS}</style><div className="lu-inner">{children}</div></div>
  );
}

function Done({ result, onSheet, onNext }: { result: LevelUpResult; onSheet: () => void; onNext: () => void }) {
  return (
    <Shell>
      <Confetti trigger={`${result.character_name}-${result.level}`} count={48} />
      <h1 className="story" style={{ marginTop: 24 }}>Level {result.level}</h1>
      <p className="sub"><span className="story" style={{ fontWeight: 700, color: "var(--text)" }}>{result.character_name}</span> is stronger. Your sheet is updated.</p>
      <div className="panel">
        {result.summary.map((s) => <div key={s} className="row"><span>{s}</span></div>)}
        {result.features_granted.length > 0 && (
          <div className="row"><span>New on your sheet</span><span>{result.features_granted.join(", ")}</span></div>
        )}
      </div>
      {result.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
      <div className="lu-nav">
        <div className="lu-nav-inner">
          <div className="lu-nav-row">
            {result.more_levels ? (
              <>
                <button type="button" className="btn btn-secondary" onClick={onSheet}>My sheet</button>
                <button type="button" className="btn btn-primary" onClick={onNext}>Next level</button>
              </>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onSheet}>Back to my sheet</button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Guide({ plan, onCancel, onDone }: { plan: LevelUpPlan; onCancel: () => void; onDone: (r: LevelUpResult) => void }) {
  const { pcId = "" } = useParams<{ pcId: string }>();
  const sc = plan.spellcasting;
  const steps = useMemo(() => {
    const s = ["new", "hp"];
    if (plan.needs_subclass) s.push("subclass");
    if (plan.asi_level) s.push("feat");
    if (sc && (sc.new_cantrips || sc.new_spells || sc.cantrip_swap || sc.spell_swap)) s.push("spells");
    s.push("review");
    return s;
  }, [plan, sc]);
  const STEP_NAMES: Record<string, string> = {
    new: "What's new", hp: "Hit points", subclass: "Subclass", feat: "Feat", spells: "Spells", review: "Review",
  };
  const [i, setI] = useState(0);
  const step = steps[i];

  // Choices.
  const [hpMethod, setHpMethod] = useState<"average" | "roll">("average");
  const [hpRoll, setHpRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [rollNote, setRollNote] = useState<string | null>(null);
  const [subclass, setSubclass] = useState("");
  const [customSub, setCustomSub] = useState("");
  const [featName, setFeatName] = useState("");
  const [bookFeat, setBookFeat] = useState("");
  const [asiMode, setAsiMode] = useState<"2" | "11">("2");
  const [asi, setAsi] = useState<Record<string, number>>({});
  const [featChoice, setFeatChoice] = useState("");
  const [featSpells, setFeatSpells] = useState<string[]>([]);
  const [featSkills, setFeatSkills] = useState<string[]>([]);
  const [featExpertise, setFeatExpertise] = useState<string[]>([]);
  const [showLocked, setShowLocked] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [cantrips, setCantrips] = useState<string[]>([]);
  const [spells, setSpells] = useState<string[]>([]);
  const [cSwapOut, setCSwapOut] = useState("");
  const [cSwapIn, setCSwapIn] = useState("");
  const [sSwapOut, setSSwapOut] = useState("");
  const [sSwapIn, setSSwapIn] = useState("");
  const [armor, setArmor] = useState<Armor | "unsure" | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const feat: LevelUpFeat | undefined = plan.feats.find((f) => f.name === featName);
  const isBook = featName === BOOK;
  const newScores = useMemo(() => {
    const out = { ...plan.scores };
    for (const [a, v] of Object.entries(asi)) out[a] = (out[a] ?? 10) + v;
    return out;
  }, [plan.scores, asi]);

  const dieAvg = Math.floor(plan.hit_die / 2) + 1;
  const diePart = hpMethod === "roll" ? hpRoll ?? 0 : dieAvg;
  const oldCon = mod(plan.scores.CON), newCon = mod(newScores.CON);
  const featHp = feat?.hp_per_level ?? 0;
  const hpGain = Math.max(1, diePart + newCon) + plan.hp_bonus_per_level + featHp + (newCon - oldCon) * plan.from_level + featHp * plan.from_level;

  const acChanges = plan.ac_abilities.some((a) => mod(newScores[a]) !== mod(plan.scores[a]))
    || (feat?.ac_bonus_in_armor ?? 0) > 0 || feat?.name === "Medium Armor Master";

  const knownNames = useMemo(() => new Set((sc?.known ?? []).map((s) => s.name)), [sc]);
  const featSpellPool = (spec: LevelUpFeat["spell_picks"][number]): LevelUpSpell[] =>
    plan.feat_spells.filter((s) =>
      s.level === spec.level
      && (!spec.schools || spec.schools.includes(s.school))
      && (!spec.list_from_choice || s.classes.includes(featChoice))
      && !knownNames.has(s.name));
  const featSpellTotal = feat?.spell_picks.reduce((n, s) => n + s.count, 0) ?? 0;

  function pickFeat(name: string) {
    setFeatName(name);
    setAsi({});
    setFeatChoice("");
    setFeatSpells([]);
    setFeatSkills([]);
    setFeatExpertise([]);
    window.setTimeout(() => document.getElementById("lu-feat-panel")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
  }

  async function rollOnTable() {
    setRolling(true);
    setRollNote(null);
    try {
      const r = await playApi.throwDice(pcId, `d${plan.hit_die}`, 0, `Level ${plan.to_level} HP`);
      setHpMethod("roll");
      setHpRoll(r.rolls[0]);
      setRollNote(`The table saw a ${r.rolls[0]}.`);
    } catch {
      setRollNote("No live table to roll on. Roll a real die and tap the number.");
    } finally {
      setRolling(false);
    }
  }

  function featReady(): string | null {
    if (!featName) return "Pick the Ability Score Improvement or a feat.";
    if (isBook) {
      if (!bookFeat.trim()) return "Type the feat's name.";
      return null;
    }
    if (!feat) return "Pick a feat.";
    const spent = Object.values(asi).reduce((a, b) => a + b, 0);
    if (feat.name === ASI && spent !== 2) return asiMode === "2" ? "Pick the ability that gets +2." : "Pick two abilities for +1 each.";
    if (feat.name !== ASI && feat.asi_options && spent !== 1) return "Pick the ability that gets +1.";
    if (feat.choice && !featChoice) return `Pick a ${feat.choice.label.toLowerCase()}.`;
    if (featSpells.length < featSpellTotal && feat.spell_picks.some((s) => featSpellPool(s).length > 0)) return `Pick ${featSpellTotal - featSpells.length} more spell${featSpellTotal - featSpells.length > 1 ? "s" : ""} for ${feat.name}.`;
    if (feat.skill_pick && featSkills.length < feat.skill_pick.count) return `Pick ${feat.skill_pick.count - featSkills.length} more skill${feat.skill_pick.count - featSkills.length > 1 ? "s" : ""}.`;
    if (feat.expertise_pick && featExpertise.length < feat.expertise_pick) return "Pick a skill for expertise.";
    return null;
  }

  function hint(): string | null {
    switch (step) {
      case "hp": return hpMethod === "roll" && !hpRoll ? `Tap what your d${plan.hit_die} rolled.` : null;
      case "subclass": return subclass === "" ? "Pick your subclass." : subclass === BOOK && !customSub.trim() ? "Type your subclass." : null;
      case "feat": return featReady();
      case "spells":
        if (cSwapOut && !cSwapIn) return "Pick the cantrip to swap in.";
        if (sSwapOut && !sSwapIn) return "Pick the spell to swap in.";
        return null;
      case "review": return acChanges && armor === "" ? "Tell us what armor you wear (for AC)." : null;
      default: return null;
    }
  }

  function choices(): LevelUpChoices {
    const featOut = plan.asi_level && featName
      ? isBook
        ? { name: bookFeat.trim(), from_book: true, asi, spells: [], skills: [], expertise: [] }
        : { name: featName, asi, choice: featChoice || null, spells: featSpells, skills: featSkills, expertise: featExpertise }
      : null;
    return {
      hp_method: hpMethod,
      hp_roll: hpMethod === "roll" ? hpRoll : null,
      subclass: plan.needs_subclass ? (subclass === BOOK ? customSub.trim() : subclass) || null : null,
      feat: featOut,
      cantrips,
      spells,
      cantrip_swap: cSwapOut && cSwapIn ? { forget: cSwapOut, learn: cSwapIn } : null,
      spell_swap: sSwapOut && sSwapIn ? { forget: sSwapOut, learn: sSwapIn } : null,
      armor: armor && armor !== "unsure" ? armor : null,
    };
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      onDone(await playApi.applyLevelUp(pcId, choices()));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const slotLevels = Array.from(new Set([...Object.keys(plan.slots_before), ...Object.keys(plan.slots_after)])).sort();
  const slotChanges = slotLevels.filter((l) => (plan.slots_before[l] ?? 0) !== (plan.slots_after[l] ?? 0));
  const offered = plan.feats.filter((f) => f.reason !== "Already taken.");
  const popular = offered.filter((f) => f.ok && f.popular);
  const others = offered.filter((f) => f.ok && !f.popular);
  const locked = offered.filter((f) => !f.ok);
  const castSpells = (sc?.options ?? []).filter((s) => s.level >= 1);
  const castCantrips = (sc?.options ?? []).filter((s) => s.level === 0);
  const takenByPicks = new Set([...cantrips, ...spells, cSwapIn, sSwapIn]);

  return (
    <Shell>
      <p className="sub" style={{ margin: "4px 0 0" }}>
        <span className="story" style={{ fontWeight: 700, color: "var(--text)" }}>{plan.character_name}</span> · {plan.character_class}{plan.subclass ? ` (${plan.subclass})` : ""}
      </p>
      <h1>Level {plan.to_level}</h1>
      <p className="sub">{STEP_NAMES[step]} · step <span className="num">{i + 1}</span> of <span className="num">{steps.length}</span></p>
      <div className="steps" aria-hidden>{steps.map((s, k) => <i key={s} className={k <= i ? "on" : ""} />)}</div>

      {step === "new" && (
        <>
          <h2>What level {plan.to_level} brings</h2>
          <div className="panel">
            {plan.new_features.length === 0 && <p className="note">No new class features at this level, but your numbers grow.</p>}
            {plan.new_features.map((f) => (
              <div key={f.name} className="new"><b>{f.name}</b>{f.note && <span>{f.note}</span>}</div>
            ))}
          </div>
          {(plan.scaling.length > 0 || slotChanges.length > 0) && (
            <>
              <span className="lbl">Numbers that change</span>
              <ul className="plain">
                {slotChanges.map((l) => <li key={l}>{ordinal(Number(l))}-level spell slots: <span className="num">{plan.slots_before[l] ?? 0} → {plan.slots_after[l] ?? 0}</span></li>)}
                {plan.scaling.map((s) => <li key={s}>{s}</li>)}
                <li>Hit Point Dice (for healing on a short rest): <span className="num">{plan.from_level} → {plan.to_level}</span> (d{plan.hit_die})</li>
              </ul>
            </>
          )}
          <p className="note">Your book is the rulebook: every choice here follows it, and your DM can adjust anything on your sheet afterwards.</p>
        </>
      )}

      {step === "hp" && (
        <>
          <h2>Hit points</h2>
          <p className="note">Each level adds one d{plan.hit_die} {fmt(plan.con_mod)} (your Constitution modifier){plan.hp_bonus_per_level ? `, plus ${plan.hp_bonus_per_level} more per level (Tough or your species/subclass)` : ""}. Take the fixed value, or roll.</p>
          <div className="lu-cards">
            <button type="button" aria-pressed={hpMethod === "average"} className={`lu-card ${hpMethod === "average" ? "on" : ""}`} onClick={() => setHpMethod("average")}>
              <b>Take {dieAvg}</b><small>The fixed value: +{plan.hp_average_gain} hit points, no risk.</small>
            </button>
            <button type="button" aria-pressed={hpMethod === "roll"} className={`lu-card ${hpMethod === "roll" ? "on" : ""}`} onClick={() => setHpMethod("roll")}>
              <b>Roll the d{plan.hit_die}</b><small>Roll a real die (or here) and take what comes. You always gain at least 1.</small>
            </button>
          </div>
          {hpMethod === "roll" && (
            <>
              <span className="lbl">What did your d{plan.hit_die} roll?</span>
              <div className="lu-chips">
                {Array.from({ length: plan.hit_die }, (_, k) => k + 1).map((n) => (
                  <button type="button" key={n} aria-pressed={hpRoll === n} className={`lu-chip die ${hpRoll === n ? "on" : ""}`} onClick={() => setHpRoll(n)}>{n}</button>
                ))}
              </div>
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={rolling} onClick={() => void rollOnTable()}>
                  <Dices size={16} /> Roll it on the table
                </button>
              </div>
              {rollNote && <p className="note">{rollNote}</p>}
            </>
          )}
          <div className="big">{plan.hp_max} → {plan.hp_max + hpGain}</div>
          <p className="big-cap">Your hit points</p>
          {plan.asi_level && <p className="note" style={{ textAlign: "center" }}>Raising Constitution in the next step adds 1 hit point for every level, this one included.</p>}
        </>
      )}

      {step === "subclass" && (
        <>
          <h2>Choose your subclass</h2>
          <div className="lu-chips">
            {plan.subclass_options.map((s) => (
              <button key={s} className={`lu-chip ${subclass === s ? "on" : ""}`} onClick={() => setSubclass(s)}>{s}</button>
            ))}
            <button className={`lu-chip ${subclass === BOOK ? "on" : ""}`} onClick={() => setSubclass(BOOK)}>From my book…</button>
          </div>
          {subclass === BOOK && <input type="text" style={{ marginTop: 8 }} value={customSub} onChange={(e) => setCustomSub(e.target.value)} placeholder="e.g. Circle of the Moon" />}
          <p className="note">A subclass from your book is recorded by name; you play its features from the book.</p>
        </>
      )}

      {step === "feat" && (
        <>
          <h2>Ability Score Improvement or a feat</h2>
          <p className="note">Take +2 to one ability (or +1 to two), or trade that for any feat you qualify for. Most feats also give +1 to an ability. Read the full feat in your book before you pick.</p>
          {popular.length > 0 && <span className="lbl">Popular for a {plan.character_class}</span>}
          <div className="lu-cards">
            {popular.map((f) => <FeatCard key={f.name} f={f} on={featName === f.name} onPick={pickFeat} />)}
          </div>
          {showAll || others.some((f) => f.name === featName) ? (
            <>
              <span className="lbl">Every other feat you qualify for</span>
              <div className="lu-cards">
                {others.map((f) => <FeatCard key={f.name} f={f} on={featName === f.name} onPick={pickFeat} />)}
                <button className={`lu-card ${isBook ? "on" : ""}`} onClick={() => pickFeat(BOOK)}>
                  <b>From my book…</b><small>Any other feat your DM allows. Recorded by name.</small>
                </button>
              </div>
            </>
          ) : (
            <div className="lu-chips" style={{ marginTop: 10 }}>
              <button className="lu-chip" onClick={() => setShowAll(true)}>{others.length === 1 ? "See 1 other feat" : `Browse all ${others.length} other feats`}</button>
              <button className={`lu-chip ${isBook ? "on" : ""}`} onClick={() => pickFeat(BOOK)}>From my book…</button>
            </div>
          )}
          {locked.length > 0 && (
            <>
              <button className="lu-chip" style={{ marginTop: 10 }} onClick={() => setShowLocked(!showLocked)}>
                {`${showLocked ? "Hide" : "Show"} feats you don’t qualify for (${locked.length})`}
              </button>
              {showLocked && (
                <div className="lu-cards" style={{ marginTop: 8 }}>
                  {locked.map((f) => (
                    <button key={f.name} className="lu-card" disabled><b>{f.name}</b><small>{f.reason}</small></button>
                  ))}
                </div>
              )}
            </>
          )}

          {(feat || isBook) && (
            <div className="panel pad" id="lu-feat-panel">
              {isBook ? (
                <>
                  <label htmlFor="lu-book" style={{ marginTop: 0 }}>Feat name</label>
                  <input id="lu-book" type="text" value={bookFeat} onChange={(e) => setBookFeat(e.target.value)} placeholder="As written in your book" />
                  <span className="lbl">Does it give +1 to an ability? (optional)</span>
                  <AbilityChips scores={plan.scores} allowed={[...ABILITIES]} asi={asi} setAsi={setAsi} each={1} total={1} />
                </>
              ) : feat && (
                <>
                  <b style={{ fontWeight: 600, fontSize: "1.05rem", color: "var(--text)" }}>{feat.name}</b>
                  <p className="note" style={{ marginTop: 4, color: "var(--text2)" }}>{feat.blurb}</p>
                  {feat.name === ASI ? (
                    <>
                      <div className="lu-chips" style={{ marginBottom: 8 }}>
                        <button className={`lu-chip ${asiMode === "2" ? "on" : ""}`} onClick={() => { setAsiMode("2"); setAsi({}); }}>+2 to one</button>
                        <button className={`lu-chip ${asiMode === "11" ? "on" : ""}`} onClick={() => { setAsiMode("11"); setAsi({}); }}>+1 to two</button>
                      </div>
                      <AbilityChips scores={plan.scores} allowed={[...ABILITIES]} asi={asi} setAsi={setAsi} each={asiMode === "2" ? 2 : 1} total={2} />
                    </>
                  ) : feat.asi_options ? (
                    <>
                      <span className="lbl">+1 to{feat.save_prof ? " (and proficiency in its saving throws)" : ""}</span>
                      <AbilityChips scores={plan.scores} allowed={feat.asi_options} asi={asi} setAsi={setAsi} each={1} total={1}
                        disabled={feat.save_prof ? plan.saves : []} />
                    </>
                  ) : null}
                  {feat.choice && (
                    <>
                      <span className="lbl">{feat.choice.label}</span>
                      <div className="lu-chips">
                        {feat.choice.options.map((o) => (
                          <button key={o} className={`lu-chip ${featChoice === o ? "on" : ""}`} onClick={() => { setFeatChoice(o); setFeatSpells([]); }}>{o}</button>
                        ))}
                      </div>
                    </>
                  )}
                  {feat.fixed_spells.length > 0 && <p className="note">You also learn {feat.fixed_spells.join(" and ")}.</p>}
                  {feat.spell_picks.map((spec, k) => {
                    const pool = featSpellPool(spec);
                    const mine = featSpells.filter((n) => pool.some((p) => p.name === n));
                    return (
                      <div key={k}>
                        <span className="lbl">
                          {spec.count} {spec.level === 0 ? "cantrip" : `${ordinal(spec.level)}-level spell`}{spec.count > 1 ? "s" : ""}
                          {spec.schools ? ` (${spec.schools.join(" or ")})` : ""}{spec.list_from_choice ? (featChoice ? ` from the ${featChoice} list` : " — pick the list first") : ""}
                        </span>
                        <div className="lu-chips">
                          {pool.map((s) => (
                            <button key={s.name} className={`lu-chip ${featSpells.includes(s.name) ? "on" : ""}`}
                              disabled={!featSpells.includes(s.name) && mine.length >= spec.count}
                              onClick={() => setFeatSpells(featSpells.includes(s.name) ? featSpells.filter((x) => x !== s.name) : [...featSpells, s.name])}>{s.name}</button>
                          ))}
                          {pool.length === 0 && (!spec.list_from_choice || featChoice) && <span className="note">None in the app's list yet: tell your DM which you chose.</span>}
                        </div>
                      </div>
                    );
                  })}
                  {feat.skill_pick && (() => {
                    const sp = feat.skill_pick;
                    const pool = sp.from ?? plan.all_skills;
                    return (
                      <>
                        <span className="lbl">{sp.count} skill{sp.count > 1 ? "s" : ""}{sp.upgrade ? " (expertise if you're already proficient)" : ""}</span>
                        <div className="lu-chips">
                          {pool.map((s) => {
                            const have = plan.skills[s] ?? 0;
                            const blocked = sp.upgrade ? have >= 2 : have >= 1;
                            return (
                              <button key={s} className={`lu-chip ${featSkills.includes(s) ? "on" : ""}`} disabled={blocked}
                                onClick={() => setFeatSkills(toggle(featSkills, s, sp.count))}>
                                {s}{sp.upgrade && have === 1 ? <small>→ expertise</small> : null}{blocked ? <small>have it</small> : null}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                  {feat.expertise_pick > 0 && (
                    <>
                      <span className="lbl">Expertise in a skill you're proficient in</span>
                      <div className="lu-chips">
                        {plan.all_skills.filter((s) => ((plan.skills[s] ?? 0) === 1 || featSkills.includes(s))).map((s) => (
                          <button key={s} className={`lu-chip ${featExpertise.includes(s) ? "on" : ""}`}
                            onClick={() => setFeatExpertise(toggle(featExpertise, s, feat.expertise_pick))}>{s}</button>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}

      {step === "spells" && sc && (
        <>
          <h2>Spells</h2>
          {sc.new_cantrips > 0 && (
            <>
              <span className="lbl">New cantrip{sc.new_cantrips > 1 ? "s" : ""} (cast any time, no slot): <span className="num">{cantrips.length}</span> of <span className="num">{sc.new_cantrips}</span></span>
              <div className="lu-chips">
                {castCantrips.map((s) => (
                  <button key={s.name} className={`lu-chip ${cantrips.includes(s.name) ? "on" : ""}`}
                    disabled={!cantrips.includes(s.name) && (cantrips.length >= sc.new_cantrips || takenByPicks.has(s.name))}
                    onClick={() => setCantrips(toggle(cantrips, s.name, sc.new_cantrips))}>{s.name}</button>
                ))}
              </div>
            </>
          )}
          {sc.new_spells > 0 && (
            <>
              <span className="lbl">
                {sc.prepared_caster ? "Prepare" : "Learn"} {sc.new_spells} more spell{sc.new_spells > 1 ? "s" : ""} (up to {ordinal(sc.max_spell_level)} level): <span className="num">{spells.length}</span> of <span className="num">{sc.new_spells}</span>
              </span>
              {Array.from({ length: sc.max_spell_level }, (_, k) => k + 1).map((lvl) => {
                const list = castSpells.filter((s) => s.level === lvl);
                if (!list.length) return null;
                return (
                  <div key={lvl} style={{ marginBottom: 8 }}>
                    <span className="note">{ordinal(lvl)} level</span>
                    <div className="lu-chips">
                      {list.map((s) => (
                        <button key={s.name} className={`lu-chip ${spells.includes(s.name) ? "on" : ""}`}
                          disabled={!spells.includes(s.name) && (spells.length >= sc.new_spells || takenByPicks.has(s.name))}
                          onClick={() => setSpells(toggle(spells, s.name, sc.new_spells))}>{s.name}</button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          {sc.note && <p className="note">{sc.note}</p>}
          {sc.cantrip_swap && (
            <SwapPicker label="Swap one cantrip (optional)" known={sc.known.filter((s) => s.level === 0)} pool={castCantrips}
              out={cSwapOut} into={cSwapIn} setOut={setCSwapOut} setInto={setCSwapIn} taken={takenByPicks} />
          )}
          {sc.spell_swap && (
            <SwapPicker label="Swap one spell (optional)" known={sc.known.filter((s) => s.level >= 1)} pool={castSpells}
              out={sSwapOut} into={sSwapIn} setOut={setSSwapOut} setInto={setSSwapIn} taken={takenByPicks} />
          )}
          <p className="note">Spell not listed? Leave the pick open and tell your DM: it's recorded so nothing is lost.</p>
        </>
      )}

      {step === "review" && (
        <>
          <h2>Review</h2>
          <div className="panel">
            <div className="row"><span>Level</span><span>{plan.from_level} → {plan.to_level}</span></div>
            <div className="row"><span>Hit points</span><span>{plan.hp_max} → {plan.hp_max + hpGain} ({hpMethod === "roll" ? `rolled ${hpRoll}` : `took ${dieAvg}`})</span></div>
            {plan.needs_subclass && <div className="row"><span>Subclass</span><span>{(subclass === BOOK ? customSub : subclass) || "—"}</span></div>}
            {plan.asi_level && <div className="row"><span>Feat</span><span>{isBook ? bookFeat : featName}{featChoice ? ` (${featChoice})` : ""}</span></div>}
            {ABILITIES.filter((a) => newScores[a] !== plan.scores[a]).map((a) => (
              <div key={a} className="row"><span>{ABILITY_NAMES[a]}</span><span>{plan.scores[a]} → {newScores[a]} ({fmt(mod(newScores[a]))})</span></div>
            ))}
            {[...featSpells, ...(feat?.fixed_spells ?? [])].length > 0 && <div className="row"><span>Feat spells</span><span>{[...(feat?.fixed_spells ?? []), ...featSpells].join(", ")}</span></div>}
            {featSkills.length > 0 && <div className="row"><span>Skills</span><span>{featSkills.join(", ")}</span></div>}
            {featExpertise.length > 0 && <div className="row"><span>Expertise</span><span>{featExpertise.join(", ")}</span></div>}
            {cantrips.length > 0 && <div className="row"><span>New cantrips</span><span>{cantrips.join(", ")}</span></div>}
            {spells.length > 0 && <div className="row"><span>New spells</span><span>{spells.join(", ")}</span></div>}
            {cSwapOut && cSwapIn && <div className="row"><span>Cantrip swap</span><span>{cSwapOut} → {cSwapIn}</span></div>}
            {sSwapOut && sSwapIn && <div className="row"><span>Spell swap</span><span>{sSwapOut} → {sSwapIn}</span></div>}
          </div>
          {sc && (cantrips.length < sc.new_cantrips || spells.length < sc.new_spells) && (
            <p className="warn">You've left {sc.new_cantrips - cantrips.length > 0 ? `${sc.new_cantrips - cantrips.length} cantrip` : ""}{sc.new_cantrips - cantrips.length > 0 && sc.new_spells - spells.length > 0 ? " and " : ""}{sc.new_spells - spells.length > 0 ? `${sc.new_spells - spells.length} spell` : ""} unpicked. That's fine: tell your DM what you chose.</p>
          )}
          {acChanges && (
            <>
              <span className="lbl">Your Armor Class is <span className="num">{plan.ac}</span>. What armor do you wear?</span>
              <div className="lu-chips">
                {(["none", "light", "medium", "heavy"] as Armor[]).map((a) => (
                  <button key={a} className={`lu-chip ${armor === a ? "on" : ""}`} onClick={() => setArmor(a)}>{a === "none" ? "No armor" : `${a[0].toUpperCase()}${a.slice(1)}`}</button>
                ))}
                <button className={`lu-chip ${armor === "unsure" ? "on" : ""}`} onClick={() => setArmor("unsure")}>Not sure</button>
              </div>
              <p className="note">A higher ability modifier can raise your Armor Class. If you&rsquo;re not sure, your DM will fix it.</p>
            </>
          )}
          {err && <p className="err">{err}</p>}
        </>
      )}

      <div className="lu-nav">
        <div className="lu-nav-inner">
          {hint() && <span className="hint" role="status">{hint()}</span>}
          <div className="lu-nav-row">
            <button type="button" className="btn btn-secondary" onClick={() => (i === 0 ? onCancel() : setI(i - 1))} disabled={busy}>
              {i === 0 ? "Later" : "Back"}
            </button>
            {i < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" disabled={!!hint()} onClick={() => { setI(i + 1); window.scrollTo({ top: 0 }); }}>Next</button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={busy || !!hint()} onClick={() => void submit()}>{busy ? "Leveling up…" : `Become level ${plan.to_level}`}</button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

function FeatCard({ f, on, onPick }: { f: LevelUpFeat; on: boolean; onPick: (name: string) => void }) {
  const plus = f.name === ASI
    ? "+2 to one ability, or +1 to two"
    : f.asi_options
      ? `+1 to ${f.asi_options.length === 6 ? "any ability" : f.asi_options.map((a) => ABILITY_NAMES[a] ?? a).join(" or ")}`
      : null;
  return (
    <button type="button" aria-pressed={on} className={`lu-card ${on ? "on" : ""}`} onClick={() => onPick(f.name)}>
      <b>{f.name}{f.category === "origin" ? <span className="pill">Origin feat</span> : f.category === "fighting_style" ? <span className="pill">Fighting style</span> : null}</b>
      <small>{f.blurb}</small>
      {plus && <small className="plus" style={{ marginTop: 4 }}>{plus}</small>}
    </button>
  );
}

function AbilityChips({ scores, allowed, asi, setAsi, each, total, disabled = [] }: {
  scores: Record<string, number>; allowed: string[]; asi: Record<string, number>;
  setAsi: (v: Record<string, number>) => void; each: number; total: number; disabled?: string[];
}) {
  const spent = Object.values(asi).reduce((a, b) => a + b, 0);
  return (
    <div className="lu-chips">
      {ABILITIES.filter((a) => allowed.includes(a)).map((a) => {
        const on = (asi[a] ?? 0) > 0;
        const tooHigh = scores[a] + each > 20;
        const off = disabled.includes(a);
        return (
          <button key={a} className={`lu-chip ${on ? "on" : ""}`} disabled={!on && (tooHigh || off || spent + each > total)}
            onClick={() => {
              const next = { ...asi };
              if (on) delete next[a];
              else next[a] = each;
              setAsi(next);
            }}>
            {ABILITY_NAMES[a]} <span className="num">{scores[a]}{on ? ` → ${scores[a] + each}` : ""}</span>
            {off ? <small>already trained in its save</small> : tooHigh ? <small>20 is the most</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function SwapPicker({ label, known, pool, out, into, setOut, setInto, taken }: {
  label: string; known: LevelUpSpell[]; pool: LevelUpSpell[]; out: string; into: string;
  setOut: (v: string) => void; setInto: (v: string) => void; taken: Set<string>;
}) {
  return (
    <>
      <span className="lbl">{label}</span>
      <div className="lu-chips">
        {known.map((s) => (
          <button key={s.name} className={`lu-chip ${out === s.name ? "on" : ""}`} onClick={() => { setOut(out === s.name ? "" : s.name); setInto(""); }}>{s.name}</button>
        ))}
      </div>
      {out && (
        <>
          <p className="note">Replace {out} with:</p>
          <div className="lu-chips">
            {pool.map((s) => (
              <button key={s.name} className={`lu-chip ${into === s.name ? "on" : ""}`} disabled={into !== s.name && taken.has(s.name)}
                onClick={() => setInto(into === s.name ? "" : s.name)}>{s.name}{s.level > 0 ? <small>level {s.level}</small> : null}</button>
            ))}
          </div>
        </>
      )}
    </>
  );
}
