import { api } from "./client";

// Plan 55 — the Puzzle Workbench. DM routes are authenticated; the
// /puzzle/* routes are capability URLs (the puzzle UUID is the secret)
// and never carry answers.

export interface PuzzleRead {
  id: string;
  campaign_id: string;
  kind: "glyph" | "cipher";
  title: string;
  config: Record<string, unknown>;
  state: Record<string, unknown>;
  solved: boolean;
  allow_player_input: boolean;
}

/** Player-facing projection — no mapping, no key, no unrevealed plaintext. */
export interface PuzzleProjection {
  id: string;
  kind: "glyph" | "cipher";
  title: string;
  solved: boolean;
  allow_player_input: boolean;
  // glyph
  tokens: string[];
  assignments: Record<string, string>;
  hide_spaces: boolean;
  hum: number;
  // cipher
  phase: "warded" | "stilled" | "solved";
  ciphertext: string;
  locked: Record<string, string>;
  intro: string;
}

export const puzzlesApi = {
  // DM
  list: (campaignId: string) => api.get<PuzzleRead[]>(`/campaigns/${campaignId}/puzzles`),
  create: (
    campaignId: string,
    data: { kind: string; title: string; config: Record<string, unknown>; allow_player_input?: boolean },
  ) => api.post<PuzzleRead>(`/campaigns/${campaignId}/puzzles`, data),
  update: (
    puzzleId: string,
    data: { title?: string; config?: Record<string, unknown>; allow_player_input?: boolean },
  ) => api.patch<PuzzleRead>(`/puzzles/${puzzleId}`, data),
  remove: (puzzleId: string) => api.delete<void>(`/puzzles/${puzzleId}`),
  reset: (puzzleId: string) => api.post<PuzzleRead>(`/puzzles/${puzzleId}/reset`),
  solveGlyphs: (puzzleId: string) => api.post<PuzzleRead>(`/puzzles/${puzzleId}/solve`),
  reveal: (puzzleId: string, scope: "word" | "line" | "all") =>
    api.post<PuzzleRead>(`/puzzles/${puzzleId}/reveal`, { scope }),
  plaintext: (puzzleId: string) => api.get<{ plaintext: string }>(`/puzzles/${puzzleId}/plaintext`),
  dmAssign: (puzzleId: string, glyph: string, letter: string) =>
    api.post<PuzzleProjection>(`/puzzles/${puzzleId}/dm-assign`, { glyph, letter }),

  // Player capability
  projection: (puzzleId: string) => api.get<PuzzleProjection>(`/puzzle/${puzzleId}`),
  assign: (puzzleId: string, glyph: string, letter: string) =>
    api.post<PuzzleProjection>(`/puzzle/${puzzleId}/assign`, { glyph, letter }),
  reading: (puzzleId: string, reading: string) =>
    api.post<{ correct: boolean; hum: number; solved: boolean }>(
      `/puzzle/${puzzleId}/reading`,
      { reading },
    ),
  key: (puzzleId: string, key: string) =>
    api.post<{ correct: boolean; phase: string }>(`/puzzle/${puzzleId}/key`, { key }),
  decode: (puzzleId: string, index: number, letter: string) =>
    api.post<{ correct: boolean; key_letter: string; locked: number }>(
      `/puzzle/${puzzleId}/decode`,
      { index, letter },
    ),
};

/** The eight glyph shapes the script types into Teams, in seed order. */
export const GLYPH_SHAPES: Record<string, string> = {
  g1: "◆",
  g2: "●",
  g3: "▲",
  g4: "✦",
  g5: "⬟",
  g6: "✚",
  g7: "◼",
  g8: "✱",
};
