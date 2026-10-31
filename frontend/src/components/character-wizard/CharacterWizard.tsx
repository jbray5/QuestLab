import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";

import { builderApi } from "../../api/characterBuilder";
import type { Ability, BuilderOptions, BuildAsiPick, WizardMode } from "../../api/characterBuilder";
import AsiStep from "./AsiStep";
import { ClassExplainer, BackgroundExplainer, SpeciesTraits, SubclassFeatures } from "./Explainers";
import {
  ABILITIES,
  ABILITY_NAMES,
  BOOK,
  abilityWords,
  armorClass,
  cantripCap as capCantrips,
  derive,
  fmt,
  maxSpellLevel as maxLevelFor,
  mod,
  nextSpellLevelAt,
  ordinal,
  profBonus,
  spellCap as capSpells,
  walkImprovements,
  type PickState,
} from "./rules";

/**
 * CharacterWizard (Plan 74, Plan 126) — the guided, rules-checked character builder.
 *
 * One component, two doors:
 * - `mode="player"` at /join/:campaignId/new — a player builds from the join link and ends on
 *   their new live sheet.
 * - `mode="dm"` at /campaigns/:campaignId/characters/new — the DM's "Add character" (inside the
 *   DM layout); it ends back on the Characters page with the new card lit.
 *
 * Phone-first, one choice per screen. Every step says what the choice gives at the chosen level
 * and why a pick is locked; Review shows the derived sheet. The server applies the same rules.
 */

const NOT_ASSIGNED = "Not assigned yet";

const CSS = `
.cc { min-height: 100dvh; padding: 16px 16px calc(140px + env(safe-area-inset-bottom, 0px)); color: var(--text);
  font-family: var(--font-ui); background: var(--bg); }
.cc.cc-dm { min-height: 0; padding: 0 0 calc(150px + env(safe-area-inset-bottom, 0px)); background: transparent; }
.cc-inner { max-width: 640px; margin: 0 auto; }
.cc .eyebrow-muted { font-size: 0.875rem; color: var(--muted); margin: 4px 0 0; }
.cc h1 { font-family: var(--font-story); font-weight: 700; font-size: clamp(1.4rem, 6vw, 1.8rem); color: var(--text); margin: 0 0 2px; }
.cc .sub { color: var(--text2); margin: 0 0 12px; font-size: 0.9375rem; }
.cc .steps { display: flex; gap: 4px; margin-bottom: 18px; }
.cc .steps i { flex: 1; height: 4px; border-radius: 2px; background: var(--border2); }
.cc .steps i.on { background: var(--accent); }
.cc h2 { font-size: 1.25rem; margin: 0 0 10px; }
.cc h3 { font-size: 1rem; font-weight: 600; margin: 0 0 4px; color: var(--text); }
.cc label, .cc .lbl { display: block; font-size: 0.875rem; font-weight: 500; color: var(--text2); margin: 16px 0 6px; }
.cc input[type=text], .cc textarea, .cc select { min-height: 44px; font-size: 16px; }
.cc-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 150px), 1fr)); gap: 8px; }
.cc-card { text-align: left; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); color: var(--text);
  padding: 10px 12px; cursor: pointer; font: inherit; min-height: 56px; display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cc-card:hover:not(:disabled) { border-color: var(--border2); }
.cc-card.on { border-color: var(--accent-edge); background: var(--accent-soft); }
.cc-card:disabled { opacity: 0.55; cursor: not-allowed; }
.cc-card b { font-weight: 600; font-size: 1rem; color: var(--text); }
.cc-card .cc-card-title { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cc-card small { color: var(--text2); font-size: 0.8125rem; line-height: 1.35; display: block; }
.cc-card small.plus { color: var(--accent-text); font-weight: 500; margin-top: 4px; }
.cc-card small.why { color: var(--amber-text); }
.cc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cc-chip { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; border: 1px solid var(--border2); border-radius: 999px;
  padding: 4px 14px; background: transparent; color: var(--text); font: inherit; font-size: 0.9375rem; cursor: pointer; max-width: 100%; }
.cc-chip:hover:not(:disabled) { background: var(--surface3); }
.cc-chip.on { border-color: var(--accent-edge); background: var(--accent-active); color: var(--accent-active-text); }
.cc-chip:disabled { opacity: 0.45; cursor: not-allowed; }
.cc-chip small { color: var(--muted); font-size: 0.75rem; }
.cc-chip.on small { color: inherit; opacity: 0.8; }
@media (pointer: coarse) { .cc-chip { min-height: 44px; } }
.cc .scores { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
.cc .score { border: 1px solid var(--border); border-radius: 12px; padding: 10px 6px; text-align: center; background: var(--surface);
  display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cc .score b { font-size: 0.8125rem; font-weight: 500; color: var(--text2); }
.cc .score .v { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: 1.6rem; font-weight: 600; color: var(--text); line-height: 1.2; }
.cc .score .m { font-family: var(--font-mono); font-size: 0.875rem; color: var(--text2); }
.cc .score .m small { font-family: var(--font-ui); color: var(--muted); font-size: 0.75rem; display: block; }
.cc .score select { margin-top: 4px; min-height: 44px; text-align: center; font-family: var(--font-mono); padding: 0 4px; }
.cc .score .pm { display: flex; justify-content: center; gap: 6px; margin-top: 4px; }
.cc .score .pm button { width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--border2); background: transparent;
  color: var(--text); font-size: 1.2rem; cursor: pointer; }
.cc .score .pm button:disabled { opacity: 0.35; cursor: not-allowed; }
.cc .score .cap { font-size: 0.75rem; color: var(--muted); min-height: 1em; }
.cc .traits { font-size: 0.9rem; color: var(--text2); padding-left: 1.1rem; margin: 12px 0 0; }
.cc .traits li { margin: 0.3rem 0; }
.cc .traits .later { color: var(--muted); }
.cc .note { color: var(--muted); font-size: 0.875rem; margin: 8px 0; }
.cc .err { color: var(--danger-text); margin: 8px 0; }
.cc .warn { color: var(--amber-text); font-size: 0.9rem; margin: 8px 0; }
.cc .panel { border: 1px solid var(--border); border-radius: 12px; padding: 4px 14px; background: var(--surface); margin: 12px 0 0; }
.cc .panel.pad { padding: 12px 14px; }
.cc .panel .phead { padding: 10px 0 4px; font-weight: 600; color: var(--text); font-size: 0.9375rem; }
.cc .row { display: flex; justify-content: space-between; gap: 16px; padding: 9px 0; border-bottom: 1px solid var(--border); font-size: 0.9375rem; }
.cc .row:last-child { border-bottom: 0; }
.cc .row > span:first-child { color: var(--muted); flex: none; max-width: 45%; }
.cc .row > span:last-child { color: var(--text); text-align: right; min-width: 0; overflow-wrap: anywhere; }
.cc .feat-row { padding: 9px 0; border-bottom: 1px solid var(--border); }
.cc .feat-row:last-child { border-bottom: 0; }
.cc .feat-row b { display: block; font-weight: 600; color: var(--text); font-size: 0.9375rem; }
.cc .feat-row span { display: block; color: var(--text2); font-size: 0.875rem; margin-top: 2px; }
.cc .feat-row .lv { display: inline; color: var(--muted); font-weight: 400; font-size: 0.8125rem; margin-left: 6px; }
.cc .how { color: var(--muted); font-size: 0.8125rem; margin: -4px 0 6px; padding: 0; list-style: none; }
.cc .how li { margin: 2px 0; }
.cc .grid-saves { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; padding: 8px 0 10px; }
.cc .grid-saves div { border: 1px solid var(--border); border-radius: 8px; padding: 6px; text-align: center; background: var(--surface2); }
.cc .grid-saves div.prof { border-color: var(--accent-line); }
.cc .grid-saves small { display: block; color: var(--muted); font-size: 0.75rem; }
.cc-asi { border: 1px solid var(--border); border-radius: 12px; background: var(--surface); margin: 10px 0; }
.cc-asi.open { border-color: var(--border2); }
.cc-asi-head { width: 100%; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; min-height: 52px;
  padding: 8px 14px; background: transparent; border: 0; color: var(--text); font: inherit; cursor: pointer; text-align: left; }
.cc-asi-title { font-weight: 600; white-space: nowrap; }
.cc-asi-sum { color: var(--text2); font-size: 0.875rem; min-width: 0; overflow-wrap: anywhere; }
.cc-asi-body { padding: 0 14px 14px; }
.cc-feat-name { font-weight: 600; font-size: 1.05rem; color: var(--text); }
.cc-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; background: #131816; border-top: 1px solid var(--border);
  padding: 10px 16px calc(10px + env(safe-area-inset-bottom, 0px)); }
.cc-nav-inner { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; gap: 8px; }
.cc-nav-hint { font-size: 0.875rem; color: var(--text2); }
.cc-nav-row { display: flex; gap: 8px; }
.cc-nav-row .btn { flex: 1; min-height: 48px; }
/* DM mode lives inside the DM layout: clear the 224 px sidebar on desktop, and keep the
   buttons out from under the dice button (bottom-right) on narrower screens. */
@media (min-width: 901px) { .cc-dm .cc-nav { left: 224px; } }
@media (max-width: 1100px) { .cc-dm .cc-nav-inner { padding-right: 60px; } }
`;

