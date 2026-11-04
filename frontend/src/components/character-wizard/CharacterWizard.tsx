import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { builderApi } from "../../api/characterBuilder";
import type { Ability, BuildAsiPick, BuilderSpecies, CharacterBuildBody, ClassChoicePick, OriginFeatPicks, WizardMode } from "../../api/characterBuilder";
import AsiStep from "./AsiStep";
import ChoicesStep from "./ChoicesStep";
import { ClassExplainer, BackgroundExplainer, HomebrewTag, SpeciesTraits, SubclassFeatures } from "./Explainers";
import RaceStep2014, { OTHER, type OriginControls } from "./RaceStep2014";
import SkillsStep from "./SkillsStep";
import SpellsStep from "./SpellsStep";
import {
  ABILITIES,
  ABILITY_NAMES,
  BOOK,
  MAGIC_INITIATE,
  abilityWords,
  armorTraining,
  bonusWords,
  choiceEntry,
  derive,
  emptyOrigin,
  fmt,
  is2014,
  miNeed,
  mod,
  originBonus,
  originSlots,
  profBonus,
  raceCantripProblem,
  raceHint,
  skillOverlap,
  slotBonus,
  splitFeat,
  spellPlan,
  walkClassChoices,
  walkImprovements,
  type ChoicePicks,
  type ChoiceState,
  type MiNeed,
  type OriginPickState,
  type PickState,
} from "./rules";

