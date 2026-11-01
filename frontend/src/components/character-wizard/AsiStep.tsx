import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { BuilderFeat, BuilderOptions } from "../../api/characterBuilder";
import {
  ABILITIES,
  ABILITY_NAMES,
  ASI,
  BOOK,
  andList,
  asiAllowed,
  emptyPick,
  featSpellPool,
  is2014,
  ordinal,
  type LevelContext,
  type PickState,
} from "./rules";

/**
 * The improvement step (Plan 126): one pick per Ability Score Improvement level the starting
 * level has passed — +2 to one ability, +1 to two, or a feat the build qualifies for at that
 * level. Each level is a fold-out row; the open one shows the picker, the others a summary.
 * The rules mirror the level-up guide's (Plan 115) and the server re-checks them on Create.
 */

interface Props {
  opts: BuilderOptions;
  klass: string;
  level: number;
  levels: number[];
  contexts: LevelContext[];
  picks: Record<number, PickState>;
  setPick: (level: number, pick: PickState) => void;
}

function toggle(list: string[], name: string, cap: number): string[] {
  if (list.includes(name)) return list.filter((x) => x !== name);
  if (cap <= 1) return [name];
  return list.length >= cap ? list : [...list, name];
}

function plusLine(f: BuilderFeat): string | null {
  if (f.name === ASI) return null; // its blurb already says it
  const allowed = asiAllowed(f);
  if (!allowed) return null;
  return `+1 to ${allowed.length === 6 ? "any ability" : allowed.map((a) => ABILITY_NAMES[a] ?? a).join(" or ")}`;
}

/** One line for a closed row: what was picked, or what is still needed. */
function summarize(p: PickState | undefined, ctx: LevelContext): string {
  if (!p?.name) return "Not chosen yet";
  const gained = Object.entries(p.asi).filter(([, v]) => v).map(([a, v]) => `+${v} ${ABILITY_NAMES[a]}`).join(", ");
  const name = p.name === BOOK ? p.bookName.trim() || "A feat from your book" : p.name;
  const base = name === ASI ? gained || "Ability Score Improvement" : `${name}${p.choice ? ` (${p.choice})` : ""}${gained ? ` · ${gained}` : ""}`;
  return ctx.problem ? `${base}. Still to do: ${ctx.problem}` : base;
}

