import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  dmEmail: string;
  setDmEmail: (email: string) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      dmEmail: import.meta.env.VITE_DM_EMAIL ?? "",
      setDmEmail: (email) => {
        const cleaned = email.trim();
        localStorage.setItem("dm_email", cleaned);
        set({ dmEmail: cleaned });
      },
      signOut: () => {
        // Clear only the DM identity. Other persisted state (dice
        // prefs, active campaign cache) survives so re-signing-in on
        // the same device feels seamless.
        localStorage.removeItem("dm_email");
        set({ dmEmail: "" });
      },
    }),
    { name: "questlab-auth" },
  ),
);
