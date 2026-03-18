import { api } from "./client";

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
};
