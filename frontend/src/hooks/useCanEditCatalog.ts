import { useAuthStore } from "../stores/useAuthStore";

/**
 * useCanEditCatalog — may this DM change a catalog row (SEC-003)?
 *
 * Shared rules rows (SRD monsters, items, spells) have no owner and only an
 * admin may change them; a homebrew row belongs to the DM who made it. The
 * server enforces this; the UI uses it to hide controls that would only fail.
 *
 * @param owner The row's author (`created_by_email`), or null for a shared row.
 */
export function useCanEditCatalog(owner: string | null | undefined): boolean {
  const profile = useAuthStore((s) => s.profile);
  if (profile?.is_admin) return true;
  const me = profile?.email?.trim().toLowerCase();
  return !!owner && !!me && owner.trim().toLowerCase() === me;
}
