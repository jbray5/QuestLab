/**
 * Your plan (Plan 130): what the signed-in DM's plan allows, how much they use,
 * and linking a Patreon account. Players never pay.
 */
import { api } from "./client";

export type PlanName = "free" | "patron";
export type PlanWhy = "admin" | "comped" | "patreon";

export interface PlanStatus {
  plan: PlanName;
  why: PlanWhy | null;
  /** False during the beta: the limits are shown, never enforced. */
  pricing_on: boolean;
  campaigns_used: number;
  /** The plan's limit; null means unlimited. */
  campaigns_limit: number | null;
  upload_bytes_used: number;
  upload_bytes_limit: number | null;
  patreon_linked: boolean;
  patron_checked_at: string | null;
  /** The last Patreon check makes them a Patron right now. */
  patreon_counts: boolean;
  patreon_counts_until: string | null;
  /** This server can link a Patreon account (Patreon sign-in is set up). */
  patreon_available: boolean;
  /** QuestLab's Patreon page, when set. */
  support_url: string | null;
  price_monthly: string;
  price_yearly: string;
  free_campaigns: number;
  free_upload_bytes: number;
  patron_upload_bytes: number;
}

export interface PatreonLinkResult {
  message: string;
  status: PlanStatus;
}

export const PLAN_QUERY_KEY = ["my-plan"] as const;

export const planApi = {
  get: () => api.get<PlanStatus>("/me/plan", { quiet: true }),
  /** Patreon's consent page for this DM; send the browser there. */
  startPatreonLink: () => api.post<{ url: string }>("/me/patreon/link", undefined, { quiet: true }),
  /** Attach the Patreon account the callback read (only works for the DM who started it). */
  confirmPatreonLink: (token: string) =>
    api.post<PatreonLinkResult>("/me/patreon/confirm", { token }, { quiet: true }),
};

/** The signed link result the Patreon callback put in the URL fragment (`#patreon=…`), or "". */
export function patreonResultFromHash(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("patreon") ?? "";
}

/** 262144000 → "250 MB", 5368709120 → "5 GB", 1536 → "2 KB". */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb >= 10 || Number.isInteger(gb) ? Math.round(gb) : gb.toFixed(1)} GB`;
  }
  if (mb >= 1) return `${mb >= 10 || Number.isInteger(mb) ? Math.round(mb) : mb.toFixed(1)} MB`;
  if (bytes <= 0) return "0 MB";
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** An ISO time as a day in the DM's own time zone: "Nov 30" (with the year when it isn't this one). */
export function formatPlanDay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
