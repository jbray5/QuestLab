import type { Ability, BuilderOptions, BuilderSpecies } from "../../api/characterBuilder";
import { SectionBody } from "./ChoicesStep";
import { ABILITIES, ABILITY_NAMES, bonusWords, emptyChoice, slotBonus, type ChoicePicks, type ChoiceState, type OriginSlot } from "./rules";

/**
 * The 2014 race details (Plan 131), under the race cards: what the race (and its subrace) adds
 * to the ability scores, the subrace pick where the race has them (or one typed from the book),
 * the Half-Elf's two +1s, the Dragonborn's ancestry, and a book race's bonuses. Plain words, one
 * decision at a time; the server checks the same rules.
 *
 * Plan 133: with custom origin on (the DM's switch), each of the race's fixed bonuses gets a
 * "+2 → [ability]" picker, prefilled with the race's own; picking an ability another bonus has
 * swaps the two, so no ability ever gets two.
 */

/** Plan 133 — custom origin's pickers: the slots, and how to move or reset them. */
export interface OriginControls {
  slots: OriginSlot[];
  setPick: (index: number, ability: Ability) => void;
  reset: () => void;
}

export const OTHER = "__other";

interface Props {
  opts: BuilderOptions;
  klass: string;
  level: number;
  /** The SRD race picked, or undefined for one from the book. */
  row: BuilderSpecies | undefined;
  /** A race from the player's book is picked. */
  book: boolean;
  subrace: string;
  setSubrace: (v: string) => void;
  customSubrace: string;
  setCustomSubrace: (v: string) => void;
  abilityChoice: Record<string, number>;
  setAbilityChoice: (v: Record<string, number>) => void;
  picks: ChoicePicks;
  setPick: (key: string, state: ChoiceState) => void;
  /** Plan 133 — custom origin is on and the race has fixed bonuses to move. */
  origin?: OriginControls | null;
}

/** Custom origin: "+2 → [Dexterity]" for each of the race's fixed bonuses. */
function OriginPickers({ origin }: { origin: OriginControls }) {
  const moved = origin.slots.some((s) => s.pick !== s.own);
  return (
    <div className="panel pad">
      <div className="phead" style={{ paddingTop: 0 }}>Custom origin: move your race&rsquo;s bonuses</div>
      <p className="note" style={{ marginTop: 0 }}>Your DM lets this table put a race&rsquo;s ability bonuses on any abilities. Each bonus goes on a different one.</p>
      {origin.slots.map((s, i) => (
        <div key={`${i}-${s.own}`} style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <span className="num" style={{ fontWeight: 600, minWidth: 28 }}>+{s.amount}</span>
          <span aria-hidden style={{ color: "var(--muted)" }}>→</span>
          <select aria-label={`Where the +${s.amount} from ${ABILITY_NAMES[s.own]} goes`} value={s.pick}
            onChange={(e) => origin.setPick(i, e.target.value as Ability)} style={{ flex: 1, minWidth: 0 }}>
            {ABILITIES.map((a) => <option key={a} value={a}>{ABILITY_NAMES[a]}{a === s.own ? " (the race's own)" : ""}</option>)}
          </select>
        </div>
      ))}
      {moved && (
        <button type="button" className="btn btn-ghost" style={{ minHeight: 44, marginTop: 8, padding: "0 0.5rem" }} onClick={origin.reset}>
          Put them back where the race has them
        </button>
      )}
    </div>
  );
}

/** Tap an ability: +1, tap again: +2, again: off; never past `most` in all. */
function BookBonuses({ value, set, most }: { value: Record<string, number>; set: (v: Record<string, number>) => void; most: number }) {
  const total = Object.values(value).reduce((a, b) => a + b, 0);
  return (
    <>
      <span className="lbl">Ability bonuses from your book (tap once for +1, twice for +2; at most +{most} in all)</span>
      <div className="cc-chips">
        {ABILITIES.map((a) => {
          const v = value[a] ?? 0;
          const nextV = v >= 2 ? 0 : v + 1;
          const blocked = nextV > v && total + 1 > most;
          return (
            <button type="button" key={a} className={`cc-chip ${v ? "on" : ""}`} aria-pressed={v > 0} disabled={blocked && !v}
              onClick={() => {
                const next = { ...value };
                if (nextV === 0 || (blocked && v)) delete next[a];
                else next[a] = nextV;
                set(next);
              }}>
              {v ? `+${v} ` : ""}{ABILITY_NAMES[a]}
            </button>
          );
        })}
      </div>
    </>
  );
}