export default function AsiStep({ opts, klass, level: charLevel, levels, contexts, picks, setPick }: Props) {
  const firstOpen = levels.find((l) => contexts.find((c) => c.level === l)?.problem) ?? levels[0];
  const [open, setOpen] = useState<number | null>(firstOpen ?? null);

  return (
    <>
      <h2>Ability scores and feats</h2>
      <p className="note">
        By level <span className="num">{charLevel}</span> a {klass} has had {levels.length === 1 ? "one Ability Score Improvement" : `${levels.length} Ability Score Improvements`},
        at level{levels.length > 1 ? "s" : ""} {andList(levels)}. Each one is +2 to one ability (or +1 to two), or a feat you
        qualify for at that level instead.{" "}
        {is2014(opts) ? "The free 2014 rules have one feat, Grappler; any other comes from your book." : "Most feats also give +1 to an ability."} No score goes above 20.
      </p>
      {levels.map((level, i) => {
        const ctx = contexts[i];
        const p = picks[level];
        const isOpen = open === level;
        return (
          <section key={level} id={`cc-asi-${level}`} className={`cc-asi ${isOpen ? "open" : ""}`}>
            <button type="button" className="cc-asi-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : level)}>
              <span className="cc-asi-title">Level <span className="num">{level}</span>{level === 19 && !is2014(opts) ? " · Epic Boon" : ""}</span>
              <span className="cc-asi-sum">{ctx ? summarize(p, ctx) : ""}</span>
              {isOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            </button>
            {isOpen && ctx && (
              <LevelPicker
                opts={opts}
                klass={klass}
                ctx={ctx}
                pick={p ?? emptyPick()}
                setPick={(next) => setPick(level, next)}
                onDone={() => {
                  const after = levels.slice(i + 1).find((l) => !picks[l]?.name);
                  setOpen(after ?? null);
                  window.setTimeout(() => document.getElementById(`cc-asi-${after ?? level}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
                }}
                isLast={i === levels.length - 1}
              />
            )}
          </section>
        );
      })}
      <p className="note">Read the full feat in your book before you pick. Everything here can be changed later on the sheet.</p>
    </>
  );
}

function LevelPicker({ opts, klass, ctx, pick, setPick, onDone, isLast }: {
  opts: BuilderOptions; klass: string; ctx: LevelContext; pick: PickState;
  setPick: (p: PickState) => void; onDone: () => void; isLast: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const offered = ctx.rows.filter((r) => r.check.reason !== "You already have it.");
  const popular = offered.filter((r) => r.check.ok && r.popular);
  const others = offered.filter((r) => r.check.ok && !r.popular);
  const locked = offered.filter((r) => !r.check.ok);
  const row = ctx.rows.find((r) => r.feat.name === pick.name);
  const feat = row?.feat;
  const isBook = pick.name === BOOK;
  const choose = (name: string) => setPick({ ...emptyPick(), name });
  // Plan 131 — level 19 brings an Epic Boon in 2024 only; in 2014 it is an ordinary improvement.
  const boon = ctx.level === 19 && !is2014(opts);
  const sortPopular = (a: (typeof popular)[number], b: (typeof popular)[number]) =>
    (opts.popular_feats[klass] ?? []).indexOf(a.feat.name) - (opts.popular_feats[klass] ?? []).indexOf(b.feat.name);

  return (
    <div className="cc-asi-body">
      {boon && (
        <p className="note">Level 19 brings an Epic Boon: take one from your book (tap &ldquo;From my book&rdquo;), or any feat below, or the Ability Score Improvement.</p>
      )}
      {popular.length > 0 && <span className="lbl">Popular for a {klass}</span>}
      <div className="cc-cards">
        {[...popular].sort(sortPopular).map((r) => <FeatCard key={r.feat.name} f={r.feat} on={pick.name === r.feat.name} onPick={choose} />)}
      </div>
      {showAll || others.some((r) => r.feat.name === pick.name) ? (
        <>
          <span className="lbl">Every other feat you qualify for at level {ctx.level}</span>
          <div className="cc-cards">
            {others.map((r) => <FeatCard key={r.feat.name} f={r.feat} on={pick.name === r.feat.name} onPick={choose} />)}
            <button type="button" className={`cc-card ${isBook ? "on" : ""}`} aria-pressed={isBook} onClick={() => choose(BOOK)}>
              <b>From my book…</b><small>{boon ? "An Epic Boon, or any other feat your DM allows." : "Any other feat your DM allows. Recorded by name."}</small>
            </button>
          </div>
        </>
      ) : (
        <div className="cc-chips" style={{ marginTop: 10 }}>
          <button type="button" className="cc-chip" onClick={() => setShowAll(true)}>
            {others.length === 1 ? "See 1 other feat" : `Browse all ${others.length} other feats`}
          </button>
          <button type="button" className={`cc-chip ${isBook ? "on" : ""}`} aria-pressed={isBook} onClick={() => choose(BOOK)}>
            {boon ? "Epic Boon from my book…" : "From my book…"}
          </button>
        </div>
      )}
      {locked.length > 0 && (
        <>
          <button type="button" className="cc-chip" style={{ marginTop: 10 }} aria-expanded={showLocked} onClick={() => setShowLocked(!showLocked)}>
            {`${showLocked ? "Hide" : "Show"} feats you don’t qualify for yet (${locked.length})`}
          </button>
          {showLocked && (
            <div className="cc-cards" style={{ marginTop: 8 }}>
              {locked.map((r) => (
                <button type="button" key={r.feat.name} className="cc-card" disabled>
                  <b>{r.feat.name}</b><small className="why">{r.check.reason}</small>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {(feat || isBook) && (
        <div className="panel pad">
          {isBook ? (
            <>
              <label htmlFor={`cc-book-${ctx.level}`} style={{ marginTop: 0 }}>{boon ? "Epic Boon or feat name" : "Feat name"}</label>
              <input id={`cc-book-${ctx.level}`} type="text" value={pick.bookName} onChange={(e) => setPick({ ...pick, bookName: e.target.value })} placeholder="As written in your book" />
              <span className="lbl">Does it give +1 to an ability? (optional)</span>
              <AbilityChips scores={ctx.scores} allowed={[...ABILITIES]} asi={pick.asi} setAsi={(asi) => setPick({ ...pick, asi })} each={1} total={1} />
            </>
          ) : feat && (
            <>
              <b className="cc-feat-name">{feat.name}</b>
              <p className="note" style={{ marginTop: 4, color: "var(--text2)" }}>{feat.blurb}</p>
              {feat.name === ASI ? (
                <>
                  <div className="cc-chips" style={{ marginBottom: 8 }}>
                    <button type="button" className={`cc-chip ${pick.mode === "2" ? "on" : ""}`} aria-pressed={pick.mode === "2"} onClick={() => setPick({ ...pick, mode: "2", asi: {} })}>+2 to one</button>
                    <button type="button" className={`cc-chip ${pick.mode === "11" ? "on" : ""}`} aria-pressed={pick.mode === "11"} onClick={() => setPick({ ...pick, mode: "11", asi: {} })}>+1 to two</button>
                  </div>
                  <AbilityChips scores={ctx.scores} allowed={[...ABILITIES]} asi={pick.asi} setAsi={(asi) => setPick({ ...pick, asi })} each={pick.mode === "2" ? 2 : 1} total={2} />
                </>
              ) : asiAllowed(feat) ? (
                <>
                  <span className="lbl">+1 to{feat.save_prof ? " (and proficiency in its saving throws)" : ""}</span>
                  <AbilityChips scores={ctx.scores} allowed={asiAllowed(feat) ?? []} asi={pick.asi} setAsi={(asi) => setPick({ ...pick, asi })} each={1} total={1}
                    disabled={feat.save_prof ? ctx.saves : []} />
                </>
              ) : null}
              {feat.choice && (
                <>
                  <span className="lbl">{feat.choice.label}</span>
                  <div className="cc-chips">
                    {feat.choice.options.map((o) => (
                      <button type="button" key={o} className={`cc-chip ${pick.choice === o ? "on" : ""}`} aria-pressed={pick.choice === o} onClick={() => setPick({ ...pick, choice: o, spells: [] })}>{o}</button>
                    ))}
                  </div>
                </>
              )}
              {feat.fixed_spells.length > 0 && <p className="note">You also learn {feat.fixed_spells.join(" and ")}.</p>}
              {feat.spell_picks.map((spec, k) => {
                const pool = featSpellPool(opts, spec, pick.choice);
                const mine = pick.spells.filter((n) => pool.some((s) => s.name === n));
                return (
                  <div key={k}>
                    <span className="lbl">
                      {spec.count} {spec.level === 0 ? "cantrip" : `${ordinal(spec.level)}-level spell`}{spec.count > 1 ? "s" : ""}
                      {spec.schools ? ` (${spec.schools.join(" or ")})` : ""}
                      {spec.list_from_choice ? (pick.choice ? ` from the ${pick.choice} list` : ": pick the list first") : ""}
                    </span>
                    <div className="cc-chips">
                      {pool.map((s) => (
                        <button type="button" key={s.name} className={`cc-chip ${pick.spells.includes(s.name) ? "on" : ""}`} aria-pressed={pick.spells.includes(s.name)}
                          disabled={!pick.spells.includes(s.name) && mine.length >= spec.count}
                          onClick={() => setPick({ ...pick, spells: pick.spells.includes(s.name) ? pick.spells.filter((x) => x !== s.name) : [...pick.spells, s.name] })}>
                          {s.name}
                        </button>
                      ))}
                      {pool.length === 0 && (!spec.list_from_choice || pick.choice) && <span className="note">None in the app&rsquo;s list yet: tell your DM which you chose.</span>}
                    </div>
                  </div>
                );
              })}
              {feat.skill_pick && (() => {
                const sp = feat.skill_pick;
                const pool = sp.from ?? Object.keys(opts.skills);
                return (
                  <>
                    <span className="lbl">{sp.count} skill{sp.count > 1 ? "s" : ""}{sp.upgrade ? " (expertise if you're already proficient)" : ""}</span>
                    <div className="cc-chips">
                      {pool.map((s) => {
                        const have = ctx.skills[s] ?? 0;
                        const blocked = sp.upgrade ? have >= 2 : have >= 1;
                        const on = pick.skills.includes(s);
                        return (
                          <button type="button" key={s} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={blocked && !on}
                            onClick={() => setPick({ ...pick, skills: toggle(pick.skills, s, sp.count), expertise: pick.expertise.filter((x) => x !== s) })}>
                            {s}{sp.upgrade && have === 1 ? <small>becomes expertise</small> : null}{blocked ? <small>you have it</small> : null}
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}
              {feat.expertise_pick > 0 && (
                <>
                  <span className="lbl">Expertise in a skill you&rsquo;re proficient in</span>
                  <div className="cc-chips">
                    {Object.keys(opts.skills).filter((s) => (ctx.skills[s] ?? 0) === 1 || pick.skills.includes(s)).map((s) => (
                      <button type="button" key={s} className={`cc-chip ${pick.expertise.includes(s) ? "on" : ""}`} aria-pressed={pick.expertise.includes(s)}
                        onClick={() => setPick({ ...pick, expertise: toggle(pick.expertise, s, feat.expertise_pick) })}>{s}</button>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {!ctx.problem && (
            <div style={{ marginTop: 12 }}>
              <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={onDone}>
                {isLast ? "Done" : "Done: next improvement"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FeatCard({ f, on, onPick }: { f: BuilderFeat; on: boolean; onPick: (name: string) => void }) {
  const plus = plusLine(f);
  return (
    <button type="button" aria-pressed={on} className={`cc-card ${on ? "on" : ""}`} onClick={() => onPick(f.name)}>
      <b className="cc-card-title">
        {f.name}
        {f.category === "origin" ? <span className="pill">Origin feat</span> : f.category === "fighting_style" ? <span className="pill">Fighting style</span> : null}
      </b>
      <small>{f.blurb}</small>
      {plus && <small className="plus">{plus}</small>}
    </button>
  );
}

function AbilityChips({ scores, allowed, asi, setAsi, each, total, disabled = [] }: {
  scores: Record<string, number>; allowed: string[]; asi: Record<string, number>;
  setAsi: (v: Record<string, number>) => void; each: number; total: number; disabled?: string[];
}) {
  const spent = Object.values(asi).reduce((a, b) => a + b, 0);
  return (
    <div className="cc-chips">
      {ABILITIES.filter((a) => allowed.includes(a)).map((a) => {
        const on = (asi[a] ?? 0) > 0;
        const tooHigh = scores[a] + each > 20;
        const off = disabled.includes(a);
        return (
          <button type="button" key={a} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && (tooHigh || off || spent + each > total)}
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
