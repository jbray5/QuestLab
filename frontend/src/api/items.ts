import { api } from "./client";
import type { WeaponAttackPreview, WeaponListParams } from "./types";
import type { Ruleset } from "../lib/ruleset";

export interface MagicItem {
  id: string;
  name: string;
  rarity: string;
  item_type: string;
  description: string | null;
  attunement_required: boolean;
  value_gp: number;
  is_magic: boolean;
  image_url: string | null;
  properties: Record<string, unknown> | null;
  /** SEC-003 — the DM who made this homebrew item; null for the shared catalog. */
  created_by_email?: string | null;
  // Weapon fields (Plan 00018, null for non-weapons)
  weapon_category: string | null;
  damage_die: string | null;
  damage_type: string | null;
  weapon_properties: string[] | null;
  versatile_damage: string | null;
  weapon_range: string | null;
  mastery: string | null;
}

export interface ItemListParams {
  q?: string;
  rarity?: string;
  item_type?: string;
  /** Plan 132: "magic" (the server's default), "mundane" (weapons, armor, gear) or "all". */
  kind?: "magic" | "mundane" | "all";
}

/** Plan 132: what the homebrew item form sends (POST creates; PATCH takes the same fields). */
export interface ItemWrite {
  name: string;
  rarity: string;
  item_type: string;
  description: string | null;
  attunement_required: boolean;
  value_gp: number;
  is_magic: boolean;
  /** Free-form extras; a magic weapon's +1/+2/+3 lives here as `bonus: "+1"`. */
  properties: Record<string, unknown> | null;
  weapon_category: string | null;
  damage_die: string | null;
  damage_type: string | null;
  weapon_properties: string[] | null;
  versatile_damage: string | null;
  weapon_range: string | null;
  mastery: string | null;
}

export const itemsApi = {
  list: (params?: ItemListParams) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.rarity) qs.set("rarity", params.rarity);
    if (params?.item_type) qs.set("item_type", params.item_type);
    if (params?.kind) qs.set("kind", params.kind);
    const query = qs.toString();
    return api.get<MagicItem[]>(`/items${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<MagicItem>(`/items/${id}`),
  updateImage: (id: string, image_url: string) =>
    api.patch<MagicItem>(`/items/${id}`, { image_url }),
  // ── Homebrew (Plan 132): the server stamps the author; only they (or an admin) edit ──
  create: (body: ItemWrite) => api.post<MagicItem>("/items", body, { quiet: true }),
  update: (id: string, body: Partial<ItemWrite>) =>
    api.patch<MagicItem>(`/items/${id}`, body, { quiet: true }),
  /** Refused (409) with a plain sentence while a character, shop or loot table holds it. */
  remove: (id: string) => api.delete(`/items/${id}`, { quiet: true }),
  // ── Weapons (Plan 00018) ──────────────────────────────────────────────
  /** Plan 135: `ruleset` is the page's 2024/2014 switch; without it the list is as it always was. */
  listWeapons: (params?: WeaponListParams & { ruleset?: Ruleset }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category) qs.set("category", params.category);
    if (params?.mastery) qs.set("mastery", params.mastery);
    if (params?.property_name) qs.set("property", params.property_name);
    if (params?.is_magic !== undefined) qs.set("is_magic", String(params.is_magic));
    if (params?.ruleset) qs.set("ruleset", params.ruleset);
    const query = qs.toString();
    return api.get<MagicItem[]>(`/weapons${query ? `?${query}` : ""}`);
  },
  attackPreview: (
    itemId: string,
    characterId: string,
    options?: { proficient?: boolean; two_handed?: boolean },
  ) => {
    const qs = new URLSearchParams({ character_id: characterId });
    if (options?.proficient !== undefined) qs.set("proficient", String(options.proficient));
    if (options?.two_handed !== undefined) qs.set("two_handed", String(options.two_handed));
    return api.post<WeaponAttackPreview>(`/items/${itemId}/attack-preview?${qs}`);
  },
};
