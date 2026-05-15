import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import type { PlayerCharacter } from "../../api/types";
import FeaturePanel from "../FeaturePanel";
import InventoryPanel from "../InventoryPanel";
import SpellPanel from "../SpellPanel";
import AbilityBlock from "./AbilityBlock";
import AttacksList from "./AttacksList";
import DeathSaveTracker from "./DeathSaveTracker";
import RollHelper from "./RollHelper";
import type { RollContext } from "./RollHelper";
import SavingThrows from "./SavingThrows";
import SkillsList from "./SkillsList";

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

  const { data: pc, isLoading } = useQuery({
    queryKey: ["character", characterId],
    queryFn: () => charactersApi.get(characterId),
  });

  const invalidatePc = () => {
    qc.invalidateQueries({ queryKey: ["character", characterId] });
    qc.invalidateQueries({ queryKey: ["characters"] });
  };

  const patchPc = useMutation({
    mutationFn: (data: Partial<PlayerCharacter>) =>
      charactersApi.update(characterId, data as never),
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
  const profSet = (pc.saving_throw_proficiencies ?? []).map((p) =>
    typeof p === "string" ? p : String(p),
  );
  const skillProfs: Record<string, number> = (pc.skill_proficiencies as Record<
    string,
    number
  > | null) ?? {};

  return (
    <div
      style={overlayStyle}
      onClick={onClose}
      role="dialog"
      aria-label={`${pc.character_name} character sheet`}
    >
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        {/* Sticky header */}
        <div style={stickyHeaderStyle}>
          <div className="flex items-center" style={{ gap: "0.75rem" }}>
            {pc.portrait_url ? (
              <img
                src={pc.portrait_url}
                alt={pc.character_name}
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 6,
                  objectFit: "cover",
                  border: "1px solid var(--gold)",
                }}
              />
            ) : (
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 6,
                  background: "var(--surface2)",
                  border: "1px dashed var(--border)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "1.5rem",
                }}
              >
                🧙
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontSize: "1.4rem",
                  color: "var(--gold)",
                  fontFamily: "Cinzel Decorative, serif",
                }}
              >
                {pc.character_name}
              </h2>
              <p
                style={{
                  margin: "0.1rem 0 0",
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                }}
              >
                Lv {pc.level} {pc.character_class}
                {pc.subclass ? ` (${pc.subclass})` : ""} · {pc.race}
                {pc.background ? ` · ${pc.background}` : ""}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 4,
                color: "var(--text)",
                fontSize: "1.1rem",
                width: 32,
                height: 32,
                cursor: "pointer",
              }}
              title="Close (Esc)"
            >
              ✕
            </button>
          </div>

          {/* Combat stat row */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
              gap: "0.5rem",
              marginTop: "0.75rem",
            }}
          >
            <StatChip
              label="HP"
              value={`${pc.hp_current}/${pc.hp_max}`}
              accent={pc.hp_current === 0 ? "var(--red, #ef5350)" : undefined}
            />
            <StatChip
              label="Temp HP"
              value={pc.temp_hp > 0 ? `+${pc.temp_hp}` : "—"}
              accent={pc.temp_hp > 0 ? "var(--green2, #4caf50)" : undefined}
            />
            <StatChip label="AC" value={String(pc.ac)} />
            <StatChip label="Speed" value={`${pc.speed} ft`} />
            <StatChip
              label="Insp"
              value={pc.heroic_inspiration ? "●" : "○"}
              accent={pc.heroic_inspiration ? "var(--gold)" : "var(--muted)"}
              clickable={!readOnly}
              onClick={() =>
                patchPc.mutate({
                  heroic_inspiration: !pc.heroic_inspiration,
                } as Partial<PlayerCharacter>)
              }
              title={
                pc.heroic_inspiration
                  ? "Spend heroic inspiration"
                  : "Grant heroic inspiration"
              }
            />
            <StatChip
              label="Init"
              value={fmt(initiativeMod)}
              clickable={!readOnly}
              onClick={() =>
                setRollCtx({
                  label: "Initiative",
                  mod: initiativeMod,
                  breakdown: `DEX mod (${fmt(initiativeMod)})`,
                })
              }
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
                style={{
                  fontSize: "0.65rem",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Adjust HP
              </label>
              <input
                type="number"
                min={0}
                value={hpDelta}
                onChange={(e) =>
                  setHpDelta(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))
                }
                placeholder="0"
                style={{
                  width: 70,
                  padding: "0.25rem 0.4rem",
                  fontFamily: "monospace",
                  fontSize: "0.85rem",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text)",
                }}
              />
              <button
                onClick={() => {
                  if (hpDelta === "" || hpDelta === 0) return;
                  damageMut.mutate(Number(hpDelta));
                }}
                disabled={hpDelta === "" || hpDelta === 0 || damageMut.isPending}
                className="btn btn-ghost"
                style={{
                  fontSize: "0.78rem",
                  padding: "0.25rem 0.6rem",
                  color: "var(--red, #ef5350)",
                  borderColor: "var(--red, #ef5350)",
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
                className="btn btn-ghost"
                style={{
                  fontSize: "0.78rem",
                  padding: "0.25rem 0.6rem",
                  color: "var(--green2, #4caf50)",
                  borderColor: "var(--green2, #4caf50)",
                }}
              >
                + Heal
              </button>
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                (damage hits Temp HP first)
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
                padding: "0.4rem 0.6rem",
                background: "rgba(76, 175, 80, 0.08)",
                border: "1px solid var(--green2, #4caf50)",
                borderRadius: 6,
                fontSize: "0.82rem",
              }}
            >
              <span>🌀</span>
              <span style={{ flex: 1 }}>
                Concentrating on:{" "}
                <strong style={{ color: "var(--green2, #4caf50)" }}>
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
                    className="btn btn-ghost"
                    style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
                  >
                    Roll CON save
                  </button>
                  <button
                    onClick={() =>
                      patchPc.mutate({
                        concentration_on: null,
                      } as Partial<PlayerCharacter>)
                    }
                    className="btn btn-ghost"
                    style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }}
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
                patchPc.mutate({ concentration_on: label } as Partial<PlayerCharacter>)
              }
            />
          )}
        </div>

        {/* Body — scrollable */}
        <div style={bodyStyle}>
          {pc.hp_current === 0 && <DeathSaveTracker pc={pc} readOnly={readOnly} />}

          <Section title="Ability Scores">
            <AbilityBlock abilities={abilities} onRoll={setRollCtx} readOnly={readOnly} />
          </Section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 1fr) minmax(280px, 2fr)",
              gap: "1.25rem",
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

          <Section title="⚔ Attacks">
            <AttacksList
              characterId={characterId}
              onRoll={setRollCtx}
              readOnly={readOnly}
            />
          </Section>

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

          {(pc.backstory || pc.notes) && (
            <Section title="📝 Backstory & Notes">
              {pc.backstory && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <h5
                    style={{
                      fontSize: "0.7rem",
                      color: "var(--muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      margin: "0 0 0.3rem",
                    }}
                  >
                    Backstory
                  </h5>
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      fontSize: "0.9rem",
                      lineHeight: 1.5,
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
                      fontSize: "0.7rem",
                      color: "var(--muted)",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      margin: "0 0 0.3rem",
                    }}
                  >
                    Notes
                  </h5>
                  <p
                    style={{
                      whiteSpace: "pre-wrap",
                      margin: 0,
                      fontSize: "0.9rem",
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
        border: `1px solid ${accent ?? "var(--border)"}`,
        borderRadius: 6,
        textAlign: "center",
        cursor: clickable ? "pointer" : "default",
        fontFamily: "inherit",
        color: "inherit",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "0.62rem",
          color: "var(--muted)",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "1.1rem",
          fontWeight: 700,
          color: accent ?? "var(--gold)",
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
      <button
        onClick={() => setEditing(true)}
        className="btn btn-ghost"
        style={{
          fontSize: "0.72rem",
          padding: "0.25rem 0.55rem",
          marginTop: "0.5rem",
          color: "var(--muted)",
        }}
        title="Mark this PC as concentrating on a spell/effect"
      >
        🌀 Start concentration
      </button>
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
        style={{
          flex: 1,
          padding: "0.25rem 0.5rem",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          color: "var(--text)",
          fontSize: "0.82rem",
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
        className="btn btn-primary"
        style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
      >
        Set
      </button>
      <button
        onClick={() => {
          setValue("");
          setEditing(false);
        }}
        className="btn btn-ghost"
        style={{ fontSize: "0.72rem", padding: "0.25rem 0.55rem" }}
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
        borderRadius: 8,
        padding: title ? "0.75rem 1rem" : "0",
      }}
    >
      {title && (
        <h3
          style={{
            margin: "0 0 0.5rem",
            fontSize: "0.85rem",
            letterSpacing: "0.04em",
            color: "var(--gold)",
            fontFamily: "Cinzel Decorative, serif",
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
  background: "rgba(0,0,0,0.78)",
  zIndex: 300,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2rem 1rem",
  overflowY: "auto",
};

const sheetStyle: React.CSSProperties = {
  maxWidth: 920,
  width: "100%",
  background: "var(--bg, #1a1a1a)",
  border: "1px solid var(--gold)",
  borderRadius: 12,
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 4rem)",
  overflow: "hidden",
};

const stickyHeaderStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface, #222)",
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
};
