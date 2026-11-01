// Plan 132 — DM homebrew: catalog rows (monsters, items, spells) a DM made. The shared SRD
// rows have no owner (`created_by_email` null); a homebrew row carries its DM's email, and only
// that DM (or an admin) sees and changes it (SEC-003).

import { useAuthStore } from "../stores/useAuthStore";

/** True when the signed-in DM made this catalog row. */
export function isMine(createdBy: string | null | undefined, email: string | null | undefined): boolean {
  return !!createdBy && !!email && createdBy.trim().toLowerCase() === email.trim().toLowerCase();
}

/** The signed-in DM's email, for `isMine`. */
export function useMyEmail(): string {
  return useAuthStore((s) => s.profile?.email || s.dmEmail || "");
}

/** Dice like "1d8", "2d6+3", "1d4 - 1" (spaces allowed); what the server's dice fields accept. */
export const DICE_RE = /^\s*\d{1,2}d(4|6|8|10|12|20|100)\s*([+-]\s*\d{1,3})?\s*$/i;
