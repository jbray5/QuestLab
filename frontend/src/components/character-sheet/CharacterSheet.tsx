import { useEffect, useState } from "react";
import { Focus, X } from "lucide-react";
import { zoomable } from "../../lib/lightbox";
import { AI_ON } from "../../lib/flags";
import { useIsCompact } from "../../hooks/useIsCompact";
import Monogram from "./Monogram";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacterUpdate } from "../../api/types";
import FeaturePanel from "../FeaturePanel";
import InventoryPanel from "../InventoryPanel";
import SpellPanel from "../SpellPanel";
import AbilityBlock from "./AbilityBlock";
import AttacksList from "./AttacksList";
import CurrencyBar from "./CurrencyBar";
import DeathSaveTracker from "./DeathSaveTracker";
import ExhaustionTracker from "./ExhaustionTracker";
import HitDiceTracker from "./HitDiceTracker";
import InfoTip from "./InfoTip";
import PlayerLinkButton from "./PlayerLinkButton";
import PortraitGenerator from "../PortraitGenerator";
import { portraitSrc } from "../../lib/portrait";
import RollHelper from "./RollHelper";
import type { RollContext } from "./RollHelper";
import SavingThrows from "./SavingThrows";
import SkillsList from "./SkillsList";

// Plan 00024 — hit-die size per class (2024 PHB), kept here to avoid an
// extra API call. Mirrors services/character_service._HIT_DIE_BY_CLASS.
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

interface Props {
  characterId: string;
  onClose: () => void;
  /** Hide all mutating controls — used by the future player-view (Plan 26). */
  readOnly?: boolean;
}

function mod(score: number): number {
  return Math.floor((score - 10) / 2);
}

