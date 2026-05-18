import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * New-DM tour state (Plan 00036).
 *
 * - ``isOpen`` + ``stepIndex`` are ephemeral; reset on every page reload.
 * - ``completed`` persists in localStorage so the auto-launch only
 *   triggers once per device. The sidebar 🧭 button bypasses it.
 */
interface TourState {
  isOpen: boolean;
  stepIndex: number;
  completed: boolean;

  /** Open the tour at step 0. Ignores ``completed``. */
  start: () => void;
  next: () => void;
  prev: () => void;
  /** Close + mark completed. */
  close: () => void;
  /** Resets ``completed`` — for QA / "show me again" affordances. */
  reset: () => void;
}

export const useTourStore = create<TourState>()(
  persist(
    (set) => ({
      isOpen: false,
      stepIndex: 0,
      completed: false,

      start: () => set({ isOpen: true, stepIndex: 0 }),
      next: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
      prev: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
      close: () => set({ isOpen: false, completed: true }),
      reset: () => set({ completed: false }),
    }),
    {
      name: "questlab-tour",
      // Only persist the "completed" flag — never the open/step state.
      partialize: (s) => ({ completed: s.completed }),
    },
  ),
);
