import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The DM's HUD preferences (review 10/30), remembered on this device.
 *
 * - `tableMode`: run the HUD full-width with the app sidebar hidden.
 * - `castShowAll`: Tonight's Cast lists every NPC instead of tonight's.
 * - `uses3d`: this DM has opened the 3D table from the HUD, so the HUD shows
 *   the 3D-only controls (the "Next hit" strike style). Everyone else never
 *   sees them (UX-001).
 */
interface HudPrefs {
  tableMode: boolean;
  castShowAll: boolean;
  uses3d: boolean;
  setTableMode: (on: boolean) => void;
  setCastShowAll: (on: boolean) => void;
  setUses3d: (on: boolean) => void;
}

export const useHudPrefs = create<HudPrefs>()(
  persist(
    (set) => ({
      tableMode: false,
      castShowAll: false,
      uses3d: false,
      setTableMode: (tableMode) => set({ tableMode }),
      setCastShowAll: (castShowAll) => set({ castShowAll }),
      setUses3d: (uses3d) => set({ uses3d }),
    }),
    { name: "ql-hud-prefs" },
  ),
);
