import { api, apiBase, authHeaders } from "./client";
import type { Monster } from "./types";

export const adminApi = {
  listMonsters: () => api.get<Monster[]>("/admin/monsters"),
  seedMonsters: () => api.post<{ inserted: number }>("/admin/monsters/seed"),
  reseedMonsters: () =>
    api.post<{ deleted: number; inserted: number }>("/admin/monsters/reseed"),
  exportCampaigns: async () => {
    const res = await fetch(`${apiBase()}/admin/export/campaigns`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "campaigns_export.json";
    a.click();
    URL.revokeObjectURL(url);
  },
};