function fmt(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * Full-screen character sheet (Plan 00022).
 *
 * Brings together Plans 17–21 into a single view:
 * - Header: portrait, name, class/level/race/background
 * - Combat stats: HP, AC, speed, initiative
 * - AbilityBlock + SavingThrows + SkillsList (server-computed bonuses)
 * - AttacksList (equipped weapons → server attack-preview)
 * - SpellPanel (slots + known/prepared, embedded open)
 * - FeaturePanel (use pips + per-PC rest, embedded open)
 * - InventoryPanel (equip/attune/qty, embedded open)
 * - Notes textarea
 *
 * Built component-driven for Plan 26 (per-player view): every interactive
 * surface accepts ``readOnly`` so flipping a single flag yields the player
 * mode without rewriting.
 */
export default function CharacterSheet({ characterId, onClose, readOnly = false }: Props) {
  const qc = useQueryClient();
  const [rollCtx, setRollCtx] = useState<RollContext | null>(null);
  const [hpDelta, setHpDelta] = useState<number | "">("");
  // Usability pass — full words on the stat tiles; a phone keeps the short form
  // (each tile's tooltip spells it out).
  const narrow = useIsCompact(560);

  const { data: pc, isLoading } = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => charactersApi.get(characterId),
  });

  const invalidatePc = () => {
    qc.invalidateQueries({ queryKey: ["character", characterId] });
    qc.invalidateQueries({ queryKey: ["characters"] });
  };

  const patchPc = useMutation({
    mutationFn: (data: PlayerCharacterUpdate) =>
      charactersApi.update(characterId, data),
    onSuccess: invalidatePc,
  });

  const damageMut = useMutation({
    mutationFn: (n: number) => charactersApi.applyDamage(characterId, n),
    onSuccess: () => {
      setHpDelta("");
      invalidatePc();
    },
  });

  const healMut = useMutation({
    mutationFn: (n: number) => charactersApi.applyHealing(characterId, n),
    onSuccess: () => {
      setHpDelta("");
      invalidatePc();
    },
  });

  const { data: skillBonuses = {} } = useQuery({
    queryKey: ["skill-bonuses", characterId],
    queryFn: () => charactersApi.skillBonuses(characterId),
    enabled: !!pc,
  });

  const { data: savingThrows = {} } = useQuery({
    queryKey: ["saving-throws", characterId],
    queryFn: () => charactersApi.savingThrows(characterId),
    enabled: !!pc,
  });

  const { data: spellStats } = useQuery({
    queryKey: ["spellcasting-stats", characterId],
    queryFn: () => charactersApi.spellcastingStats(characterId),
    enabled: !!pc,
  });

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  if (isLoading || !pc) {
    return (
      <div style={overlayStyle} onClick={onClose}>
        <div style={sheetStyle}>Loading…</div>
      </div>
    );
  }

  const abilities = [
    { label: "STR" as const, score: pc.score_str },
    { label: "DEX" as const, score: pc.score_dex },
    { label: "CON" as const, score: pc.score_con },
    { label: "INT" as const, score: pc.score_int },
    { label: "WIS" as const, score: pc.score_wis },
    { label: "CHA" as const, score: pc.score_cha },
  ];
  const initiativeMod = mod(pc.score_dex);
  const profSet = pc.saving_throw_proficiencies ?? [];
  const skillProfs: Record<string, number> = pc.skill_proficiencies ?? {};
  // Derived 5e values the sheet was missing.
  const profBonus = Math.floor((pc.level - 1) / 4) + 2;
  const passivePerception =
    10 + mod(pc.score_wis) + profBonus * (skillProfs["Perception"] ?? 0);

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      role="dialog"
      aria-label={`${pc.character_name} character sheet`}
    >
      <div className="ql-modal-in" style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        {/* Sticky header */}
        <div style={stickyHeaderStyle}>
          <div className="flex items-center" style={{ gap: "0.75rem" }}>
            {pc.portrait_url ? (
              <img
                src={portraitSrc(pc.portrait_url, pc.updated_at)} {...zoomable(portraitSrc(pc.portrait_url, pc.updated_at), pc.character_name)}
                alt={pc.character_name}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 6,
                  objectFit: "cover",
                  border: "1px solid var(--border2)",
                }}
              />
            ) : (
              <Monogram name={pc.character_name} size={56} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 className="story" style={{ margin: 0, fontSize: "1.5rem" }}>
                {pc.character_name}
              </h2>
              <p
                style={{
                  margin: "0.1rem 0 0",
                  fontSize: "0.875rem",
                  color: "var(--muted)",
                }}
              >
                Level {pc.level} {pc.character_class}
                {pc.subclass ? ` (${pc.subclass})` : ""} · {pc.race}
                {pc.background ? ` · ${pc.background}` : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              className="btn btn-ghost"
              style={{ width: 36, height: 36, minHeight: 0, padding: 0 }}
              title="Close (Esc)"
              aria-label="Close character sheet"
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ marginTop: "0.5rem" }}>
            <PlayerLinkButton characterId={characterId} />
          </div>

          {/* DM-help inline tooltips */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              marginTop: "0.65rem",
              fontSize: "0.8125rem",
              color: "var(--muted)",
            }}
          >
            <span>Rules help:</span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              Temp HP
              <InfoTip title="Temporary HP">
                A separate HP pool, used up before real HP. Doesn't stack — a new
                source replaces the old (don't add).{"\n\n"}
                Common sources: False Life, Heroism, Inspiring Leader, Tempest Cleric's
                Channel Divinity. Lost on long rest.{"\n\n"}
                Use the Damage button — Temp HP is used up first automatically.
              </InfoTip>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
              Inspiration
              <InfoTip title="Heroic Inspiration (2024)">
                A binary boost. The player either HAS inspiration or not — it
                doesn't stack.{"\n\n"}
                Spend BEFORE rolling: re-roll any d20 (attack, save, check)
                and use either result.{"\n\n"}
                2024 rules grant Heroic Inspiration automatically on any
                natural 20. Also grant it for cool roleplay, clever solutions,
                or anything you want to reward at the table.{"\n\n"}
                Click the Inspiration tile to toggle it on or off.
              </InfoTip>
            </span>
          </div>

          {/* Combat stat row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
              gap: "0.5rem",
              marginTop: "0.5rem",
            }}
          >
            <StatChip
              label={narrow ? "HP" : "Hit points"}
              value={`${pc.hp_current}/${pc.hp_max}`}
              accent={pc.hp_current === 0 ? "var(--danger-text)" : undefined}
              title="Hit points: current / maximum"
            />
            <StatChip
              label={narrow ? "Temp" : "Temp HP"}
              value={pc.temp_hp > 0 ? `+${pc.temp_hp}` : "—"}
              accent={pc.temp_hp > 0 ? "var(--teal-text)" : undefined}
              title="Temporary hit points: lost first, gone after a long rest"
            />
            <StatChip
              label={narrow ? "AC" : "Armor Class"}
              value={String(pc.ac)}
              title="Armor Class: what an attack roll must reach to hit"
            />
            <StatChip label="Speed" value={`${pc.speed} ft`} title="Speed: feet moved per turn" />
            <StatChip
              label={narrow ? "Insp." : "Inspiration"}
              value={pc.heroic_inspiration ? "Yes" : "No"}
              accent={pc.heroic_inspiration ? "var(--accent-text)" : "var(--muted)"}
              clickable={!readOnly}
              onClick={() =>
                patchPc.mutate({
                  heroic_inspiration: !pc.heroic_inspiration,
                })
              }
              title={
                pc.heroic_inspiration
                  ? "Spend heroic inspiration"
                  : "Grant heroic inspiration"
              }
            />
            <StatChip
              label={narrow ? "Init." : "Initiative"}
              value={fmt(initiativeMod)}
              clickable={!readOnly}
              onClick={() =>
                setRollCtx({
                  label: "Initiative",
                  mod: initiativeMod,
                  breakdown: `DEX mod (${fmt(initiativeMod)})`,
                })
              }
              title="Initiative: roll d20 + Dexterity modifier"
            />
            <StatChip
              label={narrow ? "Prof." : "Proficiency"}
              value={fmt(profBonus)}
              title="Proficiency bonus: added to anything this character is trained in"
            />
            <StatChip
              label={narrow ? "Perc." : "Passive Perception"}
              value={String(passivePerception)}
              title="Passive Perception: noticing things without rolling (10 + Perception bonus)"
            />
          </div>

          {/* HP damage / heal controls */}
          {!readOnly && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                marginTop: "0.55rem",
                flexWrap: "wrap",
              }}
            >
              <label
                htmlFor={`hp-delta-${characterId}`}
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--muted)",
                  margin: 0,
                }}
              >
                Adjust hit points
              </label>
              <input
                id={`hp-delta-${characterId}`}
                type="number"
                min={0}
                value={hpDelta}
                onChange={(e) =>
                  setHpDelta(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                }
                placeholder="0"
                className="num"
                style={{
                  width: 76,
                  padding: "0.3rem 0.45rem",
                  fontSize: "0.9375rem",
                }}
              />
              <button
                onClick={() => {
                  if (hpDelta === "" || hpDelta === 0) return;
                  damageMut.mutate(Number(hpDelta));
                }}
                disabled={hpDelta === "" || hpDelta === 0 || damageMut.isPending}
                className="btn btn-secondary"
                style={{
                  fontSize: "0.875rem",
                  padding: "0.3rem 0.7rem",
                  minHeight: 0,
                  color: "var(--danger-text)",
                }}
              >
                − Damage
              </button>
              <button
                onClick={() => {
                  if (hpDelta === "" || hpDelta === 0) return;
                  healMut.mutate(Number(hpDelta));
                }}
                disabled={hpDelta === "" || hpDelta === 0 || healMut.isPending}
                className="btn btn-secondary"
                style={{
                  fontSize: "0.875rem",
                  padding: "0.3rem 0.7rem",
                  minHeight: 0,
                  color: "var(--teal-text)",
                }}
              >
                + Heal
              </button>
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
                Damage uses up Temp HP first.
              </span>
            </div>
          )}

          {/* Concentration line */}
          {pc.concentration_on && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.6rem",
                marginTop: "0.55rem",
                padding: "0.4rem 0.4rem 0.4rem 0.7rem",
                background: "var(--amber-soft)",
                border: "1px solid var(--amber-soft)",
                borderRadius: 8,
                fontSize: "0.875rem",
                flexWrap: "wrap",
              }}
            >
              <Focus size={16} style={{ color: "var(--amber-text)" }} />
              <span style={{ flex: 1, color: "var(--text2)" }}>
                Concentrating on{" "}
                <strong style={{ color: "var(--amber-text)" }}>
                  {pc.concentration_on}
                </strong>
              </span>
              {!readOnly && (
                <>
                  <button
                    onClick={() =>
                      setRollCtx({
                        label: "Concentration (CON save)",
                        mod: mod(pc.score_con),
                        breakdown: "CON mod · DC = max(10, half damage taken)",
                      })
                    }
                    className="btn btn-secondary"
                    style={{ fontSize: "0.8125rem", padding: "0.2rem 0.6rem", minHeight: 0 }}
                    title="Constitution saving throw — DC 10 or half the damage taken, whichever is higher"
                  >
                    Roll Constitution save
                  </button>
                  <button
                    onClick={() =>
                      patchPc.mutate({
                        concentration_on: null,
                      })
                    }
                    className="btn btn-ghost"
                    style={{ fontSize: "0.8125rem", padding: "0.2rem 0.6rem", minHeight: 0 }}
                  >
                    Drop
                  </button>
                </>
              )}
            </div>
          )}
          {!pc.concentration_on && !readOnly && (
            <ConcentrationStarter
              onStart={(label) =>
                patchPc.mutate({ concentration_on: label })
              }
            />
          )}
        </div>

        {/* Body — scrollable */}
        <div style={bodyStyle}>
          {pc.hp_current === 0 && <DeathSaveTracker pc={pc} readOnly={readOnly} />}

          {/* The generator is AI-only (Plan 86); without it this box was empty. */}
          {!readOnly && AI_ON && (
            <Section title="Portrait">
              <PortraitGenerator
                currentUrl={portraitSrc(pc.portrait_url, pc.updated_at) ?? null}
                onGenerate={async (hints) => {
                  const updated = await charactersApi.generatePortrait(
                    characterId,
                    hints,
                  );
                  invalidatePc();
                  return updated.portrait_url ?? "";
                }}
              />
            </Section>
          )}

          <Section title="Ability scores">
            <AbilityBlock abilities={abilities} onRoll={setRollCtx} readOnly={readOnly} />
          </Section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))",
              gap: "1rem",
            }}
          >
            <Section>
              <SavingThrows
                saves={savingThrows}
                proficient={profSet}
                onRoll={setRollCtx}
                readOnly={readOnly}
              />
            </Section>
            <Section>
              <SkillsList
                bonuses={skillBonuses}
                proficiencies={skillProfs}
                onRoll={setRollCtx}
                readOnly={readOnly}
              />
            </Section>
          </div>

          <Section>
            <AttacksList
              characterId={characterId}
              onRoll={setRollCtx}
              readOnly={readOnly}
            />
          </Section>

          {/* Plan 24 — Spellcasting line (casters only) */}
          {spellStats && spellStats.ability && (
            <Section>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.5rem 1.25rem",
                  flexWrap: "wrap",
                  fontSize: "0.875rem",
                }}
              >
                <span style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text)" }}>
                  Spellcasting
                </span>
                <span style={{ color: "var(--muted)" }} title="The ability this character casts spells with">
                  Ability{" "}
                  <strong className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
                    {spellStats.ability}
                  </strong>
                </span>
                <span style={{ color: "var(--muted)" }} title="What a target must roll to resist this character's spells">
                  Spell save DC{" "}
                  <strong className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
                    {spellStats.save_dc}
                  </strong>
                </span>
                <span style={{ color: "var(--muted)" }} title="Added to the d20 for a spell attack">
                  Spell attack{" "}
                  <strong className="num" style={{ color: "var(--text)", fontWeight: 600 }}>
                    {spellStats.attack_bonus !== null &&
                    spellStats.attack_bonus >= 0
                      ? "+"
                      : ""}
                    {spellStats.attack_bonus}
                  </strong>
                </span>
              </div>
            </Section>
          )}

          {/* Embedded panels — always expanded inside the sheet.
              The panels render their own headers, so no wrapper Section
              title (would double up). */}
          <SpellPanel
            characterId={characterId}
            characterClass={pc.character_class}
            characterName={pc.character_name}
            defaultOpen
            readOnly={readOnly}
          />

          <FeaturePanel
            characterId={characterId}
            characterClass={pc.character_class}
            characterLevel={pc.level}
            characterName={pc.character_name}
            defaultOpen
            readOnly={readOnly}
          />

          <InventoryPanel
            characterId={characterId}
            characterName={pc.character_name}
            defaultOpen
            readOnly={readOnly}
          />

          {/* Plan 24 — Resources row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: "1rem",
            }}
          >
            <Section>
              <HitDiceTracker
                pc={pc}
                dieSize={HIT_DIE_BY_CLASS[pc.character_class] ?? 8}
                readOnly={readOnly}
              />
            </Section>
            <Section>
              <ExhaustionTracker pc={pc} readOnly={readOnly} />
            </Section>
          </div>
          <Section>
            <CurrencyBar pc={pc} readOnly={readOnly} />
          </Section>

          {(pc.backstory || pc.notes) && (
            <Section title="Backstory and notes">
              {pc.backstory && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <h5
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--muted)",
                      margin: "0 0 0.3rem",
                    }}
                  >
                    Backstory
                  </h5>
                  <p
                    className="story"
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      fontSize: "1.05rem",
                      lineHeight: 1.55,
                      color: "var(--story-text)",
                    }}
                  >
                    {pc.backstory}
                  </p>
                </div>
              )}
              {pc.notes && (
                <div>
                  <h5
                    style={{
                      fontSize: "0.8125rem",
                      fontWeight: 500,
                      color: "var(--muted)",
                      margin: "0 0 0.3rem",
                    }}
                  >
                    Notes
                  </h5>
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      fontSize: "0.9375rem",
                      lineHeight: 1.5,
                    }}
                  >
                    {pc.notes}
                  </p>
                </div>
              )}
            </Section>
          )}
        </div>
      </div>

      <RollHelper context={rollCtx} onClose={() => setRollCtx(null)} />
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────


function StatChip({
  label,
  value,
  clickable = false,
  onClick,
  accent,
  title,
}: {
  label: string;
  value: string;
  clickable?: boolean;
  onClick?: () => void;
  accent?: string;
  title?: string;
}) {
  return (
    <button
      disabled={!clickable}
      onClick={onClick}
      title={title}
      style={{
        padding: "0.4rem 0.5rem",
        background: "var(--surface2)",
        border: `1px solid ${clickable ? "var(--border2)" : "var(--border)"}`,
        borderRadius: 8,
        textAlign: "center",
        cursor: clickable ? "pointer" : "default",
        fontFamily: "inherit",
        color: "inherit",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "0.75rem",
          color: "var(--muted)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </div>
      <div
        className="num"
        style={{
          fontSize: "1.15rem",
          fontWeight: 600,
          color: accent ?? "var(--text)",
        }}
      >
        {value}
      </div>
    </button>
  );
}

function ConcentrationStarter({
  onStart,
}: {
  onStart: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");

  if (!editing) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          marginTop: "0.5rem",
        }}
      >
        <button
          onClick={() => setEditing(true)}
          className="btn btn-ghost"
          style={{
            fontSize: "0.8125rem",
            padding: "0.25rem 0.6rem",
            minHeight: 0,
          }}
          title="Mark this PC as concentrating on a spell/effect"
        >
          <Focus size={14} /> Start concentration
        </button>
        <InfoTip title="Concentration">
          Spells tagged "Concentration" require ongoing focus. Casting another
          concentration spell drops the first.{"\n\n"}
          Whenever the PC takes damage they make a CON save:
          DC = max(10, half damage taken). Failing drops the spell.{"\n\n"}
          Click "Start concentration" and type the spell name when the
          player casts something like Bless, Hold Person, or Hunter's Mark.
        </InfoTip>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "flex",
        gap: "0.4rem",
        alignItems: "center",
        marginTop: "0.5rem",
      }}
    >
      <input
        autoFocus
        type="text"
        maxLength={120}
        value={value}
        placeholder="e.g. Bless, Hex, Shield of Faith"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onStart(value.trim());
            setValue("");
            setEditing(false);
          }
          if (e.key === "Escape") {
            setValue("");
            setEditing(false);
          }
        }}
        aria-label="Spell or effect being concentrated on"
        style={{
          flex: 1,
          padding: "0.3rem 0.55rem",
          fontSize: "0.875rem",
        }}
      />
      <button
        onClick={() => {
          if (!value.trim()) return;
          onStart(value.trim());
          setValue("");
          setEditing(false);
        }}
        disabled={!value.trim()}
        className="btn btn-secondary"
        style={{ fontSize: "0.8125rem", padding: "0.3rem 0.65rem", minHeight: 0 }}
      >
        Set
      </button>
      <button
        onClick={() => {
          setValue("");
          setEditing(false);
        }}
        className="btn btn-ghost"
        style={{ fontSize: "0.8125rem", padding: "0.3rem 0.65rem", minHeight: 0 }}
      >
        Cancel
      </button>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "0.75rem 1rem",
      }}
    >
      {title && (
        <h3
          style={{
            margin: "0 0 0.5rem",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--text)",
          }}
        >
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(5, 8, 7, 0.78)",
  zIndex: 300,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "1rem 0.6rem",
  overflowY: "auto",
  // iOS: keep the overlay's own scrolling from bouncing the page behind it.
  overscrollBehavior: "contain",
};

const sheetStyle: React.CSSProperties = {
  maxWidth: 920,
  width: "100%",
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  // dvh = the VISIBLE viewport on phones (100vh hides behind the iOS URL bar).
  maxHeight: "calc(100dvh - 2rem)",
  overflow: "hidden",
};

const stickyHeaderStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  overflowY: "auto",
  // A flex child won't shrink below its content without minHeight 0 — that
  // was the phone bug: the body could never scroll, the sheet just clipped.
  flex: "1 1 auto",
  minHeight: 0,
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};
