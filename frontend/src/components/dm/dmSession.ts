/**
 * dmSession — which session the DM notes dock should follow (Plan 75).
 *
 * The dock lives on every DM page, but notes belong to one session. Any
 * /sessions/:id/* page (HUD, runner, 3D board) stamps its id here, so the dock
 * still shows tonight's notes when the DM wanders off to the NPC list or the
 * compendium mid-game.
 */

const KEY = "ql-dock-session";

export function rememberDockSession(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* the dock just won't follow across pages */
  }
}

export function readDockSession(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function sessionIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/sessions\/([0-9a-fA-F-]{36})(?:\/|$)/);
  return m ? m[1] : null;
}
