import { api } from "./client";
import type { Adventure, AdventureCreate } from "./types";

export const adventuresApi = {
  list: (campaignId: string) =>
    api.get<Adventure[]>(`/campaigns/${campaignId}/adventures`),
  create: (campaignId: string, data: AdventureCreate) =>
    api.post<Adventure>(`/campaigns/${campaignId}/adventures`, data),
  get: (id: string) => api.get<Adventure>(`/adventures/${id}`),
  update: (id: string, data: Partial<AdventureCreate>) =>
    api.patch<Adventure>(`/adventures/${id}`, data),
  delete: (id: string) => api.delete(`/adventures/${id}`),
};
