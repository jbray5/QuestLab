import { useState } from "react";
import { Palette, PersonStanding, X } from "lucide-react";
import { AI_ON } from "../lib/flags";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Monster } from "../api/types";
import { monstersApi } from "../api/monsters";
import ImageUpload from "./ImageUpload";
import ModelUpload from "./ModelUpload";
import { heightFtForSize } from "../engine/heights";
import ObsidianLink, { ObsidianNoteInput } from "./dm/ObsidianLink";

interface Props {
  monster: Monster;
  onClose: () => void;
}

function abilityModifier(score: number): string {
  const mod = Math.floor((score - 10) / 2);
  return mod >= 0 ? `+${mod}` : `${mod}`;
}

function formatSpeed(speed: Record<string, number> | null): string {
  if (!speed || Object.keys(speed).length === 0) return "—";
  return Object.entries(speed)
    .map(([type, val]) => {
      if (type === "walk") return `${val} ft.`;
      return `${type} ${val} ft.`;
    })
    .join(", ");
}

function formatSignedNumber(val: number): string {
  return val >= 0 ? `+${val}` : `${val}`;
}

function capitalized(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/** Full names for the ability tiles' tooltips (usability pass, Plan 121). */
const ABILITY_NAME: Record<string, string> = {
  STR: "Strength",
  DEX: "Dexterity",
  CON: "Constitution",
  INT: "Intelligence",
  WIS: "Wisdom",
  CHA: "Charisma",
};

/** A hairline rule between stat-block sections (.stat-block hr). */
function Divider() {
  return <hr style={{ margin: "0.75rem 0" }} />;
}

/** One "Label value" property line: muted-strong label, readable value. */
function Prop({ label, title, children }: { label: string; title?: string; children: React.ReactNode }) {
  return (
    <p style={{ marginBottom: "0.3rem" }}>
      <strong style={{ color: "var(--text)", fontWeight: 600 }} title={title}>
        {label}
      </strong>{" "}
      <span style={{ color: "var(--text2)" }}>{children}</span>
    </p>
  );
}

interface SectionProps {
  title: string;
  entries: Array<{ name: string; desc: string }> | null;
}

function ActionSection({ title, entries }: SectionProps) {
  if (!entries || entries.length === 0) return null;
  return (
    <div style={{ marginTop: "0.9rem" }}>
      <h3
        style={{
          color: "var(--text)",
          fontSize: "1.05rem",
          fontWeight: 600,
          borderBottom: "1px solid var(--accent-line)",
          paddingBottom: "0.25rem",
          marginBottom: "0.5rem",
        }}
      >
        {title}
      </h3>
      {entries.map((entry, i) => (
        <p key={i} style={{ marginBottom: "0.55rem", lineHeight: 1.55 }}>
          <strong style={{ color: "var(--text)", fontWeight: 600, fontStyle: "italic" }}>{entry.name}.</strong>{" "}
          <span style={{ color: "var(--text2)" }}>{entry.desc}</span>
        </p>
      ))}
    </div>
  );
}

export default function MonsterStatBlock({ monster, onClose }: Props) {
  const qc = useQueryClient();
  const updateImage = useMutation({
    mutationFn: (url: string) => monstersApi.updateImage(monster.id, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monsters"] }),
  });
  // Plan 111 — the rigged figure the immersive table walks for this monster.
  const updateModel = useMutation({
    mutationFn: (url: string | null) => monstersApi.update(monster.id, { model_url: url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monsters"] }),
  });
  // Plan 93 — the DM's Obsidian path. Saved on blur so it isn't a PATCH per keystroke.
  const [note, setNote] = useState<string | null>(monster.dm_note ?? null);
  const saveNote = useMutation({
    mutationFn: (dm_note: string | null) => monstersApi.update(monster.id, { dm_note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monsters"] }),
  });

  const scores: Array<{ label: string; value: number }> = [
    { label: "STR", value: monster.score_str },
    { label: "DEX", value: monster.score_dex },
    { label: "CON", value: monster.score_con },
    { label: "INT", value: monster.score_int },
    { label: "WIS", value: monster.score_wis },
    { label: "CHA", value: monster.score_cha },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5, 8, 7, 0.8)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        overflowY: "auto",
        padding: "2rem 1rem",
      }}
    >
      <div
        className="stat-block fade-in"
        role="dialog"
        aria-label={`${monster.name} stat block`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          maxWidth: "600px",
          width: "100%",
          padding: "1.4rem 1.5rem",
          borderColor: "var(--border2)",
        }}
      >
        {/* Close button */}
        <button
          className="btn btn-ghost"
          onClick={onClose}
          style={{
            position: "absolute",
            top: "0.75rem",
            right: "0.75rem",
            width: 36,
            height: 36,
            minHeight: 0,
            padding: 0,
            zIndex: 1,
          }}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div style={{ paddingRight: "2.5rem", display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: "center" }}>
            <ImageUpload
              currentUrl={monster.image_url}
              onUrlChange={(url) => updateImage.mutate(url)}
              label="Monster Art"
              size={90}
            />
            {AI_ON && <MonsterPortraitButton monsterId={monster.id} />}
            {AI_ON && <MonsterFigureButton monsterId={monster.id} hasFigure={!!monster.figure_url} />}
            <ModelUpload currentUrl={monster.model_url} onUrlChange={(url) => updateModel.mutate(url)} heightFt={heightFtForSize(monster.size)} />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h2
                className="monster-name"
                style={{
                  fontSize: "1.75rem",
                  lineHeight: 1.15,
                  flex: 1,
                }}
              >
                {monster.name}
              </h2>
              <ObsidianLink dmNote={monster.dm_note} />
            </div>
            <p style={{ fontStyle: "italic", color: "var(--muted)", fontSize: "0.9375rem" }}>
              {monster.size} {monster.creature_type}
              {monster.alignment ? `, ${monster.alignment}` : ""}
            </p>
          </div>
        </div>

        <Divider />

        {/* Plan 93 — DM-only: the vault path for this monster's page. */}
        <label
          style={{
            display: "block",
            fontSize: "0.8125rem",
            color: "var(--muted)",
            marginBottom: "0.5rem",
          }}
        >
          Obsidian note
          <span onBlur={() => saveNote.mutate(note)}>
            <ObsidianNoteInput value={note} onChange={setNote} />
          </span>
        </label>

        {/* AC / HP / Speed */}
        <div style={{ marginBottom: "0.5rem", fontSize: "0.9375rem" }}>
          <Prop label="Armor Class" title="What an attack roll must reach to hit">
            <span className="num" style={{ color: "var(--text)" }}>{monster.ac}</span>
            {monster.ac_notes ? ` (${monster.ac_notes})` : ""}
          </Prop>
          <Prop label="Hit Points" title="Average hit points (the dice to roll them instead)">
            <span className="num" style={{ color: "var(--text)" }}>{monster.hp_average}</span>{" "}
            <span className="num">({monster.hp_formula})</span>
          </Prop>
          <Prop label="Speed">{formatSpeed(monster.speed)}</Prop>
        </div>

        {/* Ability Scores */}
        <div className="ability-grid">
          {scores.map(({ label, value }) => (
            <div key={label} title={`${ABILITY_NAME[label] ?? label} ${value} (modifier ${abilityModifier(value)})`}>
              <div style={{ color: "var(--muted)", fontSize: "0.75rem", fontFamily: "var(--font-ui)" }}>
                {label}
              </div>
              <div style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: 600 }}>
                {value}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                ({abilityModifier(value)})
              </div>
            </div>
          ))}
        </div>

        {/* Properties */}
        <div style={{ fontSize: "0.9375rem", marginTop: "0.75rem" }}>
          {monster.saving_throws && Object.keys(monster.saving_throws).length > 0 && (
            <Prop label="Saving Throws">
              {Object.entries(monster.saving_throws)
                .map(([k, v]) => `${capitalized(k)} ${formatSignedNumber(v)}`)
                .join(", ")}
            </Prop>
          )}
          {monster.skills && Object.keys(monster.skills).length > 0 && (
            <Prop label="Skills">
              {Object.entries(monster.skills)
                .map(([k, v]) => `${capitalized(k)} ${formatSignedNumber(v)}`)
                .join(", ")}
            </Prop>
          )}
          {monster.damage_resistances.length > 0 && (
            <Prop label="Damage Resistances" title="Takes half damage of these types">
              {monster.damage_resistances.join(", ")}
            </Prop>
          )}
          {monster.damage_immunities.length > 0 && (
            <Prop label="Damage Immunities" title="Takes no damage of these types">
              {monster.damage_immunities.join(", ")}
            </Prop>
          )}
          {monster.condition_immunities && monster.condition_immunities.length > 0 && (
            <Prop label="Condition Immunities">{monster.condition_immunities.join(", ")}</Prop>
          )}
          {monster.senses && Object.keys(monster.senses).length > 0 && (
            <Prop label="Senses">
              {Object.entries(monster.senses)
                .map(([k, v]) => {
                  const label = capitalized(k.replace(/_/g, " "));
                  if (/passive/i.test(k)) return `${label} ${v}`;
                  return typeof v === "number" ? `${label} ${v} ft.` : `${label} ${v}`;
                })
                .join(", ")}
            </Prop>
          )}
          <Prop label="Languages">{monster.languages || "—"}</Prop>
          <Prop label="Challenge" title="Challenge rating — roughly the party level this monster is a fair fight for">
            <span className="num" style={{ color: "var(--text)" }}>{monster.challenge_rating}</span>{" "}
            (<span className="num">{monster.xp.toLocaleString()}</span> XP)
          </Prop>
          <Prop label="Proficiency Bonus">
            <span className="num">{formatSignedNumber(monster.proficiency_bonus)}</span>
          </Prop>
        </div>

        <Divider />

        {/* Traits */}
        {monster.traits && monster.traits.length > 0 && (
          <div style={{ marginBottom: "0.5rem" }}>
            {monster.traits.map((trait, i) => (
              <p key={i} style={{ marginBottom: "0.55rem", fontSize: "0.9375rem", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--text)", fontWeight: 600, fontStyle: "italic" }}>{trait.name}.</strong>{" "}
                <span style={{ color: "var(--text2)" }}>{trait.desc}</span>
              </p>
            ))}
          </div>
        )}

        {/* Action Sections */}
        <ActionSection title="Actions" entries={monster.actions} />
        <ActionSection title="Bonus Actions" entries={monster.bonus_actions} />
        <ActionSection title="Reactions" entries={monster.reactions} />
        <ActionSection title="Legendary Actions" entries={monster.legendary_actions} />
        <ActionSection title="Lair Actions" entries={monster.lair_actions} />

        {/* Source badge */}
        <div style={{ marginTop: "1rem", textAlign: "right" }}>
          <span className="pill" title="Where this stat block comes from">
            {monster.source}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * "Minifig" button — generates the transparent full-body standee the 3D
 * board uses (Plan 45). Stored on the stat block, so every token of this
 * monster in every session wears it.
 */
function MonsterFigureButton({ monsterId, hasFigure }: { monsterId: string; hasFigure: boolean }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const gen = useMutation({
    mutationFn: () => monstersApi.generateFigure(monsterId),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["monsters"] });
      qc.invalidateQueries({ queryKey: ["monster", monsterId] });
    },
    onError: (e) => setError((e as Error)?.message ?? "Generation failed"),
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
      <button
        onClick={() => gen.mutate()}
        disabled={gen.isPending}
        className="btn btn-ghost"
        style={{ fontSize: "0.8125rem", padding: "0.25rem 0.55rem", minHeight: 0, whiteSpace: "nowrap" }}
        title={
          hasFigure
            ? "Regenerate the 3D-board standee for this monster (~30s)"
            : "Generate the 3D-board standee for this monster (~30s)"
        }
      >
        <PersonStanding size={14} />
        {gen.isPending ? "Sculpting…" : hasFigure ? "Minifig (made)" : "Minifig"}
      </button>
      {error && (
        <div style={{ fontSize: "0.75rem", color: "var(--danger-text)", maxWidth: 130 }}>
          {error}
        </div>
      )}
    </div>
  );
}

/**
 * Small "Generate" button for monster portraits.
 *
 * Sits under the manual ImageUpload — paste a URL OR generate via AI,
 * the DM's choice. Optional style-hints input expands on click.
 */
function MonsterPortraitButton({ monsterId }: { monsterId: string }) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [hints, setHints] = useState("");
  const [error, setError] = useState<string | null>(null);

  const gen = useMutation({
    mutationFn: () =>
      monstersApi.generatePortrait(monsterId, hints.trim() || undefined),
    onSuccess: () => {
      setExpanded(false);
      setHints("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["monsters"] });
      qc.invalidateQueries({ queryKey: ["monster", monsterId] });
    },
    onError: (e) => setError((e as Error)?.message ?? "Generation failed"),
  });

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="btn btn-ghost"
        style={{ fontSize: "0.8125rem", padding: "0.25rem 0.55rem", minHeight: 0, whiteSpace: "nowrap" }}
        title="Generate a portrait via AI (~$0.04 / image)"
      >
        <Palette size={14} /> Generate
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", width: 130 }}>
      <input
        type="text"
        value={hints}
        onChange={(e) => setHints(e.target.value)}
        placeholder="style hints…"
        disabled={gen.isPending}
        aria-label="Style hints"
        style={{ fontSize: "0.8125rem", padding: "0.2rem 0.4rem", width: "100%" }}
      />
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <button
          onClick={() => gen.mutate()}
          disabled={gen.isPending}
          className="btn btn-secondary"
          style={{ fontSize: "0.8125rem", padding: "0.25rem 0.5rem", minHeight: 0, flex: 1 }}
        >
          {gen.isPending ? "Painting…" : "Go"}
        </button>
        <button
          onClick={() => {
            setExpanded(false);
            setError(null);
          }}
          className="btn btn-ghost"
          style={{ padding: "0.25rem 0.4rem", minHeight: 0 }}
          disabled={gen.isPending}
          aria-label="Cancel"
        >
          <X size={14} />
        </button>
      </div>
      {error && (
        <span style={{ fontSize: "0.75rem", color: "var(--danger-text)" }}>{error}</span>
      )}
    </div>
  );
}
