import { friendlyApiError } from "./errors";

// Base URL for the QuestLab API.
//   - Local dev: "/api" — Vite proxies to localhost:8000 (see vite.config.ts)
//   - Production: set VITE_API_BASE_URL to the deployed backend origin, e.g.
//     "https://questlab-api.onrender.com/api"
//   - Vercel PREVIEW deployments don't inherit Production-scoped env vars,
//     so on *.vercel.app hosts we fall back to the deployed API directly —
//     branch previews just work with zero dashboard config.
export function apiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL;
  if (env) return env;
  if (typeof window !== "undefined" && window.location.hostname.endsWith(".vercel.app")) {
    return "https://questlab-api-9yhe.onrender.com/api";
  }
  return "/api";
}

const BASE = apiBase();

/** Per-call options. `quiet`: the caller shows the error inline, so no toast too. */
export interface RequestOptions {
  quiet?: boolean;
}

/**
 * The identity headers for a DM request: the signed session token when there
 * is one (Plan 73), else the personal-mode email header. Every fetch that
 * talks to a DM route uses this — uploads included (Plan 120) — so nothing
 * breaks when a deployment stops trusting the email header.
 */
export function authHeaders(): Record<string, string> {
  // Plan 73 — a signed session token (OAuth sign-in) is the real identity.
  // The email header remains for personal/header-mode deployments only.
  const token = localStorage.getItem("ql_token") || "";
  if (token) return { Authorization: `Bearer ${token}` };
  const email = localStorage.getItem("dm_email") || import.meta.env.VITE_DM_EMAIL || "";
  return email ? { "X-MS-CLIENT-PRINCIPAL-NAME": email } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...authHeaders(),
  };

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = body?.detail;
    // Review 10/30 — never raw Pydantic text on screen.
    const message = friendlyApiError(detail, res.statusText);
    // Plan 29 — dispatch a window event so the global ToastProvider can
    // surface transient API errors that callers don't explicitly handle.
    // 401s are noisy on first load (no DM email yet); skip them.
    // Plan 73 — the AI paywall / quota answers with a structured detail;
    // surface it as a dedicated event so one modal serves every AI button.
    if (typeof window !== "undefined" && (res.status === 402 || res.status === 429) && detail && typeof detail === "object" && "code" in detail) {
      if (detail.code === "rate_limited") {
        // Plan 77 — per-IP throttle, not the paywall.
        throw new Error("Slow down a moment — too many requests. Try again in a few seconds.");
      }
      window.dispatchEvent(new CustomEvent("ql:paywall", { detail }));
      throw new Error(
        detail.code === "daily_limit"
          ? "Today's AI allowance is spent."
          : detail.code === "tier_required"
            ? "This needs a higher Patreon tier."
            : "AI features are for QuestLab patrons.",
      );
    }
    if (typeof window !== "undefined" && res.status === 401) {
      // Expired session, or (Plan 120) a browser still holding a bare email
      // after the deployment switched to accounts: clear it and let the
      // layout send them to sign in.
      localStorage.removeItem("ql_token");
      localStorage.removeItem("dm_email");
      window.dispatchEvent(new CustomEvent("ql:signed-out"));
    }
    if (typeof window !== "undefined" && res.status !== 401 && !opts.quiet) {
      window.dispatchEvent(
        new CustomEvent("ql:api-error", { detail: { message } }),
      );
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, body, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>("PUT", path, body, opts),
  patch: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, body, opts),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
