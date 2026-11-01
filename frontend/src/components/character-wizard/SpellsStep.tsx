import { useState } from "react";

import type { BuilderOptions, BuilderSpell } from "../../api/characterBuilder";
import Fold from "./Fold";
import SpellList from "./SpellList";
import { ABILITY_NAMES, andList, fmt, is2014, nextSpellLevelAt, ordinal, type MiNeed, type OriginPickState, type SpellPlan } from "./rules";

/**
 * The Spells step (Plan 128): always-prepared spells shown free, then cantrips and prepared
 * spells picked up to the class's count, with how many are left, then Magic Initiate's picks.
 * Every spell opens its casting time, range, duration and full text. Next stays off until the
 * counts are met (the wizard's hint says what's left), and the server checks the same.
 *
 * Plan 131: in 2014 a known caster picks its spells known, a prepared caster prepares ability
 * modifier + level, a Wizard fills its spellbook and then prepares some of it, a Paladin or
 * Ranger has no spells at level 1, and a High Elf picks a Wizard cantrip.
 */

interface Props {
  opts: BuilderOptions;
  klass: string;
  level: number;
  plan: SpellPlan;
  cantrips: string[];
  spells: string[];
  setCantrips: (v: string[]) => void;
  setSpells: (v: string[]) => void;
  /** Spells picked elsewhere (feats, Magic Initiate): can't be picked twice. */
  elsewhere: Map<string, string>;
  featSpells: string[];
  mi: MiNeed[];
  setMi: (source: MiNeed["source"], state: OriginPickState) => void;
  /** Invocations waiting on a damaging cantrip, in words, or null. */
  cantripNeed: string | null;
  /** Plan 131 — a 2014 Wizard's prepared spells, out of its spellbook (`spells`). */
  prepared: string[];
  setPrepared: (v: string[]) => void;
  /** Plan 131 — the race as the sheet stores it ("High Elf"), for its cantrip's note. */
  race: string;
}

// Plan 131 — the 2014 rules: known casters swap on level-up; the Paladin prepares daily.
const SWAP_2014: Record<string, string> = {
  Cleric: "After a Long Rest you can change your prepared spells.",
  Druid: "After a Long Rest you can change your prepared spells.",
  Paladin: "After a Long Rest you can change your prepared spells.",
  Wizard: "After a Long Rest you can prepare a different set from your spellbook.",
  Bard: "When you gain a level you can swap one of these spells for another.",
  Ranger: "When you gain a level you can swap one of these spells for another.",
  Sorcerer: "When you gain a level you can swap one of these spells for another.",
  Warlock: "When you gain a level you can swap one of these spells for another.",
};

