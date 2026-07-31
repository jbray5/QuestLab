import { api, apiBase } from "./client";

// Plan 57 — the Session Notebook. DM-only; every route 403s until the
// server sets NOTEBOOK_ENABLED=true (ship dark).
//
// The constitution, client-side:
//   Law 1 — nothing in this module (or any notebook component) writes AI
//   text into blocks. `riff` returns suggestions; the ONLY thing done
//   with them is creating `ai` margin pins.
//   Law 3 — the notebook API is the notebook's only write surface.

export type BlockType =
  | "text"
  | "verbatim"
  | "prompt"
  | "key"
  | "card"
  | "sketch"
  | "image"
  | "divider";

export interface Block {
  id: string;
  type: BlockType;
  /** Shape depends on type:
   * text/verbatim/prompt/key → { text }
   * card → { title, beats: string[] }
   * sketch → { paths: {d, color, w}[], height }
   * image → { url, caption? }
   * divider → {} */
  content: Record<string, unknown>;
}

export type PinKind = "entity" | "image" | "note" | "ai";

export interface Pin {
  id: string;
  block_id: string;
  kind: PinKind;
  // entity
  entity_kind?: "pc" | "npc" | "item" | "map" | "preset";
  ref_id?: string;
  name?: string;
  thumb?: string | null;
  // image
  url?: string;
  // note / ai
  text?: string;
  // ai provenance (Law 1: display-only; no insert path exists)
  model?: string;
  at?: string;
  prompt?: string;
}

export interface Notebook {
  id: string;
  campaign_id: string;
  title: string;
  sort_order: number;
}

export interface PageSummary {
  id: string;
  notebook_id: string;
  title: string;
  sort_order: number;
  is_runbook: boolean;
}

export interface Page {
  id: string;
  notebook_id: string;
  title: string;
  sort_order: number;
  blocks: Block[];
  pins: Pin[];
  is_runbook: boolean;
  updated_at: string;
}

export interface SearchHit {
  page_id: string;
  notebook_id: string;
  notebook_title: string;
  page_title: string;
  snippet: string;
}

export interface RiffResponse {
  suggestions: string[];
  model: string;
  at: string;
  prompt: string;
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export const notebooksApi = {
  list: (campaignId: string) => api.get<Notebook[]>(`/campaigns/${campaignId}/notebooks`),
  create: (campaignId: string, title: string) =>
    api.post<Notebook>(`/campaigns/${campaignId}/notebooks`, { title }),
  rename: (notebookId: string, title: string) =>
    api.patch<Notebook>(`/notebooks/${notebookId}`, { title }),
  remove: (notebookId: string) => api.delete<void>(`/notebooks/${notebookId}`),

  pages: (notebookId: string) => api.get<PageSummary[]>(`/notebooks/${notebookId}/pages`),
  createPage: (notebookId: string, title: string) =>
    api.post<Page>(`/notebooks/${notebookId}/pages`, { title }),
  page: (pageId: string) => api.get<Page>(`/notebook-pages/${pageId}`),
  savePage: (
    pageId: string,
    data: {
      title?: string;
      blocks?: Block[];
      pins?: Pin[];
      is_runbook?: boolean;
      sort_order?: number;
    },
  ) => api.patch<Page>(`/notebook-pages/${pageId}`, data),
  removePage: (pageId: string) => api.delete<void>(`/notebook-pages/${pageId}`),

  search: (campaignId: string, q: string) =>
    api.get<SearchHit[]>(`/campaigns/${campaignId}/notebook-search?q=${encodeURIComponent(q)}`),
  runbooks: (campaignId: string) =>
    api.get<PageSummary[]>(`/campaigns/${campaignId}/notebook-runbooks`),

  riff: (pageId: string, data: { selection?: string; question?: string; block_id?: string }) =>
    api.post<RiffResponse>(`/notebook-pages/${pageId}/riff`, data),
};

/** Upload a pasted image via the existing uploads route; returns its URL. */
export async function uploadImage(file: File | Blob, name = "pasted.png"): Promise<string> {
  const form = new FormData();
  form.append("file", new File([file], name, { type: file.type || "image/png" }));
  const email = localStorage.getItem("dm_email") || import.meta.env.VITE_DM_EMAIL || "";
  const res = await fetch(`${apiBase()}/uploads`, {
    method: "POST",
    headers: email ? { "X-MS-CLIENT-PRINCIPAL-NAME": email } : {},
    body: form,
  });
  if (!res.ok) throw new Error("Upload failed.");
  const body = (await res.json()) as { url: string };
  // The API serves /uploads/* itself — make the URL absolute for <img>.
  return body.url.startsWith("http")
    ? body.url
    : `${apiBase().replace(/\/api$/, "")}${body.url}`;
}
