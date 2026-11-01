import { useState } from "react";
import { Plus, X } from "lucide-react";

import type { BuilderOptions } from "../../api/characterBuilder";
import Fold from "./Fold";
import SpellList from "./SpellList";
import {
  ABILITY_NAMES,
  MASTERY_NOTES,
  andList,
  choiceOptions,
  choiceSpellPool,
  masteryWeaponOk,
  ordinal,
  type ChoiceSection,
  type ChoiceState,
} from "./rules";

/**
 * The class's own choices (Plan 128): Fighting Style, Weapon Mastery, Expertise, Divine or Primal
 * Order, Eldritch Invocations, Metamagic, and the SRD subclasses' picks (Hunter's Prey, the
 * Circle's land, Lore's skills). One fold-out section each, with what it does in plain words,
 * how many to pick, and why a pick is locked. Each lands on the sheet where the level-up guide
 * records it; the server checks the same rules.
 *
 * Plan 131: the 2014 choices render here too (Pact Boon, invocations that need a Pact Boon or
 * Eldritch Blast, Favored Enemy, Natural Explorer, Dragon Ancestor, Metamagic, the land, the
 * Hunter's picks), and the "spell" choices (Mystic Arcanum, Magical Secrets) get a spell picker
 * filtered by their rule, with "From my book" for spells the app doesn't list.
 */

/** A cantrip an option needs, in words (a damaging one, or in 2014 one by name). */
function cantripNeed(want: string | undefined): string | null {
  if (!want) return null;
  if (want === "damage") return "Needs a Warlock cantrip that deals damage (pick it on the Spells step).";
  if (want === "attack") return "Needs a Warlock cantrip that hits with an attack and deals damage (pick it on the Spells step).";
  return `Needs the ${want} cantrip (pick it on the Spells step).`;
}

interface Props {
  opts: BuilderOptions;
  klass: string;
  level: number;
  sections: ChoiceSection[];
  setChoice: (key: string, state: ChoiceState) => void;
}

function summarize(s: ChoiceSection): string {
  const names = [...s.state.picks, ...s.state.book.filter((b) => b.trim())];
  if (s.problem) return names.length ? `${names.join(", ")}. Still to do: ${s.problem}` : `Choose ${s.count}`;
  return names.join(", ");
}

/** Pick or unpick `name`: one-pick choices swap, the rest fill up to the count. */
function toggle(list: string[], name: string, cap: number): string[] {
  if (list.includes(name)) return list.filter((x) => x !== name);
  if (cap === 1) return [name];
  return list.length >= cap ? list : [...list, name];
}

