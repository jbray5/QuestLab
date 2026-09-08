/**
 * Obsidian vault addressing (Plan 93).
 *
 * The DM's lore lives in a local vault; a card's `dm_note` is a vault-relative
 * path ("People/Auntie Sorrel"). Change the two constants here to point the
 * whole app at a different vault or campaign folder.
 */

export const OBSIDIAN_VAULT = "DnD";
export const OBSIDIAN_FOLDER = "Hollowmere";

/** The `obsidian://` URI for a vault-relative note path. */
export function obsidianHref(dmNote: string): string {
  return (
    `obsidian://open?vault=${OBSIDIAN_VAULT}` +
    `&file=${encodeURIComponent(`${OBSIDIAN_FOLDER}/`)}${encodeURIComponent(dmNote)}`
  );
}