const STEP_TITLES: Record<string, string> = {
  name: "Name", species: "Species", class: "Class", background: "Background", scores: "Ability scores",
  skills: "Skills and gear", asi: "Improvements", spells: "Spells", review: "Review",
};

interface Draft {
  step: number;
  characterName: string;
  playerName: string;
  species: string;
  customSpecies: string;
  klass: string;
  subclass: string;
  customSub: string;
  level: number;
  background: string;
  customBg: string;
  method: "standard" | "pointbuy" | "manual";
  scores: Record<Ability, number>;
  bonusMode: "21" | "111";
  bonusPlus2: Ability | "";
  bonusPlus1: Ability | "";
  skills: string[];
  originFeat: string;
  kit: string;
  asiPicks: Record<number, PickState>;
  cantrips: string[];
  spells: string[];
  appearance: string;
}

/** Plan 82 — the standard array laid out for a class: primary abilities first, then CON, then the rest. */
function arrayForClass(primary: string[]): Record<Ability, number> {
  const order = [...primary];
  for (const a of ["CON", "DEX", "WIS", "CHA", "INT", "STR"]) if (!order.includes(a)) order.push(a);
  const values = [15, 14, 13, 12, 10, 8];
  const out = {} as Record<Ability, number>;
  order.slice(0, 6).forEach((a, i) => { out[a as Ability] = values[i]; });
  return out;
}

