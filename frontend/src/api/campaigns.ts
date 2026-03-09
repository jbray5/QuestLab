import { api } from "./client";
import type { Campaign, CampaignCreate } from "./types";

export const campaignsApi = {
  list: () => api.get<Campaign[]>("/campaigns"),
  create: (data: CampaignCreate) => api.post<Campaign>("/campaigns", data),
  get: (id: string) => api.get<Campaign>(`/campaigns/${id}`),
  update: (id: string, data: Partial<CampaignCreate>) =>
    api.patch<Campaign>(`/campaigns/${id}`, data),
  delete: (id: string) => api.delete(`/campaigns/${id}`),
};
