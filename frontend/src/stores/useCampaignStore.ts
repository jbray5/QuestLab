import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Adventure, Campaign } from "../api/types";

interface CampaignState {
  activeCampaign: Campaign | null;
  activeAdventure: Adventure | null;
  setActiveCampaign: (c: Campaign | null) => void;
  setActiveAdventure: (a: Adventure | null) => void;
}

export const useCampaignStore = create<CampaignState>()(
  persist(
    (set) => ({
      activeCampaign: null,
      activeAdventure: null,
      setActiveCampaign: (c) => set({ activeCampaign: c, activeAdventure: null }),
      setActiveAdventure: (a) => set({ activeAdventure: a }),
    }),
    { name: "questlab-campaign" },
  ),
);
