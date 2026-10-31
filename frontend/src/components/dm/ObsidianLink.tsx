/**
 * Obsidian vault link — DM-only (Plan 93).
 *
 * The DM keeps lore, NPC voices and secrets in a local Obsidian vault. A card
 * holding a `dm_note` path ("People/Auntie Sorrel") gets one click through to
 * that page instead of an alt-tab and a search.
 *
 * SPOILER RULE: the path text names the secret. Render this ONLY on DM-private
 * surfaces — the session HUD, Tonight's Cast, and the DM's own library pages.
 * Never on the board, the table projection, a player sheet, or an explorable.
 * The field is not carried in any player-facing payload either, so a leak takes
 * two mistakes rather than one.
 */

import { useState } from "react";
import { Gem } from "lucide-react";

import { useIsCompact } from "../../hooks/useIsCompact";
import { obsidianHref, obsidianPlace, setObsidianPlace } from "../../lib/obsidian";

interface Props {
  /** Vault-relative path, e.g. "People/Auntie Sorrel". Empty renders nothing. */
  dmNote?: string | null;
  /** Slightly smaller variant for dense card headers. */
  compact?: boolean;
}

export default function ObsidianLink({ dmNote, compact = false }: Props) {
  // Plan 123 — thumb-sized on a phone.
  const phone = useIsCompact(640);
  const path = (dmNote ?? "").trim();
  if (!path) return null;
  const box = phone ? 44 : compact ? 22 : 26;
  return (
    <a
      href={obsidianHref(path)}
      title={`Open "${path}" in Obsidian`}
      aria-label={`Open ${path} in Obsidian`}
      onClick={(e) => e.stopPropagation()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        flexShrink: 0,
        borderRadius: 6,
        border: "1px solid var(--border2)",
        background: "var(--surface3)",
        color: "var(--text2)",
        lineHeight: 1,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <Gem size={compact ? 12 : 14} aria-hidden />
    </a>
  );
}

/**
 * The matching editor: a path input for the DM's own forms.
 *
 * Plan 128 — most DMs don't keep an Obsidian vault, and the field named
 * Justin's own campaign folder to every beta DM (Marco). With nothing linked it
 * is now a small "Link an Obsidian note" button; the box appears once tapped,
 * or straight away when a note is already linked. The vault and folder are a
 * per-device setting shown under the box (lib/obsidian.ts).
 */
export function ObsidianNoteInput({
  value,
  onChange,
  id,
}: {
  value?: string | null;
  onChange: (next: string | null) => void;
  /** For a caller's <label htmlFor>. */
  id?: string;
}) {
  const phone = useIsCompact(640);
  const [opened, setOpened] = useState(false);
  const [place, setPlace] = useState(obsidianPlace);
  const [editingPlace, setEditingPlace] = useState(false);
  const linked = !!(value ?? "").trim();
  const updatePlace = (next: typeof place) => {
    setPlace(next);
    setObsidianPlace(next);
  };
  if (!linked && !opened) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => setOpened(true)}
        style={{
          minHeight: phone ? 44 : 28,
          padding: "0.15rem 0.6rem",
          fontSize: "0.8125rem",
          gap: "0.35rem",
          color: "var(--muted)",
          border: "1px dashed var(--border2)",
          justifyContent: "flex-start",
        }}
      >
        <Gem size={13} aria-hidden /> Link an Obsidian note
      </button>
    );
  }
  return (
    <>
      <input
        id={id}
        type="text"
        value={value ?? ""}
        autoFocus={opened && !linked}
        aria-label="Obsidian note path"
        placeholder="e.g. People/Auntie Sorrel"
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
        style={{ width: "100%" }}
      />
      <small style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
        The page&rsquo;s path in your Obsidian vault. Only you see it, never the board or a player&rsquo;s phone.
      </small>
      {editingPlace || !place.vault ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.35rem" }}>
          <input
            type="text"
            value={place.vault}
            aria-label="Obsidian vault name"
            placeholder="Vault name (on this device)"
            onChange={(e) => updatePlace({ ...place, vault: e.target.value })}
            style={{ flex: "1 1 140px", minWidth: 0 }}
          />
          <input
            type="text"
            value={place.folder}
            aria-label="Folder inside the vault (optional)"
            placeholder="Folder (optional)"
            onChange={(e) => updatePlace({ ...place, folder: e.target.value })}
            style={{ flex: "1 1 140px", minWidth: 0 }}
          />
        </div>
      ) : (
        <small style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
          Opens in vault <span className="story">{place.vault}</span>
          {place.folder ? <>, folder <span className="story">{place.folder}</span></> : null}.{" "}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setEditingPlace(true)}
            style={{ minHeight: phone ? 44 : 24, padding: "0 0.35rem", fontSize: "0.75rem" }}
          >
            Change
          </button>
        </small>
      )}
    </>
  );
}
