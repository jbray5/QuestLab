import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { charactersApi } from "../api/characters";
import type { Contest } from "../components/summergames/summerGamesContent";
import { CONTESTS, PAYOUTS, ROUNDS } from "../components/summergames/summerGamesContent";

/**
 * The Summer Games Companion (Plan 114, Session 8) —
 * `campaigns/:campaignId/summergames`.
 *
 * Five contests, three rounds each, one running total per entrant. The party
 * enters whichever events they like; each contest also has the NPC who is
 * already good at it, and that rival rolls a d20 plus a flat bonus which this
 * adds for the DM. Highest total takes the prize; a tie adds a fourth round.
 *
 * Same posture as the Restwater and Temple companions: DM-only, frontend-only,
 * localStorage per campaign, and a print sheet as the paper backstop. Nothing
 * here reaches the players' screens, so it can be wrong without embarrassing
 * anybody, and it can be thrown away the moment the scene ends.
 */

interface Scores {
  /** contest key → entrant name → per-round scores (blank until entered). */
  [contest: string]: { [entrant: string]: (number | null)[] };
}

interface Persisted {
  scores: Scores;
  /** Entrants the DM has added by hand, beyond the party and the rival. */
  extras: string[];
  /** Contest key → the DM's called winner. */
  winners: Record<string, string>;
}

const EMPTY: Persisted = { scores: {}, extras: [], winners: {} };
const key = (campaignId: string) => `ql-summergames-${campaignId}`;

