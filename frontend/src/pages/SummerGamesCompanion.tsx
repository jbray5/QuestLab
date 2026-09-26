import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { charactersApi } from "../api/characters";
import type { Contest, EventKey } from "../components/summergames/summerGamesContent";
import {
  APPLE_ROUNDS,
  CONTESTS,
  MAZE_GOAL,
  MOTH_OIL,
  PAYOUTS,
  RING_OUT,
} from "../components/summergames/summerGamesContent";

/**
 * The Summer Games Companion (Plan 114, Session 8) —
 * `campaigns/:campaignId/summergames`.
 *
 * Everybody competes at once and no two events play the same way, so this is
 * five small games rather than one scoreboard: a chase with a holder, a
 * free-for-all with touches, a push-your-luck race, a sealed-bid auction, and
 * three throws that can each backfire. The rival in each one is an entrant
 * like any other, with a button that rolls their d20 and adds their bonus.
 *
 * DM-only, frontend-only, localStorage per campaign, print sheet as the paper
 * backstop — the same posture as the Restwater and Temple companions. Because
 * nothing here is ever written to the table state, the Moth Lantern's sealed
 * bids cannot leak to the players' screens even in principle.
 */

type Throw = number | "x" | null;

interface Persisted {
  extras: string[];
  winners: Partial<Record<EventKey, string>>;
  paid: EventKey[];
  apple: { init: Record<string, number>; holder: string; round: number };
  ring: Record<string, { touches: number; out: boolean }>;
  maze: { round: number; runners: Record<string, { steps: number; stuck: boolean }> };
  moths: {
    round: number;
    revealed: boolean;
    e: Record<string, { oil: number; bid: number | null; caught: number; magic: boolean }>;
  };
  caber: Record<string, Throw[]>;
}

const EMPTY: Persisted = {
  extras: [],
  winners: {},
  paid: [],
  apple: { init: {}, holder: "", round: 1 },
  ring: {},
  maze: { round: 1, runners: {} },
  moths: { round: 1, revealed: false, e: {} },
  caber: {},
};

// Versioned: the 9/26 revision changed the shape entirely, and a half-read
// older blob would be worse than starting clean.
const storeKey = (campaignId: string) => `ql-summergames2-${campaignId}`;

