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

/** Read DM identity from localStorage (set on first load from a meta tag or env). */
function getAuthHeader(): Record<string, string> {
  const email = localStorage.getItem("dm_email") || import.meta.env.VITE_DM_EMAIL || "";
  return email ? { "X-MS-CLIENT-PRINCIPAL-NAME": email } : {};
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
  };

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? detail.map((d: { msg?: string }) => d.msg ?? JSON.stringify(d)).join("; ")
          : res.statusText;
    // Plan 29 — dispatch a window event so the global ToastProvider can
    // surface transient API errors that callers don't explicitly handle.
    // 401s are noisy on first load (no DM email yet); skip them.
    if (typeof window !== "undefined" && res.status !== 401) {
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
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
