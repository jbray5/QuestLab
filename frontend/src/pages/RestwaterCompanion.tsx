import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  DM_WARNING,
  DOORWAY_NOTE,
  EDRIK,
  HOUSE_ACTIONS,
  MIRA,
  PHASES,
  SORREL,
  SPRING_GATE,
  STAFF,
  TALLY_MAX,
  TALLY_NPC_SLOTS,
  TALLY_PCS,
  WELCOME,
} from "../components/restwater/restwaterContent";
import { RESTWATER_CSS } from "../components/restwater/restwaterCss";

/**
 * The Restwater Companion (Plan 59) — campaigns/:campaignId/restwater.
 *
 * DM cockpit for the Session 6 bathhouse fight: the Auntie Sorrel tracker
 * (pools toggle, cumulative-damage phases, house actions, spring-gate
 * objective, ally cards) plus the comfort tally. Same posture as the
 * Temple Companion (Plan 58): DM-only, frontend-only, localStorage per
 * campaign, print sheet as the paper backstop.
 *
 * The handoff's engine, encoded:
 * - Phases key off CUMULATIVE DAMAGE DEALT, not HP — regeneration heals
 *   must not roll phases back, so damage buttons feed a separate counter.
 * - While POOLS FULL she regenerates +10 and cannot drop below 1 HP.
 * - Draining ends regeneration, clears the floor, fires P3 immediately,
 *   clears Mira's COMPROMISED flag, and frees the staff.
 */

interface TallyRow {
  label: string;
  value: number;
}

interface Persisted {
  hp: number;
  dealt: number;
  round: number;
  poolsDrained: boolean;
  houseUsed: string[];
  houseEarly: boolean;
  miraCompromised: boolean;
  miraHp: number;
  welcomeHp: number;
  welcomeReciteUsed: boolean;
  edrikHp: number;
  staffDown: boolean[];
  tallyPcs: number[];
  tallyNpcs: TallyRow[];
}

const INITIAL: Persisted = {
  hp: SORREL.maxHp,
  dealt: 0,
  round: 1,
  poolsDrained: false,
  houseUsed: [],
  houseEarly: false,
  // The handoff's behavior flag; auto-clears when the pools drain.
  miraCompromised: true,
  miraHp: MIRA.maxHp,
  welcomeHp: WELCOME.maxHp,
  welcomeReciteUsed: false,
  edrikHp: EDRIK.maxHp,
  staffDown: [false, false, false],
  tallyPcs: TALLY_PCS.map(() => 0),
  tallyNpcs: Array.from({ length: TALLY_NPC_SLOTS }, () => ({ label: "", value: 0 })),
};

function storageKey(campaignId: string) {
  return `ql-restwater-${campaignId}`;
}

function load(campaignId: string): Persisted {
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      ...INITIAL,
      ...parsed,
      staffDown: parsed.staffDown ?? INITIAL.staffDown,
      tallyPcs: parsed.tallyPcs ?? INITIAL.tallyPcs,
      tallyNpcs: parsed.tallyNpcs ?? INITIAL.tallyNpcs,
    };
  } catch {
    return INITIAL;
  }
}

