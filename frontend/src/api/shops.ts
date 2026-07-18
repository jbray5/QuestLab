import { api } from "./client";

// Plan 47 — the player marketplace. DM management endpoints ride the
// authenticated client; storefront/market are capability URLs (no auth,
// but the shared client just sends the header when present — harmless).

export interface ShopRead {
  id: string;
  campaign_id: string;
  name: string;
  keeper?: string | null;
  blurb?: string | null;
  location?: string | null;
  banner_url?: string | null;
  hidden?: boolean;
  item_count: number;
}

export interface StorefrontItem {
  shop_item_id: string;
  item_id: string;
  name: string;
  item_type: string;
  rarity: string;
  description?: string | null;
  attunement_required: boolean;
  is_magic: boolean;
  image_url?: string | null;
  price_gp: number;
  stock?: number | null;
  pitch?: string | null;
  cost_text?: string | null;
}

export interface StorefrontRead {
  id: string;
  campaign_id: string;
  name: string;
  keeper?: string | null;
  blurb?: string | null;
  location?: string | null;
  banner_url?: string | null;
  items: StorefrontItem[];
}

export interface MarketShop {
  id: string;
  name: string;
  keeper?: string | null;
  blurb?: string | null;
  location?: string | null;
  banner_url?: string | null;
  item_count: number;
}

export interface MarketRead {
  campaign_id: string;
  campaign_name: string;
  shops: MarketShop[];
}

export interface ShopItemAdd {
  item_id?: string;
  name?: string;
  item_type?: string;
  rarity?: string;
  description?: string;
  price_gp?: number;
  stock?: number | null;
  pitch?: string;
}

export interface ShopItemUpdate {
  price_gp?: number;
  stock?: number | null;
  pitch?: string | null;
  sort_order?: number;
}

/** Format a gp price the way a keeper would say it ("5 sp", "1,200 gp"). */
export function formatPrice(gp: number): string {
  if (gp === 0) return "—";
  if (gp < 0.1) return `${Math.round(gp * 100)} cp`;
  if (gp < 1) return `${Math.round(gp * 10)} sp`;
  const whole = Math.floor(gp);
  const rest = gp - whole;
  const gold = whole.toLocaleString();
  if (rest >= 0.1) return `${gold} gp ${Math.round(rest * 10)} sp`;
  return `${gold} gp`;
}

export const shopsApi = {
  // DM management
  list: (campaignId: string) => api.get<ShopRead[]>(`/campaigns/${campaignId}/shops`),
  create: (campaignId: string, data: { name: string; keeper?: string; blurb?: string; location?: string; hidden?: boolean }) =>
    api.post<ShopRead>(`/campaigns/${campaignId}/shops`, data),
  update: (shopId: string, data: Partial<Pick<ShopRead, "name" | "keeper" | "blurb" | "location" | "hidden">>) =>
    api.patch<ShopRead>(`/shops/${shopId}`, data),
  remove: (shopId: string) => api.delete<void>(`/shops/${shopId}`),
  stock: (shopId: string, concept: string | undefined, count: number) =>
    api.post<StorefrontRead>(`/shops/${shopId}/stock`, { concept: concept || null, count }),
  generateBanner: (shopId: string) => api.post<ShopRead>(`/shops/${shopId}/banner`, {}),
  addItem: (shopId: string, data: ShopItemAdd) =>
    api.post<StorefrontItem>(`/shops/${shopId}/items`, data),
  updateItem: (shopId: string, shopItemId: string, data: ShopItemUpdate) =>
    api.patch<StorefrontItem>(`/shops/${shopId}/items/${shopItemId}`, data),
  removeItem: (shopId: string, shopItemId: string) =>
    api.delete<void>(`/shops/${shopId}/items/${shopItemId}`),
  generateItemImage: (shopId: string, shopItemId: string) =>
    api.post<{ url: string }>(`/shops/${shopId}/items/${shopItemId}/image`, {}),
  // Player capability reads
  storefront: (shopId: string) => api.get<StorefrontRead>(`/storefront/${shopId}`),
  market: (campaignId: string) => api.get<MarketRead>(`/market/${campaignId}`),
};
