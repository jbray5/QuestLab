import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { playApi, type CombatState, type TurnState } from "../api/play";
import { portraitSrc } from "../lib/portrait";
import type { PlayerCharacter } from "../api/types";
import InfoTip from "../components/character-sheet/InfoTip";
import { useEventStream, type StreamEvent } from "../hooks/useEventStream";

/**
 * Player view (Plan 00025).
 *
 * Each player gets a URL like /play/:pcId. The UUID is the implicit
 * secret — the DM shares it out of band. Mobile-first single-column
 * layout that puts the most-frequent table-state actions (HP, slots,
 * hit dice, death saves, inspiration) right at the player's thumb.
 */
export default function PlayerView() {
  const { pcId } = useParams<{ pcId: string }>();
  if (!pcId) return <ErrorScreen msg="No character ID in URL." />;
  return <PlayerSheet pcId={pcId} />;
}

/** Plan 39 — a DM table roll received over the SSE stream. */
interface DmRoll {
  id?: number;
  label: string;
  detail: string;
  total: number;
  crit: boolean;
  fumble: boolean;
  roller: string;
}

const HIT_DIE_BY_CLASS: Record<string, number> = {
  Sorcerer: 6,
  Wizard: 6,
  Artificer: 8,
  Bard: 8,
  Cleric: 8,
  Druid: 8,
  Monk: 8,
  Rogue: 8,
  Warlock: 8,
  Fighter: 10,
  Paladin: 10,
  Ranger: 10,
  Barbarian: 12,
};

function PlayerSheet({ pcId }: { pcId: string }) {
  const qc = useQueryClient();

  const { data: pc, isLoading, isError } = useQuery({
    queryKey: ["play-pc", pcId],
    queryFn: () => playApi.get(pcId),
  });
  const { data: spellStats } = useQuery({
    queryKey: ["play-spell-stats", pcId],
    queryFn: () => playApi.spellcastingStats(pcId),
    enabled: !!pc,
  });
  const { data: slotState } = useQuery({
    queryKey: ["play-slots", pcId],
    queryFn: () => playApi.spellSlots(pcId),
    enabled: !!pc,
  });
  const { data: features = [] } = useQuery({
    queryKey: ["play-features", pcId],
    queryFn: () => playApi.features(pcId),
    enabled: !!pc,
  });
  const { data: skillBonuses = {} } = useQuery({
    queryKey: ["play-skills", pcId],
    queryFn: () => playApi.skillBonuses(pcId),
    enabled: !!pc,
  });
  const { data: savingThrows = {} } = useQuery({
    queryKey: ["play-saves", pcId],
    queryFn: () => playApi.savingThrows(pcId),
    enabled: !!pc,
  });

  // Plan 28 — initial turn-state probe so the banner shows correctly on
  // load + after reconnect. Event stream takes over for live updates.
  const { data: turnState } = useQuery({
    queryKey: ["play-turn-state", pcId],
    queryFn: () => playApi.turnState(pcId),
    enabled: !!pc,
    refetchOnWindowFocus: true,
  });

  // Plan 37 — active-combat conditions (charmed, prone, ...) so the
  // player can see what their PC is suffering. Refetched on pc.combat.updated.
  const { data: combatState } = useQuery({
    queryKey: ["play-combat-state", pcId],
    queryFn: () => playApi.combatState(pcId),
    enabled: !!pc,
    refetchOnWindowFocus: true,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["play-pc", pcId] });
    qc.invalidateQueries({ queryKey: ["play-slots", pcId] });
    qc.invalidateQueries({ queryKey: ["play-features", pcId] });
  };

  // Plan 39 — live feed of the DM's broadcast "table rolls".
  const [dmRolls, setDmRolls] = useState<DmRoll[]>([]);

  // Plan 26 — live sync via SSE. Refetch the relevant queries when the
  // backend signals this PC changed.
  const onStreamEvent = useCallback(
    (evt: StreamEvent) => {
      if (evt.type === "pc.spells.updated") {
        qc.invalidateQueries({ queryKey: ["play-slots", pcId] });
      } else if (evt.type === "pc.features.updated") {
        qc.invalidateQueries({ queryKey: ["play-features", pcId] });
      } else if (evt.type === "pc.inventory.updated") {
        qc.invalidateQueries({ queryKey: ["play-inventory", pcId] });
      } else if (evt.type === "pc.combat.updated") {
        // Plan 37 — DM toggled a condition / defeated flag on this PC's
        // combatant row. Refetch just the conditions strip.
        qc.invalidateQueries({ queryKey: ["play-combat-state", pcId] });
      } else if (evt.type === "dice.rolled") {
        // Plan 39 — DM broadcast a table roll. Prepend to the feed.
        const roll = (evt as StreamEvent & { roll?: DmRoll }).roll;
        if (roll) {
          setDmRolls((prev) => [{ ...roll, id: Date.now() + Math.random() }, ...prev].slice(0, 6));
        }
      } else if (evt.type === "pc.turn.changed") {
        // Plan 28 — write the new turn-state straight into the cache so
        // the banner toggles instantly without a network round-trip.
        const active = !!(evt as StreamEvent & { active?: boolean }).active;
        const next: TurnState = active
          ? {
              active: true,
              session_id: (evt as StreamEvent & { session_id?: string }).session_id,
              round: (evt as StreamEvent & { round?: number }).round,
              active_combatant_name: (evt as StreamEvent & { active_combatant_name?: string })
                .active_combatant_name,
            }
          : { active: false };
        qc.setQueryData(["play-turn-state", pcId], next);
        // On activation, give the phone a short buzz if it supports it.
        if (active && typeof navigator !== "undefined" && "vibrate" in navigator) {
          try {
            navigator.vibrate?.([60, 40, 60]);
          } catch {
            /* ignore */
          }
        }
      } else {
        // pc.updated or unspecified — refetch everything.
        qc.invalidateQueries({ queryKey: ["play-pc", pcId] });
        qc.invalidateQueries({ queryKey: ["play-slots", pcId] });
        qc.invalidateQueries({ queryKey: ["play-features", pcId] });
        qc.invalidateQueries({ queryKey: ["play-spell-stats", pcId] });
        qc.invalidateQueries({ queryKey: ["play-skills", pcId] });
        qc.invalidateQueries({ queryKey: ["play-saves", pcId] });
      }
    },
    [qc, pcId],
  );
  useEventStream("pc", pcId, onStreamEvent);

  // Plan 37 — when hp_current changes, flash the whole sheet container
  // (was previously only the HP chip; the user wanted bigger, more obvious
  // feedback that an HP change just happened). 700ms one-shot.
  const prevHpRef = useRef<number | null>(null);
  const [sheetFlash, setSheetFlash] = useState<"" | "damage" | "heal">("");
  useEffect(() => {
    const next = pc?.hp_current;
    if (next === undefined) return;
    const prev = prevHpRef.current;
    prevHpRef.current = next;
    if (prev === null || next === prev) return;
    setSheetFlash(next < prev ? "damage" : "heal");
    const t = setTimeout(() => setSheetFlash(""), 900);
    return () => clearTimeout(t);
  }, [pc?.hp_current]);

  if (isLoading) return <LoadingScreen />;
  if (isError || !pc) return <ErrorScreen msg="Could not load character." />;

  const initMod = mod(pc.score_dex);
  const conMod = mod(pc.score_con);
  const dieSize = HIT_DIE_BY_CLASS[pc.character_class] ?? 8;
  const flashClass =
    sheetFlash === "damage"
      ? "ql-sheet-flash-damage"
      : sheetFlash === "heal"
        ? "ql-sheet-flash-heal"
        : "";

  return (
    <div style={pageStyle}>
      {/* Plan 37 — full-viewport flash so a DM-applied HP change can't be
          missed even when the user is scrolled past the HP chip. */}
      {sheetFlash && (
        <div
          aria-hidden
          className={flashClass}
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            zIndex: 9999,
          }}
        />
      )}
      <div style={containerStyle}>
        <TurnBanner turnState={turnState} />
        <ConditionsStrip combatState={combatState} />
        <DmRollsFeed rolls={dmRolls} />
        <HeaderBanner pc={pc} spellStats={spellStats ?? null} initMod={initMod} />

        <HpZone pc={pc} pcId={pcId} conMod={conMod} onUpdate={invalidate} />

        {pc.hp_current === 0 && (
          <DeathSavesBlock pc={pc} pcId={pcId} onUpdate={invalidate} />
        )}

        <ConcentrationBlock pc={pc} pcId={pcId} conMod={conMod} onUpdate={invalidate} />

        <Section title="🎲 Resources" defaultOpen>
          <HitDiceBlock pc={pc} dieSize={dieSize} conMod={conMod} pcId={pcId} onUpdate={invalidate} />
          <hr style={hrStyle} />
          <ExhaustionBlock pc={pc} pcId={pcId} onUpdate={invalidate} />
          <hr style={hrStyle} />
          <CurrencyBlock pc={pc} pcId={pcId} onUpdate={invalidate} />
        </Section>

        {slotState && Object.keys(slotState.levels).length > 0 && (
          <Section title="📖 Spell Slots" defaultOpen>
            <SlotBlock slotState={slotState} pcId={pcId} qc={qc} />
          </Section>
        )}

        {features.length > 0 && (
          <Section title="⚡ Features" defaultOpen>
            <FeaturesBlock features={features} pcId={pcId} qc={qc} />
          </Section>
        )}

        <Section title="🧭 Your Turn — Walkthrough" defaultOpen>
          <TurnWalkthrough pc={pc} />
        </Section>

        <Section title="🎯 Skills">
          <SkillsBlock bonuses={skillBonuses} />
        </Section>

        <Section title="🛡 Saving Throws">
          <SavesBlock saves={savingThrows} />
        </Section>

        <Section title="🎭 People You've Met">
          <NpcsBlock pcId={pcId} />
        </Section>

        <Section title="📚 Quick Rules Reference">
          <RulesReference pc={pc} />
        </Section>
      </div>
    </div>
  );
}