export default function RestwaterCompanion() {
  const { campaignId = "" } = useParams();
  const navigate = useNavigate();
  const [s, setS] = useState<Persisted>(() => load(campaignId));
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(campaignId), JSON.stringify(s));
    } catch {
      // storage blocked — the fight still runs, ticks just don't survive reload
    }
  }, [campaignId, s]);

  const floor = s.poolsDrained ? 0 : 1;
  const clampHp = (v: number) => Math.max(floor, Math.min(SORREL.maxHp, v));
  /** Damage: moves HP down AND feeds the cumulative counter the phases key off. */
  const damage = (n: number) =>
    setS((st) => {
      const hp = clampHp(st.hp - n);
      return { ...st, hp, dealt: st.dealt + n };
    });
  /** Regen / corrections: HP only — phases never roll back. */
  const healHp = (n: number) => setS((st) => ({ ...st, hp: clampHp(st.hp + n) }));

  const p3 = s.dealt >= 60 || s.poolsDrained;
  const p2 = s.dealt >= 30;
  const houseOnline = p3 || s.houseEarly;

  const drain = (drained: boolean) =>
    setS((st) => ({
      ...st,
      poolsDrained: drained,
      // Draining clears Mira's flag and frees the staff (handoff).
      miraCompromised: drained ? false : st.miraCompromised,
    }));

  const setPcTally = (i: number, v: number) =>
    setS((st) => ({
      ...st,
      tallyPcs: st.tallyPcs.map((x, j) => (j === i ? v : x)),
    }));
  const setNpcTally = (i: number, patch: Partial<TallyRow>) =>
    setS((st) => ({
      ...st,
      tallyNpcs: st.tallyNpcs.map((row, j) => (j === i ? { ...row, ...patch } : row)),
    }));

  return (
    <div className={`rw-root${printing ? " printing" : ""}`}>
      <style>{RESTWATER_CSS}</style>

      <div className="rw-bar">
        <button className="rw-ghost" title="Leave the cockpit" onClick={() => navigate(-1)}>
          ← back
        </button>
        <h1>Restwater — Companion</h1>
        <span className="rw-warnpill">{DM_WARNING}</span>
        <button className="rw-ghost" onClick={() => setPrinting(true)}>
          🖨 Print sheet
        </button>
      </div>

      {/* ── Left: the fight ── */}
      <div className="rw-col">
        {/* The engine switch. */}
        <div className={`rw-pools ${s.poolsDrained ? "drained" : "full"}`}>
          <span className="rw-pools-state">
            {s.poolsDrained ? "POOLS DRAINED" : "POOLS FULL"}
          </span>
          <span className="rw-pools-note">
            {s.poolsDrained
              ? "Regeneration ended · can't-die flag cleared · P3 running · staff freed"
              : `${SORREL.regen} · ${SORREL.hardFlag}`}
          </span>
          <button className="rw-ghost" onClick={() => drain(!s.poolsDrained)}>
            {s.poolsDrained ? "↺ refill (undo)" : "⚙ open the gate"}
          </button>
        </div>

        <div className="rw-boss-head">
          <h2>{SORREL.name}</h2>
          <div className="rw-statline">
            AC {SORREL.ac} · HP {SORREL.maxHp} · Speed {SORREL.speed} · Init {SORREL.init}
          </div>
          <div className="rw-statline">{SORREL.attack}</div>
          <div className="rw-statline">Base: {SORREL.base}</div>
        </div>

        <div className="rw-ticker-row">
          <button className="rw-tick dmg" onClick={() => damage(10)}>
            −10
          </button>
          <button className="rw-tick dmg" onClick={() => damage(5)}>
            −5
          </button>
          <button className="rw-tick dmg" onClick={() => damage(1)}>
            −1
          </button>
          <div className="rw-hp">
            <input
              className="rw-hp-input"
              type="number"
              value={s.hp}
              onChange={(e) => setS((st) => ({ ...st, hp: clampHp(Number(e.target.value)) }))}
              aria-label="Sorrel HP"
            />
            <span className="rw-hp-max">/ {SORREL.maxHp}</span>
          </div>
          <button
            className="rw-tick"
            title={SORREL.regen}
            disabled={s.poolsDrained}
            onClick={() => healHp(10)}
          >
            +10 regen
          </button>
          <button className="rw-tick" title="HP correction only — does not change damage dealt" onClick={() => healHp(1)}>
            +1
          </button>
        </div>
        <div className="rw-hp-bar">
          <div className="rw-hp-fill" style={{ width: `${(s.hp / SORREL.maxHp) * 100}%` }} />
        </div>
        <div className="rw-dealt">
          damage dealt (phases key off this): <b>{s.dealt}</b>
          <button
            className="rw-tick"
            style={{ marginLeft: "0.5rem" }}
            title="Correction only"
            onClick={() => setS((st) => ({ ...st, dealt: Math.max(0, st.dealt - 1) }))}
          >
            −1
          </button>
          {!s.poolsDrained && s.hp === 1 && (
            <span className="rw-floor-hint"> · held at 1 — the pools keep her alive</span>
          )}
        </div>

        <div className="rw-phases">
          {PHASES.map((p) => {
            const lit = p.endstate ? p3 : p.at === 30 ? p2 : true;
            return (
              <div key={p.at} className={`rw-phase${lit ? " lit" : ""}${p.endstate && lit ? " end" : ""}`}>
                <span className="rw-phase-at">{p.at}</span>
                <span>
                  {p.label}
                  {"note" in p && p.note ? <div className="rw-phase-note">{p.note}</div> : null}
                </span>
              </div>
            );
          })}
        </div>

        <div className="rw-section-label">
          The house · initiative 20 · one per round · {houseOnline ? "ONLINE" : "P3 only"}
        </div>
        {!p3 && (
          <label className="rw-toggle">
            <input
              type="checkbox"
              checked={s.houseEarly}
              onChange={(e) => setS((st) => ({ ...st, houseEarly: e.target.checked }))}
            />
            <span>toggle the house on early</span>
          </label>
        )}
        <div className="rw-house">
          {HOUSE_ACTIONS.map((a) => {
            const used = s.houseUsed.includes(a.id);
            return (
              <button
                key={a.id}
                className={`rw-house-btn${used ? " used" : ""}${houseOnline ? "" : " offline"}`}
                onClick={() =>
                  setS((st) => ({
                    ...st,
                    houseUsed: used ? st.houseUsed.filter((x) => x !== a.id) : [...st.houseUsed, a.id],
                  }))
                }
              >
                <b>{a.name}</b>
                <span>{a.detail}</span>
              </button>
            );
          })}
        </div>

        <div className="rw-round">
          <button className="rw-ghost" onClick={() => setS((st) => ({ ...st, round: Math.max(1, st.round - 1) }))}>
            ◀
          </button>
          <span>
            round <b>{s.round}</b>
          </span>
          <button
            className="rw-ghost"
            title="Advance the round (clears the used house action)"
            onClick={() => setS((st) => ({ ...st, round: st.round + 1, houseUsed: [] }))}
          >
            next round ▶
          </button>
        </div>

        <div className="rw-card">
          <b>{SPRING_GATE.title}</b>
          <div>A: {SPRING_GATE.methodA}</div>
          <div>B: {SPRING_GATE.methodB}</div>
          <div className="rw-sub">{SPRING_GATE.variant}</div>
          <div className="rw-sub">On open: {SPRING_GATE.onOpen}</div>
        </div>

        <p className="rw-flavor">Traits (as printed, reference only): {SORREL.traits.join(" · ")}</p>
        <p className="rw-flavor">{DOORWAY_NOTE}</p>

        <button
          className="rw-ghost rw-reset"
          onClick={() => {
            if (confirm("Reset the whole tracker (fight + tally)?")) setS(INITIAL);
          }}
        >
          ↺ reset tracker
        </button>
      </div>

      {/* ── Right: allies + tally ── */}
      <div className="rw-col side">
        <div className="rw-section-label">Allies &amp; house folk</div>

        <div className={`rw-card${s.miraCompromised ? " compromised" : ""}`}>
          <b>{MIRA.name}</b> — {MIRA.line}
          <label className="rw-toggle">
            <input
              type="checkbox"
              checked={s.miraCompromised}
              onChange={(e) => setS((st) => ({ ...st, miraCompromised: e.target.checked }))}
            />
            <span>{MIRA.compromised}</span>
          </label>
          <AllyHp label="Mira HP" value={s.miraHp} max={MIRA.maxHp} onChange={(miraHp) => setS((st) => ({ ...st, miraHp }))} />
        </div>

        <div className="rw-card">
          <b>{EDRIK.name}</b> — {EDRIK.line}
          <AllyHp label="Edrik HP" value={s.edrikHp} max={EDRIK.maxHp} onChange={(edrikHp) => setS((st) => ({ ...st, edrikHp }))} />
        </div>

        <div className="rw-card">
          <b>{WELCOME.name}</b> — {WELCOME.line}
          <label className="rw-toggle">
            <input
              type="checkbox"
              checked={s.welcomeReciteUsed}
              onChange={(e) => setS((st) => ({ ...st, welcomeReciteUsed: e.target.checked }))}
            />
            <span style={{ textDecoration: s.welcomeReciteUsed ? "line-through" : "none" }}>
              {WELCOME.recite}
            </span>
          </label>
          <AllyHp
            label="Welcome HP"
            value={s.welcomeHp}
            max={WELCOME.maxHp}
            onChange={(welcomeHp) => setS((st) => ({ ...st, welcomeHp }))}
          />
        </div>

        <div className="rw-card">
          <b>{STAFF.name} ×{STAFF.count}</b> — {STAFF.line}
          <div className="rw-sub">{STAFF.freed}</div>
          {s.staffDown.map((down, i) => (
            <label key={i} className="rw-toggle">
              <input
                type="checkbox"
                checked={down}
                onChange={() =>
                  setS((st) => ({
                    ...st,
                    staffDown: st.staffDown.map((x, j) => (j === i ? !x : x)),
                  }))
                }
              />
              <span style={{ textDecoration: down ? "line-through" : "none", opacity: down ? 0.5 : 1 }}>
                #{i + 1} · HP {STAFF.maxHp}
                {down ? " · down" : ""}
              </span>
            </label>
          ))}
        </div>

        <div className="rw-section-label">Comfort tally · 0–{TALLY_MAX}</div>
        {TALLY_PCS.map((name, i) => (
          <TallyLine key={name} label={name} value={s.tallyPcs[i]} onChange={(v) => setPcTally(i, v)} />
        ))}
        {s.tallyNpcs.map((row, i) => (
          <div key={i} className="rw-tally-row">
            <span className="rw-tally-name">
              <input
                placeholder={`NPC ${i + 1}…`}
                value={row.label}
                onChange={(e) => setNpcTally(i, { label: e.target.value.slice(0, 24) })}
                aria-label={`NPC ${i + 1} name`}
              />
            </span>
            <Pips value={row.value} onChange={(value) => setNpcTally(i, { value })} />
          </div>
        ))}
      </div>

      {/* ── Print: the paper backstop ── */}
      <div className="rw-print">
        {printing && (
          <button className="rw-ghost" onClick={() => setPrinting(false)}>
            ← back to the cockpit
          </button>
        )}
        <h1>RESTWATER — DM SHEET</h1>
        <div className="box">
          <b>{SORREL.name}</b> — AC {SORREL.ac} · HP {SORREL.maxHp} · Speed {SORREL.speed} · Init {SORREL.init} · {SORREL.attack}
          <div>{SORREL.regen}. {SORREL.hardFlag}</div>
          <div>Phases (cumulative damage dealt): {PHASES.map((p) => `${p.at} → ${p.label}`).join(" · ")}</div>
          <div>Traits: {SORREL.traits.join(" · ")}</div>
        </div>
        <div className="box">
          <b>THE HOUSE</b> (init 20, one/round, P3 only unless toggled early):{" "}
          {HOUSE_ACTIONS.map((a) => `${a.name}: ${a.detail}`).join(" · ")}
        </div>
        <div className="box">
          <b>{SPRING_GATE.title}</b>
          <div>A: {SPRING_GATE.methodA}</div>
          <div>B: {SPRING_GATE.methodB}</div>
          <div>{SPRING_GATE.variant}</div>
          <div>On open: {SPRING_GATE.onOpen}</div>
        </div>
        <div className="box">
          <b>{MIRA.name}</b>: {MIRA.line}. {MIRA.compromised}
          <div>
            <b>{EDRIK.name}</b>: {EDRIK.line}
          </div>
          <div>
            <b>{WELCOME.name}</b>: {WELCOME.line} {WELCOME.recite}
          </div>
          <div>
            <b>{STAFF.name} ×{STAFF.count}</b>: {STAFF.line} {STAFF.freed}
          </div>
        </div>
        <div className="box">
          <b>COMFORT TALLY</b>: {TALLY_PCS.join(" · ")} · NPC ___ · NPC ___ · NPC ___ (each 0–{TALLY_MAX})
        </div>
      </div>
    </div>
  );
}

