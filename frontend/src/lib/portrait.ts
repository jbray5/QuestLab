// Portrait cache-busting (Plan 39 fix).
//
// Portrait images are stored at deterministic blob paths — e.g.
// portraits/pc-<uuid>.png. When a portrait is re-generated the bytes at
// that path change but the URL does NOT, so browsers happily serve the
// stale cached image. (Observed: desktop shows the old portrait while a
// freshly-loaded phone shows the new one.)
//
// Fix: append a `?v=` query param derived from the entity's updated_at
// timestamp. The URL then changes whenever the entity is mutated — which
// includes a portrait re-generation, since that bumps updated_at — so the
// browser treats it as a new resource and refetches.

/**
 * Append a cache-busting version param to a portrait/image URL.
 *
 * @param url       The stored image URL (may be null/undefined).
 * @param version   A value that changes when the image changes — pass the
 *                   entity's `updated_at`. Falls back to a per-call
 *                   timestamp if omitted (always-fresh, but defeats
 *                   caching entirely — prefer passing updated_at).
 * @returns The URL with a `v=` param, or undefined if no url was given.
 */
export function portraitSrc(
  url: string | null | undefined,
  version?: string | number | null,
): string | undefined {
  if (!url) return undefined;
  const v = version ?? Date.now();
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}v=${encodeURIComponent(String(v))}`;
}
