import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  dmEmail: string;
  setDmEmail: (email: string) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      dmEmail: import.meta.env.VITE_DM_EMAIL ?? "",
      setDmEmail: (email) => {
        localStorage.setItem("dm_email", email);
        set({ dmEmail: email });
      },
    }),
    { name: "questlab-auth" },
  ),
);
