/**
 * Obsidian vault addressing (Plan 93).
 *
 * The DM's lore lives in a local vault; a card's `dm_note` is a vault-relative
 * path ("People/Auntie Sorrel"). Plan 128: the vault and an optional folder are
 * a setting on this device (they used to be hard-coded to Justin's own vault,
 * so every other DM's links opened the wrong place). With no vault set, the
 * link opens the note in whichever vault Obsidian last had open.
 */

const KEY = "ql-obsidian-vault";

export interface ObsidianPlace {
  /** The vault's name as Obsidian shows it, e.g. "DnD". */
  vault: string;
  /** An optional folder inside it that note paths start from, e.g. "Hollowmere". */
  folder: string;
}

/** This device's vault and folder (empty strings when never set). */
export function obsidianPlace(): ObsidianPlace {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<ObsidianPlace>;
      return { vault: String(p.vault ?? "").trim(), folder: String(p.folder ?? "").trim() };
    }
  } catch {
    // Private window or blocked storage: links just use Obsidian's last vault.
  }
  return { vault: "", folder: "" };
}

/** Remember this device's vault and folder. */
export function setObsidianPlace(place: ObsidianPlace): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ vault: place.vault.trim(), folder: place.folder.trim() }));
  } catch {
    // Not saved; the link still works against Obsidian's last vault.
  }
}

/** The `obsidian://` URI for a vault-relative note path. */
export function obsidianHref(dmNote: string): string {
  const { vault, folder } = obsidianPlace();
  const file = folder ? `${folder.replace(/\/+$/, "")}/${dmNote}` : dmNote;
  const inVault = vault ? `vault=${encodeURIComponent(vault)}&` : "";
  return `obsidian://open?${inVault}file=${encodeURIComponent(file)}`;
}
