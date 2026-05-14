import { api } from "./client";
import type { WeaponAttackPreview, WeaponListParams } from "./types";

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
}

export interface LoreRequest {
  adventure_id?: string;
}

export const itemsApi = {
  list: (params?: ItemListParams) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.rarity) qs.set("rarity", params.rarity);
    if (params?.item_type) qs.set("item_type", params.item_type);
    const query = qs.toString();
    return api.get<MagicItem[]>(`/items${query ? `?${query}` : ""}`);
  },
  get: (id: string) => api.get<MagicItem>(`/items/${id}`),
  generateLore: (id: string, body: LoreRequest = {}) =>
    api.post<{ lore: string }>(`/items/${id}/lore`, body),
  updateImage: (id: string, image_url: string) =>
    api.patch<MagicItem>(`/items/${id}`, { image_url }),
  // ── Weapons (Plan 00018) ──────────────────────────────────────────────
  listWeapons: (params?: WeaponListParams) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set("q", params.q);
    if (params?.category) qs.set("category", params.category);
    if (params?.mastery) qs.set("mastery", params.mastery);
    if (params?.property_name) qs.set("property", params.property_name);
    if (params?.is_magic !== undefined) qs.set("is_magic", String(params.is_magic));
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
