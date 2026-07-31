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

/**
 * A preset as it appears in a checked-in scenes JSON file. References the
 * map by NAME because map ids differ per database — the importer resolves
 * the name against the campaign's battle-map library at import time.
 * An unresolvable (or null) name imports as a mood-only preset.
 */
export interface ScenePresetImport {
  name: string;
  mapName?: string | null;
  darkness: number;
  weather?: string | null;
  title?: string;
}

/**
 * Merge presets from a JSON file into the saved set (same-name replaces),
 * resolving map names to ids via the caller's library lookup.
 *
 * Returns the merged list plus the names whose map didn't resolve, so the
 * UI can tell the DM which presets imported mood-only.
 */
export function importScenePresets(
  sessionId: string,
  incoming: ScenePresetImport[],
  resolveMapId: (mapName: string) => string | null,
): { presets: ScenePreset[]; unresolved: string[] } {
  const unresolved: string[] = [];
  const mapped: ScenePreset[] = incoming
    .filter((p) => p && typeof p.name === "string" && p.name.trim())
    .map((p) => {
      const mapId = p.mapName ? resolveMapId(p.mapName) : null;
      if (p.mapName && !mapId) unresolved.push(`${p.name} (map "${p.mapName}")`);
      return {
        name: p.name.slice(0, 24),
        mapId,
        darkness: Math.min(1, Math.max(0, Number(p.darkness) || 0)),
        weather: p.weather ?? null,
        title: p.title || undefined,
      };
    });

  const existing = loadScenePresets(sessionId);
  const names = new Set(mapped.map((p) => p.name));
  const presets = [...existing.filter((p) => !names.has(p.name)), ...mapped];
  saveScenePresets(sessionId, presets);
  return { presets, unresolved };
}
