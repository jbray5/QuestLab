/**
 * Keeping old tabs fresh (Plan 128).
 *
 * Every deploy renames the page files (`/assets/Campaigns-<hash>.js`). A tab
 * opened before the deploy — Safari restores them for weeks, and players keep
 * their sheet open between sessions — still asks for the old names the first
 * time it opens a page, the file is gone, and the screen went blank until a
 * manual refresh. So:
 *
 * - a page file that fails to load reloads the tab once (`installStaleChunkReload`,
 *   and ErrorBoundary for the same error);
 * - `checkForUpdate` notices a new deploy when the tab comes back into view, so
 *   UpdateWatcher can offer a reload and do it on the next navigation.
 *
 * Production only: the dev server has no hashed files.
 */

const RELOADED_AT = "ql-reloaded-for-update";

/** True for the error a browser throws when a page's code file can't be loaded. */
export function isStaleChunkError(err: unknown): boolean {
  const msg = String((err as { message?: unknown } | null)?.message ?? err ?? "");
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/i.test(
    msg,
  );
}

let scheduled = false;

/**
 * Reload the tab to pick up the new deploy, at most once every 30 s so a file
 * that is really missing can't loop. Returns whether a reload is on its way.
 *
 * The reload waits a moment: a page file cut off because the tab is already
 * leaving fails the same way, and then the timer never runs, so it neither
 * fights the navigation nor uses up the one reload.
 */
export function reloadForUpdate(): boolean {
  if (scheduled) return true;
  try {
    const last = Number(window.sessionStorage.getItem(RELOADED_AT) || 0);
    if (Date.now() - last < 30_000) return false;
  } catch {
    // No storage means no loop guard, so don't risk a reload loop.
    return false;
  }
  scheduled = true;
  window.setTimeout(() => {
    try {
      window.sessionStorage.setItem(RELOADED_AT, String(Date.now()));
    } catch {
      scheduled = false;
      return;
    }
    window.location.reload();
  }, 80);
  return true;
}

/** True once a reload for a new version is on its way (ErrorBoundary shows a quiet note). */
export function isReloadScheduled(): boolean {
  return scheduled;
}

/** Vite fires `vite:preloadError` when a lazy page's file fails; reload instead of throwing. */
export function installStaleChunkReload(): void {
  if (!import.meta.env.PROD) return;
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForUpdate()) event.preventDefault();
  });
}

const ENTRY = /\/assets\/index-[\w-]+\.js/;

/** The entry file this tab is running, e.g. "/assets/index-DdUA8HpE.js". */
function runningEntry(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
  return el ? (new URL(el.src, window.location.href).pathname.match(ENTRY)?.[0] ?? null) : null;
}

/** Ask the server for its current index page: true when a newer deploy is live. */
export async function checkForUpdate(): Promise<boolean> {
  if (!import.meta.env.PROD) return false;
  const mine = runningEntry();
  if (!mine) return false;
  try {
    const res = await fetch("/", { cache: "no-store", headers: { Accept: "text/html" } });
    if (!res.ok) return false;
    const live = (await res.text()).match(ENTRY)?.[0];
    return !!live && live !== mine;
  } catch {
    return false; // Offline: try again next time.
  }
}