export default function RaceStep2014(p: Props) {
  const { opts, klass, level, row, book, subrace, setSubrace, customSubrace, setCustomSubrace, abilityChoice, setAbilityChoice, picks, setPick, origin } = p;

  if (book) {
    return (
      <div className="panel pad">
        <p className="note" style={{ marginTop: 0 }}>A race from your book: add the ability bonuses it gives, and track its traits yourself.</p>
        <BookBonuses value={abilityChoice} set={setAbilityChoice} most={4} />
      </div>
    );
  }
  if (!row) return null;

  const sub = row.subraces?.find((s) => s.name === subrace);
  const spec = row.ability_choice;
  const chosen = Object.keys(abilityChoice).filter((a) => abilityChoice[a]);
  const originSlots = origin?.slots.length ? origin.slots : null;
  const fixedWords = originSlots
    ? bonusWords(slotBonus(originSlots))
    : [bonusWords(row.ability_bonuses), sub ? bonusWords(sub.ability_bonuses) : ""].filter(Boolean).join(", ");

  return (
    <>
      <div className="panel">
        <div className="row"><span>Ability bonuses</span><span>{fixedWords || "None"}</span></div>
        {!!row.skills?.length && <div className="row"><span>Skills</span><span>Trained in {row.skills.join(" and ")}</span></div>}
        {!!row.skill_choice && <div className="row"><span>Skills</span><span>{row.skill_choice} more of your choice, picked with your class skills</span></div>}
      </div>

      {!!row.subraces?.length && (
        <>
          <span className="lbl">Subrace</span>
          <div className="cc-chips">
            {row.subraces.map((s) => (
              <button type="button" key={s.name} aria-pressed={subrace === s.name} className={`cc-chip ${subrace === s.name ? "on" : ""}`}
                onClick={() => { setSubrace(s.name); setAbilityChoice({}); }}>
                {s.name} <small>{bonusWords(s.ability_bonuses)}</small>
              </button>
            ))}
            <button type="button" aria-pressed={subrace === OTHER} className={`cc-chip ${subrace === OTHER ? "on" : ""}`}
              onClick={() => { setSubrace(OTHER); setAbilityChoice({}); }}>From my book…</button>
          </div>
          {subrace === OTHER && (
            <>
              <input type="text" value={customSubrace} onChange={(e) => setCustomSubrace(e.target.value)} placeholder={`e.g. Mountain ${row.name}`} style={{ marginTop: 8 }} aria-label="Subrace name" maxLength={100} />
              <BookBonuses value={abilityChoice} set={setAbilityChoice} most={2} />
            </>
          )}
          {sub && (
            <ul className="traits">
              {sub.traits.map((t) => <li key={t}>{t}</li>)}
              {sub.cantrip_choice && <li>You pick the {sub.cantrip_choice.list} cantrip on the Spells step.</li>}
            </ul>
          )}
        </>
      )}

      {origin && originSlots && <OriginPickers origin={origin} />}

      {spec && (
        <>
          <span className="lbl">Pick {spec.choose} abilities for +{spec.amount} each ({chosen.length} of {spec.choose})</span>
          <div className="cc-chips">
            {/* A pick that custom origin has since barred still shows, so it can be taken off. */}
            {ABILITIES.filter((a) => !spec.exclude.includes(a) || !!abilityChoice[a]).map((a) => {
              const on = !!abilityChoice[a];
              return (
                <button type="button" key={a} className={`cc-chip ${on ? "on" : ""}`} aria-pressed={on} disabled={!on && chosen.length >= spec.choose}
                  onClick={() => {
                    const next = { ...abilityChoice };
                    if (on) delete next[a];
                    else next[a] = spec.amount;
                    setAbilityChoice(next);
                  }}>
                  +{spec.amount} {ABILITY_NAMES[a]}
                </button>
              );
            })}
          </div>
          {spec.exclude.length > 0 && (
            <p className="note">Not {spec.exclude.map((a) => ABILITY_NAMES[a]).join(" or ")}: {spec.exclude.length > 1 ? "they already get their bonuses" : "it already gets its bonus"} from your race.</p>
          )}
        </>
      )}

      {Object.entries(row.choices ?? {}).map(([key, count]) => {
        const kindSpec = opts.choice_kinds[key];
        if (!kindSpec) return null;
        const state = picks[key] ?? emptyChoice();
        const done = state.picks.length >= count;
        return (
          <div key={key} className="panel pad">
            <div className="phead" style={{ paddingTop: 0 }}>{kindSpec.label}</div>
            <SectionBody opts={opts} klass={klass} level={level}
              s={{ key, spec: kindSpec, count, state, skillPool: [], problem: done ? null : "choose one." }}
              setChoice={setPick} />
          </div>
        );
      })}
    </>
  );
}
