import { useSyncExternalStore } from "react";

/**
 * useIsCompact — true when the viewport is at or below `breakpoint` px (Plan 44).
 *
 * Drives responsive reflows for an inline-styled, desktop-first app: components
 * switch fixed multi-column grids to stacked single-column layouts when this is
 * true. Uses matchMedia via useSyncExternalStore, so there is no setState-in-effect
 * (no re-render storms, no lint violations) and it is SSR-safe.
 *
 * Breakpoints in use: 900 (nav / general chrome), 820 (the HUD three-panel body).
 */
export function useIsCompact(breakpoint = 820): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
