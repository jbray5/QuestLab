import {
  BOSS_FLAVOR,
  EDRIK,
  LAIR_ACTIONS,
  MIRA,
  NEREA,
  PHASES,
} from "./templeContent";

/**
 * BossMode (Plan 58) — the Nerea tracker.
 *
 * Phase banners light automatically off cumulative damage dealt
 * (max HP − current HP), so the DM tracks one number instead of two.
 * Lair actions mark used-this-round and clear when the round advances.
 * Freeing Edrik removes Chains Tighten from the list — the lair action
 * that depends on him being held — and reveals his ally line.
 */

export interface BossState {
  hp: number;
  round: number;
  lairUsed: string[];
  edrikFreed: boolean;
  miraIn: boolean;
  miraHp: number;
}

export const INITIAL_BOSS: BossState = {
  hp: NEREA.maxHp,
  round: 1,
  lairUsed: [],
  edrikFreed: false,
  miraIn: false,
  miraHp: MIRA.maxHp,
};

function Ticker({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  return (
    <div className="tc-ticker">
      <div className="tc-ticker-row">
        <button className="tc-tick" onClick={() => onChange(clamp(value - 10))} title="−10">
          −10
        </button>
        <button className="tc-tick" onClick={() => onChange(clamp(value - 5))} title="−5">
          −5
        </button>
        <button className="tc-tick" onClick={() => onChange(clamp(value - 1))} title="−1">
          −1
        </button>
        <div className="tc-hp">
          <input
            className="tc-hp-input"
            type="number"
            value={value}
            onChange={(e) => onChange(clamp(Number(e.target.value)))}
            aria-label={label}
          />
          <span className="tc-hp-max">/ {max}</span>
        </div>
        <button className="tc-tick" onClick={() => onChange(clamp(value + 1))} title="+1">
          +1
        </button>
        <button className="tc-tick" onClick={() => onChange(clamp(value + 5))} title="+5">
          +5
        </button>
      </div>
      <div className="tc-hp-bar">
        <div className="tc-hp-fill" style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}

export default function BossMode({
  state,
  onChange,
}: {
  state: BossState;
  onChange: (next: BossState) => void;
}) {
  const dealt = NEREA.maxHp - state.hp;
  const lair = LAIR_ACTIONS.filter((a) => !(a.requiresEdrikHeld && state.edrikFreed));

  return (
    <div className="tc-boss">
      <div className="tc-boss-head">
        <h2>{NEREA.name}</h2>
        <div className="tc-boss-line">{NEREA.line}</div>
      </div>

      <Ticker
        value={state.hp}
        max={NEREA.maxHp}
        label="Nerea HP"
        onChange={(hp) => onChange({ ...state, hp })}
      />
      <div className="tc-dealt">
        damage dealt: <b>{dealt}</b>
      </div>

      {/* Phase banners — auto-light by damage dealt. */}
      <div className="tc-phases">
        {PHASES.map((p) => {
          const lit = dealt >= p.at;
          return (
            <div
              key={p.at}
              className={`tc-phase${lit ? " lit" : ""}${p.endstate && lit ? " end" : ""}`}
            >
              <span className="tc-phase-at">{p.at}</span>
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>

      {/* Lair actions — init 20, pick one. */}
      <div className="tc-section-label">Lair actions · initiative 20 · pick one</div>
      <div className="tc-lair">
        {lair.map((a) => {
          const used = state.lairUsed.includes(a.id);
          return (
            <button
              key={a.id}
              className={`tc-lair-btn${used ? " used" : ""}`}
              onClick={() =>
                onChange({
                  ...state,
                  lairUsed: used
                    ? state.lairUsed.filter((x) => x !== a.id)
                    : [...state.lairUsed, a.id],
                })
              }
            >
              <b>{a.name}</b>
              <span>{a.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="tc-round">
        <button
          className="tc-ghost"
          onClick={() => onChange({ ...state, round: Math.max(1, state.round - 1) })}
        >
          ◀
        </button>
        <span>
          round <b>{state.round}</b>
        </span>
        <button
          className="tc-ghost"
          title="Advance the round (clears used lair actions)"
          onClick={() => onChange({ ...state, round: state.round + 1, lairUsed: [] })}
        >
          next round ▶
        </button>
      </div>

      {/* Allies */}
      <div className="tc-section-label">Allies</div>
      <label className="tc-toggle">
        <input
          type="checkbox"
          checked={state.edrikFreed}
          onChange={(e) => onChange({ ...state, edrikFreed: e.target.checked })}
        />
        <span>
          Edrik {EDRIK.freeing}
        </span>
      </label>
      {state.edrikFreed && (
        <div className="tc-ally">
          <b>EDRIK fights</b> — {EDRIK.allyLine}
          <div className="tc-ally-note">Chains Tighten removed from the lair list.</div>
        </div>
      )}

      <label className="tc-toggle">
        <input
          type="checkbox"
          checked={state.miraIn}
          onChange={(e) => onChange({ ...state, miraIn: e.target.checked })}
        />
        <span>{MIRA.label}</span>
      </label>
      {state.miraIn && (
        <div className="tc-ally">
          <b>MIRA</b> — {MIRA.line}
          <Ticker
            value={state.miraHp}
            max={MIRA.maxHp}
            label="Mira HP"
            onChange={(miraHp) => onChange({ ...state, miraHp })}
          />
        </div>
      )}

      <p className="tc-flavor">{BOSS_FLAVOR}</p>

      <button
        className="tc-ghost tc-reset"
        onClick={() => {
          if (confirm("Reset the boss tracker?")) onChange(INITIAL_BOSS);
        }}
      >
        ↺ reset tracker
      </button>
    </div>
  );
}
