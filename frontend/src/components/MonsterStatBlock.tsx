import { useState } from "react";
import { Copy, Pencil, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Monster } from "../api/types";
import { monstersApi } from "../api/monsters";
import ImageUpload from "./ImageUpload";
import ModelUpload from "./ModelUpload";
import { heightFtForSize } from "../engine/heights";
import ObsidianLink, { ObsidianNoteInput } from "./dm/ObsidianLink";
import PhoneSheet from "./PhoneSheet";
import { useIsCompact } from "../hooks/useIsCompact";
import { useCanEditCatalog } from "../hooks/useCanEditCatalog";
import HomebrewChip from "./HomebrewChip";
import { isMine, useMyEmail } from "../lib/homebrew";

interface Props {
  monster: Monster;
  onClose: () => void;
  /**
   * Plan 132 — the homebrew buttons. Each shows only when its handler is given
   * (the Monsters page passes them; the session HUD doesn't): "Copy and edit"
   * on any block, "Edit" and "Delete" on one the DM may change.
   */
  onCopy?: () => void;
  onEdit?: () => void;
  /** Called after a delete went through. */
  onDeleted?: () => void;
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

export default function MonsterStatBlock({ monster, onClose, onCopy, onEdit, onDeleted }: Props) {
  // Plan 123: on a phone the stat block is a bottom sheet with the name in its header.
  const phone = useIsCompact(640);
  // SEC-003 — SRD monsters are admin-only to change; homebrew belongs to its DM.
  const canEdit = useCanEditCatalog(monster.is_custom ? monster.created_by_email : null);
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
  // Plan 132 — the DM's own homebrew: a "Yours" chip, and Delete (refused while in use).
  const myEmail = useMyEmail();
  const mine = isMine(monster.created_by_email, myEmail);
  const canDelete = !!onDeleted && monster.is_custom && canEdit;
  const remove = useMutation({
    mutationFn: () => monstersApi.remove(monster.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monsters"] });
      onDeleted?.();
    },
  });

  const scores: Array<{ label: string; value: number }> = [
    { label: "STR", value: monster.score_str },
    { label: "DEX", value: monster.score_dex },
    { label: "CON", value: monster.score_con },
    { label: "INT", value: monster.score_int },
    { label: "WIS", value: monster.score_wis },
    { label: "CHA", value: monster.score_cha },
  ];

  // The art and the 3D figure. On a phone it moves to the end of the
  // sheet so the numbers come first.
  const art = !canEdit ? (
    monster.image_url ? (
      <img
        src={monster.image_url}
        alt={monster.name}
        style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
      />
    ) : null
  ) : (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", alignItems: phone ? "flex-start" : "center" }}>
      <ImageUpload
        currentUrl={monster.image_url}
        onUrlChange={(url) => updateImage.mutate(url)}
        label="Monster Art"
        size={90}
      />
      {/* The 3D figure's preview is a WebGL scene (those crashed phones) and only
          the laptop table uses it, so a phone just says where to set it. */}
      {phone ? (
        <small style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>3D figure: set it on a bigger screen.</small>
      ) : (
        <ModelUpload currentUrl={monster.model_url} onUrlChange={(url) => updateModel.mutate(url)} heightFt={heightFtForSize(monster.size)} />
      )}
    </div>
  );

  // Plan 93: DM-only, the vault path for this monster's page.
  const obsidianNote = (
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
  );

  const typeLine = (
    <p style={{ fontStyle: "italic", color: "var(--muted)", fontSize: "0.9375rem", margin: phone ? 0 : undefined }}>
      {monster.size} {monster.creature_type}
      {monster.alignment ? `, ${monster.alignment}` : ""}
    </p>
  );

  // Plan 132 — first thing under the name, so making it yours is never buried.
  const showEdit = !!onEdit && canEdit;
  const homebrewBar =
    onCopy || showEdit || canDelete ? (
      <div className="ql-tap" style={{ marginTop: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
          {onCopy && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onCopy}
              title="Make a monster of your own from this one; this one stays as it is"
            >
              <Copy size={16} aria-hidden /> Copy and edit
            </button>
          )}
          {showEdit && (
            <button type="button" className="btn btn-secondary" onClick={onEdit}>
              <Pencil size={16} aria-hidden /> Edit
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              className="btn btn-danger"
              style={{ marginLeft: "auto" }}
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm(`Delete "${monster.name}"? This can't be undone.`)) remove.mutate();
              }}
            >
              {remove.isPending ? "Deleting…" : "Delete"}
            </button>
          )}
        </div>
        {remove.isError && (
          <p role="alert" style={{ color: "var(--danger-text)", fontSize: "0.875rem", margin: "0.5rem 0 0" }}>
            {(remove.error as Error)?.message || "That didn't delete. Try again."}
          </p>
        )}
      </div>
    ) : null;

  const body = (
    <>
        {/* Header (on a phone the sheet's own header already names the monster) */}
        {phone ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
            {typeLine}
            {mine && <HomebrewChip />}
            <ObsidianLink dmNote={monster.dm_note} />
          </div>
        ) : (
          <div style={{ paddingRight: "2.5rem", display: "flex", gap: "1rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            {art}
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
                {mine && <HomebrewChip />}
                <ObsidianLink dmNote={monster.dm_note} />
              </div>
              {typeLine}
            </div>
          </div>
        )}

        {homebrewBar}

        <Divider />

        {!phone && canEdit && obsidianNote}

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

        {phone && (
          <>
            <Divider />
            {art}
            {canEdit && <div style={{ marginTop: "0.75rem" }}>{obsidianNote}</div>}
          </>
        )}

        {/* Source badge */}
        <div style={{ marginTop: "1rem", textAlign: "right" }}>
          <span className="pill" title="Where this stat block comes from">
            {monster.source}
          </span>
        </div>
    </>
  );

  if (phone) {
    return (
      <PhoneSheet title={monster.name} label={`${monster.name} stat block`} onClose={onClose}>
        <div
          className="stat-block"
          style={{ maxWidth: "none", border: "none", background: "transparent", padding: 0 }}
        >
          {body}
        </div>
      </PhoneSheet>
    );
  }

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
        {body}
      </div>
    </div>
  );
}
