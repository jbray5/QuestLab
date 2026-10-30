import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The DM's HUD preferences (review 10/30), remembered on this device.
 *
 * - `tableMode`: run the HUD full-width with the app sidebar hidden.
 * - `castShowAll`: Tonight's Cast lists every NPC instead of tonight's.
 */
interface HudPrefs {
  tableMode: boolean;
  castShowAll: boolean;
  setTableMode: (on: boolean) => void;
  setCastShowAll: (on: boolean) => void;
}

export const useHudPrefs = create<HudPrefs>()(
  persist(
    (set) => ({
      tableMode: false,
      castShowAll: false,
      setTableMode: (tableMode) => set({ tableMode }),
      setCastShowAll: (castShowAll) => set({ castShowAll }),
    }),
    { name: "ql-hud-prefs" },
  ),
);
