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

import { obsidianHref, OBSIDIAN_FOLDER } from "../../lib/obsidian";

interface Props {
  /** Vault-relative path, e.g. "People/Auntie Sorrel". Empty renders nothing. */
  dmNote?: string | null;
  /** Slightly smaller variant for dense card headers. */
  compact?: boolean;
}

export default function ObsidianLink({ dmNote, compact = false }: Props) {
  const path = (dmNote ?? "").trim();
  if (!path) return null;
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
        width: compact ? 20 : 24,
        height: compact ? 20 : 24,
        flexShrink: 0,
        borderRadius: 5,
        border: "1px solid var(--border)",
        background: "rgba(124,77,255,0.12)",
        fontSize: compact ? "0.7rem" : "0.8rem",
        lineHeight: 1,
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      🔮
    </a>
  );
}

/** The matching editor: a labelled path input for the DM's own forms. */
export function ObsidianNoteInput({
  value,
  onChange,
}: {
  value?: string | null;
  onChange: (next: string | null) => void;
}) {
  return (
    <>
      <input
        type="text"
        value={value ?? ""}
        placeholder="People/Auntie Sorrel"
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
        style={{ width: "100%" }}
      />
      <small style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>
        Vault-relative path inside {OBSIDIAN_FOLDER}. DM-only — never shown on the board or a player's
        phone.
      </small>
    </>
  );
}