// ── Sub-blocks ─────────────────────────────────────────────────────────────

function DmRollsFeed({ rolls }: { rolls: DmRoll[] }) {
  // Plan 39 — live feed of the DM's broadcast rolls. Renders nothing
  // until the first roll arrives; newest on top, capped at 6.
  if (rolls.length === 0) return null;
  return (
    <div
      style={{
        margin: "0.5rem 0",
        padding: "0.5rem 0.7rem",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontSize: "0.62rem",
          color: "var(--gold)",
          fontFamily: "Cinzel Decorative, serif",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "0.3rem",
        }}
      >
        🎲 DM's Rolls
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.18rem" }}>
        {rolls.map((r) => (
          <div
            key={r.id}
            style={{
              display: "flex",
              gap: "0.45rem",
              alignItems: "center",
              fontSize: "0.78rem",
            }}
          >
            <span style={{ color: "var(--muted)" }}>{r.label}</span>
            <span
              style={{
                color: "var(--muted)",
                fontSize: "0.66rem",
                fontFamily: "monospace",
              }}
            >
              {r.detail}
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontWeight: 700,
                fontFamily: "monospace",
                color: r.crit
                  ? "var(--green2, #4caf50)"
                  : r.fumble
                    ? "var(--red, #ef5350)"
                    : "var(--gold)",
              }}
            >
              {r.total}
              {r.crit ? " ✦ CRIT" : r.fumble ? " ✦ FUMBLE" : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConditionsStrip({ combatState }: { combatState: CombatState | undefined }) {
  // Plan 37 — render only when in active combat AND at least one condition.
  // Defeated implies hp 0 already; the DeathSavesBlock handles that case.
  if (!combatState?.in_combat) return null;
  const conditions = combatState.conditions ?? [];
  if (conditions.length === 0) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        margin: "0.5rem 0",
        padding: "0.55rem 0.8rem",
        background: "rgba(244, 67, 54, 0.12)",
        border: "1px solid var(--red, #ef5350)",
        borderRadius: 8,
        display: "flex",
        flexWrap: "wrap",
        gap: "0.4rem",
        alignItems: "center",
      }}
    >
      <span
        style={{
          fontFamily: "Cinzel Decorative, serif",
          fontSize: "0.7rem",
          letterSpacing: "0.1em",
          color: "var(--red, #ef5350)",
          textTransform: "uppercase",
        }}
      >
        Conditions
      </span>
      {conditions.map((c) => (
        <span
          key={c}
          style={{
            padding: "0.15rem 0.55rem",
            background: "var(--red, #ef5350)",
            color: "#fff",
            borderRadius: 12,
            fontSize: "0.78rem",
            fontWeight: 600,
            letterSpacing: "0.02em",
            textTransform: "capitalize",
          }}
        >
          {c}
        </span>
      ))}
    </div>
  );
}

function TurnBanner({ turnState }: { turnState: TurnState | undefined }) {
  if (!turnState?.active) return null;
  const round = turnState.round;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        padding: "0.7rem 1rem",
        background: "linear-gradient(90deg, var(--gold), #d4af37, var(--gold))",
        backgroundSize: "200% 100%",
        color: "var(--bg, #1a1a1a)",
        fontWeight: 700,
        letterSpacing: "0.04em",
        borderRadius: 10,
        textAlign: "center",
        fontFamily: "Cinzel Decorative, serif",
        boxShadow: "0 0 20px rgba(214, 175, 54, 0.5)",
        animation: "ql-turn-pulse 2.4s ease-in-out infinite, ql-turn-shine 4s linear infinite",
      }}
    >
      <span style={{ fontSize: "1.05rem" }}>⚔ It's your turn!</span>
      {round !== undefined && (
        <span
          style={{
            display: "block",
            fontSize: "0.7rem",
            opacity: 0.75,
            marginTop: "0.15rem",
            letterSpacing: "0.08em",
            fontFamily: "inherit",
          }}
        >
          Round {round}
        </span>
      )}
      <style>{`
        @keyframes ql-turn-pulse {
          0%, 100% { box-shadow: 0 0 16px rgba(214, 175, 54, 0.4); }
          50%      { box-shadow: 0 0 28px rgba(214, 175, 54, 0.8); }
        }
        @keyframes ql-turn-shine {
          0%   { background-position: 0% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

function HeaderBanner({
  pc,
  spellStats,
  initMod,
}: {
  pc: PlayerCharacter;
  spellStats: { ability: string | null; save_dc: number | null; attack_bonus: number | null } | null;
  initMod: number;
}) {
  // Derived 5e values players reference constantly.
  const profBonus = Math.floor((pc.level - 1) / 4) + 2;
  const percProf =
    (pc.skill_proficiencies as Record<string, number> | null | undefined)?.["Perception"] ?? 0;
  const passivePerception = 10 + mod(pc.score_wis) + profBonus * percProf;
  return (
    <div style={headerStyle}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
        {pc.portrait_url ? (
          <img src={portraitSrc(pc.portrait_url, pc.updated_at)} alt={pc.character_name} style={portraitStyle} />
        ) : (
          <div style={{ ...portraitStyle, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.6rem" }}>
            🧙
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={nameStyle}>{pc.character_name}</h1>
          <p style={subtitleStyle}>
            Lv {pc.level} {pc.character_class}
            {pc.subclass ? ` (${pc.subclass})` : ""} · {pc.race}
          </p>
        </div>
      </div>

      <div style={chipRowStyle}>
        <BigChip label="HP" value={`${pc.hp_current}/${pc.hp_max}`} accent={pc.hp_current === 0 ? "var(--red, #ef5350)" : "var(--gold)"} />
        {pc.temp_hp > 0 && <BigChip label="Temp" value={`+${pc.temp_hp}`} accent="var(--green2, #4caf50)" />}
        <BigChip label="AC" value={String(pc.ac)} />
        <BigChip label="Speed" value={`${pc.speed} ft`} />
        <BigChip label="Init" value={fmt(initMod)} />
        <BigChip label="Prof" value={fmt(profBonus)} />
        <BigChip label="Pass. Perc" value={String(passivePerception)} />
        {pc.heroic_inspiration && <BigChip label="Insp" value="●" accent="var(--gold)" />}
      </div>

      {spellStats?.ability && (
        <div style={spellLineStyle}>
          <strong style={{ color: "var(--gold)" }}>SPELLCASTING</strong>{" "}
          {spellStats.ability} · Save DC {spellStats.save_dc} · Attack{" "}
          {spellStats.attack_bonus != null && spellStats.attack_bonus >= 0 ? "+" : ""}
          {spellStats.attack_bonus}
        </div>
      )}
    </div>
  );
}

function HpZone({
  pc,
  pcId,
  conMod,
  onUpdate,
}: {
  pc: PlayerCharacter;
  pcId: string;
  conMod: number;
  onUpdate: () => void;
}) {
  const [amount, setAmount] = useState<number | "">("");
  const damage = useMutation({
    mutationFn: (n: number) => playApi.applyDamage(pcId, n),
    onSuccess: () => {
      setAmount("");
      onUpdate();
    },
  });
  const heal = useMutation({
    mutationFn: (n: number) => playApi.applyHealing(pcId, n),
    onSuccess: () => {
      setAmount("");
      onUpdate();
    },
  });
  const inspToggle = useMutation({
    mutationFn: () => playApi.patchState(pcId, { heroic_inspiration: !pc.heroic_inspiration }),
    onSuccess: onUpdate,
  });

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <strong style={sectionHeadingStyle}>HP / Inspiration</strong>
        <InfoTip title="Adjusting HP">
          Damage hits Temp HP first, then real HP. Healing only restores
          real HP (never adds Temp). The server applies the waterfall — just
          enter the number and tap.{"\n\n"}
          For attacks: enter what the DM tells you. For self-healing (potion,
          spell), enter the heal you rolled.
        </InfoTip>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))}
          placeholder="0"
          style={hpInputStyle}
        />
        <button
          onClick={() => amount !== "" && amount > 0 && damage.mutate(Number(amount))}
          disabled={amount === "" || amount === 0 || damage.isPending}
          style={{ ...mobileBtnStyle, color: "var(--red)", borderColor: "var(--red)" }}
        >
          − Damage
        </button>
        <button
          onClick={() => amount !== "" && amount > 0 && heal.mutate(Number(amount))}
          disabled={amount === "" || amount === 0 || heal.isPending}
          style={{ ...mobileBtnStyle, color: "var(--green2, #4caf50)", borderColor: "var(--green2, #4caf50)" }}
        >
          + Heal
        </button>
        <button
          onClick={() => inspToggle.mutate()}
          disabled={inspToggle.isPending}
          style={{
            ...mobileBtnStyle,
            color: pc.heroic_inspiration ? "var(--gold)" : "var(--muted)",
            borderColor: pc.heroic_inspiration ? "var(--gold)" : "var(--border)",
          }}
        >
          {pc.heroic_inspiration ? "● Spend Insp" : "○ Inspiration"}
        </button>
      </div>
      <p style={smallNoteStyle}>CON mod: {fmt(conMod)} (added when you roll a Hit Die)</p>
    </section>
  );
}

function DeathSavesBlock({ pc, pcId, onUpdate }: { pc: PlayerCharacter; pcId: string; onUpdate: () => void }) {
  const [d20, setD20] = useState<number | "">("");
  const mut = useMutation({
    mutationFn: (n: number) => playApi.resolveDeathSave(pcId, n),
    onSuccess: () => {
      setD20("");
      onUpdate();
    },
  });
  const stable = pc.death_save_successes >= 3;
  const dead = pc.death_save_failures >= 3;
  const state = dead ? "DEAD" : stable ? "STABLE" : "DYING";
  const color = dead ? "var(--red)" : stable ? "var(--muted)" : "var(--gold)";

  return (
    <section style={{ ...cardStyle, borderColor: color }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <strong style={{ ...sectionHeadingStyle, color }}>💀 {state}</strong>
        <InfoTip title="Death Saves">
          At 0 HP, roll a d20 at the start of your turn (no modifier).{"\n\n"}
          ≥10 = success · &lt;10 = failure · nat 1 = 2 failures · nat 20 = revive at 1 HP{"\n\n"}
          3 successes = stable. 3 failures = dead.
        </InfoTip>
      </div>
      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <PipRow label="Successes" filled={pc.death_save_successes} color="var(--green2, #4caf50)" />
        <PipRow label="Failures" filled={pc.death_save_failures} color="var(--red)" />
      </div>
      {!stable && !dead && (
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
          <input
            type="number"
            min={1}
            max={20}
            value={d20}
            onChange={(e) => setD20(e.target.value === "" ? "" : Number(e.target.value))}
            placeholder="?"
            style={{ ...hpInputStyle, width: 70 }}
          />
          <button
            disabled={d20 === "" || mut.isPending}
            onClick={() => d20 !== "" && mut.mutate(Math.max(1, Math.min(20, Math.floor(Number(d20)))))}
            style={mobileBtnStyle}
          >
            Apply death save
          </button>
          <button
            disabled={mut.isPending}
            onClick={() => mut.mutate(Math.floor(Math.random() * 20) + 1)}
            style={mobileBtnStyle}
          >
            🎲 Digital
          </button>
        </div>
      )}
    </section>
  );
}

function ConcentrationBlock({
  pc,
  pcId,
  conMod,
  onUpdate,
}: {
  pc: PlayerCharacter;
  pcId: string;
  conMod: number;
  onUpdate: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const set = useMutation({
    mutationFn: (label: string | null) => playApi.patchState(pcId, { concentration_on: label }),
    onSuccess: () => {
      setEditing(false);
      setValue("");
      onUpdate();
    },
  });

  if (pc.concentration_on) {
    return (
      <section style={{ ...cardStyle, borderColor: "var(--green2, #4caf50)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🌀</span>
          <span style={{ flex: 1 }}>
            Concentrating on <strong style={{ color: "var(--green2, #4caf50)" }}>{pc.concentration_on}</strong>
          </span>
          <InfoTip title="Concentration">
            When you take damage, the DM will ask for a CON save (DC = max(10, half damage)).{"\n\n"}
            CON mod: {fmt(conMod)}. Casting another concentration spell drops this one.
          </InfoTip>
          <button onClick={() => set.mutate(null)} disabled={set.isPending} style={mobileBtnStyle}>
            Drop
          </button>
        </div>
      </section>
    );
  }
  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} style={{ ...mobileBtnStyle, color: "var(--muted)", alignSelf: "flex-start", marginBottom: "0.5rem" }}>
        🌀 Start concentration
      </button>
    );
  }
  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
        <input
          autoFocus
          type="text"
          maxLength={120}
          value={value}
          placeholder="Spell name (e.g. Bless)"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && value.trim()) set.mutate(value.trim());
            if (e.key === "Escape") setEditing(false);
          }}
          style={{ ...hpInputStyle, flex: 1 }}
        />
        <button disabled={!value.trim() || set.isPending} onClick={() => set.mutate(value.trim())} style={mobileBtnStyle}>
          Set
        </button>
        <button onClick={() => setEditing(false)} style={mobileBtnStyle}>
          Cancel
        </button>
      </div>
    </section>
  );
}

function HitDiceBlock({
  pc,
  dieSize,
  conMod,
  pcId,
  onUpdate,
}: {
  pc: PlayerCharacter;
  dieSize: number;
  conMod: number;
  pcId: string;
  onUpdate: () => void;
}) {
  const total = pc.level;
  const available = Math.max(0, total - pc.hit_dice_spent);
  const [flowOpen, setFlowOpen] = useState(false);
  const [die, setDie] = useState<number | "">("");
  const mut = useMutation({
    mutationFn: async (heal: number) => {
      await playApi.spendHitDice(pcId, 1);
      return playApi.applyHealing(pcId, heal);
    },
    onSuccess: () => {
      setFlowOpen(false);
      setDie("");
      onUpdate();
    },
  });
  const valid = die !== "" && die >= 1 && die <= dieSize;
  const heal = valid ? Math.max(1, Number(die) + conMod) : null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
        <strong style={subHeadingStyle}>Hit Dice</strong>
        <InfoTip title="Hit Dice">
          During a short rest (1 hour), roll a d{dieSize} and add CON mod ({fmt(conMod)}). That's how much you heal.{"\n\n"}
          You have one per level. Half (min 1) recover on a long rest.
        </InfoTip>
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
          <strong style={{ color: "var(--gold)" }}>{available}</strong>/{total} · d{dieSize}
        </span>
      </div>
      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
        {Array.from({ length: total }).map((_, i) => {
          const filled = i < available;
          return (
            <button
              key={i}
              disabled={!filled || flowOpen || mut.isPending}
              onClick={() => setFlowOpen(true)}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                borderRadius: 4,
                border: "1px solid var(--gold)",
                background: filled ? "var(--gold)" : "transparent",
                color: "var(--bg, #1a1a1a)",
                fontSize: "0.65rem",
                fontWeight: 700,
                fontFamily: "monospace",
              }}
            >
              {filled ? `d${dieSize}` : ""}
            </button>
          );
        })}
      </div>
      {flowOpen && (
        <div style={{ marginTop: "0.5rem", padding: "0.55rem 0.7rem", background: "var(--surface2)", borderRadius: 6, border: "1px solid var(--gold)" }}>
          <div style={{ fontSize: "0.7rem", color: "var(--muted)", marginBottom: "0.3rem" }}>🎲 Roll 1d{dieSize} + CON {fmt(conMod)}</div>
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
            <input
              type="number"
              min={1}
              max={dieSize}
              value={die}
              autoFocus
              onChange={(e) => setDie(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="?"
              style={{ ...hpInputStyle, width: 70 }}
            />
            <button onClick={() => setDie(Math.floor(Math.random() * dieSize) + 1)} style={mobileBtnStyle}>
              🎲 Digital
            </button>
            <span style={{ fontFamily: "monospace", fontWeight: 700, color: heal != null ? "var(--green2, #4caf50)" : "var(--muted)" }}>
              Heal {heal != null ? `+${heal}` : "—"}
            </span>
            <span style={{ flex: 1 }} />
            <button disabled={heal == null || mut.isPending} onClick={() => heal != null && mut.mutate(heal)} style={mobileBtnStyle}>
              Apply &amp; spend 1 HD
            </button>
            <button onClick={() => { setFlowOpen(false); setDie(""); }} style={mobileBtnStyle}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExhaustionBlock({ pc, pcId, onUpdate }: { pc: PlayerCharacter; pcId: string; onUpdate: () => void }) {
  const level = pc.exhaustion ?? 0;
  const set = useMutation({
    mutationFn: (n: number) => playApi.patchState(pcId, { exhaustion: n }),
    onSuccess: onUpdate,
  });
  const dead = level >= 6;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
        <strong style={subHeadingStyle}>Exhaustion</strong>
        <InfoTip title="Exhaustion (2024)">
          0–6 scale. Each level applies a cumulative −2 to all D20 Tests
          (attacks, ability checks, saves). Level 6 = death. Long rest reduces by 1.
        </InfoTip>
        <span style={{ fontFamily: "monospace", fontSize: "0.85rem", color: dead ? "var(--red)" : "var(--text)" }}>
          Lv {level}
          {level > 0 && !dead && <span style={{ color: "var(--muted)" }}> · {level * -2} to D20 Tests</span>}
          {dead && <span style={{ color: "var(--red)" }}> · DEAD</span>}
        </span>
      </div>
      <div style={{ display: "flex", gap: "0.3rem" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => {
          const filled = i <= level;
          return (
            <button
              key={i}
              disabled={set.isPending}
              onClick={() => set.mutate(i === level ? level - 1 : i)}
              style={{
                width: 26,
                height: 26,
                borderRadius: "50%",
                border: `2px solid ${i === 6 ? "var(--red)" : "var(--crimson2, #8b1a1a)"}`,
                background: filled ? "var(--crimson2, #8b1a1a)" : "transparent",
                padding: 0,
              }}
              aria-label={`Exhaustion level ${i}`}
            />
          );
        })}
      </div>
    </div>
  );
}

function CurrencyBlock({ pc, pcId, onUpdate }: { pc: PlayerCharacter; pcId: string; onUpdate: () => void }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.35rem" }}>
        <strong style={subHeadingStyle}>Currency</strong>
        <InfoTip title="Currency">
          1 platinum (pp) = 10 gold (gp) = 20 electrum (ep) = 100 silver (sp) = 1000 copper (cp).{"\n\n"}
          Tap a number to edit. Enter or tap-away saves.
        </InfoTip>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: "0.4rem" }}>
        {(["pp", "gp", "ep", "sp", "cp"] as const).map((d) => (
          <CurrencyCell key={d} pc={pc} pcId={pcId} denom={d} onUpdate={onUpdate} />
        ))}
      </div>
    </div>
  );
}

function CurrencyCell({
  pc,
  pcId,
  denom,
  onUpdate,
}: {
  pc: PlayerCharacter;
  pcId: string;
  denom: "pp" | "gp" | "ep" | "sp" | "cp";
  onUpdate: () => void;
}) {
  const [local, setLocal] = useState<string>(String(pc[denom] ?? 0));
  const set = useMutation({
    mutationFn: (n: number) => playApi.patchState(pcId, { [denom]: n }),
    onSuccess: onUpdate,
  });
  const labels: Record<typeof denom, string> = { pp: "PP", gp: "GP", ep: "EP", sp: "SP", cp: "CP" };
  function commit() {
    const n = Math.max(0, Math.floor(Number(local) || 0));
    if (n !== (pc[denom] ?? 0)) set.mutate(n);
    else setLocal(String(pc[denom] ?? 0));
  }
  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 6, padding: "0.3rem", textAlign: "center" }}>
      <div style={{ fontSize: "0.6rem", color: "var(--gold)", letterSpacing: "0.08em", fontWeight: 700 }}>{labels[denom]}</div>
      <input
        type="number"
        min={0}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        style={{ width: "100%", background: "transparent", border: "none", color: "var(--text)", fontFamily: "monospace", fontWeight: 700, textAlign: "center", fontSize: "0.95rem" }}
      />
    </div>
  );
}

function SlotBlock({
  slotState,
  pcId,
  qc,
}: {
  slotState: { levels: Record<string, { max: number; used: number; remaining: number }> };
  pcId: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const expend = useMutation({
    mutationFn: (level: number) => playApi.expendSpellSlot(pcId, level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["play-slots", pcId] }),
  });
  const restore = useMutation({
    mutationFn: (level: number) => playApi.restoreSpellSlot(pcId, level),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["play-slots", pcId] }),
  });

  const levels = Object.entries(slotState.levels).sort((a, b) => Number(a[0]) - Number(b[0]));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <InfoTip title="Spell Slots">
        Tap a filled pip to expend a slot when you cast. Tap an empty pip to restore one (e.g. if you misclicked).
        Long rest restores all.
      </InfoTip>
      {levels.map(([level, state]) => (
        <div key={level} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--gold)", minWidth: 36 }}>L{level}</span>
          <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
            {Array.from({ length: state.max }).map((_, i) => {
              const filled = i < state.remaining;
              return (
                <button
                  key={i}
                  disabled={expend.isPending || restore.isPending}
                  onClick={() => (filled ? expend.mutate(Number(level)) : restore.mutate(Number(level)))}
                  title={filled ? `Expend a level ${level} slot` : `Restore a level ${level} slot`}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    borderRadius: "50%",
                    border: "2px solid var(--gold)",
                    background: filled ? "var(--gold)" : "transparent",
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontFamily: "monospace", fontSize: "0.8rem", color: "var(--muted)" }}>
            {state.remaining}/{state.max}
          </span>
        </div>
      ))}
    </div>
  );
}

function FeaturesBlock({
  features,
  pcId,
  qc,
}: {
  features: Array<{ id: string; feature_name: string; uses_spent: number; max_uses: number; recovery: string }>;
  pcId: string;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const spend = useMutation({
    mutationFn: (cfId: string) => playApi.spendFeature(pcId, cfId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["play-features", pcId] }),
  });
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <InfoTip title="Class Features">
        Most features have limited uses that reset on a short or long rest.
        Tap a filled pip to spend a use. The DM will tell you what the feature does at the table.
      </InfoTip>
      {features.map((f) => {
        const remaining = Math.max(0, f.max_uses - f.uses_spent);
        return (
          <div key={f.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ flex: 1, fontWeight: 600 }}>{f.feature_name}</span>
            <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{f.recovery}</span>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {Array.from({ length: Math.max(1, f.max_uses) }).map((_, i) => {
                const filled = i < remaining;
                return (
                  <button
                    key={i}
                    disabled={!filled || spend.isPending}
                    onClick={() => spend.mutate(f.id)}
                    style={{
                      width: 18,
                      height: 18,
                      padding: 0,
                      borderRadius: "50%",
                      border: "2px solid var(--gold)",
                      background: filled ? "var(--gold)" : "transparent",
                    }}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SkillsBlock({ bonuses }: { bonuses: Record<string, number> }) {
  const entries = Object.entries(bonuses).sort();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.4rem" }}>
      {entries.map(([skill, b]) => (
        <div key={skill} style={{ display: "flex", justifyContent: "space-between", padding: "0.25rem 0.5rem", background: "var(--surface2)", borderRadius: 4 }}>
          <span style={{ fontSize: "0.82rem" }}>{skill}</span>
          <strong style={{ fontFamily: "monospace", color: "var(--gold)" }}>{fmt(b)}</strong>
        </div>
      ))}
    </div>
  );
}

function SavesBlock({ saves }: { saves: Record<string, number> }) {
  const order = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem" }}>
      {order.map((ab) => (
        <div key={ab} style={{ display: "flex", justifyContent: "space-between", padding: "0.3rem 0.5rem", background: "var(--surface2)", borderRadius: 4 }}>
          <span style={{ fontWeight: 700, fontSize: "0.8rem" }}>{ab}</span>
          <strong style={{ fontFamily: "monospace", color: "var(--gold)" }}>{fmt(saves[ab] ?? 0)}</strong>
        </div>
      ))}
    </div>
  );
}

function TurnWalkthrough({ pc }: { pc: PlayerCharacter }) {
  return (
    <div style={{ fontSize: "0.88rem", lineHeight: 1.55 }}>
      <p style={{ marginTop: 0, color: "var(--muted)" }}>
        When the DM says <em>"your turn,"</em> here's the playbook. You don't
        have to do every step — but you can do <strong>each</strong> of these
        once per turn.
      </p>

      <ol style={{ paddingLeft: "1.2rem", margin: 0 }}>
        <li style={stepStyle}>
          <strong>Look around.</strong> Where are the enemies? Where are your
          friends? Who's hurt? Don't rush — combat is meant to be a puzzle.
        </li>

        <li style={stepStyle}>
          <strong>Pick a goal.</strong> Common ones:
          <ul style={subListStyle}>
            <li>"I want to hit that thing." → <em>Attack action</em></li>
            <li>"I want to cast a spell." → <em>Cast a Spell action</em></li>
            <li>"I'm in trouble — I need out." → <em>Disengage</em> or <em>Dash</em></li>
            <li>"I want to help my friend." → <em>Help action</em></li>
            <li>"I want to sneak up." → <em>Hide</em></li>
          </ul>
        </li>

        <li style={stepStyle}>
          <strong>Move</strong> — up to <strong>{pc.speed} ft</strong>. You can
          split it: move some, do your action, move the rest. Moving away from
          an enemy in melee normally triggers an{" "}
          <em>opportunity attack</em> — <em>Disengage</em> avoids that.
        </li>

        <li style={stepStyle}>
          <strong>Take ONE Action.</strong> Pick from:
          <ul style={subListStyle}>
            <li><strong>Attack</strong> — roll d20 + your attack bonus vs target's AC. If you hit, roll damage.</li>
            <li><strong>Cast a Spell</strong> — pick a spell, declare a target, the DM tells you what to roll.</li>
            <li><strong>Dash</strong> — double your move this turn.</li>
            <li><strong>Dodge</strong> — attackers have Disadvantage on you until your next turn.</li>
            <li><strong>Disengage</strong> — your move this turn doesn't trigger opportunity attacks.</li>
            <li><strong>Help</strong> — grant a nearby ally Advantage on their next ability check or attack roll.</li>
            <li><strong>Hide</strong> — make a Stealth check; if you succeed and have cover, you're hidden.</li>
            <li><strong>Ready</strong> — set up an "if X happens, I do Y" trigger that fires on someone else's turn.</li>
            <li><strong>Search</strong> — make a Perception or Investigation check to find something.</li>
            <li><strong>Use an Object</strong> — drink a potion, pull a lever, throw something.</li>
          </ul>
        </li>

        <li style={stepStyle}>
          <strong>Bonus Action</strong> — only if a feature, spell, or item
          says you have one. Examples: a Rogue's Cunning Action, a Fighter's
          Second Wind, off-hand weapon attack, certain spells like Healing
          Word.{" "}
          <em style={{ color: "var(--muted)" }}>
            (Check your features above — if nothing there gives you a bonus
            action, you don't have one this turn.)
          </em>
        </li>

        <li style={stepStyle}>
          <strong>One free interaction</strong> — open a door, draw a weapon,
          pick up an item, speak a sentence. Doesn't cost your action.
        </li>

        <li style={stepStyle}>
          <strong>Say "end of turn."</strong> The DM will note any
          conditions that resolve on your turn (ongoing saves, etc.) and
          move to the next combatant.
        </li>
      </ol>

      <h4 style={ruleHeadStyle}>Reactions (not on your turn)</h4>
      <p style={{ margin: "0.3rem 0 0.6rem" }}>
        You get <strong>one reaction per round</strong>, used on someone
        else's turn. Common triggers:
      </p>
      <ul style={ruleListStyle}>
        <li><strong>Opportunity Attack</strong> — an enemy moves out of your melee reach. Auto-prompt.</li>
        <li>Spells like <em>Shield</em> or <em>Counterspell</em> that say "as a reaction."</li>
        <li>Class features like a Paladin's <em>Divine Smite</em> on a critical hit, or a Wizard's <em>Shield</em>.</li>
      </ul>

      <h4 style={ruleHeadStyle}>How to roll an attack</h4>
      <ol style={ruleListStyle}>
        <li>Roll a d20. Add your attack bonus (shown next to the weapon).</li>
        <li>Compare the total to the target's AC (the DM will tell you if you hit).</li>
        <li>If you hit, roll the weapon's damage dice and add your modifier.</li>
        <li>Nat 20 = critical: roll the damage dice <strong>twice</strong>, then add your modifier once.</li>
        <li>Nat 1 = automatic miss, regardless of bonus.</li>
      </ol>

      <h4 style={ruleHeadStyle}>How to make a save</h4>
      <p>The DM says <em>"make a [stat] save, DC X."</em> You roll a d20 and add the matching save bonus from above. If your total ≥ DC, you succeed. If not, you fail (and usually take the listed effect).</p>

      <h4 style={ruleHeadStyle}>When in doubt</h4>
      <p style={{ marginBottom: 0 }}>
        <strong>Ask the DM.</strong> Everyone's new at the table for the
        first session — questions are good. The fastest way to learn is to
        try something and see what happens.
      </p>
    </div>
  );
}

function NpcsBlock({ pcId }: { pcId: string }) {
  // Plan 38 P3-3 — player-facing campaign NPC roster. Backend strips
  // DM-facing fields (secret, motivation, dialog hooks, notes). Players
  // see only what they'd plausibly know after meeting the NPC.
  const { data: npcs = [], isLoading } = useQuery({
    queryKey: ["play-npcs", pcId],
    queryFn: () => playApi.npcs(pcId),
  });
  if (isLoading) {
    return <p className="text-sm text-muted">Loading…</p>;
  }
  if (npcs.length === 0) {
    return (
      <p className="text-sm text-muted" style={{ fontStyle: "italic" }}>
        You haven't met anyone yet. Faces will appear here as the DM
        adds them to the campaign.
      </p>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
        gap: "0.6rem",
      }}
    >
      {npcs.map((n) => (
        <article
          key={n.id}
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.55rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.35rem",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          {n.portrait_url ? (
            <img
              src={portraitSrc(n.portrait_url)}
              alt={n.name}
              style={{
                width: "100%",
                aspectRatio: "1",
                objectFit: "cover",
                borderRadius: 6,
                border: "1px solid var(--gold)",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                aspectRatio: "1",
                background: "var(--surface)",
                borderRadius: 6,
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "2rem",
              }}
            >
              👤
            </div>
          )}
          <div>
            <strong
              style={{
                color: "var(--gold)",
                fontSize: "0.82rem",
                fontFamily: "Cinzel Decorative, serif",
                lineHeight: 1.2,
                display: "block",
              }}
            >
              {n.name}
            </strong>
            {n.role && (
              <p
                style={{
                  margin: "0.15rem 0 0",
                  fontSize: "0.68rem",
                  color: "var(--muted)",
                  fontStyle: "italic",
                  lineHeight: 1.3,
                }}
              >
                {n.role}
              </p>
            )}
            {(n.race || n.location) && (
              <p
                style={{
                  margin: "0.2rem 0 0",
                  fontSize: "0.62rem",
                  color: "var(--muted)",
                  lineHeight: 1.3,
                }}
              >
                {n.race}
                {n.race && n.location ? " · " : ""}
                {n.location}
              </p>
            )}
            {n.status && n.status !== "Alive" && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: "0.25rem",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 8,
                  background: n.status === "Dead" ? "var(--red, #ef5350)" : "var(--surface)",
                  color: n.status === "Dead" ? "#fff" : "var(--muted)",
                  fontSize: "0.6rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  border: n.status === "Dead" ? "none" : "1px solid var(--border)",
                }}
              >
                {n.status}
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}

function RulesReference({ pc: _pc }: { pc: PlayerCharacter }) {
  return (
    <div style={{ fontSize: "0.85rem", lineHeight: 1.5 }}>
      <h4 style={ruleHeadStyle}>Advantage / Disadvantage</h4>
      <p>Roll 2d20 and take the higher (Advantage) or lower (Disadvantage). Multiple sources don't stack.</p>

      <h4 style={ruleHeadStyle}>Critical Hit</h4>
      <p>Natural 20 on an attack roll. Roll all attack damage dice <strong>twice</strong>, then add modifiers once.</p>

      <h4 style={ruleHeadStyle}>Opportunity Attacks</h4>
      <p>If a hostile creature moves out of your melee reach, you can use your <strong>Reaction</strong> to make one melee attack against them. <em>Disengage</em> prevents this.</p>

      <h4 style={ruleHeadStyle}>Cover</h4>
      <p>Half cover: +2 AC and DEX saves. Three-quarters: +5. Total cover: can't be targeted directly.</p>

      <h4 style={ruleHeadStyle}>Conditions (quick gloss)</h4>
      <ul style={ruleListStyle}>
        <li><strong>Prone:</strong> melee attacks vs you have Advantage; ranged have Disadvantage; you have Disadvantage on attacks.</li>
        <li><strong>Grappled:</strong> speed 0; ends when grappler is Incapacitated.</li>
        <li><strong>Restrained:</strong> speed 0, attacks vs you Adv, your attacks Disadv, DEX saves Disadv.</li>
        <li><strong>Frightened:</strong> Disadv on ability checks and attacks while source is in sight.</li>
        <li><strong>Charmed:</strong> can't attack the charmer; they have Adv on social checks vs you.</li>
        <li><strong>Poisoned:</strong> Disadv on attacks and ability checks.</li>
        <li><strong>Stunned / Paralyzed / Unconscious:</strong> Incapacitated; auto-fail STR & DEX saves; attacks vs you have Adv.</li>
      </ul>
    </div>
  );
}

// ── Visual building blocks ─────────────────────────────────────────────────

function BigChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: "0.4rem 0.55rem",
      background: "var(--surface2)",
      border: `1px solid ${accent ?? "var(--border)"}`,
      borderRadius: 6,
      textAlign: "center",
      minWidth: 0,
    }}>
      <div style={{ fontSize: "0.6rem", color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: "1.1rem", fontWeight: 700, color: accent ?? "var(--gold)", fontFamily: "monospace" }}>{value}</div>
    </div>
  );
}

function PipRow({ label, filled, color }: { label: string; filled: number; color: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: "0.62rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.15rem" }}>{label}</div>
      <div style={{ display: "flex", gap: "0.3rem" }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: `2px solid ${color}`,
              background: i < filled ? color : "transparent",
              display: "inline-block",
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ ...cardStyle, padding: 0 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          padding: "0.75rem 1rem",
          textAlign: "left",
          cursor: "pointer",
          color: "var(--text)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <strong style={sectionHeadingStyle}>{title}</strong>
        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && <div style={{ padding: "0 1rem 1rem" }}>{children}</div>}
    </section>
  );
}

function LoadingScreen() {
  return (
    <div style={pageStyle}>
      <div style={{ ...containerStyle, padding: "2rem", textAlign: "center", color: "var(--muted)" }}>
        Loading your character…
      </div>
    </div>
  );
}

function ErrorScreen({ msg }: { msg: string }) {
  return (
    <div style={pageStyle}>
      <div style={{ ...containerStyle, padding: "2rem" }}>
        <h1 style={{ color: "var(--red)", marginTop: 0 }}>Something's off</h1>
        <p>{msg}</p>
        <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          Ask your DM for the correct link.
        </p>
      </div>
    </div>
  );
}

// ── Utils ─────────────────────────────────────────────────────────────────

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}
function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

// ── Styles ────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "var(--bg, #1a1a1a)",
  padding: "0.75rem",
  fontFamily: "inherit",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 640,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
};

const headerStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--gold)",
  borderRadius: 8,
  padding: "0.85rem 1rem",
};

const portraitStyle: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: 6,
  objectFit: "cover",
  border: "1px solid var(--gold)",
  background: "var(--surface2)",
};

const nameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.3rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  lineHeight: 1.1,
};

const subtitleStyle: React.CSSProperties = {
  margin: "0.15rem 0 0",
  fontSize: "0.78rem",
  color: "var(--muted)",
};

const chipRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(70px, 1fr))",
  gap: "0.4rem",
  marginTop: "0.6rem",
};

const spellLineStyle: React.CSSProperties = {
  marginTop: "0.6rem",
  padding: "0.35rem 0.6rem",
  background: "rgba(214, 175, 54, 0.08)",
  border: "1px solid var(--gold)",
  borderRadius: 4,
  fontSize: "0.82rem",
  fontFamily: "monospace",
};

const cardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.75rem 1rem",
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: "0.9rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  letterSpacing: "0.04em",
};

const subHeadingStyle: React.CSSProperties = {
  fontSize: "0.75rem",
  color: "var(--muted)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const hpInputStyle: React.CSSProperties = {
  width: 80,
  padding: "0.4rem 0.5rem",
  fontFamily: "monospace",
  fontSize: "1rem",
  fontWeight: 700,
  textAlign: "center",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
};

const mobileBtnStyle: React.CSSProperties = {
  fontSize: "0.85rem",
  padding: "0.45rem 0.75rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
  cursor: "pointer",
  fontFamily: "inherit",
  minHeight: 36,
};

const smallNoteStyle: React.CSSProperties = {
  margin: "0.4rem 0 0",
  fontSize: "0.7rem",
  color: "var(--muted)",
};

const hrStyle: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid var(--border)",
  margin: "0.75rem 0",
};

const ruleHeadStyle: React.CSSProperties = {
  margin: "0.75rem 0 0.25rem",
  fontSize: "0.8rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
};

const ruleListStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: "1.2rem",
};

const stepStyle: React.CSSProperties = {
  marginBottom: "0.6rem",
};

const subListStyle: React.CSSProperties = {
  margin: "0.3rem 0 0",
  paddingLeft: "1.1rem",
};