function AllyHp({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(0, Math.min(max, v));
  return (
    <div className="rw-ticker-row" style={{ marginTop: "0.3rem" }}>
      <button className="rw-tick dmg" onClick={() => onChange(clamp(value - 5))}>
        −5
      </button>
      <button className="rw-tick dmg" onClick={() => onChange(clamp(value - 1))}>
        −1
      </button>
      <div className="rw-hp">
        <input
          className="rw-hp-input"
          style={{ fontSize: "0.95rem", width: "2.4em" }}
          type="number"
          value={value}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          aria-label={label}
        />
        <span className="rw-hp-max">/ {max}</span>
      </div>
      <button className="rw-tick" onClick={() => onChange(clamp(value + 1))}>
        +1
      </button>
    </div>
  );
}

function Pips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <span className="rw-tally-pips">
      {Array.from({ length: TALLY_MAX }).map((_, i) => (
        <button
          key={i}
          className={`rw-pip${i < value ? " on" : ""}`}
          title={`set ${i + 1 === value ? 0 : i + 1}`}
          onClick={() => onChange(i + 1 === value ? 0 : i + 1)}
        />
      ))}
      <span className="rw-tally-num">{value}</span>
    </span>
  );
}

function TallyLine({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rw-tally-row">
      <span className="rw-tally-name">{label}</span>
      <Pips value={value} onChange={onChange} />
    </div>
  );
}
