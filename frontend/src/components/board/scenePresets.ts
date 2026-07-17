/**
 * Scene presets (Plan 46) — one-click DM scene changes: map + darkness +
 * weather + title card in a single tap, so a session flows like cinema
 * ("Morning Green" → "The Road" → "Camp, night, torch").
 *
 * Stored per-session in localStorage (DM-local prep, no schema).
 */

export interface ScenePreset {
  name: string;
  mapId: string | null;
  darkness: number;
  weather: string | null;
  title?: string;
}

function key(sessionId: string): string {
  return `ql-scenes-${sessionId}`;
}

export function loadScenePresets(sessionId: string): ScenePreset[] {
  try {
    const raw = localStorage.getItem(key(sessionId));
    const parsed = raw ? (JSON.parse(raw) as ScenePreset[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScenePresets(sessionId: string, presets: ScenePreset[]): void {
  try {
    localStorage.setItem(key(sessionId), JSON.stringify(presets));
  } catch {
    // storage full/blocked — presets just don't persist
  }
}
