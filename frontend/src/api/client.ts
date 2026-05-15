// Base URL for the QuestLab API.
//   - Local dev: "/api" — Vite proxies to localhost:8000 (see vite.config.ts)
//   - Production: set VITE_API_BASE_URL to the deployed backend origin, e.g.
//     "https://questlab-api.onrender.com/api"
const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

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
  delete: (path: string) => request<void>("DELETE", path),
};