function load(campaignId: string): Persisted {
  try {
    const raw = localStorage.getItem(storeKey(campaignId));
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Persisted) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** A d20 for a rival who is not at the table to roll their own. */
function d20(): number {
  return 1 + Math.floor(Math.random() * 20);
}

export default function SummerGamesCompanion() {
  const { campaignId = "" } = useParams();
  const [s, setS] = useState<Persisted>(() => load(campaignId));

  useEffect(() => {
    try {
      localStorage.setItem(storeKey(campaignId), JSON.stringify(s));
    } catch {
      // A blocked or full store is not worth losing the scene over.
    }
  }, [campaignId, s]);

  const { data: party = [] } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId),
    enabled: !!campaignId,
  });

  const names = useMemo(
    () => [...party.map((p) => p.character_name), ...s.extras],
    [party, s.extras],
  );
  const fieldFor = (c: Contest) => [...names, c.rival.name];

  const setWinner = (k: EventKey, who: string) =>
    setS((p) => ({ ...p, winners: { ...p.winners, [k]: who } }));

  // ---------------------------------------------------------------- purse
  const wins = useMemo(() => {
    const t: Record<string, number> = {};
    for (const w of Object.values(s.winners)) if (w) t[w] = (t[w] ?? 0) + 1;
    return t;
  }, [s.winners]);
  const top = Math.max(0, ...Object.values(wins));
  const champions = Object.keys(wins).filter((n) => wins[n] === top && top > 0);

  return (
    <div className="sg-root">
      <style>{CSS}</style>
      <header>
        <h1>The Summer Games</h1>
        <p>
          Five contests, everyone at once. Each rival has a 🎲 that rolls their d20 and adds their
          bonus. DM-only: none of this reaches the players, so the sealed bids stay sealed.
        </p>
        <div className="sg-bar">
          <button
            className="btn btn-ghost"
            onClick={() => {
              const n = prompt("Entrant name")?.trim();
              if (n) setS((p) => ({ ...p, extras: [...p.extras, n] }));
            }}
          >
            ＋ entrant
          </button>
          {s.extras.map((n) => (
            <button
              key={n}
              className="btn btn-ghost sg-danger"
              title={`Remove ${n}`}
              onClick={() => setS((p) => ({ ...p, extras: p.extras.filter((x) => x !== n) }))}
            >
              {n} ✕
            </button>
          ))}
          <span className="sg-spacer" />
          <button className="btn btn-ghost" onClick={() => window.print()}>
            🖨 Print
          </button>
          <button
            className="btn btn-ghost sg-danger"
            onClick={() => {
              if (confirm("Clear every event and start the Games over?")) setS(EMPTY);
            }}
          >
            Reset
          </button>
        </div>
      </header>

      {CONTESTS.map((c) => (
        <section key={c.key}>
          <h2>
            {c.name}
            <small>{c.prize}</small>
          </h2>
          <p className="sg-shape">{c.shape}</p>
          <p className="sg-check">{c.check}</p>
          <p className="sg-note">
            Win: {c.win} · <b>{c.rival.name}</b> +{c.rival.bonus}
            {c.rival.habit ? ` — ${c.rival.habit}` : ""}
          </p>

          {c.key === "apple" && (
            <Apple s={s} setS={setS} field={fieldFor(c)} bonus={c.rival.bonus} rival={c.rival.name} />
          )}
          {c.key === "ring" && (
            <Ring s={s} setS={setS} field={fieldFor(c)} bonus={c.rival.bonus} rival={c.rival.name} />
          )}
          {c.key === "maze" && (
            <Maze s={s} setS={setS} field={fieldFor(c)} bonus={c.rival.bonus} rival={c.rival.name} />
          )}
          {c.key === "moths" && (
            <Moths s={s} setS={setS} field={fieldFor(c)} rival={c.rival.name} />
          )}
          {c.key === "caber" && (
            <Caber s={s} setS={setS} field={fieldFor(c)} bonus={c.rival.bonus} rival={c.rival.name} />
          )}

          <div className="sg-foot">
            <label>
              Winner:{" "}
              <select value={s.winners[c.key] ?? ""} onChange={(e) => setWinner(c.key, e.target.value)}>
                <option value="">—</option>
                {fieldFor(c).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {s.winners[c.key] && (
              <label className="sg-paid">
                <input
                  type="checkbox"
                  checked={s.paid.includes(c.key)}
                  onChange={(e) =>
                    setS((p) => ({
                      ...p,
                      paid: e.target.checked
                        ? [...p.paid, c.key]
                        : p.paid.filter((k) => k !== c.key),
                    }))
                  }
                />{" "}
                Paid {PAYOUTS.consolation} gp each to{" "}
                {names.filter((n) => n !== s.winners[c.key]).join(", ") || "nobody"} (
                {names.filter((n) => n !== s.winners[c.key]).length * PAYOUTS.consolation} gp)
              </label>
            )}
          </div>
        </section>
      ))}

      <section>
        <h2>
          The purse<small>after all five</small>
        </h2>
        <p className={champions.length > 1 ? "sg-tie" : "sg-lead"}>
          {champions.length === 0
            ? "No events called yet."
            : champions.length > 1
              ? `Tied on ${top} win${top === 1 ? "" : "s"}: ${champions.join(", ")} — roll it off.`
              : `Grand Champion: ${champions[0]}, ${top} win${top === 1 ? "" : "s"} — ${PAYOUTS.champion} gp and ${PAYOUTS.championPrize}.`}
        </p>
        <p className="sg-note">
          {PAYOUTS.consolation} gp to every entrant who did not win an event they entered.
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- the games

interface GameProps {
  s: Persisted;
  setS: React.Dispatch<React.SetStateAction<Persisted>>;
  field: string[];
  rival: string;
  bonus?: number;
}

/** A rival's roll button: d20 plus their flat bonus, straight into a slot. */
function Roll({ bonus, onRoll }: { bonus: number; onRoll: (n: number) => void }) {
  return (
    <button className="sg-roll" title={`d20 + ${bonus}`} onClick={() => onRoll(d20() + bonus)}>
      🎲
    </button>
  );
}

/** Keep-away: who has the apple, in initiative order, for four rounds. */
function Apple({ s, setS, field, rival, bonus = 0 }: GameProps) {
  const order = [...field].sort(
    (a, b) => (s.apple.init[b] ?? -99) - (s.apple.init[a] ?? -99) || a.localeCompare(b),
  );
  return (
    <>
      <div className="sg-row">
        <b>Round {s.apple.round}</b> of {APPLE_ROUNDS}
        <button
          className="btn btn-ghost"
          onClick={() =>
            setS((p) => ({ ...p, apple: { ...p.apple, round: Math.min(APPLE_ROUNDS, p.apple.round + 1) } }))
          }
        >
          next round
        </button>
        <span className="sg-spacer" />
        <span className="sg-holder">
          Holder: <b>{s.apple.holder || "—"}</b>
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Entrant</th>
            <th>Init</th>
            <th>Has the apple</th>
          </tr>
        </thead>
        <tbody>
          {order.map((n) => (
            <tr key={n} className={n === rival ? "sg-rival" : undefined}>
              <td>{n}</td>
              <td>
                <input
                  type="number"
                  value={s.apple.init[n] ?? ""}
                  onChange={(e) =>
                    setS((p) => ({
                      ...p,
                      apple: {
                        ...p.apple,
                        init: { ...p.apple.init, [n]: e.target.value === "" ? 0 : Number(e.target.value) },
                      },
                    }))
                  }
                />
                {n === rival && (
                  <Roll
                    bonus={bonus}
                    onRoll={(v) =>
                      setS((p) => ({ ...p, apple: { ...p.apple, init: { ...p.apple.init, [n]: v } } }))
                    }
                  />
                )}
              </td>
              <td>
                <button
                  className={s.apple.holder === n ? "btn" : "btn btn-ghost"}
                  onClick={() => setS((p) => ({ ...p, apple: { ...p.apple, holder: n } }))}
                >
                  {s.apple.holder === n ? "🍎 holding" : "take it"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Free-for-all: three touches and you are out; last one in wins. */
function Ring({ s, setS, field, rival }: GameProps) {
  const get = (n: string) => s.ring[n] ?? { touches: 0, out: false };
  const set = (n: string, v: { touches: number; out: boolean }) =>
    setS((p) => ({ ...p, ring: { ...p.ring, [n]: v } }));
  const standing = field.filter((n) => !get(n).out && get(n).touches < RING_OUT);
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Entrant</th>
            <th>Touches</th>
            <th>In the circle</th>
          </tr>
        </thead>
        <tbody>
          {field.map((n) => {
            const r = get(n);
            const done = r.out || r.touches >= RING_OUT;
            return (
              <tr key={n} className={n === rival ? "sg-rival" : undefined}>
                <td className={done ? "sg-dim" : undefined}>{n}</td>
                <td>
                  {[0, 1, 2].map((i) => (
                    <button
                      key={i}
                      className="sg-pip"
                      title={`${i + 1} touch${i ? "es" : ""}`}
                      onClick={() => set(n, { ...r, touches: r.touches === i + 1 ? i : i + 1 })}
                    >
                      {r.touches > i ? "●" : "○"}
                    </button>
                  ))}
                </td>
                <td>
                  <button
                    className={done ? "btn btn-ghost sg-danger" : "btn btn-ghost"}
                    onClick={() => set(n, { ...r, out: !r.out })}
                  >
                    {done ? "out" : "push out"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="sg-lead">
        {standing.length === 1
          ? `Last one in: ${standing[0]}.`
          : `${standing.length} still in the circle.`}
      </p>
    </>
  );
}

/** Push your luck: four steps to the centre, and a failure sticks you. */
function Maze({ s, setS, field, rival, bonus = 0 }: GameProps) {
  const layout = ["A", "B", "C"][(s.maze.round - 1) % 3];
  const get = (n: string) => s.maze.runners[n] ?? { steps: 0, stuck: false };
  const set = (n: string, v: { steps: number; stuck: boolean }) =>
    setS((p) => ({ ...p, maze: { ...p.maze, runners: { ...p.maze.runners, [n]: v } } }));
  const home = field.filter((n) => get(n).steps >= MAZE_GOAL);
  return (
    <>
      <div className="sg-row">
        <b>Round {s.maze.round}</b>
        <span className="sg-tag">hedges: layout {layout}</span>
        <button
          className="btn btn-ghost"
          title="Advance the round and shift the hedges"
          onClick={() =>
            setS((p) => ({
              ...p,
              maze: {
                round: p.maze.round + 1,
                // Being stuck costs you exactly the next round.
                runners: Object.fromEntries(
                  Object.entries(p.maze.runners).map(([k, v]) => [k, { ...v, stuck: false }]),
                ),
              },
            }))
          }
        >
          next round
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Entrant</th>
            <th>Steps to the centre</th>
            <th>Stuck</th>
          </tr>
        </thead>
        <tbody>
          {field.map((n) => {
            const r = get(n);
            return (
              <tr key={n} className={n === rival ? "sg-rival" : undefined}>
                <td>
                  {n}
                  {n === rival && <Roll bonus={bonus} onRoll={() => set(n, { ...r, steps: r.steps + 1 })} />}
                </td>
                <td>
                  {[0, 1, 2, 3].map((i) => (
                    <button
                      key={i}
                      className="sg-pip"
                      onClick={() => set(n, { ...r, steps: r.steps === i + 1 ? i : i + 1 })}
                    >
                      {r.steps > i ? "◆" : "◇"}
                    </button>
                  ))}
                  {r.steps >= MAZE_GOAL && <span className="sg-tag">centre</span>}
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={r.stuck}
                    title="Skips the next round"
                    onChange={(e) => set(n, { ...r, stuck: e.target.checked })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {home.length > 0 && <p className="sg-lead">Reached the centre: {home.join(", ")}.</p>}
    </>
  );
}

/** Sealed bid: six oil across three rounds, revealed all at once. */
function Moths({ s, setS, field, rival }: GameProps) {
  const get = (n: string) =>
    s.moths.e[n] ?? { oil: MOTH_OIL, bid: null, caught: 0, magic: false };
  const set = (n: string, v: ReturnType<typeof get>) =>
    setS((p) => ({ ...p, moths: { ...p.moths, e: { ...p.moths.e, [n]: v } } }));
  return (
    <>
      <div className="sg-row">
        <b>Round {s.moths.round}</b> of 3
        {!s.moths.revealed ? (
          <button
            className="btn"
            title="Show every bid at once and spend the oil"
            onClick={() =>
              setS((p) => ({
                ...p,
                moths: {
                  ...p.moths,
                  revealed: true,
                  e: Object.fromEntries(
                    field.map((n) => {
                      const v = p.moths.e[n] ?? { oil: MOTH_OIL, bid: null, caught: 0, magic: false };
                      return [n, { ...v, oil: Math.max(0, v.oil - (v.bid ?? 0)) }];
                    }),
                  ),
                },
              }))
            }
          >
            👁 Reveal bids
          </button>
        ) : (
          <button
            className="btn btn-ghost"
            onClick={() =>
              setS((p) => ({
                ...p,
                moths: {
                  round: p.moths.round + 1,
                  revealed: false,
                  e: Object.fromEntries(
                    Object.entries(p.moths.e).map(([k, v]) => [k, { ...v, bid: null }]),
                  ),
                },
              }))
            }
          >
            next round
          </button>
        )}
        <span className="sg-spacer" />
        <span className="sg-tag">{s.moths.revealed ? "bids are open" : "bids are sealed"}</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Entrant</th>
            <th>Oil left</th>
            <th>Bid</th>
            <th>Moths</th>
            <th>Magic light</th>
          </tr>
        </thead>
        <tbody>
          {field.map((n) => {
            const v = get(n);
            return (
              <tr key={n} className={n === rival ? "sg-rival" : undefined}>
                <td>{n}</td>
                <td className="sg-total">{v.oil}</td>
                <td className={s.moths.revealed ? undefined : "sg-sealed"}>
                  <input
                    type="number"
                    min={0}
                    max={v.oil}
                    value={v.bid ?? ""}
                    onChange={(e) =>
                      set(n, { ...v, bid: e.target.value === "" ? null : Number(e.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={v.caught || ""}
                    onChange={(e) => set(n, { ...v, caught: Number(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    title="One-time +1"
                    checked={v.magic}
                    onChange={(e) => set(n, { ...v, magic: e.target.checked })}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </>
  );
}

/** Three throws, each one a gamble; the best single throw stands. */
function Caber({ s, setS, field, rival, bonus = 0 }: GameProps) {
  const get = (n: string): Throw[] => s.caber[n] ?? [null, null, null];
  const set = (n: string, i: number, v: Throw) =>
    setS((p) => {
      const row = [...(p.caber[n] ?? [null, null, null])];
      row[i] = v;
      return { ...p, caber: { ...p.caber, [n]: row } };
    });
  const best = (n: string) => {
    const nums = get(n).filter((t): t is number => typeof t === "number");
    return nums.length ? Math.max(...nums) : 0;
  };
  return (
    <table>
      <thead>
        <tr>
          <th>Entrant</th>
          <th>Throw 1</th>
          <th>Throw 2</th>
          <th>Throw 3</th>
          <th>Best</th>
        </tr>
      </thead>
      <tbody>
        {field.map((n) => {
          const row = get(n);
          return (
            <tr key={n} className={n === rival ? "sg-rival" : undefined}>
              <td>{n}</td>
              {[0, 1, 2].map((i) => (
                <td key={i}>
                  <input
                    type="number"
                    value={typeof row[i] === "number" ? row[i] : ""}
                    disabled={row[i] === "x"}
                    onChange={(e) => set(n, i, e.target.value === "" ? null : Number(e.target.value))}
                  />
                  <button
                    className="sg-pip"
                    title="Backfire — scores nothing"
                    onClick={() => set(n, i, row[i] === "x" ? null : "x")}
                  >
                    {row[i] === "x" ? "💥" : "·"}
                  </button>
                  {n === rival && <Roll bonus={bonus} onRoll={(v) => set(n, i, v)} />}
                </td>
              ))}
              <td className="sg-total">{best(n) || ""}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const CSS = `
.sg-root { max-width: 1040px; margin: 0 auto; padding: 18px 16px 60px; color: var(--text); }
.sg-root h1 { font: 600 26px/1.2 Cinzel, Georgia, serif; color: var(--gold, #d6af36); margin: 0 0 6px; }
.sg-root header > p { color: var(--muted); font-size: 0.85rem; max-width: 66ch; margin: 0 0 10px; }
.sg-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 18px; font-size: 0.78rem; }
.sg-spacer { margin-left: auto; }
.sg-root section { border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
.sg-root h2 { font: 600 17px/1.2 Cinzel, Georgia, serif; margin: 0 0 4px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
.sg-root h2 small { font: 400 12px system-ui, sans-serif; color: var(--gold, #d6af36); }
.sg-shape { font-size: 0.78rem; color: var(--text); margin: 0 0 2px; }
.sg-check { font-size: 0.74rem; color: var(--muted); margin: 0 0 2px; }
.sg-note { font-size: 0.72rem; color: var(--muted); margin: 0 0 8px; }
.sg-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 0.76rem; margin-bottom: 6px; }
.sg-root table { border-collapse: collapse; width: 100%; font-size: 0.78rem; }
.sg-root th { text-align: left; font: 600 10px system-ui, sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); padding: 0 6px 5px 0; border-bottom: 1px solid var(--border); }
.sg-root td { padding: 3px 6px 3px 0; border-bottom: 1px solid var(--border); white-space: nowrap; }
.sg-root input[type="number"] { width: 48px; font-size: 0.78rem; padding: 1px 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 5px; color: var(--text); }
.sg-root select { font-size: 0.76rem; padding: 1px 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 5px; color: var(--text); }
.sg-rival td:first-child { color: var(--gold, #d6af36); }
.sg-dim { opacity: 0.45; text-decoration: line-through; }
.sg-tag { font-size: 0.68rem; color: var(--muted); margin-left: 5px; }
.sg-holder { font-size: 0.78rem; }
.sg-roll { background: none; border: 0; cursor: pointer; font-size: 0.82rem; padding: 0 0 0 3px; }
.sg-pip { background: none; border: 0; cursor: pointer; font-size: 0.85rem; color: var(--gold, #d6af36); padding: 0 1px; }
.sg-total { font-weight: 700; }
.sg-sealed input { color: transparent; text-shadow: 0 0 7px var(--muted); }
.sg-lead { font-size: 0.76rem; color: var(--muted); margin: 6px 0 0; }
.sg-tie { font-size: 0.76rem; color: #e8a33d; margin: 6px 0 0; }
.sg-danger { color: #ef5350; }
.sg-foot { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; margin-top: 8px; font-size: 0.76rem; }
.sg-paid { color: var(--muted); }
@media print {
  .sg-bar, .sg-roll, .sg-pip { display: none; }
  .sg-root { max-width: none; color: #000; }
  .sg-root section { break-inside: avoid; }
  .sg-sealed input { color: #000; text-shadow: none; }
}
`;
