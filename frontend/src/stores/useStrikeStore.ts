import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * The DM's standing choice of what the next hit is (Plan 113): a weapon blow,
 * fire, cold … It rides every HP patch as `hit_flavor` so the immersive table
 * can colour the strike. Sticky until changed; a spell cast from a PC's panel
 * sets it to that spell's damage type.
 */
interface StrikeState {
  flavor: string;
  setFlavor: (flavor: string) => void;
}

// Remembered across reloads (review 10/30): the picker keeps the last one used.
export const useStrikeStore = create<StrikeState>()(
  persist(
    (set) => ({
      flavor: "weapon",
      setFlavor: (flavor) => set({ flavor }),
    }),
    { name: "ql-strike-flavor" },
  ),
);