function BookEntries({ state, room, onChange, label }: { state: ChoiceState; room: number; onChange: (s: ChoiceState) => void; label: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const name = draft.trim();
    if (!name || room <= 0) return;
    onChange({ ...state, book: [...state.book, name] });
    setDraft("");
  };
  return (
    <div style={{ marginTop: 10 }}>
      <span className="lbl">From my book: type the name as your book writes it</span>
      {state.book.length > 0 && (
        <div className="cc-chips" style={{ marginBottom: 8 }}>
          {state.book.map((b, i) => (
            <button type="button" key={`${b}-${i}`} className="cc-chip on" aria-label={`Remove ${b}`}
              onClick={() => onChange({ ...state, book: state.book.filter((_, j) => j !== i) })}>
              {b} <X size={14} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={label} aria-label={label} maxLength={80}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} style={{ flex: 1, minWidth: 0 }} />
        <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} disabled={!draft.trim() || room <= 0} onClick={add}>
          <Plus size={16} aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}

/**
 * One choice's picker: skills, weapon kinds, spells (Plan 131) or listed options. Exported so the
 * 2014 race step can show the Dragonborn's ancestry with the same cards (Plan 131).
 */
export function SectionBody({ opts, klass, level, s, setChoice }: { opts: BuilderOptions; klass: string; level: number; s: ChoiceSection; setChoice: Props["setChoice"] }) {
  const { spec, state, count } = s;
  const set = (next: ChoiceState) => setChoice(s.key, next);
  const total = state.picks.length + state.book.length;
  const full = total >= count;
  const [showBook, setShowBook] = useState(state.book.length > 0);

  if (spec.kind === "spell") {
    // Plan 131 — Mystic Arcanum (one Warlock spell of each level from 6th) or Magical Secrets.
    const pool = choiceSpellPool(opts, klass, level, spec, count);
    const levels = spec.spell?.levels?.slice(0, count) ?? null;
    const groups = levels ?? [...new Set(pool.map((x) => x.level))].sort((a, b) => a - b);
    const pick = (name: string) => {
      const row = pool.find((x) => x.name === name);
      if (state.picks.includes(name)) return set({ ...state, picks: state.picks.filter((x) => x !== name) });
      // Mystic Arcanum: a new pick of a level replaces the old one.
      const kept = levels && row ? state.picks.filter((n) => pool.find((x) => x.name === n)?.level !== row.level) : state.picks;
      if (kept.length + state.book.length < count) set({ ...state, picks: [...kept, name] });
    };
    // Mystic Arcanum swaps a level's pick; Magical Secrets fills up to the count.
    const blocked = levels ? undefined : () => (full ? `All ${count} picked: take one off first.` : null);
    return (
      <>
        <p className="note">{spec.note} Pick {count}: <span className="num">{total}</span> of <span className="num">{count}</span>.</p>
        {groups.map((lvl) => {
          const list = pool.filter((x) => x.level === lvl);
          return (
            <div key={lvl} style={{ marginBottom: 8 }}>
              <span className="lbl" style={{ marginTop: 8 }}>{lvl === 0 ? "Cantrips" : `${ordinal(lvl)} level`}</span>
              {list.length ? <SpellList spells={list} picked={state.picks} onToggle={pick} blocked={blocked} />
                : <p className="note">None in the app&rsquo;s list yet: add it from your book below.</p>}
            </div>
          );
        })}
        {spec.book && (
          showBook || state.book.length > 0 ? (
            <BookEntries state={state} room={count - total} onChange={set} label="Spell name" />
          ) : (
            <div className="cc-chips" style={{ marginTop: 10 }}>
              <button type="button" className="cc-chip" onClick={() => setShowBook(true)}>From my book…</button>
            </div>
          )
        )}
      </>
    );
  }

  if (spec.kind === "skill" || spec.kind === "expertise") {
    return (
      <>
        <p className="note">{spec.note} Pick {count}: <span className="num">{state.picks.length}</span> of <span className="num">{count}</span>.</p>
        {s.skillPool.length === 0 && <p className="note">You need to be trained in a skill first: pick skills in the Skills step.</p>}
        <div className="cc-chips">
          {s.skillPool.map((name) => {
            const on = state.picks.includes(name);
            return (
              <button type="button" key={name} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && full && count > 1}
                onClick={() => set({ ...state, picks: toggle(state.picks, name, count) })}>
                {name} <small>{ABILITY_NAMES[opts.skills[name]] ?? opts.skills[name]}</small>
              </button>
            );
          })}
        </div>
      </>
    );
  }

  if (spec.kind === "weapon") {
    const weapons = opts.mastery_weapons.filter((w) => masteryWeaponOk(opts, klass, w));
    const groups = [["Simple weapons", weapons.filter((w) => w.category.startsWith("Simple"))], ["Martial weapons", weapons.filter((w) => w.category.startsWith("Martial"))]] as const;
    const picked = weapons.filter((w) => state.picks.includes(w.name));
    return (
      <>
        <p className="note">{spec.note} Pick {count}: <span className="num">{state.picks.length}</span> of <span className="num">{count}</span>. Weapons you carry are good picks.</p>
        {groups.map(([label, list]) => list.length > 0 && (
          <div key={label}>
            <span className="lbl">{label}</span>
            <div className="cc-chips">
              {list.map((w) => {
                const on = state.picks.includes(w.name);
                return (
                  <button type="button" key={w.name} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && full && count > 1}
                    onClick={() => set({ ...state, picks: toggle(state.picks, w.name, count) })}>
                    {w.name} <small>{w.mastery}</small>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {picked.length > 0 && (
          <ul className="traits">
            {picked.map((w) => <li key={w.name}><b>{w.name}</b>, {w.mastery}: {MASTERY_NOTES[w.mastery] ?? "read it in your book."}</li>)}
          </ul>
        )}
      </>
    );
  }

  // Feats (Fighting Style) and listed options (orders, invocations, metamagic, land...).
  const options = choiceOptions(opts, klass, s.key);
  const lockOf = (o: (typeof options)[number]): string | null => (o.level && level < o.level ? `Needs Warlock level ${o.level}.` : null);
  const shown = options.filter((o) => !lockOf(o));
  const locked = options.filter((o) => lockOf(o));
  return (
    <>
      <p className="note">{spec.note} {count > 1 ? <>Pick {count}: <span className="num">{total}</span> of <span className="num">{count}</span>.</> : "Pick one."}</p>
      <div className="cc-cards">
        {shown.map((o) => {
          const on = state.picks.includes(o.name);
          const needs = [o.requires ? `Needs ${o.requires}.` : null, cantripNeed(o.cantrip)].filter(Boolean).join(" ");
          return (
            <button type="button" key={o.name} className={`cc-card ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && full && count > 1}
              onClick={() => set({ ...state, picks: toggle(state.picks, o.name, count) })}>
              <b className="cc-card-title">{o.name}{o.cantrips ? <span className="pill">{o.cantrips.count} {o.cantrips.list} cantrip{o.cantrips.count > 1 ? "s" : ""}</span> : null}</b>
              <small>{o.blurb}</small>
              {needs && <small style={{ color: "var(--muted)" }}>{needs}</small>}
            </button>
          );
        })}
      </div>
      {locked.length > 0 && (
        <p className="note">At higher Warlock levels: {andList(locked.map((o) => `${o.name} (${o.level})`))}.</p>
      )}
      {spec.book && (
        showBook || state.book.length > 0 ? (
          <BookEntries state={state} room={count - total} onChange={set} label={`${spec.label} name`} />
        ) : (
          <div className="cc-chips" style={{ marginTop: 10 }}>
            <button type="button" className="cc-chip" onClick={() => setShowBook(true)}>From my book…</button>
          </div>
        )
      )}
    </>
  );
}

export default function ChoicesStep({ opts, klass, level, sections, setChoice }: Props) {
  const [open, setOpen] = useState<string | null>(() => sections.find((s) => s.problem)?.key ?? sections[0]?.key ?? null);
  return (
    <>
      <h2>Class choices</h2>
      <p className="note">
        A level <span className="num">{level}</span> {klass} makes {sections.length === 1 ? "this choice" : "these choices"}. Each one goes on the sheet, and you can change most of them later with your DM.
      </p>
      {sections.map((s) => (
        <Fold key={s.key} id={`cc-ch-${s.key}`} title={s.spec.label} open={open === s.key} onToggle={() => setOpen(open === s.key ? null : s.key)}
          done={!s.problem} summary={summarize(s)}>
          <SectionBody opts={opts} klass={klass} level={level} s={s} setChoice={(key, next) => {
            setChoice(key, next);
            // A one-pick choice is done when picked: open the next one still to do.
            const total = next.picks.length + next.book.length;
            if (s.count === 1 && total === 1 && next.picks.length) {
              const after = sections.find((x) => x.key !== key && x.problem);
              if (after) setOpen(after.key);
            }
          }} />
        </Fold>
      ))}
    </>
  );
}