function load(campaignId: string): Persisted {
  try {
    const raw = localStorage.getItem(key(campaignId));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Persisted) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** A d20, for the rival who is not sitting at the table to roll their own. */
function d20(): number {
  return 1 + Math.floor(Math.random() * 20);
}

export default function SummerGamesCompanion() {
  const { campaignId = "" } = useParams();
  const [state, setState] = useState<Persisted>(() => load(campaignId));
  const [rounds, setRounds] = useState(ROUNDS);

  useEffect(() => {
    try {
      localStorage.setItem(key(campaignId), JSON.stringify(state));
    } catch {
      // A full or blocked store is not worth losing the scene over.
    }
  }, [campaignId, state]);

  const { data: party = [] } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId),
    enabled: !!campaignId,
  });

  const partyNames = useMemo(() => party.map((p) => p.character_name), [party]);

  const entrantsFor = useCallback(
    (c: Contest) => [...partyNames, ...state.extras, c.rival],
    [partyNames, state.extras],
  );

  function setScore(contest: string, entrant: string, round: number, value: number | null) {
    setState((s) => {
      const per = { ...(s.scores[contest] ?? {}) };
      const row = [...(per[entrant] ?? Array(8).fill(null))];
      row[round] = value;
      per[entrant] = row;
      return { ...s, scores: { ...s.scores, [contest]: per } };
    });
  }

  function total(contest: string, entrant: string): number {
    return (state.scores[contest]?.[entrant] ?? []).reduce<number>((n, v) => n + (v ?? 0), 0);
  }

  /** Roll this round for the rival: a d20 and their bonus, no thinking required. */
  function rollRival(c: Contest, round: number) {
    setScore(c.key, c.rival, round, d20() + c.bonus);
  }

  /** Who is ahead, and whether anybody is level with them. */
  function leaders(c: Contest): { names: string[]; score: number } {
    const scored = entrantsFor(c).map((e) => ({ e, n: total(c.key, e) }));
    const best = Math.max(0, ...scored.map((s) => s.n));
    return { names: scored.filter((s) => s.n === best && best > 0).map((s) => s.e), score: best };
  }

  // Grand Champion: most events won, counting only the winners the DM called.
  const wins = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const w of Object.values(state.winners)) if (w) tally[w] = (tally[w] ?? 0) + 1;
    return tally;
  }, [state.winners]);
  const championScore = Math.max(0, ...Object.values(wins));
  const champions = Object.keys(wins).filter((n) => wins[n] === championScore && championScore > 0);

  return (
    <div className="sg-root">
      <style>{CSS}</style>
      <header>
        <h1>The Summer Games</h1>
        <p>
          Five contests, {rounds} rounds each. Rivals roll a d20 and their bonus — the button does
          it. Highest total takes the prize. DM-only: nothing here shows to the players.
        </p>
        <div className="sg-bar">
          <button className="btn btn-ghost" onClick={() => setRounds((r) => Math.max(1, r - 1))}>
            − round
          </button>
          <b>{rounds} rounds</b>
          <button
            className="btn btn-ghost"
            onClick={() => setRounds((r) => Math.min(8, r + 1))}
            title="A tie goes to a fourth round"
          >
            + round
          </button>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            🖨 Print
          </button>
          <button
            className="btn btn-ghost sg-danger"
            onClick={() => {
              if (confirm("Clear every score and called winner?")) setState(EMPTY);
            }}
          >
            Reset
          </button>
        </div>
      </header>

      {CONTESTS.map((c) => {
        const lead = leaders(c);
        const tied = lead.names.length > 1;
        return (
          <section key={c.key}>
            <h2>
              {c.name}
              <small>{c.prize}</small>
            </h2>
            <p className="sg-check">{c.check}</p>
            {c.note && <p className="sg-note">{c.note}</p>}
            <table>
              <thead>
                <tr>
                  <th>Entrant</th>
                  {Array.from({ length: rounds }, (_, i) => (
                    <th key={i}>R{i + 1}</th>
                  ))}
                  <th>Total</th>
                  <th>Won</th>
                </tr>
              </thead>
              <tbody>
                {entrantsFor(c).map((e) => {
                  const isRival = e === c.rival;
                  return (
                    <tr key={e} className={isRival ? "sg-rival" : undefined}>
                      <td>
                        {e}
                        {isRival && <span className="sg-tag">+{c.bonus}</span>}
                      </td>
                      {Array.from({ length: rounds }, (_, i) => (
                        <td key={i}>
                          <input
                            type="number"
                            value={state.scores[c.key]?.[e]?.[i] ?? ""}
                            onChange={(ev) =>
                              setScore(c.key, e, i, ev.target.value === "" ? null : Number(ev.target.value))
                            }
                          />
                          {isRival && (
                            <button
                              className="sg-roll"
                              title={`Roll d20 + ${c.bonus} for ${c.rival}`}
                              onClick={() => rollRival(c, i)}
                            >
                              🎲
                            </button>
                          )}
                        </td>
                      ))}
                      <td className="sg-total">{total(c.key, e) || ""}</td>
                      <td>
                        <input
                          type="radio"
                          name={`win-${c.key}`}
                          checked={state.winners[c.key] === e}
                          onChange={() =>
                            setState((s) => ({ ...s, winners: { ...s.winners, [c.key]: e } }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className={tied ? "sg-tie" : "sg-lead"}>
              {lead.score === 0
                ? "No scores yet."
                : tied
                  ? `Tied on ${lead.score}: ${lead.names.join(", ")} — add a round.`
                  : `Ahead: ${lead.names[0]} on ${lead.score}.`}
            </p>
          </section>
        );
      })}

      <section>
        <h2>
          The purse<small>after all five</small>
        </h2>
        <ul>
          <li>{PAYOUTS.runnerUp}</li>
          <li>{PAYOUTS.champion}</li>
        </ul>
        <p className={champions.length > 1 ? "sg-tie" : "sg-lead"}>
          {champions.length === 0
            ? "No events called yet."
            : champions.length > 1
              ? `Tied on ${championScore} win${championScore === 1 ? "" : "s"}: ${champions.join(", ")} — roll it off.`
              : `Grand Champion: ${champions[0]}, ${championScore} win${championScore === 1 ? "" : "s"}.`}
        </p>
        <p className="sg-note">
          Add an entrant who is not in the party:{" "}
          <button
            className="btn btn-ghost"
            onClick={() => {
              const name = prompt("Entrant name")?.trim();
              if (name) setState((s) => ({ ...s, extras: [...s.extras, name] }));
            }}
          >
            ＋ entrant
          </button>
          {state.extras.map((n) => (
            <button
              key={n}
              className="btn btn-ghost sg-danger"
              title={`Remove ${n}`}
              onClick={() => setState((s) => ({ ...s, extras: s.extras.filter((x) => x !== n) }))}
            >
              {n} ✕
            </button>
          ))}
        </p>
      </section>
    </div>
  );
}

const CSS = `
.sg-root { max-width: 1000px; margin: 0 auto; padding: 18px 16px 60px; color: var(--text); }
.sg-root h1 { font: 600 26px/1.2 Cinzel, Georgia, serif; color: var(--gold, #d6af36); margin: 0 0 6px; }
.sg-root header > p { color: var(--muted); font-size: 0.85rem; max-width: 62ch; margin: 0 0 10px; }
.sg-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; font-size: 0.8rem; }
.sg-root section { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.sg-root h2 { font: 600 17px/1.2 Cinzel, Georgia, serif; margin: 0 0 4px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.sg-root h2 small { font: 400 12px system-ui, sans-serif; color: var(--gold, #d6af36); }
.sg-check { font-size: 0.76rem; color: var(--text); margin: 0 0 3px; }
.sg-note { font-size: 0.72rem; color: var(--muted); margin: 0 0 8px; }
.sg-root table { border-collapse: collapse; width: 100%; font-size: 0.78rem; }
.sg-root th { text-align: left; font: 600 10px system-ui, sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding: 0 6px 5px 0; border-bottom: 1px solid var(--border); }
.sg-root td { padding: 3px 6px 3px 0; border-bottom: 1px solid var(--border); white-space: nowrap; }
.sg-root input[type="number"] { width: 46px; font-size: 0.78rem; padding: 1px 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 5px; color: var(--text); }
.sg-rival td:first-child { color: var(--gold, #d6af36); }
.sg-tag { font-size: 0.66rem; color: var(--muted); margin-left: 5px; }
.sg-roll { background: none; border: 0; cursor: pointer; font-size: 0.8rem; padding: 0 0 0 2px; }
.sg-total { font-weight: 700; }
.sg-lead { font-size: 0.76rem; color: var(--muted); margin: 6px 0 0; }
.sg-tie { font-size: 0.76rem; color: #e8a33d; margin: 6px 0 0; }
.sg-danger { color: #ef5350; }
.sg-root ul { font-size: 0.78rem; color: var(--muted); margin: 0 0 6px; padding-left: 18px; }
@media print {
  .sg-bar, .sg-roll { display: none; }
  .sg-root { max-width: none; color: #000; }
  .sg-root section { break-inside: avoid; }
}
`;
