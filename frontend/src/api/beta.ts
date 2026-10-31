/** The friends beta (Plan 125): invites, feedback, and the admin view of who joined. */
import { api } from "./client";

export type FeedbackKind = "loved" | "confusing" | "broken" | "idea";

export interface FeedbackCreate {
  kind: FeedbackKind;
  text: string;
  /** Where it was sent from, e.g. "/sessions/…/hud". */
  page: string;
  /** e.g. "390×844". */
  viewport: string;
}

export interface FeedbackRow extends FeedbackCreate {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
  seen: boolean;
}

export interface InviteRow {
  id: string;
  code: string;
  label: string;
  max_uses: number;
  uses: number;
  revoked: boolean;
  created_at: string;
  joined: { email: string; display_name: string }[];
}

export interface BetaDm {
  email: string;
  display_name: string;
  invite_code: string | null;
  created_at: string;
  last_seen_at: string;
  campaigns: number;
  sessions: number;
  /** Plan 130 — their plan, and whether an admin gave them Patron. */
  plan: "free" | "patron";
  comped: boolean;
}

/** Someone who left an email on the landing page (Plan 54). */
export interface WaitlistEntry {
  email: string;
  source: string | null;
  created_at: string;
}

export interface BetaOverview {
  invites_required: boolean;
  dms: BetaDm[];
}

export const betaApi = {
  sendFeedback: (body: FeedbackCreate) => api.post<{ id: string }>("/feedback", body, { quiet: true }),
  /** Public: is this invite real, and who is it for? (Greets the friend by name.) */
  checkInvite: (code: string) =>
    api.get<{ valid: boolean; label: string | null }>(`/auth/invites/${encodeURIComponent(code)}`, { quiet: true }),
  // Admin
  invites: () => api.get<InviteRow[]>("/admin/invites"),
  createInvite: (label: string, maxUses: number) =>
    api.post<InviteRow>("/admin/invites", { label, max_uses: maxUses }),
  revokeInvite: (id: string) => api.post<InviteRow>(`/admin/invites/${id}/revoke`),
  overview: () => api.get<BetaOverview>("/admin/beta"),
  feedback: () => api.get<FeedbackRow[]>("/admin/feedback"),
  markSeen: (id: string) => api.post<FeedbackRow>(`/admin/feedback/${id}/seen`),
  waitlist: () => api.get<{ count: number; entries: WaitlistEntry[] }>("/admin/waitlist"),
  /** Plan 130 — give a DM Patron, or take it back. */
  setComp: (email: string, comped: boolean) =>
    api.post<{ email: string; comped: boolean; plan: "free" | "patron" }>(
      `/admin/users/${encodeURIComponent(email)}/comp`,
      { comped },
    ),
};
