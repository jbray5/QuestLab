import { useState } from "react";

import type { BuilderOptions, BuilderSpell } from "../../api/characterBuilder";
import Fold from "./Fold";
import SpellList from "./SpellList";
import { ABILITY_NAMES, andList, nextSpellLevelAt, ordinal, type MiNeed, type OriginPickState, type SpellPlan } from "./rules";

/**
 * The Spells step (Plan 128): always-prepared spells shown free, then cantrips and prepared
 * spells picked up to the class's count, with how many are left, then Magic Initiate's picks.
 * Every spell opens its casting time, range, duration and full text. Next stays off until the
 * counts are met (the wizard's hint says what's left), and the server checks the same.
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
}

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

export default function SpellsStep({ opts, klass, level, plan, cantrips, spells, setCantrips, setSpells, elsewhere, featSpells, mi, setMi, cantripNeed }: Props) {
  const sc = opts.classes[klass]?.spellcasting;
  const levels = Array.from({ length: Math.max(0, plan.maxLevel) }, (_, k) => k + 1).filter((l) => plan.spellPool.some((s) => s.level === l));
  const sections = [
    ...(plan.cantripCap ? ["cantrips"] : []),
    ...(plan.spellCap ? ["spells"] : []),
    ...mi.map((m) => `mi-${m.source}`),
  ];
  const incomplete = (key: string) => {
    if (key === "cantrips") return cantrips.length < plan.needCantrips || !!cantripNeed;
    if (key === "spells") return spells.length < plan.needSpells;
    return !!mi.find((m) => `mi-${m.source}` === key)?.problem;
  };
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
      {!plan.caster && !mi.length ? (
        <>
          <p className="note">A {klass} doesn&rsquo;t cast spells, so there&rsquo;s nothing to pick here. Tap Next.</p>
          {featSpells.length > 0 && <p className="note">Your feats give you: {featSpells.join(", ")}.</p>}
        </>
      ) : (
        <>
          {plan.caster && (
            <p className="note">
              A level {level} {klass} knows <span className="num">{plan.cantripCap}</span> cantrip{plan.cantripCap === 1 ? "" : "s"}
              {plan.spellCap ? <> and prepares <span className="num">{plan.spellCap}</span> spell{plan.spellCap === 1 ? "" : "s"} of up to {ordinal(Math.max(1, plan.maxLevel))} level</> : null}
              {sc ? `, cast with ${ABILITY_NAMES[sc.ability]}` : ""}.
              {next ? ` ${ordinal(next.spellLevel)}-level spells come at level ${next.at}.` : ""} Tap a spell to read what it does.
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
            <Fold id="cc-sp-spells" title="Prepared spells" open={open.has("spells")} onToggle={() => toggle("spells")}
              done={!incomplete("spells")} summary={counter(spells.length, plan.spellCap, plan.needSpells, "spell")}>
              <p className="note">These use spell slots. {SWAP[klass] ?? ""}</p>
              {plan.spellLists.length > 1 && <p className="note">Magical Secrets: you can also pick from the {andList(plan.spellLists.slice(1))} lists.</p>}
              {levels.map((lvl) => (
                <div key={lvl} style={{ marginBottom: 8 }}>
                  <span className="lbl" style={{ marginTop: 8 }}>{ordinal(lvl)} level</span>
                  <SpellList spells={plan.spellPool.filter((s) => s.level === lvl)} picked={spells} onToggle={toggleIn(spells, setSpells, plan.spellCap)} blocked={blockedFor(spells, plan.spellCap)} />
                </div>
              ))}
              {plan.spellPool.length === 0 && <p className="note">No spells in the app&rsquo;s list yet: tell your DM which you chose.</p>}
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