export default function CharacterWizard({ mode }: { mode: WizardMode }) {
  const { campaignId = "" } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dm = mode === "dm";
  const exitPath = dm ? `/campaigns/${campaignId}/characters` : `/join/${campaignId}`;
  const exitLabel = dm ? "Back to characters" : "Back to the party";
  const [opts, setOpts] = useState<BuilderOptions | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The build survives a reload or a remount (a phone switching apps, a tablet turning past
  // the layout's breakpoint): it is kept as a draft in this tab until it is created.
  const draftKey = `ql-wizard-${mode}-${campaignId}`;
  const [draft] = useState<Partial<Draft>>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(draftKey) || "{}") as Partial<Draft>;
    } catch {
      return {};
    }
  });
  const [step, setStep] = useState(draft.step ?? 0);

  // Build state.
  const [characterName, setCharacterName] = useState(draft.characterName ?? "");
  const [playerName, setPlayerName] = useState(draft.playerName ?? "");
  const [species, setSpecies] = useState(draft.species ?? "");
  const [customSpecies, setCustomSpecies] = useState(draft.customSpecies ?? "");
  const [klass, setKlass] = useState(draft.klass ?? "");
  const [subclass, setSubclass] = useState(draft.subclass ?? "");
  const [customSub, setCustomSub] = useState(draft.customSub ?? "");
  const [level, setLevel] = useState(draft.level ?? 1);
  const [background, setBackground] = useState(draft.background ?? "");
  const [customBg, setCustomBg] = useState(draft.customBg ?? "");
  const [method, setMethod] = useState<Draft["method"]>(draft.method ?? "standard");
  const [scores, setScores] = useState<Record<Ability, number>>(draft.scores ?? { STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 });
  const [bonusMode, setBonusMode] = useState<Draft["bonusMode"]>(draft.bonusMode ?? "21");
  const [bonusPlus2, setBonusPlus2] = useState<Ability | "">(draft.bonusPlus2 ?? "");
  const [bonusPlus1, setBonusPlus1] = useState<Ability | "">(draft.bonusPlus1 ?? "");
  const [skills, setSkills] = useState<string[]>(draft.skills ?? []);
  const [originFeat, setOriginFeat] = useState(draft.originFeat ?? "");
  const [kit, setKit] = useState(draft.kit ?? "");
  const [asiPicks, setAsiPicks] = useState<Record<number, PickState>>(draft.asiPicks ?? {});
  const [cantrips, setCantrips] = useState<string[]>(draft.cantrips ?? []);
  const [spells, setSpells] = useState<string[]>(draft.spells ?? []);
  const [appearance, setAppearance] = useState(draft.appearance ?? "");

  useEffect(() => {
    const next: Draft = {
      step, characterName, playerName, species, customSpecies, klass, subclass, customSub, level, background, customBg,
      method, scores, bonusMode, bonusPlus2, bonusPlus1, skills, originFeat, kit, asiPicks, cantrips, spells, appearance,
    };
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* private mode or full storage: the wizard still works, it just won't survive a reload */
    }
  }, [draftKey, step, characterName, playerName, species, customSpecies, klass, subclass, customSub, level, background, customBg,
    method, scores, bonusMode, bonusPlus2, bonusPlus1, skills, originFeat, kit, asiPicks, cantrips, spells, appearance]);

  // Picking a draft back up says so, with a way to start clean.
  const [resumed, setResumed] = useState(() => Boolean(draft.characterName || draft.klass || draft.species));

  function startOver() {
    clearDraft();
    window.location.reload();
  }

  function clearDraft() {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* fine */
    }
  }

  useEffect(() => {
    if (!campaignId) return;
    builderApi
      .options(mode, campaignId)
      .then(setOpts)
      .catch((e: Error) => setLoadError(e.message));
  }, [campaignId, mode]);

  const cls = opts && klass ? opts.classes[klass] : null;
  const speciesRow = opts?.species.find((s) => s.name === species);
  const bg = opts?.backgrounds.find((b) => b.name === background);
  const speciesName = species === "__other" ? customSpecies : species;
  const subclassName = subclass === "__other" ? customSub : subclass;
  const bgName = background === "__other" ? customBg : background;
  const activeSub = cls && level >= cls.subclass_level && subclassName.trim() ? subclassName.trim() : null;

  const bonus = useMemo(() => {
    if (!bg) return {} as Record<string, number>;
    if (bonusMode === "111") return Object.fromEntries(bg.abilities.map((a) => [a, 1]));
    const out: Record<string, number> = {};
    if (bonusPlus2) out[bonusPlus2] = 2;
    if (bonusPlus1 && bonusPlus1 !== bonusPlus2) out[bonusPlus1] = 1;
    return out;
  }, [bg, bonusMode, bonusPlus2, bonusPlus1]);

  const finalScores = useMemo(
    () => Object.fromEntries(ABILITIES.map((a) => [a, Math.min(20, scores[a] + (bonus[a] ?? 0))])) as Record<Ability, number>,
    [scores, bonus],
  );

  const pointsSpent = useMemo(
    () => ABILITIES.reduce((sum, a) => sum + (opts?.point_buy_cost[String(scores[a])] ?? 0), 0),
    [scores, opts],
  );
  const arrayUsed = useMemo(() => [...ABILITIES.map((a) => scores[a])].sort((x, y) => y - x), [scores]);

  // Spell caps mirror the server's SRD tables.
  const cantripCap = opts && klass ? capCantrips(opts, klass, level) : 0;
  const spellCap = opts && klass ? capSpells(opts, klass, level) : 0;
  const maxSpellLevel = opts && klass ? maxLevelFor(opts, klass, level) : 0;
  const classSpells = useMemo(
    () => (opts && klass ? opts.spells.filter((s) => s.classes.includes(klass) && s.level <= Math.max(1, maxSpellLevel)) : []),
    [opts, klass, maxSpellLevel],
  );

  const skillPicksAllowed = (cls?.skills.choose ?? 0) + (speciesRow?.bonus_skill_choices ?? 0);
  const classSkillPicks = skills.filter((s) => !(bg?.skills ?? []).includes(s));

  // Plan 126 — the Ability Score Improvement levels this build has passed, walked in order.
  const asiDue = useMemo(() => (opts && klass ? (opts.asi_levels[klass] ?? []).filter((l) => l <= level) : []), [opts, klass, level]);
  const startFeats = useMemo(() => {
    const out = bg ? [bg.feat.split(" (")[0]] : [];
    if (speciesRow?.bonus_origin_feat && originFeat) out.push(originFeat);
    return out;
  }, [bg, speciesRow, originFeat]);
  const startSkills = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of [...skills, ...(bg?.skills ?? [])]) out[s] = 1;
    return out;
  }, [skills, bg]);
  const walk = useMemo(
    () => (opts && klass
      ? walkImprovements(opts, klass, asiDue, activeSub, { scores: finalScores, feats: startFeats, saves: cls?.saves ?? [], skills: startSkills }, asiPicks)
      : null),
    [opts, klass, asiDue, activeSub, finalScores, startFeats, cls, startSkills, asiPicks],
  );
  const kitRow = cls?.kits.find((x) => x.name === kit) ?? cls?.kits[0];
  const sheet = useMemo(() => {
    if (!opts || !cls || !walk) return null;
    return derive({
      opts, klass, level, species: speciesName, subclass: activeSub, scores: walk.scores,
      feats: walk.feats, saves: walk.saves, skills: walk.skills, kit: kitRow, speed: speciesRow?.speed ?? 30,
    });
  }, [opts, cls, walk, klass, level, speciesName, activeSub, kitRow, speciesRow]);
  const featPicked = useMemo(() => new Set(asiDue.flatMap((l) => asiPicks[l]?.spells ?? [])), [asiDue, asiPicks]);
  const doubled = [...cantrips, ...spells].find((n) => featPicked.has(n));

  const steps = useMemo(() => {
    const s = ["name", "species", "class", "background", "scores", "skills"];
    if (asiDue.length) s.push("asi");
    s.push("spells", "review");
    return s;
  }, [asiDue.length]);
  const at = Math.min(step, steps.length - 1);
  const key = steps[at];

  /** Plan 82 — why Next is disabled, in one line, so nobody sits tapping a dead button. */
  function nextHint(): string | null {
    switch (key) {
      case "name":
        if (!characterName.trim()) return dm ? "Give the character a name." : "Give your character a name.";
        if (!dm && !playerName.trim()) return "Add your own name too.";
        return null;
      case "species": return species === "" ? "Pick a species." : species === "__other" && !customSpecies.trim() ? "Type the species name." : null;
      case "class":
        if (klass === "") return "Pick a class.";
        if (cls && level >= cls.subclass_level && subclass === "__other" && !customSub.trim()) return "Type the subclass name.";
        return null;
      case "background":
        if (background === "") return "Pick a background.";
        if (background === "__other" && !customBg.trim()) return "Type the background name.";
        if (bg && bonusMode === "21" && !bonusPlus2) return "Choose which ability gets the +2 (below).";
        if (bg && bonusMode === "21" && (!bonusPlus1 || bonusPlus1 === bonusPlus2)) return "Now choose the +1.";
        return null;
      case "scores":
        if (method === "pointbuy" && pointsSpent > (opts?.point_buy_budget ?? 27)) return `Point buy is over budget: ${pointsSpent} of ${opts?.point_buy_budget ?? 27}.`;
        if (method === "standard" && opts && JSON.stringify(arrayUsed) !== JSON.stringify([...opts.standard_array].sort((x, y) => y - x))) return "Use each of 15, 14, 13, 12, 10 and 8 once.";
        return null;
      case "skills": {
        const left = skillPicksAllowed - classSkillPicks.length;
        if (left > 0) return `Pick ${left} more skill${left === 1 ? "" : "s"}. Greyed ones already come from the background.`;
        if (speciesRow?.bonus_origin_feat && originFeat === "") return "Humans pick an Origin feat: choose one below.";
        if (cls?.kits.length && kit === "") return "Pick the starting gear.";
        return null;
      }
      case "asi": return walk?.problem ?? null;
      case "spells": return doubled ? `${doubled} is already a feat spell: pick a different one.` : null;
      default: return null;
    }
  }
  const hint = nextHint();

  function setAsiPick(lv: number, pick: PickState) {
    setAsiPicks((prev) => ({ ...prev, [lv]: pick }));
  }

  function asiPayload(): BuildAsiPick[] {
    return asiDue.map((lv) => {
      const p = asiPicks[lv];
      if (!p || !p.name) return { level: lv, name: "", asi: {}, spells: [], skills: [], expertise: [] };
      if (p.name === BOOK) return { level: lv, name: p.bookName.trim(), from_book: true, asi: p.asi, spells: [], skills: [], expertise: [] };
      return { level: lv, name: p.name, asi: p.asi, choice: p.choice || null, spells: p.spells, skills: p.skills, expertise: p.expertise };
    });
  }

  async function submit() {
    if (!campaignId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await builderApi.create(mode, campaignId, {
        character_name: characterName.trim(),
        player_name: playerName.trim() || (dm ? NOT_ASSIGNED : ""),
        species: speciesName,
        character_class: klass,
        subclass: level >= (cls?.subclass_level ?? 3) && subclassName ? subclassName : null,
        background: bgName,
        level,
        scores,
        score_method: method,
        background_bonus: bonus,
        skills,
        origin_feat: speciesRow?.bonus_origin_feat ? originFeat || null : null,
        cantrips,
        spells,
        kit: kit || null,
        asi: asiPayload(),
        appearance: appearance.trim() || null,
      });
      clearDraft();
      if (dm) {
        await qc.invalidateQueries({ queryKey: ["characters", campaignId] });
        navigate(`/campaigns/${campaignId}/characters?new=${encodeURIComponent(res.pc_id)}`, { replace: true });
        return;
      }
      // SEC-002 — the new sheet opens by its link key, never its id.
      const linkKey = res.play_key || res.pc_id;
      try {
        localStorage.setItem(`qj-pick-${campaignId}`, linkKey);
      } catch {
        /* fine */
      }
      navigate(`/play/${linkKey}`, { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className={`cc${dm ? " cc-dm" : ""}`}>
      <style>{CSS}</style>
      <div className="cc-inner">{children}</div>
    </div>
  );

  if (loadError) {
    return shell(
      <>
        <h2 style={{ marginTop: 24 }}>We couldn&rsquo;t open the character builder</h2>
        <p className="err">{loadError}</p>
        <p className="note">{dm ? "Check your connection and try again." : "Check your connection, or ask your DM for a fresh join link."}</p>
        <Link to={exitPath} style={{ display: "inline-flex", alignItems: "center", minHeight: 44 }}>{exitLabel}</Link>
      </>,
    );
  }
  if (!opts) return shell(<p className="sub" style={{ marginTop: 24 }}>Opening the character builder…</p>);

  const levelNote = (() => {
    const pb = profBonus(level);
    const firstAsi = klass ? (opts.asi_levels[klass] ?? [])[0] : 4;
    return `Level ${level}: proficiency bonus ${fmt(pb)}${level >= (firstAsi ?? 4) ? ", and Ability Score Improvements to choose" : ""}.`;
  })();
  const next = maxSpellLevel && klass ? nextSpellLevelAt(opts, klass, level) : null;

  return (
    <div className={`cc${dm ? " cc-dm" : ""}`}>
      <style>{CSS}</style>
      <div className="cc-inner">
        <p className="eyebrow-muted">New character for</p>
        <h1>{opts.campaign_name}</h1>
        <p className="sub">
          {STEP_TITLES[key]} · step <span className="num">{at + 1}</span> of <span className="num">{steps.length}</span>
        </p>
        <div className="steps" aria-hidden>{steps.map((s, i) => <i key={s} className={i <= at ? "on" : ""} />)}</div>
        {resumed && (
          <p className="note" role="status">
            Picking up where you left off.{" "}
            <button type="button" className="btn btn-ghost" style={{ minHeight: 44, padding: "0 0.5rem" }} onClick={startOver}>Start over</button>
          </p>
        )}

        {key === "name" && (
          <>
            <h2>{dm ? "Name and level" : "Who are you?"}</h2>
            <label htmlFor="cname">Character name</label>
            <input id="cname" type="text" value={characterName} onChange={(e) => setCharacterName(e.target.value)} placeholder="e.g. Bram Oakhelm" autoFocus />
            <label htmlFor="pname">{dm ? "Who plays this character" : "Your name (the player)"}</label>
            <input id="pname" type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder={dm ? NOT_ASSIGNED : "What the table calls you"} />
            {dm && <p className="note">Leave it empty if nobody has claimed this character yet. It shows as &ldquo;{NOT_ASSIGNED}&rdquo;.</p>}
            <label htmlFor="lvl">Starting level</label>
            <select id="lvl" value={level} onChange={(e) => setLevel(Number(e.target.value))}>
              {Array.from({ length: 20 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>Level {l}</option>)}
            </select>
            <p className="note">{dm ? "The level your table starts at. Most start at 1 or 3." : "Ask your DM what level the table starts at. Most start at 1 or 3."} {levelNote}</p>
          </>
        )}

        {key === "species" && (
          <>
            <h2>Species</h2>
            <p className="note">Your species sets your size and speed and gives traits you keep all game.</p>
            <div className="cc-cards">
              {opts.species.map((s) => (
                <button type="button" key={s.name} aria-pressed={species === s.name} className={`cc-card ${species === s.name ? "on" : ""}`} onClick={() => setSpecies(s.name)}>
                  <b>{s.name}</b><small>{s.size} · speed <span className="num">{s.speed}</span> ft</small>
                </button>
              ))}
              <button type="button" aria-pressed={species === "__other"} className={`cc-card ${species === "__other" ? "on" : ""}`} onClick={() => setSpecies("__other")}>
                <b>From my book…</b><small>Any species your DM allows. You track its traits.</small>
              </button>
            </div>
            {species === "__other" && (
              <>
                <label htmlFor="cspecies">Species name</label>
                <input id="cspecies" type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="e.g. Aasimar" />
              </>
            )}
            {speciesRow && <SpeciesTraits row={speciesRow} level={level} />}
          </>
        )}

        {key === "class" && (
          <>
            <h2>Class</h2>
            <p className="note">Your class is what you do in a fight and out of it. Tap one to see what it gives at level {level}.</p>
            <div className="cc-cards">
              {Object.entries(opts.classes).map(([name, c]) => (
                <button type="button" key={name} aria-pressed={klass === name} className={`cc-card ${klass === name ? "on" : ""}`} onClick={() => {
                  setKlass(name); setSubclass(""); setSkills([]); setKit(c.kits[0]?.name ?? ""); setCantrips([]); setSpells([]); setAsiPicks({});
                  if (method === "standard") setScores(arrayForClass(c.primary ?? []));
                  window.setTimeout(() => document.getElementById("cc-class-more")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50);
                }}>
                  <b>{name}</b>
                  <small>Best with {abilityWords(c.primary)}</small>
                  <small style={{ color: "var(--muted)" }}>Hit die d{c.hit_die}{c.spellcasting ? " · casts spells" : ""}</small>
                </button>
              ))}
            </div>
            <span id="cc-class-more" />
            {cls && (
              <>
                <span className="lbl">Subclass (your specialty, from level {cls.subclass_level})</span>
                <div className="cc-chips">
                  {cls.srd_subclasses.map((s) => (
                    <button type="button" key={s} aria-pressed={subclass === s} className={`cc-chip ${subclass === s ? "on" : ""}`} disabled={level < cls.subclass_level} onClick={() => setSubclass(s)}>
                      {s}{level < cls.subclass_level ? <small>comes at level {cls.subclass_level}</small> : null}
                    </button>
                  ))}
                  <button type="button" aria-pressed={subclass === "__other"} className={`cc-chip ${subclass === "__other" ? "on" : ""}`} disabled={level < cls.subclass_level} onClick={() => setSubclass("__other")}>From my book…</button>
                </div>
                {level < cls.subclass_level ? (
                  <p className="note">A {klass} picks a subclass at level {cls.subclass_level}. Start at level {cls.subclass_level} or higher to choose it now, or pick it when you level up.</p>
                ) : (
                  <>
                    {subclass === "__other" && (
                      <input type="text" value={customSub} onChange={(e) => setCustomSub(e.target.value)} placeholder="e.g. Oath of the Ancients" style={{ marginTop: 8 }} aria-label="Subclass name" />
                    )}
                    <p className="note">The free rules (SRD) include one subclass per class; a subclass from your book is recorded by name and you play it from the book. You can also leave it for now.</p>
                    {subclass && subclass !== "__other" && <SubclassFeatures opts={opts} klass={klass} subclass={subclass} level={level} />}
                  </>
                )}
                <ClassExplainer opts={opts} klass={klass} level={level} subclass={activeSub} />
              </>
            )}
          </>
        )}

        {key === "background" && (
          <>
            <h2>Background</h2>
            <p className="note">Where you come from. It gives two skills, a tool, an Origin feat and bonuses to three ability scores.</p>
            <div className="cc-cards">
              {opts.backgrounds.map((b) => (
                <button type="button" key={b.name} aria-pressed={background === b.name} className={`cc-card ${background === b.name ? "on" : ""}`} onClick={() => { setBackground(b.name); setBonusPlus2(""); setBonusPlus1(""); window.setTimeout(() => document.getElementById("cc-bonus")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50); }}>
                  <b>{b.name}</b><small>{b.blurb}</small>
                </button>
              ))}
              <button type="button" aria-pressed={background === "__other"} className={`cc-card ${background === "__other" ? "on" : ""}`} onClick={() => setBackground("__other")}>
                <b>From my book…</b><small>Recorded by name; no automatic bonuses.</small>
              </button>
            </div>
            {background === "__other" && (
              <input type="text" value={customBg} onChange={(e) => setCustomBg(e.target.value)} placeholder="Background name" style={{ marginTop: 8 }} aria-label="Background name" />
            )}
            {bg && (
              <>
                <BackgroundExplainer opts={opts} bg={bg} />
                <span className="lbl" id="cc-bonus">Ability bonus from {bg.name}: pick where the +2 and +1 go</span>
                <div className="cc-chips" style={{ marginBottom: 8 }}>
                  <button type="button" aria-pressed={bonusMode === "21"} className={`cc-chip ${bonusMode === "21" ? "on" : ""}`} onClick={() => setBonusMode("21")}>+2 and +1</button>
                  <button type="button" aria-pressed={bonusMode === "111"} className={`cc-chip ${bonusMode === "111" ? "on" : ""}`} onClick={() => setBonusMode("111")}>+1 to all three</button>
                </div>
                {bonusMode === "21" && (
                  <div className="cc-chips">
                    {bg.abilities.map((a) => (
                      <button type="button" key={a} aria-pressed={bonusPlus2 === a} className={`cc-chip ${bonusPlus2 === a ? "on" : ""}`} onClick={() => { setBonusPlus2(a); if (bonusPlus1 === a) setBonusPlus1(""); }}>+2 {ABILITY_NAMES[a]}</button>
                    ))}
                    <span style={{ width: "100%" }} />
                    {bg.abilities.map((a) => (
                      <button type="button" key={a} aria-pressed={bonusPlus1 === a} className={`cc-chip ${bonusPlus1 === a ? "on" : ""}`} disabled={bonusPlus2 === a} onClick={() => setBonusPlus1(a)}>
                        +1 {ABILITY_NAMES[a]}{bonusPlus2 === a ? <small>has the +2</small> : null}
                      </button>
                    ))}
                  </div>
                )}
                <p className="note">The background can only raise {abilityWords(bg.abilities, ", ")}. {cls ? `A ${klass} leans on ${abilityWords(cls.primary)}.` : ""}</p>
              </>
            )}
          </>
        )}

        {key === "scores" && (
          <>
            <h2>Ability scores</h2>
            <p className="note">Each score gives a modifier you add to rolls: 10 or 11 is +0, and every 2 points above adds +1.</p>
            <div className="cc-chips" style={{ marginBottom: 10 }}>
              <button type="button" aria-pressed={method === "standard"} className={`cc-chip ${method === "standard" ? "on" : ""}`} onClick={() => { setMethod("standard"); setScores(arrayForClass(cls?.primary ?? [])); }}>Standard array</button>
              <button type="button" aria-pressed={method === "pointbuy"} className={`cc-chip ${method === "pointbuy" ? "on" : ""}`} onClick={() => { setMethod("pointbuy"); setScores({ STR: 8, DEX: 8, CON: 8, INT: 8, WIS: 8, CHA: 8 }); }}>Point buy</button>
              <button type="button" aria-pressed={method === "manual"} className={`cc-chip ${method === "manual" ? "on" : ""}`} onClick={() => setMethod("manual")}>I rolled them</button>
            </div>
            {method === "pointbuy" && <p className="note"><span className="num">{pointsSpent}</span> of <span className="num">{opts.point_buy_budget}</span> points spent. Scores run 8 to 15 before the background bonus; 14 and 15 cost more.</p>}
            {method === "standard" && <p className="note">Give each ability one of 15, 14, 13, 12, 10 and 8. {cls ? `A ${klass} wants high ${abilityWords(cls.primary)}.` : ""}</p>}
            {method === "manual" && <p className="note">Rolled your scores? Set each one with − and + (3 to 20 before the background bonus).</p>}
            <div className="scores">
              {ABILITIES.map((a) => {
                const cost = (v: number) => opts.point_buy_cost[String(v)] ?? 99;
                const lo = method === "pointbuy" ? 8 : 3;
                const hi = method === "pointbuy" ? 15 : 20;
                const cantAfford = method === "pointbuy" && scores[a] < hi && pointsSpent - cost(scores[a]) + cost(scores[a] + 1) > opts.point_buy_budget;
                const capNote = scores[a] >= hi ? `${hi} is the most` : cantAfford ? "not enough points" : scores[a] <= lo ? `${lo} is the least` : "";
                return (
                  <div key={a} className="score">
                    <b>{ABILITY_NAMES[a]}</b>
                    <div className="v">{finalScores[a]}</div>
                    <div className="m">{fmt(mod(finalScores[a]))}{bonus[a] ? <small>+{bonus[a]} from background</small> : null}</div>
                    {method === "standard" ? (
                      <select aria-label={`${ABILITY_NAMES[a]} score`} value={scores[a]} onChange={(e) => setScores({ ...scores, [a]: Number(e.target.value) })}>
                        {opts.standard_array.map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <>
                        <div className="pm">
                          <button type="button" aria-label={`Lower ${ABILITY_NAMES[a]}`} disabled={scores[a] <= lo} onClick={() => setScores({ ...scores, [a]: Math.max(lo, scores[a] - 1) })}>−</button>
                          <button type="button" aria-label={`Raise ${ABILITY_NAMES[a]}`} disabled={scores[a] >= hi || cantAfford} onClick={() => setScores({ ...scores, [a]: Math.min(hi, scores[a] + 1) })}>+</button>
                        </div>
                        <span className="cap">{capNote}</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {method === "standard" && JSON.stringify(arrayUsed) !== JSON.stringify([...opts.standard_array].sort((x, y) => y - x)) && (
              <p className="err">Use each of 15, 14, 13, 12, 10 and 8 exactly once.</p>
            )}
            {asiDue.length > 0 && <p className="note">Your Ability Score Improvements come in step {steps.indexOf("asi") + 1}, after skills.</p>}
          </>
        )}

        {key === "skills" && cls && (
          <>
            <h2>Skills</h2>
            <p className="note">
              Skills are what you&rsquo;re trained at: you add your proficiency bonus ({fmt(profBonus(level))} at level {level}) to those checks.
              Pick {skillPicksAllowed}: <span className="num">{classSkillPicks.length}</span> of <span className="num">{skillPicksAllowed}</span> picked.
              {bg ? ` ${bg.name} already gives ${bg.skills.join(" and ")}.` : ""}
            </p>
            {(() => {
              const bonusN = speciesRow?.bonus_skill_choices ?? 0;
              const bonusFrom = speciesRow?.bonus_skill_from;
              const offListPicked = classSkillPicks.filter((x) => !cls.skills.from.includes(x)).length;
              const chip = (s: string) => {
                const fromBg = (bg?.skills ?? []).includes(s);
                const onList = cls.skills.from.includes(s);
                const allowed = onList || skills.includes(s) || (bonusN > offListPicked && (!bonusFrom || bonusFrom.includes(s)));
                const on = skills.includes(s) || fromBg;
                const full = classSkillPicks.length >= skillPicksAllowed && !skills.includes(s);
                return (
                  <button type="button" key={s} aria-pressed={on} className={`cc-chip ${on ? "on" : ""}`} disabled={fromBg || !allowed || full}
                    onClick={() => setSkills(on ? skills.filter((x) => x !== s) : [...skills, s])}>
                    {s} <small>{fromBg ? "from background" : ABILITY_NAMES[opts.skills[s]] ?? opts.skills[s]}</small>
                  </button>
                );
              };
              const others = Object.keys(opts.skills).filter((s) => !cls.skills.from.includes(s));
              return (
                <>
                  <span className="lbl">{klass} skills: pick {cls.skills.choose}</span>
                  <div className="cc-chips">{cls.skills.from.map(chip)}</div>
                  {others.length > 0 && (
                    <>
                      <span className="lbl">
                        {bonusN > 0
                          ? `${species} adds one more${bonusFrom ? `: ${bonusFrom.join(", ")}` : ", any skill"}`
                          : `Not on the ${klass} list`}
                      </span>
                      <div className="cc-chips">{others.map(chip)}</div>
                    </>
                  )}
                </>
              );
            })()}
            {speciesRow?.bonus_origin_feat && (
              <>
                <span className="lbl">Versatile: pick an Origin feat (required)</span>
                <div className="cc-cards">
                  {opts.origin_feats.map((f) => {
                    // A feat is taken once unless it says otherwise (Magic Initiate, Skilled).
                    const fromBg = bg?.feat.split(" (")[0] === f.name && !opts.feats.find((x) => x.name === f.name)?.repeatable;
                    return (
                      <button type="button" key={f.name} aria-pressed={originFeat === f.name} className={`cc-card ${originFeat === f.name ? "on" : ""}`} disabled={fromBg} onClick={() => setOriginFeat(f.name)}>
                        <b>{f.name}</b><small className={fromBg ? "why" : undefined}>{fromBg ? `${bg?.name} already gives it.` : f.blurb}</small>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
            {cls.kits.length > 0 && (
              <>
                <span className="lbl">Starting gear</span>
                <div className="cc-cards">
                  {cls.kits.map((k) => {
                    const preview = armorClass(opts, klass, finalScores, k, startFeats, activeSub);
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
              </>
            )}
          </>
        )}

        {key === "asi" && cls && walk && (
          <AsiStep opts={opts} klass={klass} level={level} levels={asiDue} contexts={walk.contexts} picks={asiPicks} setPick={setAsiPick} />
        )}

        {key === "spells" && (
          <>
            <h2>Spells</h2>
            {!cls?.spellcasting ? (
              <>
                <p className="note">A {klass} doesn&rsquo;t cast spells, so there&rsquo;s nothing to pick here. Tap Next.</p>
                {walk && walk.featSpells.length > 0 && <p className="note">Your feats give you: {walk.featSpells.join(", ")}.</p>}
              </>
            ) : (
              <>
                <p className="note">
                  A level {level} {klass} knows <span className="num">{cantripCap}</span> cantrip{cantripCap === 1 ? "" : "s"} and prepares{" "}
                  <span className="num">{spellCap}</span> spell{spellCap === 1 ? "" : "s"} of up to {ordinal(Math.max(1, maxSpellLevel))} level,
                  cast with {ABILITY_NAMES[cls.spellcasting.ability]}.
                  {next ? ` ${ordinal(next.spellLevel)}-level spells come at level ${next.at}.` : ""}
                </p>
                {cantripCap > 0 && (
                  <>
                    <span className="lbl">Cantrips (cast any time, no slot): <span className="num">{cantrips.length}</span> of <span className="num">{cantripCap}</span></span>
                    <div className="cc-chips">
                      {classSpells.filter((s) => s.level === 0).map((s) => (
                        <button type="button" key={s.name} aria-pressed={cantrips.includes(s.name)} className={`cc-chip ${cantrips.includes(s.name) ? "on" : ""}`}
                          disabled={!cantrips.includes(s.name) && (cantrips.length >= cantripCap || featPicked.has(s.name))}
                          onClick={() => setCantrips(cantrips.includes(s.name) ? cantrips.filter((x) => x !== s.name) : [...cantrips, s.name])}>
                          {s.name}{featPicked.has(s.name) ? <small>from a feat</small> : null}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <span className="lbl">Prepared spells (these use spell slots): <span className="num">{spells.length}</span> of <span className="num">{spellCap}</span></span>
                {Array.from({ length: Math.max(1, maxSpellLevel) }, (_, k) => k + 1).map((lvl) => {
                  const list = classSpells.filter((s) => s.level === lvl);
                  if (!list.length) return null;
                  return (
                    <div key={lvl} style={{ marginBottom: 8 }}>
                      <span className="note">{ordinal(lvl)} level</span>
                      <div className="cc-chips">
                        {list.map((s) => (
                          <button type="button" key={s.name} aria-pressed={spells.includes(s.name)} className={`cc-chip ${spells.includes(s.name) ? "on" : ""}`}
                            disabled={!spells.includes(s.name) && (spells.length >= spellCap || featPicked.has(s.name))}
                            onClick={() => setSpells(spells.includes(s.name) ? spells.filter((x) => x !== s.name) : [...spells, s.name])}>
                            {s.name}{featPicked.has(s.name) ? <small>from a feat</small> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {walk && walk.featSpells.length > 0 && <p className="note">Your feats also give you: {walk.featSpells.join(", ")}. They don&rsquo;t count against these picks.</p>}
                <p className="note">Prepared spells can be changed any time from the sheet.</p>
              </>
            )}
          </>
        )}

        {key === "review" && sheet && walk && cls && (
          <>
            <h2>Review</h2>
            <div className="panel">
              <div className="row"><span>Name</span><span className="story" style={{ fontWeight: 700 }}>{characterName}</span></div>
              {dm && <div className="row"><span>Played by</span><span>{playerName.trim() || NOT_ASSIGNED}</span></div>}
              <div className="row"><span>Species</span><span>{speciesName}</span></div>
              <div className="row"><span>Class</span><span>{klass} <span className="num">{level}</span>{subclassName && level >= cls.subclass_level ? ` · ${subclassName}` : ""}</span></div>
              <div className="row"><span>Background</span><span>{bgName}</span></div>
            </div>

            <div className="panel">
              <div className="phead">Hit points <span className="num" style={{ float: "right" }}>{sheet.hp}</span></div>
              <ul className="how">{sheet.hpLines.map((l) => <li key={l}>{l}</li>)}</ul>
              <div className="phead">Armor Class <span className="num" style={{ float: "right" }}>{sheet.ac}</span></div>
              <ul className="how"><li>{sheet.acHow}</li></ul>
              <div className="row"><span>Proficiency bonus</span><span className="num">{fmt(sheet.pb)}</span></div>
              <div className="row"><span>Initiative</span><span className="num">{fmt(sheet.initiative)}</span></div>
              <div className="row"><span>Speed</span><span><span className="num">{speciesRow?.speed ?? 30}</span> ft</span></div>
              <div className="row"><span>Passive Perception</span><span className="num">{sheet.passivePerception}</span></div>
            </div>

            <div className="panel">
              <div className="phead">Ability scores</div>
              <div className="grid-saves">
                {ABILITIES.map((a) => (
                  <div key={a}>
                    <small>{ABILITY_NAMES[a]}</small>
                    <span className="num">{walk.scores[a]}</span> <span className="num" style={{ color: "var(--text2)" }}>({fmt(mod(walk.scores[a]))})</span>
                  </div>
                ))}
              </div>
              <div className="phead">Saving throws</div>
              <div className="grid-saves">
                {sheet.saves.map((s) => (
                  <div key={s.ability} className={s.prof ? "prof" : ""}>
                    <small>{ABILITY_NAMES[s.ability]}{s.prof ? " · trained" : ""}</small>
                    <span className="num">{fmt(s.bonus)}</span>
                  </div>
                ))}
              </div>
              <div className="row"><span>Skills</span><span>
                {sheet.skills.filter((s) => s.rank > 0).map((s) => `${s.name} ${fmt(s.bonus)}${s.rank > 1 ? " (expertise)" : ""}`).join(", ") || "None yet"}
              </span></div>
              {sheet.slots && <div className="row"><span>Spell slots</span><span>{sheet.slots}</span></div>}
              <div className="row"><span>Feats</span><span>{walk.feats.length ? walk.feats.join(", ") : "None"}</span></div>
              {walk.summary.length > 0 && <div className="row"><span>Improvements</span><span>{walk.summary.join("; ")}</span></div>}
              {cls.spellcasting && <div className="row"><span>Spells</span><span>{[...cantrips, ...spells].join(", ") || "None yet"}</span></div>}
              {walk.featSpells.length > 0 && <div className="row"><span>Feat spells</span><span>{walk.featSpells.join(", ")}</span></div>}
              <div className="row"><span>Gear</span><span>{kitRow ? kitRow.name : "None"}</span></div>
            </div>
            {sheet.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
            <p className="note">Everything here can be changed later from the sheet{dm ? "" : " or by your DM"}. Class choices such as Expertise, a Fighting Style or Eldritch Invocations go on the sheet{dm ? "" : " with your DM"}.</p>
            <label htmlFor="look">{dm ? "How they look (optional)" : "How you look (optional)"}</label>
            <textarea id="look" rows={4} value={appearance} onChange={(e) => setAppearance(e.target.value)} placeholder="e.g. Scarred, grey braids, a dented breastplate and a green cloak" />
            {error && <p className="err" role="alert">{error}</p>}
          </>
        )}
      </div>

      <div className="cc-nav">
        <div className="cc-nav-inner">
          {at < steps.length - 1 && hint && <span className="cc-nav-hint" role="status">{hint}</span>}
          <div className="cc-nav-row">
            <button type="button" className="btn btn-secondary" onClick={() => {
              if (at === 0) {
                clearDraft();
                navigate(exitPath);
              } else setStep(at - 1);
            }} disabled={busy}>
              {at === 0 ? exitLabel : "Back"}
            </button>
            {at < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => { setStep(at + 1); setResumed(false); window.scrollTo({ top: 0 }); }} disabled={!!hint}>Next</button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !!walk?.problem}>
                {busy ? "Creating…" : dm ? "Create character" : "Create and open my sheet"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