/**
 * CharacterWizard (Plan 74, Plan 126, Plan 128) — the guided, rules-checked character builder.
 *
 * One component, two doors:
 * - `mode="player"` at /join/:campaignId/new — a player builds from the join link and ends on
 *   their new live sheet.
 * - `mode="dm"` at /campaigns/:campaignId/characters/new — the DM's "Add character" (inside the
 *   DM layout); it ends back on the Characters page with the new card lit.
 *
 * Phone-first, one decision per screen (long steps fold into sections). Every step says what a
 * choice gives at the chosen level and why a pick is locked, and Next stays off (with the reason)
 * until the step is complete: the subclass at its level, the class's own choices, cantrips and
 * prepared spells up to the count, Magic Initiate's spells. Review shows the derived sheet. The
 * server checks the same rules on Create.
 *
 * Plan 131: a 2014 campaign (`opts.ruleset === "2014"`) gets the 2014 steps: a race with its
 * ability bonuses and subrace (the Half-Elf's two +1s, the Dragonborn's ancestry), a background
 * with no bonus and no Origin feat (a book background picks 2 skills), racial bonuses on the
 * scores, 2014 spell counts (the Wizard's spellbook) and no Epic Boon. A 2024 campaign renders
 * and sends exactly what it did.
 *
 * Plan 133: the campaign DM's homebrew races and subclasses sit with the SRD ones, marked
 * "Yours" for the DM and "Your table's" for a player; a homebrew subclass's features show in the
 * explainers in the DM's words. In DM mode, "Make a custom race / subclass" opens the catalog in
 * a new tab, and the options reload when the DM comes back. A 2014 campaign with custom origin on
 * lets the race's fixed bonuses move ("+2 → [ability]").
 *
 * Plan 135: the DM's homebrew feats join the improvement step (and a homebrew fighting style the
 * Fighting Style choice), marked the same way; in DM mode "Make a custom feat" opens the Feats tab.
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
.cc-card small.why, .cc small.why { color: var(--amber-text); }
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
.cc-spells { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.cc-spell { border: 1px solid var(--border); border-radius: 10px; background: var(--surface2); }
.cc-spell.on { border-color: var(--accent-edge); background: var(--accent-soft); }
.cc-spell-line { display: grid; grid-template-columns: 44px 1fr 28px; align-items: center; gap: 4px; padding: 4px 8px 4px 4px; }
.cc-spell-pick { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; background: transparent;
  border: 0; color: var(--accent-active-text); cursor: pointer; border-radius: 8px; position: relative; }
.cc-spell-pick::before { content: ""; position: absolute; width: 22px; height: 22px; border: 1.5px solid var(--border2); border-radius: 6px; }
.cc-spell-pick[aria-pressed=true]::before, .cc-spell-pick.locked::before { background: var(--accent-active); border-color: var(--accent-edge); }
.cc-spell-pick svg { position: relative; }
.cc-spell-pick:disabled { opacity: 0.4; cursor: not-allowed; }
.cc-spell-pick.locked { color: var(--accent-active-text); cursor: default; }
.cc-spell-main { text-align: left; background: transparent; border: 0; color: var(--text); font: inherit; cursor: pointer; padding: 6px 0;
  display: flex; flex-direction: column; gap: 2px; min-width: 0; min-height: 44px; justify-content: center; }
.cc-spell-name { font-weight: 600; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.cc-spell-name small { font-weight: 400; color: var(--muted); font-size: 0.75rem; }
.cc-spell-meta { color: var(--text2); font-size: 0.8125rem; }
.cc-spell-sum { color: var(--muted); font-size: 0.8125rem; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cc-spell-more { color: var(--muted); display: inline-flex; justify-content: center; }
.cc-spell-detail { padding: 2px 14px 12px 52px; font-size: 0.9rem; color: var(--text2); }
.cc-spell-detail.in-sheet { padding: 0; }
.cc-spell-detail dl { margin: 0 0 8px; }
.cc-spell-row { display: flex; gap: 12px; padding: 4px 0; border-bottom: 1px solid var(--border); font-size: 0.875rem; }
.cc-spell-row dt { color: var(--muted); flex: none; width: 7.5rem; }
.cc-spell-row dd { margin: 0; color: var(--text); min-width: 0; overflow-wrap: anywhere; }
.cc-spell-note { color: var(--amber-text); font-size: 0.875rem; margin: 8px 0; }
.cc-spell-text { margin: 8px 0; line-height: 1.5; white-space: pre-line; }
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
@media (max-width: 640px) { .cc-spell-detail { padding-left: 14px; } .cc-spell-row dt { width: 6.5rem; } }
`;

const STEP_TITLES: Record<string, string> = {
  name: "Name", species: "Species", class: "Class", background: "Background", scores: "Ability scores",
  skills: "Skills and gear", choices: "Class choices", asi: "Improvements", spells: "Spells", review: "Review",
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
  classPicks: ChoicePicks;
  bgFeatPicks: OriginPickState;
  originPicks: OriginPickState;
  // Plan 131 — the 2014 picks.
  subrace: string;
  customSubrace: string;
  abilityChoice: Record<string, number>;
  speciesPicks: ChoicePicks;
  bgSkills: string[];
  prepared: string[];
  // Plan 133 — custom origin: where each of the race's fixed bonuses goes, for the race `key`.
  origin: { key: string; picks: string[] };
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

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export default function CharacterWizard({ mode }: { mode: WizardMode }) {
  const { campaignId = "" } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dm = mode === "dm";
  const exitPath = dm ? `/campaigns/${campaignId}/characters` : `/join/${campaignId}`;
  const exitLabel = dm ? "Back to characters" : "Back to the party";
  // Plan 128 — the options come from the query cache: a remount (a phone switching apps, a hot
  // reload, a layout change) shows the wizard straight away instead of blanking it while the
  // options load again (persona run 3: the Spells step flashed "Opening the character builder").
  const optsQuery = useQuery({
    queryKey: ["character-builder-options", mode, campaignId],
    queryFn: () => builderApi.options(mode, campaignId),
    enabled: !!campaignId,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  const opts = optsQuery.data ?? null;
  const loadError = optsQuery.error ? (optsQuery.error as Error).message : null;
  // Plan 133 — after "Make a custom race / subclass" (a new tab), coming back to this tab
  // reloads the options, so the DM's new homebrew is on the list straight away.
  const reloadOnReturn = useRef(false);
  useEffect(() => {
    if (!dm) return;
    const reload = () => {
      if (!reloadOnReturn.current || document.visibilityState === "hidden") return;
      reloadOnReturn.current = false;
      void qc.invalidateQueries({ queryKey: ["character-builder-options", mode, campaignId] });
    };
    window.addEventListener("focus", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.removeEventListener("focus", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [dm, qc, mode, campaignId]);
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
  const [classPicks, setClassPicks] = useState<ChoicePicks>(draft.classPicks ?? {});
  const [bgFeatPicks, setBgFeatPicks] = useState<OriginPickState>(draft.bgFeatPicks ?? emptyOrigin());
  const [originPicks, setOriginPicks] = useState<OriginPickState>(draft.originPicks ?? emptyOrigin());
  // Plan 131 — the 2014 picks: subrace, the Half-Elf's +1s (or a book race's bonuses), the
  // Dragonborn's ancestry, a book background's skills, a Wizard's prepared spells.
  const [subrace, setSubrace] = useState(draft.subrace ?? "");
  const [customSubrace, setCustomSubrace] = useState(draft.customSubrace ?? "");
  const [abilityChoice, setAbilityChoice] = useState<Record<string, number>>(draft.abilityChoice ?? {});
  const [speciesPicks, setSpeciesPicks] = useState<ChoicePicks>(draft.speciesPicks ?? {});
  const [bgSkills, setBgSkills] = useState<string[]>(draft.bgSkills ?? []);
  const [prepared, setPrepared] = useState<string[]>(draft.prepared ?? []);
  const [origin, setOrigin] = useState<Draft["origin"]>(draft.origin ?? { key: "", picks: [] });

  useEffect(() => {
    const next: Draft = {
      step, characterName, playerName, species, customSpecies, klass, subclass, customSub, level, background, customBg,
      method, scores, bonusMode, bonusPlus2, bonusPlus1, skills, originFeat, kit, asiPicks, cantrips, spells, appearance,
      classPicks, bgFeatPicks, originPicks, subrace, customSubrace, abilityChoice, speciesPicks, bgSkills, prepared, origin,
    };
    try {
      sessionStorage.setItem(draftKey, JSON.stringify(next));
    } catch {
      /* private mode or full storage: the wizard still works, it just won't survive a reload */
    }
  }, [draftKey, step, characterName, playerName, species, customSpecies, klass, subclass, customSub, level, background, customBg,
    method, scores, bonusMode, bonusPlus2, bonusPlus1, skills, originFeat, kit, asiPicks, cantrips, spells, appearance,
    classPicks, bgFeatPicks, originPicks, subrace, customSubrace, abilityChoice, speciesPicks, bgSkills, prepared, origin]);

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

  const old = is2014(opts);
  const cls = opts && klass ? opts.classes[klass] : null;
  const speciesRow = opts?.species.find((s) => s.name === species);
  const bg = opts?.backgrounds.find((b) => b.name === background);
  const speciesName = species === "__other" ? customSpecies : species;
  const subclassName = subclass === "__other" ? customSub : subclass;
  const bgName = background === "__other" ? customBg : background;
  const activeSub = cls && level >= cls.subclass_level && subclassName.trim() ? subclassName.trim() : null;
  const versatile = !!speciesRow?.bonus_origin_feat;
  // Plan 131 — a 2014 race: the subrace (stored as the race, "Hill Dwarf") and its bonuses.
  const subraceRow = old ? speciesRow?.subraces?.find((s) => s.name === subrace) : undefined;
  const subraceName = old && speciesRow?.subraces?.length ? (subrace === OTHER ? customSubrace.trim() : subrace) : "";
  const raceName = subraceName || speciesName;
  const bookBackground = old && background === "__other";
  // Plan 133 — custom origin (a 2014 campaign's switch): each of the race's fixed bonuses can
  // move. The picks belong to one race (the race's slots first, so picking its subrace keeps
  // them); another race starts from its own.
  const originKey = species;
  const slots = useMemo(
    () => (old && opts?.custom_origin && species !== "__other"
      ? originSlots(speciesRow, subraceRow, origin.key === originKey ? origin.picks : [])
      : []),
    [old, opts?.custom_origin, species, speciesRow, subraceRow, origin, originKey],
  );
  const movedBonus = originBonus(slots);
  // The ability choice (the Half-Elf's +1s) stays off wherever the race's bonuses are now.
  const raceRow = useMemo<BuilderSpecies | undefined>(
    () => (speciesRow?.ability_choice && slots.length
      ? { ...speciesRow, ability_choice: { ...speciesRow.ability_choice, exclude: [...new Set(slots.map((s) => s.pick))] } }
      : speciesRow),
    [speciesRow, slots],
  );
  const originControls: OriginControls | null = slots.length
    ? {
        slots,
        setPick: (i, a) => {
          // Picking an ability another bonus has swaps the two: no ability gets two.
          const next = slots.map((s) => s.pick);
          const j = next.indexOf(a);
          if (j >= 0 && j !== i) next[j] = next[i];
          next[i] = a;
          setOrigin({ key: originKey, picks: next });
          if (abilityChoice[a]) {
            const left = { ...abilityChoice };
            delete left[a];
            setAbilityChoice(left);
          }
        },
        reset: () => setOrigin({ key: originKey, picks: [] }),
      }
    : null;

  const bonus = useMemo(() => {
    if (!bg || old) return {} as Record<string, number>;
    if (bonusMode === "111") return Object.fromEntries(bg.abilities.map((a) => [a, 1]));
    const out: Record<string, number> = {};
    if (bonusPlus2) out[bonusPlus2] = 2;
    if (bonusPlus1 && bonusPlus1 !== bonusPlus2) out[bonusPlus1] = 1;
    return out;
  }, [bg, old, bonusMode, bonusPlus2, bonusPlus1]);

  // Plan 131 — 2014 ability bonuses come from the race: its own, its subrace's, and the ones
  // picked (the Half-Elf's +1s, or a book race's).
  const raceBonus = useMemo(() => {
    const out: Record<string, number> = {};
    if (!old) return out;
    // Plan 133 — with custom origin the fixed bonuses sit where the slots put them.
    const fixed = slots.length ? [slotBonus(slots)] : [speciesRow?.ability_bonuses, subraceRow?.ability_bonuses];
    for (const b of [...fixed, abilityChoice]) {
      for (const [a, v] of Object.entries(b ?? {})) if (v) out[a] = (out[a] ?? 0) + v;
    }
    return out;
  }, [old, speciesRow, subraceRow, abilityChoice, slots]);

  const finalScores = useMemo(
    () => Object.fromEntries(ABILITIES.map((a) => [a, Math.min(20, scores[a] + ((old ? raceBonus : bonus)[a] ?? 0))])) as Record<Ability, number>,
    [scores, bonus, old, raceBonus],
  );

  const pointsSpent = useMemo(
    () => ABILITIES.reduce((sum, a) => sum + (opts?.point_buy_cost[String(scores[a])] ?? 0), 0),
    [scores, opts],
  );
  const arrayUsed = useMemo(() => [...ABILITIES.map((a) => scores[a])].sort((x, y) => y - x), [scores]);

  // Skills that come free: the background's, and (2014) the race's and a book background's two.
  const granted = useMemo(() => {
    const out: Record<string, string> = {};
    for (const s of bg?.skills ?? []) out[s] = "from background";
    // Plan 133 — a homebrew species' fixed skills count in 2024 too (the 2024 SRD ones have none).
    for (const s of speciesRow?.skills ?? []) out[s] = old ? "from race" : "from species";
    if (old && bookBackground) for (const s of bgSkills) out[s] = "from background";
    return out;
  }, [bg, old, speciesRow, bookBackground, bgSkills]);
  // Plan 133 — a skill the race and the background both give becomes one more pick of any skill.
  const overlap = useMemo(() => skillOverlap(speciesRow, bg?.skills), [speciesRow, bg]);
  const skillRow = useMemo<BuilderSpecies | undefined>(
    () => (speciesRow && overlap.length ? { ...speciesRow, bonus_skill_choices: (speciesRow.bonus_skill_choices ?? 0) + overlap.length } : speciesRow),
    [speciesRow, overlap],
  );
  const skillPicksAllowed = (cls?.skills.choose ?? 0) + (skillRow?.bonus_skill_choices ?? 0);
  const classSkillPicks = skills.filter((s) => !granted[s]);

  // The background's Origin feat and a Human's Versatile one, as they go on the sheet.
  // Plan 131: a 2014 background has no feat (feat: null); a 2014 race's choices go on instead.
  const bgFeat = bg?.feat ? splitFeat(bg.feat) : null;
  const raceChoiceFeats = useMemo(
    () => (old && opts ? Object.keys(speciesRow?.choices ?? {}).flatMap((k) => (speciesPicks[k]?.picks ?? []).map((n) => choiceEntry(opts, k, n))) : []),
    [old, opts, speciesRow, speciesPicks],
  );
  const startFeats = useMemo(() => {
    const out = bg?.feat ? [bg.feat.startsWith(MAGIC_INITIATE) ? bg.feat : bg.feat.split(" (")[0]] : [];
    if (versatile && originFeat) out.push(originFeat === MAGIC_INITIATE && originPicks.choice ? `${MAGIC_INITIATE} (${originPicks.choice})` : originFeat);
    return [...out, ...raceChoiceFeats];
  }, [bg, versatile, originFeat, originPicks.choice, raceChoiceFeats]);
  const startSkills = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of [...skills, ...Object.keys(granted)]) out[s] = 1;
    if (versatile && originFeat === "Skilled") for (const s of originPicks.skills) out[s] = 1;
    return out;
  }, [skills, granted, versatile, originFeat, originPicks.skills]);

  // Plan 128 — the class's own choices, walked like the server: they add feats and skills.
  const choiceWalk = useMemo(
    () => (opts && klass ? walkClassChoices(opts, klass, level, activeSub, { feats: startFeats, skills: startSkills }, classPicks) : null),
    [opts, klass, level, activeSub, startFeats, startSkills, classPicks],
  );

  // Plan 126 — the Ability Score Improvement levels this build has passed, walked in order.
  const asiDue = useMemo(() => (opts && klass ? (opts.asi_levels[klass] ?? []).filter((l) => l <= level) : []), [opts, klass, level]);
  const walk = useMemo(
    () => (opts && klass && choiceWalk
      ? walkImprovements(opts, klass, asiDue, activeSub, { scores: finalScores, feats: choiceWalk.feats, saves: cls?.saves ?? [], skills: choiceWalk.skills }, asiPicks)
      : null),
    [opts, klass, asiDue, activeSub, finalScores, choiceWalk, cls, asiPicks],
  );
  const kitRow = cls?.kits.find((x) => x.name === kit) ?? cls?.kits[0];
  // Plan 131 — 2014 gear needs the armor training (the Cleric's chain mail: the Life Domain).
  const kitTraining = old && opts && klass ? armorTraining(opts, klass, walk?.feats ?? startFeats, activeSub) : null;
  const kitCategory = kitRow?.armor ? opts?.armor[kitRow.armor]?.category : undefined;
  const kitNeedsTraining = !!kitTraining && ((!!kitCategory && !kitTraining.has(kitCategory)) || (!!kitRow?.shield && !kitTraining.has("shields")));
  const sheet = useMemo(() => {
    if (!opts || !cls || !walk) return null;
    return derive({
      opts, klass, level, species: raceName, subclass: activeSub, scores: walk.scores,
      feats: walk.feats, saves: walk.saves, skills: walk.skills, kit: kitRow, speed: speciesRow?.speed ?? 30,
      // Plan 133 — a homebrew race's own hit points per level.
      raceHp: speciesRow?.homebrew ? { label: speciesRow.name, n: speciesRow.hp_per_level_bonus ?? 0 } : null,
    });
  }, [opts, cls, walk, klass, level, raceName, activeSub, kitRow, speciesRow]);

  // Spells: the plan (counts, pools, always prepared) and Magic Initiate's picks.
  // Plan 131: a 2014 prepared count uses the final ability modifier; a High Elf adds a cantrip.
  const raceCantrip = subraceRow?.cantrip_choice ?? null;
  const plan = useMemo(
    () => (opts && klass ? spellPlan(opts, klass, level, activeSub, choiceWalk, old ? { scores: walk?.scores, raceCantrip } : {}) : null),
    [opts, klass, level, activeSub, choiceWalk, old, walk?.scores, raceCantrip],
  );
  const miNeeds = useMemo(() => {
    if (!opts) return [] as MiNeed[];
    const out: MiNeed[] = [];
    if (bg && bgFeat?.feat === MAGIC_INITIATE) out.push(miNeed(opts, "background", bg.name, bgFeat.list, bgFeatPicks, null));
    if (versatile && originFeat === MAGIC_INITIATE) out.push(miNeed(opts, "species", "Versatile", null, originPicks, bgFeat?.feat === MAGIC_INITIATE ? bgFeat.list : null));
    return out;
  }, [opts, bg, bgFeat?.feat, bgFeat?.list, bgFeatPicks, versatile, originFeat, originPicks]);
  // Class picks that still fit (a later subclass may have made one always prepared).
  const cleanCantrips = plan ? cantrips.filter((n) => plan.cantripPool.some((s) => s.name === n)) : cantrips;
  const cleanSpells = plan ? spells.filter((n) => plan.spellPool.some((s) => s.name === n)) : spells;
  // Plan 131 — a 2014 Wizard's prepared spells, out of its spellbook picks.
  const cleanPrepared = plan?.mode === "spellbook" ? prepared.filter((n) => cleanSpells.includes(n)) : [];
  const featPicked = useMemo(() => asiDue.flatMap((l) => asiPicks[l]?.spells ?? []), [asiDue, asiPicks]);
  const choiceSpells = useMemo(() => choiceWalk?.choiceSpells ?? [], [choiceWalk]);
  const elsewhere = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of featPicked) m.set(n, "a feat");
    for (const need of miNeeds) for (const n of need.state.spells) m.set(n, `Magic Initiate (${need.from})`);
    for (const n of choiceSpells) m.set(n, "a class choice");
    return m;
  }, [featPicked, miNeeds, choiceSpells]);
  const doubled = useMemo(() => {
    const seen = new Set<string>();
    for (const n of [...cleanCantrips, ...cleanSpells, ...featPicked, ...miNeeds.flatMap((m) => m.state.spells), ...choiceSpells]) {
      if (seen.has(n)) return n;
      seen.add(n);
    }
    return null;
  }, [cleanCantrips, cleanSpells, featPicked, miNeeds, choiceSpells]);
  const cantripNeed = useMemo(() => {
    if (!choiceWalk || !opts) return null;
    const picked = cleanCantrips.map((n) => opts.spells.find((s) => s.name === n)).filter(Boolean);
    for (const need of choiceWalk.needsCantrip) {
      // Plan 131 — a 2014 invocation names its cantrip ("Eldritch Blast").
      if (need.want !== "damage" && need.want !== "attack") {
        if (!picked.some((s) => s!.name === need.want)) return `${need.name} needs the ${need.want} cantrip: pick it here.`;
        continue;
      }
      const ok = need.want === "damage" ? picked.some((s) => s!.damage) : picked.some((s) => s!.damage && s!.attack);
      if (!ok) return `${need.name} needs a Warlock cantrip that ${need.want === "damage" ? "deals damage" : "hits with an attack and deals damage"}, such as Eldritch Blast.`;
    }
    // Plan 131 — the High Elf's cantrip comes from the Wizard list.
    if (plan && klass) return raceCantripProblem(opts, plan, klass, raceName, cleanCantrips, [klass, ...choiceWalk.cantripLists]);
    return null;
  }, [choiceWalk, opts, cleanCantrips, plan, klass, raceName]);

  const steps = useMemo(() => {
    const s = ["name", "species", "class", "background", "scores", "skills"];
    if (choiceWalk?.sections.length) s.push("choices");
    if (asiDue.length) s.push("asi");
    s.push("spells", "review");
    return s;
  }, [choiceWalk?.sections.length, asiDue.length]);
  const at = Math.min(step, steps.length - 1);
  const key = steps[at];
  const who = `a level ${level} ${klass}`;
  // Plan 131 — the 2014 rules call it a race.
  const titles = old ? { ...STEP_TITLES, species: "Race" } : STEP_TITLES;

  /** Plan 82 — why Next is disabled, in one line, so nobody sits tapping a dead button. */
  function hintFor(k: string): string | null {
    switch (k) {
      case "name":
        if (!characterName.trim()) return dm ? "Give the character a name." : "Give your character a name.";
        if (!dm && !playerName.trim()) return "Add your own name too.";
        return null;
      case "species":
        if (old) {
          if (species === "") return "Pick a race.";
          if (species === "__other" && !customSpecies.trim()) return "Type the race name.";
          return opts ? raceHint(raceRow, subrace, customSubrace, abilityChoice, speciesPicks, opts) : null;
        }
        return species === "" ? "Pick a species." : species === "__other" && !customSpecies.trim() ? "Type the species name." : null;
      case "class":
        if (klass === "") return "Pick a class.";
        if (cls && level >= cls.subclass_level && !subclass) return `Pick a subclass: a level ${level} ${klass} has one (they start at level ${cls.subclass_level}).`;
        if (cls && level >= cls.subclass_level && subclass === "__other" && !customSub.trim()) return "Type the subclass name.";
        return null;
      case "background":
        if (background === "") return "Pick a background.";
        if (background === "__other" && !customBg.trim()) return "Type the background name.";
        // Plan 131 — no background bonus in 2014; a book background picks its 2 skills.
        if (old) return bookBackground && bgSkills.length < 2 ? `Pick ${plural(2 - bgSkills.length, "more skill")} your book's background gives (below).` : null;
        if (bg && bonusMode === "21" && !bonusPlus2) return "Choose which ability gets the +2 (below).";
        if (bg && bonusMode === "21" && (!bonusPlus1 || bonusPlus1 === bonusPlus2)) return "Now choose the +1.";
        return null;
      case "scores":
        if (method === "pointbuy" && pointsSpent > (opts?.point_buy_budget ?? 27)) return `Point buy is over budget: ${pointsSpent} of ${opts?.point_buy_budget ?? 27}.`;
        if (method === "standard" && opts && JSON.stringify(arrayUsed) !== JSON.stringify([...opts.standard_array].sort((x, y) => y - x))) return "Use each of 15, 14, 13, 12, 10 and 8 once.";
        return null;
      case "skills": {
        const left = skillPicksAllowed - classSkillPicks.length;
        if (left > 0) return `Pick ${plural(left, "more skill")}. Greyed ones already come from ${old ? "your race or background" : speciesRow?.skills?.length ? "your species or background" : "the background"}.`;
        if (versatile && originFeat === "") return "Humans pick an Origin feat: choose one under Origin feat.";
        if (versatile && originFeat === "Skilled" && originPicks.skills.length < 3) return `Skilled: pick ${plural(3 - originPicks.skills.length, "more skill")}.`;
        if (cls?.kits.length && kit === "") return "Pick the starting gear.";
        if (old && kitRow && kitNeedsTraining) return `${kitRow.name} needs armor training ${who} doesn't have: pick other gear.`;
        return null;
      }
      case "choices": return choiceWalk?.problem ?? null;
      case "asi": return walk?.problem ?? null;
      case "spells": {
        if (!plan) return null;
        if (plan.caster && plan.mode !== "prepared") {
          // Plan 131 — 2014 known casters and the Wizard's spellbook.
          const book = plan.mode === "spellbook";
          const has = book ? `${who}'s spellbook holds ${plan.spellCap}` : `${who} knows ${plan.spellCap}`;
          if (cleanCantrips.length > plan.cantripCap) return `Take ${plural(cleanCantrips.length - plan.cantripCap, "cantrip")} off: ${who} has ${plan.cantripCap}.`;
          if (cleanCantrips.length < plan.needCantrips) return `Pick ${plural(plan.needCantrips - cleanCantrips.length, "more cantrip")}: ${who} has ${plan.cantripCap}.`;
          if (cleanSpells.length > plan.spellCap) return `Take ${plural(cleanSpells.length - plan.spellCap, "spell")} off: ${has}.`;
          if (cleanSpells.length < plan.needSpells) return `Pick ${plural(plan.needSpells - cleanSpells.length, "more spell")}: ${has}.`;
          if (book && cleanPrepared.length > plan.prepareCap) return `Take ${plural(cleanPrepared.length - plan.prepareCap, "prepared spell")} off: ${who} prepares ${plan.prepareCap}.`;
          if (book && cleanPrepared.length < Math.min(plan.prepareCap, cleanSpells.length)) return `Prepare ${plural(Math.min(plan.prepareCap, cleanSpells.length) - cleanPrepared.length, "more spell")} from your spellbook: ${who} prepares ${plan.prepareCap}.`;
          if (cantripNeed) return cantripNeed;
        } else if (plan.caster) {
          if (cleanCantrips.length > plan.cantripCap) return `Take ${plural(cleanCantrips.length - plan.cantripCap, "cantrip")} off: ${who} has ${plan.cantripCap}.`;
          if (cleanCantrips.length < plan.needCantrips) return `Pick ${plural(plan.needCantrips - cleanCantrips.length, "more cantrip")}: ${who} has ${plan.cantripCap}.`;
          if (cleanSpells.length > plan.spellCap) return `Take ${plural(cleanSpells.length - plan.spellCap, "spell")} off: ${who} prepares ${plan.spellCap}.`;
          if (cleanSpells.length < plan.needSpells) return `Pick ${plural(plan.needSpells - cleanSpells.length, "more spell")} to prepare: ${who} prepares ${plan.spellCap}.`;
          if (cantripNeed) return cantripNeed;
        }
        for (const m of miNeeds) if (m.problem) return m.problem;
        if (doubled) return `${doubled} is picked twice: choose a different spell.`;
        return null;
      }
      default: return null;
    }
  }
  const hint = hintFor(key);
  // The first unfinished step before Review (a later change can undo an earlier step).
  const blocking = steps.slice(0, -1).map((k) => [k, hintFor(k)] as const).find(([, h]) => h) ?? null;

  function setAsiPick(lv: number, pick: PickState) {
    setAsiPicks((prev) => ({ ...prev, [lv]: pick }));
  }
  function setChoice(k: string, state: ChoiceState) {
    setClassPicks((prev) => ({ ...prev, [k]: state }));
  }
  function setMi(source: MiNeed["source"], state: OriginPickState) {
    if (source === "background") setBgFeatPicks(state);
    else setOriginPicks(state);
  }

  function asiPayload(): BuildAsiPick[] {
    return asiDue.map((lv) => {
      const p = asiPicks[lv];
      if (!p || !p.name) return { level: lv, name: "", asi: {}, spells: [], skills: [], expertise: [] };
      if (p.name === BOOK) return { level: lv, name: p.bookName.trim(), from_book: true, asi: p.asi, spells: [], skills: [], expertise: [] };
      return { level: lv, name: p.name, asi: p.asi, choice: p.choice || null, spells: p.spells, skills: p.skills, expertise: p.expertise };
    });
  }

  function choicesPayload(): ClassChoicePick[] {
    return (choiceWalk?.sections ?? []).map((s) => ({
      key: s.key,
      picks: s.state.picks,
      book: s.spec.book ? s.state.book.map((b) => b.trim()).filter(Boolean) : [],
    }));
  }

  function originPayloads(): { background_feat_picks: OriginFeatPicks | null; origin_feat_picks: OriginFeatPicks | null } {
    const bgMi = bgFeat?.feat === MAGIC_INITIATE;
    return {
      background_feat_picks: bgMi ? { choice: null, spells: bgFeatPicks.spells, skills: [] } : null,
      origin_feat_picks: !versatile
        ? null
        : originFeat === MAGIC_INITIATE
          ? { choice: originPicks.choice || null, spells: originPicks.spells, skills: [] }
          : originFeat === "Skilled"
            ? { choice: null, spells: [], skills: originPicks.skills }
            : null,
    };
  }

  /** Plan 131 — what a 2014 build adds (and the 2024 picks it leaves empty). */
  function payload2014(): Partial<CharacterBuildBody> {
    const book = species === "__other" || subrace === OTHER;
    return {
      subrace: subraceName || null,
      ability_choice: Object.fromEntries(Object.entries(abilityChoice).filter(([, v]) => v && (book || speciesRow?.ability_choice))),
      background_skills: bookBackground ? bgSkills : [],
      species_choices: Object.keys(speciesRow?.choices ?? {}).map((k) => ({ key: k, picks: speciesPicks[k]?.picks ?? [], book: [] })),
      prepared_spells: cleanPrepared,
      // Plan 133 — custom origin: only when a bonus moved (empty keeps the race's own).
      origin_bonus: movedBonus ?? {},
      background_bonus: {},
      origin_feat: null,
      background_feat_picks: null,
      origin_feat_picks: null,
    };
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
        origin_feat: versatile ? originFeat || null : null,
        cantrips: cleanCantrips,
        spells: cleanSpells,
        kit: kit || null,
        asi: asiPayload(),
        class_choices: choicesPayload(),
        ...originPayloads(),
        appearance: appearance.trim() || null,
        ...(old ? payload2014() : {}),
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

  if (loadError && !opts) {
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
    return `At level ${level} you add ${fmt(pb)} to the rolls you're trained in${level >= (firstAsi ?? 4) ? ", and you choose Ability Score Improvements" : ""}.`;
  })();
  const alwaysNames = plan?.always.map((a) => a.name) ?? [];
  const miSpells = miNeeds.flatMap((m) => m.state.spells);
  /** Plan 133 — DM mode only: open the homebrew catalog's blank form in a new tab. */
  const makeOwn = (href: string, label: string) => (
    <div style={{ margin: "8px 0" }}>
      <a href={href} target="_blank" rel="noopener" onClick={() => { reloadOnReturn.current = true; }}
        style={{ display: "inline-flex", alignItems: "center", minHeight: 44, fontWeight: 500 }}>
        {label}
      </a>
      <p className="note" style={{ margin: 0 }}>Opens in a new tab. Save it there, come back, and it&rsquo;s on this list.</p>
    </div>
  );

  return (
    <div className={`cc${dm ? " cc-dm" : ""}`}>
      <style>{CSS}</style>
      <div className="cc-inner">
        <p className="eyebrow-muted">New character for</p>
        <h1>{opts.campaign_name}</h1>
        <p className="sub">
          {titles[key]} · step <span className="num">{at + 1}</span> of <span className="num">{steps.length}</span>
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

        {key === "species" && !old && (
          <>
            <h2>Species</h2>
            <p className="note">Your species sets your size and speed and gives traits you keep all game.</p>
            <div className="cc-cards">
              {opts.species.map((s) => (
                <button type="button" key={s.name} aria-pressed={species === s.name} className={`cc-card ${species === s.name ? "on" : ""}`} onClick={() => setSpecies(s.name)}>
                  <span className="cc-card-title"><b>{s.name}</b>{s.homebrew && <HomebrewTag dm={dm} />}</span>
                  <small>{s.size} · speed <span className="num">{s.speed}</span> ft</small>
                </button>
              ))}
              <button type="button" aria-pressed={species === "__other"} className={`cc-card ${species === "__other" ? "on" : ""}`} onClick={() => setSpecies("__other")}>
                <b>From my book…</b><small>Any species your DM allows. You track its traits.</small>
              </button>
            </div>
            {dm && makeOwn("/homebrew?new=1", "Make a custom species")}
            {species === "__other" && (
              <>
                <label htmlFor="cspecies">Species name</label>
                <input id="cspecies" type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="e.g. Aasimar" />
              </>
            )}
            {speciesRow && <SpeciesTraits row={speciesRow} level={level} />}
          </>
        )}

        {key === "species" && old && (
          <>
            <h2>Race</h2>
            <p className="note">Your race raises some ability scores, sets your size and speed, and gives traits you keep all game.</p>
            <div className="cc-cards">
              {opts.species.map((s) => (
                <button type="button" key={s.name} aria-pressed={species === s.name} className={`cc-card ${species === s.name ? "on" : ""}`}
                  onClick={() => { if (species !== s.name) { setSpecies(s.name); setSubrace(""); setCustomSubrace(""); setAbilityChoice({}); setSpeciesPicks({}); } }}>
                  <span className="cc-card-title"><b>{s.name}</b>{s.homebrew && <HomebrewTag dm={dm} />}</span>
                  <small>{s.size} · speed <span className="num">{s.speed}</span> ft</small>
                  {bonusWords(s.ability_bonuses) && <small className="plus">{bonusWords(s.ability_bonuses)}{s.ability_choice ? `, +${s.ability_choice.amount} to ${s.ability_choice.choose} more` : ""}</small>}
                </button>
              ))}
              <button type="button" aria-pressed={species === "__other"} className={`cc-card ${species === "__other" ? "on" : ""}`}
                onClick={() => { if (species !== "__other") { setSpecies("__other"); setSubrace(""); setCustomSubrace(""); setAbilityChoice({}); setSpeciesPicks({}); } }}>
                <b>From my book…</b><small>Any race your DM allows. You track its traits.</small>
              </button>
            </div>
            {dm && makeOwn("/homebrew?new=1", "Make a custom race")}
            {species === "__other" && (
              <>
                <label htmlFor="cspecies">Race name</label>
                <input id="cspecies" type="text" value={customSpecies} onChange={(e) => setCustomSpecies(e.target.value)} placeholder="e.g. Aasimar" />
              </>
            )}
            {speciesRow && <SpeciesTraits row={speciesRow} level={level} />}
            <RaceStep2014 opts={opts} klass={klass} level={level} row={raceRow} book={species === "__other"} origin={originControls}
              subrace={subrace} setSubrace={setSubrace} customSubrace={customSubrace} setCustomSubrace={setCustomSubrace}
              abilityChoice={abilityChoice} setAbilityChoice={setAbilityChoice}
              picks={speciesPicks} setPick={(k, st) => setSpeciesPicks((prev) => ({ ...prev, [k]: st }))} />
          </>
        )}

        {key === "class" && (
          <>
            <h2>Class</h2>
            <p className="note">Your class is what you do in a fight and out of it. Tap one to see what it gives at level {level}.</p>
            <div className="cc-cards">
              {Object.entries(opts.classes).map(([name, c]) => (
                <button type="button" key={name} aria-pressed={klass === name} className={`cc-card ${klass === name ? "on" : ""}`} onClick={() => {
                  setKlass(name); setSubclass(""); setSkills([]); setKit(c.kits[0]?.name ?? ""); setCantrips([]); setSpells([]); setAsiPicks({}); setClassPicks({}); setPrepared([]);
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
                  {/* Plan 133 — the campaign DM's own subclasses for this class. */}
                  {(opts.homebrew_subclasses?.[klass] ?? []).map((s) => (
                    <button type="button" key={`hb-${s.name}`} aria-pressed={subclass === s.name} className={`cc-chip ${subclass === s.name ? "on" : ""}`} disabled={level < cls.subclass_level} onClick={() => setSubclass(s.name)}>
                      {s.name} <HomebrewTag dm={dm} />{level < cls.subclass_level ? <small>comes at level {cls.subclass_level}</small> : null}
                    </button>
                  ))}
                  <button type="button" aria-pressed={subclass === "__other"} className={`cc-chip ${subclass === "__other" ? "on" : ""}`} disabled={level < cls.subclass_level} onClick={() => setSubclass("__other")}>From my book…</button>
                </div>
                {dm && makeOwn("/homebrew?tab=subclasses&new=1", "Make a custom subclass")}
                {level < cls.subclass_level ? (
                  <p className="note">A {klass} picks a subclass at level {cls.subclass_level}. Start at level {cls.subclass_level} or higher to choose it now, or pick it when you level up.</p>
                ) : (
                  <>
                    {subclass === "__other" && (
                      <input type="text" value={customSub} onChange={(e) => setCustomSub(e.target.value)} placeholder="e.g. Oath of the Ancients" style={{ marginTop: 8 }} aria-label="Subclass name" />
                    )}
                    <p className="note">
                      A level {level} {klass} has a subclass: pick one. The free rules (SRD) include one per class; a subclass from your book is recorded by name and you play it from the book.
                    </p>
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
            <p className="note">{old ? "Where you come from. It gives two skills, languages and a feature. (In the 2014 rules your ability bonuses come from your race.)" : "Where you come from. It gives two skills, a tool, an Origin feat and bonuses to three ability scores."}</p>
            <div className="cc-cards">
              {opts.backgrounds.map((b) => (
                <button type="button" key={b.name} aria-pressed={background === b.name} className={`cc-card ${background === b.name ? "on" : ""}`} onClick={() => { setBackground(b.name); setBonusPlus2(""); setBonusPlus1(""); setBgFeatPicks(emptyOrigin()); window.setTimeout(() => document.getElementById("cc-bonus")?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 50); }}>
                  <b>{b.name}</b><small>{b.blurb}</small>
                </button>
              ))}
              <button type="button" aria-pressed={background === "__other"} className={`cc-card ${background === "__other" ? "on" : ""}`} onClick={() => setBackground("__other")}>
                <b>From my book…</b><small>{old ? "Recorded by name: you pick the 2 skills it gives." : "Recorded by name; no automatic bonuses."}</small>
              </button>
            </div>
            {background === "__other" && (
              <input type="text" value={customBg} onChange={(e) => setCustomBg(e.target.value)} placeholder="Background name" style={{ marginTop: 8 }} aria-label="Background name" />
            )}
            {bg && old && <BackgroundExplainer opts={opts} bg={bg} />}
            {bookBackground && (
              <>
                <span className="lbl">Skills from your book's background: pick 2 ({bgSkills.length} of 2)</span>
                <div className="cc-chips">
                  {Object.keys(opts.skills).map((sk) => {
                    const on = bgSkills.includes(sk);
                    const fromRace = (speciesRow?.skills ?? []).includes(sk);
                    return (
                      <button type="button" key={sk} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={fromRace || (!on && bgSkills.length >= 2)}
                        onClick={() => { setBgSkills(on ? bgSkills.filter((x) => x !== sk) : [...bgSkills, sk]); setSkills(skills.filter((x) => x !== sk)); }}>
                        {sk} <small>{fromRace ? "from race" : ABILITY_NAMES[opts.skills[sk]] ?? opts.skills[sk]}</small>
                      </button>
                    );
                  })}
                </div>
                <p className="note">Its feature and languages are yours to track from the book.</p>
              </>
            )}
            {bg && !old && (
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
                {bgFeat?.feat === MAGIC_INITIATE && <p className="note">You pick Magic Initiate&rsquo;s spells on the Spells step.</p>}
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
            {method === "pointbuy" && <p className="note"><span className="num">{pointsSpent}</span> of <span className="num">{opts.point_buy_budget}</span> points spent. Scores run 8 to 15 before the {old ? "racial bonuses" : "background bonus"}; 14 and 15 cost more.</p>}
            {method === "standard" && <p className="note">Give each ability one of 15, 14, 13, 12, 10 and 8. {cls ? `A ${klass} wants high ${abilityWords(cls.primary)}.` : ""}</p>}
            {method === "manual" && <p className="note">Rolled your scores? Set each one with − and + (3 to 20 before the {old ? "racial bonuses" : "background bonus"}).</p>}
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
                    <div className="m">{fmt(mod(finalScores[a]))}{(old ? raceBonus : bonus)[a] ? <small>+{(old ? raceBonus : bonus)[a]} from {old ? "race" : "background"}</small> : null}</div>
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
          <SkillsStep opts={opts} cls={cls} klass={klass} level={level} species={species} speciesRow={skillRow} bg={bg} overlap={overlap}
            skills={skills} setSkills={setSkills} originFeat={originFeat} setOriginFeat={setOriginFeat}
            originPicks={originPicks} setOriginPicks={setOriginPicks} kit={kit} setKit={setKit}
            finalScores={finalScores} startFeats={startFeats} activeSub={activeSub} granted={granted} race={raceName} />
        )}

        {key === "choices" && cls && choiceWalk && (
          <ChoicesStep opts={opts} klass={klass} level={level} sections={choiceWalk.sections} setChoice={setChoice} dm={dm} />
        )}

        {key === "asi" && cls && walk && (
          <AsiStep opts={opts} klass={klass} level={level} levels={asiDue} contexts={walk.contexts} picks={asiPicks} setPick={setAsiPick}
            dm={dm} makeOwn={dm ? makeOwn("/homebrew?tab=feats&new=1", "Make a custom feat") : null} />
        )}

        {key === "spells" && plan && (
          <SpellsStep opts={opts} klass={klass} level={level} plan={plan} cantrips={cleanCantrips} spells={cleanSpells}
            setCantrips={setCantrips} setSpells={setSpells} elsewhere={elsewhere} featSpells={walk?.featSpells ?? []}
            mi={miNeeds} setMi={setMi} cantripNeed={cantripNeed} prepared={cleanPrepared} setPrepared={setPrepared} race={raceName} />
        )}

        {key === "review" && sheet && walk && cls && (
          <>
            <h2>Review</h2>
            <div className="panel">
              <div className="row"><span>Name</span><span className="story" style={{ fontWeight: 700 }}>{characterName}</span></div>
              {dm && <div className="row"><span>Played by</span><span>{playerName.trim() || NOT_ASSIGNED}</span></div>}
              <div className="row"><span>{old ? "Race" : "Species"}</span><span>{raceName}</span></div>
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
              {choiceWalk && choiceWalk.summary.length > 0 && <div className="row"><span>Class choices</span><span>{choiceWalk.summary.join("; ")}</span></div>}
              {old && raceChoiceFeats.length > 0 && <div className="row"><span>Race choices</span><span>{raceChoiceFeats.join("; ")}</span></div>}
              {old && Object.keys(raceBonus).length > 0 && <div className="row"><span>{movedBonus ? "Racial bonuses (custom origin)" : "Racial bonuses"}</span><span>{bonusWords(raceBonus)}</span></div>}
              <div className="row"><span>Feats</span><span>{(old ? [] : startFeats).concat(walk.feats.filter((f) => !choiceWalk?.feats.includes(f))).join(", ") || "None"}</span></div>
              {walk.summary.length > 0 && <div className="row"><span>Improvements</span><span>{walk.summary.join("; ")}</span></div>}
              {alwaysNames.length > 0 && <div className="row"><span>Always prepared</span><span>{alwaysNames.join(", ")}</span></div>}
              {plan?.caster && plan.mode !== "spellbook" && <div className="row"><span>Spells</span><span>{[...cleanCantrips, ...cleanSpells].join(", ") || "None yet"}</span></div>}
              {plan?.mode === "spellbook" && (
                <>
                  <div className="row"><span>Cantrips</span><span>{cleanCantrips.join(", ") || "None yet"}</span></div>
                  <div className="row"><span>Spellbook</span><span>{cleanSpells.join(", ") || "None yet"}</span></div>
                  <div className="row"><span>Prepared today</span><span>{cleanPrepared.join(", ") || "None yet"}</span></div>
                </>
              )}
              {miSpells.length > 0 && <div className="row"><span>Magic Initiate</span><span>{miSpells.join(", ")}</span></div>}
              {walk.featSpells.length > 0 && <div className="row"><span>Feat spells</span><span>{walk.featSpells.join(", ")}</span></div>}
              <div className="row"><span>Gear</span><span>{kitRow ? kitRow.name : "None"}</span></div>
            </div>
            {sheet.warnings.map((w) => <p key={w} className="warn">{w}</p>)}
            {blocking && (
              <p className="warn" role="alert">
                {titles[blocking[0]]} isn&rsquo;t finished: {blocking[1]}{" "}
                <button type="button" className="btn btn-ghost" style={{ minHeight: 44, padding: "0 0.5rem" }} onClick={() => setStep(steps.indexOf(blocking[0]))}>Go there</button>
              </p>
            )}
            <p className="note">Everything here can be changed later from the sheet{dm ? "" : " or by your DM"}.</p>
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
              <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={busy || !!blocking}>
                {busy ? "Creating…" : dm ? "Create character" : "Create and open my sheet"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
