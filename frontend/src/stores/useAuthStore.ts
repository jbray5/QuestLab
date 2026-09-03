import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface DmProfile {
  email: string;
  display_name: string;
  avatar_url: string | null;
  discord_linked: boolean;
  patreon_linked: boolean;
  patron_active: boolean;
  is_admin: boolean;
  ai_allowed: boolean;
  ai_reason: string | null;
  ai_remaining_today: number | null;
}

interface AuthState {
  dmEmail: string;
  token: string;
  profile: DmProfile | null;
  setDmEmail: (email: string) => void;
  /** Plan 73 — OAuth sign-in: keep the signed token; the API resolves identity from it. */
  setToken: (token: string) => void;
  setProfile: (profile: DmProfile | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      dmEmail: import.meta.env.VITE_DM_EMAIL ?? "",
      token: localStorage.getItem("ql_token") ?? "",
      profile: null,
      setDmEmail: (email) => {
        const cleaned = email.trim();
        localStorage.setItem("dm_email", cleaned);
        set({ dmEmail: cleaned });
      },
      setToken: (token) => {
        localStorage.setItem("ql_token", token);
        set({ token });
      },
      setProfile: (profile) => set({ profile }),
      signOut: () => {
        // Clear only the DM identity. Other persisted state (dice
        // prefs, active campaign cache) survives so re-signing-in on
        // the same device feels seamless.
        localStorage.removeItem("dm_email");
        localStorage.removeItem("ql_token");
        set({ dmEmail: "", token: "", profile: null });
      },
    }),
    { name: "questlab-auth" },
  ),
);