const SWAP: Record<string, string> = {
  Cleric: "After a Long Rest you can change your prepared spells.",
  Druid: "After a Long Rest you can change your prepared spells.",
  Wizard: "After a Long Rest you can change your prepared spells.",
  Paladin: "After a Long Rest you can swap one prepared spell for another.",
  Ranger: "After a Long Rest you can swap one prepared spell for another.",
  Bard: "When you gain a level you can swap one of these spells for another.",
  Sorcerer: "When you gain a level you can swap one of these spells for another.",
  Warlock: "When you gain a level you can swap one of these spells for another.",
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function counter(picked: number, cap: number, need: number, word: string): string {
  const left = need - picked;
  if (left > 0) return `${picked} of ${cap} picked · ${plural(left, word)} left`;
  if (picked > cap) return `${picked} of ${cap}: take ${picked - cap} off`;
  return `${picked} of ${cap} picked`;
}

export default function SpellsStep({ opts, klass, level, plan, cantrips, spells, setCantrips, setSpells, elsewhere, featSpells, mi, setMi, cantripNeed, prepared, setPrepared, race }: Props) {
  const sc = opts.classes[klass]?.spellcasting;
  const old = is2014(opts);
  const book = plan.mode === "spellbook";
  const levels = Array.from({ length: Math.max(0, plan.maxLevel) }, (_, k) => k + 1).filter((l) => plan.spellPool.some((s) => s.level === l));
  const needPrepared = Math.min(plan.prepareCap, spells.length);
  const sections = [
    ...(plan.cantripCap ? ["cantrips"] : []),
    ...(plan.spellCap ? ["spells"] : []),
    ...(book && plan.spellCap ? ["prepared"] : []),
    ...mi.map((m) => `mi-${m.source}`),
  ];
  const incomplete = (key: string) => {
    if (key === "cantrips") return cantrips.length < plan.needCantrips || !!cantripNeed;
    if (key === "spells") return spells.length < plan.needSpells;
    if (key === "prepared") return prepared.length < needPrepared || prepared.length > plan.prepareCap;
    return !!mi.find((m) => `mi-${m.source}` === key)?.problem;
  };
  const swap = (old ? SWAP_2014 : SWAP)[klass] ?? "";
  const spellsTitle = plan.mode === "known" ? "Spells known" : book ? "Spellbook" : "Prepared spells";
  const [open, setOpen] = useState<Set<string>>(() => new Set([sections.find(incomplete) ?? sections[0]].filter(Boolean) as string[]));
  const toggle = (k: string) => setOpen((prev) => { const n = new Set(prev); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const next = plan.maxLevel ? nextSpellLevelAt(opts, klass, level) : null;
  const byName = new Map(opts.spells.map((s) => [s.name.toLowerCase(), s]));
  const alwaysRows = plan.always.map((a) => byName.get(a.name.toLowerCase()) ?? ({ name: a.name, level: 1, classes: [], school: "" } as BuilderSpell));
  const sourceOf = new Map(plan.always.map((a) => [a.name.toLowerCase(), a.source]));
  const otherCantripLists = plan.cantripLists.filter((l) => l !== klass);

  const toggleIn = (list: string[], set: (v: string[]) => void, cap: number) => (name: string) => {
    if (list.includes(name)) set(list.filter((x) => x !== name));
    else if (list.length < cap) set([...list, name]);
  };
  const blockedFor = (list: string[], cap: number) => (s: BuilderSpell) => {
    const other = elsewhere.get(s.name);
    if (other) return `Already picked for ${other}.`;
    if (list.length >= cap) return `All ${cap} picked: take one off first.`;
    return null;
  };

  return (
    <>
      <h2>Spells</h2>
      {plan.startsAt && !plan.cantripCap && !mi.length ? (
        <p className="note">A level {level} {klass} doesn&rsquo;t cast spells yet: they start at level {plan.startsAt}, and you pick them then. Tap Next.</p>
      ) : !plan.caster && !mi.length ? (
        <>
          <p className="note">A {klass} doesn&rsquo;t cast spells, so there&rsquo;s nothing to pick here. Tap Next.</p>
          {featSpells.length > 0 && <p className="note">Your feats give you: {featSpells.join(", ")}.</p>}
        </>
      ) : (
        <>
          {plan.caster && old && sc && (
            <p className="note">
              A level {level} {klass} knows <span className="num">{plan.cantripCap}</span> cantrip{plan.cantripCap === 1 ? "" : "s"}
              {plan.startsAt ? `; spells start at level ${plan.startsAt}` : null}
              {!plan.startsAt && plan.mode === "known" ? <> and <span className="num">{plan.spellCap}</span> spell{plan.spellCap === 1 ? "" : "s"} of up to {ordinal(Math.max(1, plan.maxLevel))} level</> : null}
              {!plan.startsAt && plan.mode === "prepared" ? <> and prepares <span className="num">{plan.spellCap}</span> spell{plan.spellCap === 1 ? "" : "s"} a day of up to {ordinal(Math.max(1, plan.maxLevel))} level ({ABILITY_NAMES[sc.ability]} {fmt(plan.abilityMod)} + {sc.prepared_formula === "half_level" ? "half your level" : "your level"})</> : null}
              {!plan.startsAt && book ? <>, keeps <span className="num">{plan.spellCap}</span> spells of up to {ordinal(Math.max(1, plan.maxLevel))} level in a spellbook, and prepares <span className="num">{plan.prepareCap}</span> of them a day ({ABILITY_NAMES[sc.ability]} {fmt(plan.abilityMod)} + your level)</> : null}
              , cast with {ABILITY_NAMES[sc.ability]}.
              {next && !plan.startsAt ? ` ${ordinal(next.spellLevel)}-level spells come at level ${next.at}.` : ""} Tap a spell to read what it does.
            </p>
          )}
          {plan.caster && !(old && sc) && (
            <p className="note">
              A level {level} {klass} knows <span className="num">{plan.cantripCap}</span> cantrip{plan.cantripCap === 1 ? "" : "s"}
              {plan.spellCap ? <> and prepares <span className="num">{plan.spellCap}</span> spell{plan.spellCap === 1 ? "" : "s"} of up to {ordinal(Math.max(1, plan.maxLevel))} level</> : null}
              {sc ? `, cast with ${ABILITY_NAMES[sc.ability]}` : ""}.
              {next ? ` ${ordinal(next.spellLevel)}-level spells come at level ${next.at}.` : ""} Tap a spell to read what it does.
            </p>
          )}
          {plan.raceCantrip && (
            <p className="note">
              As {/^[AEIOU]/i.test(race) ? "an" : "a"} {race}, {plan.raceCantrip.count === 1 ? "one of your cantrips is a" : `${plan.raceCantrip.count} of your cantrips are`} {plan.raceCantrip.list} cantrip{plan.raceCantrip.count === 1 ? "" : "s"}, cast with {ABILITY_NAMES[plan.raceCantrip.ability] ?? plan.raceCantrip.ability}.
            </p>
          )}
          {!plan.caster && <p className="note">A {klass} doesn&rsquo;t cast spells, but a feat gives you some. Tap a spell to read what it does.</p>}

          {alwaysRows.length > 0 && (
            <div className="panel pad">
              <div className="phead" style={{ paddingTop: 0 }}>Always prepared</div>
              <p className="note" style={{ marginTop: 0 }}>Free: these are on your sheet and don&rsquo;t count against your picks.</p>
              <SpellList spells={alwaysRows} picked={[]} locked={(s) => sourceOf.get(s.name.toLowerCase()) ?? "Always prepared"} />
            </div>
          )}

          {plan.cantripCap > 0 && (
            <Fold id="cc-sp-cantrips" title="Cantrips" open={open.has("cantrips")} onToggle={() => toggle("cantrips")}
              done={!incomplete("cantrips")} summary={counter(cantrips.length, plan.cantripCap, plan.needCantrips, "cantrip")}>
              <p className="note">Cast any time, no spell slot needed.{otherCantripLists.length ? ` ${sc ? "Your extra ones come" : "They come"} from the ${andList(otherCantripLists)} list.` : ""}</p>
              {cantripNeed && <p className="warn">{cantripNeed}</p>}
              {plan.cantripPool.length === 0 && <p className="note">No cantrips in the app&rsquo;s list yet: tell your DM which you chose.</p>}
              <SpellList spells={plan.cantripPool} picked={cantrips} onToggle={toggleIn(cantrips, setCantrips, plan.cantripCap)} blocked={blockedFor(cantrips, plan.cantripCap)} />
            </Fold>
          )}

          {plan.spellCap > 0 && (
            <Fold id="cc-sp-spells" title={spellsTitle} open={open.has("spells")} onToggle={() => toggle("spells")}
              done={!incomplete("spells")} summary={counter(spells.length, plan.spellCap, plan.needSpells, "spell")}>
              <p className="note">
                {book ? `Your spellbook holds ${plan.spellCap} spells to start. You prepare some of them each day (next section); only prepared ones can be cast. ` : "These use spell slots. "}
                {swap}
              </p>
              {plan.spellLists.length > 1 && <p className="note">Magical Secrets: you can also pick from the {andList(plan.spellLists.slice(1))} lists.</p>}
              {plan.expanded.length > 0 && <p className="note">Your subclass adds {andList(plan.expanded)} to the {klass} spells you can pick.</p>}
              {levels.map((lvl) => (
                <div key={lvl} style={{ marginBottom: 8 }}>
                  <span className="lbl" style={{ marginTop: 8 }}>{ordinal(lvl)} level</span>
                  <SpellList spells={plan.spellPool.filter((s) => s.level === lvl)} picked={spells} onToggle={toggleIn(spells, setSpells, plan.spellCap)} blocked={blockedFor(spells, plan.spellCap)} />
                </div>
              ))}
              {plan.spellPool.length === 0 && <p className="note">No spells in the app&rsquo;s list yet: tell your DM which you chose.</p>}
            </Fold>
          )}

          {book && plan.spellCap > 0 && (
            <Fold id="cc-sp-prepared" title="Prepared today" open={open.has("prepared")} onToggle={() => toggle("prepared")}
              done={!incomplete("prepared")} summary={counter(prepared.length, plan.prepareCap, needPrepared, "spell")}>
              <p className="note">Pick {plan.prepareCap} of your spellbook&rsquo;s spells to have ready today. {swap}</p>
              {spells.length === 0 && <p className="note">Fill your spellbook first (above).</p>}
              <SpellList
                spells={plan.spellPool.filter((s) => spells.includes(s.name))}
                picked={prepared}
                onToggle={toggleIn(prepared, setPrepared, plan.prepareCap)}
                blocked={(s) => (prepared.length >= plan.prepareCap && !prepared.includes(s.name) ? `All ${plan.prepareCap} picked: take one off first.` : null)}
              />
            </Fold>
          )}

          {mi.map((m) => {
            const key = `mi-${m.source}`;
            const pickedC = m.state.spells.filter((n) => m.cantrips.some((s) => s.name === n));
            const pickedF = m.state.spells.filter((n) => m.firsts.some((s) => s.name === n));
            const set = (spells: string[]) => setMi(m.source, { ...m.state, spells });
            const tog = (pool: BuilderSpell[], cap: number) => (name: string) => {
              const mine = m.state.spells.filter((n) => pool.some((s) => s.name === n));
              if (m.state.spells.includes(name)) set(m.state.spells.filter((x) => x !== name));
              else if (mine.length < cap) set([...m.state.spells, name]);
            };
            const block = (pool: BuilderSpell[], cap: number) => (s: BuilderSpell) => {
              const other = elsewhere.get(s.name);
              if (other && other !== `Magic Initiate (${m.from})`) return `Already picked for ${other}.`;
              if (plan.alwaysSet.has(s.name.toLowerCase())) return "Always prepared for you already.";
              return m.state.spells.filter((n) => pool.some((p) => p.name === n)).length >= cap ? `All ${cap} picked: take one off first.` : null;
            };
            return (
              <Fold key={key} id={`cc-sp-${key}`} title={`Magic Initiate (${m.from})`} open={open.has(key)} onToggle={() => toggle(key)}
                done={!m.problem} summary={m.problem ? m.problem.replace(/^Magic Initiate: /, "") : `${pickedC.length + pickedF.length} of 3 picked`}>
                <p className="note">
                  Two cantrips and one level 1 spell from {m.list ? `the ${m.list}` : "the Cleric, Druid or Wizard"} list. The level 1 spell is always prepared, and once a day you can cast it without a slot.
                </p>
                {!m.fixed && (
                  <>
                    <span className="lbl">Spell list</span>
                    <div className="cc-chips">
                      {["Cleric", "Druid", "Wizard"].map((l) => (
                        <button type="button" key={l} className={`cc-chip ${m.state.choice === l ? "on" : ""}`} aria-pressed={m.state.choice === l}
                          onClick={() => setMi(m.source, { choice: l, spells: [], skills: [] })}>{l}</button>
                      ))}
                    </div>
                  </>
                )}
                {m.list && (
                  <>
                    <span className="lbl">Cantrips: {pickedC.length} of {m.needCantrips || 2}</span>
                    <SpellList spells={m.cantrips} picked={m.state.spells} onToggle={tog(m.cantrips, 2)} blocked={block(m.cantrips, 2)} />
                    <span className="lbl">Level 1 spell: {pickedF.length} of {m.needFirsts || 1}</span>
                    <SpellList spells={m.firsts} picked={m.state.spells} onToggle={tog(m.firsts, 1)} blocked={block(m.firsts, 1)} />
                  </>
                )}
              </Fold>
            );
          })}
          {featSpells.length > 0 && <p className="note">Your feats also give you: {featSpells.join(", ")}. They don&rsquo;t count against these picks.</p>}
        </>
      )}
    </>
  );
}
