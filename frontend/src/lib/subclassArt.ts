/**
 * Subclass-flavored panel backgrounds (Plan 60c, redrawn under Plan 86):
 * procedural gradients keyed by the subclass name. No generated images.
 */

/** Kept for callers that keyed on it; there is no generated art any more (Plan 86). */
export const SUBCLASS_CARD_ART: Record<string, string> = {};

function hue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return h;
}

/**
 * Layered CSS background for a panel: optional tint, readability scrim, then
 * a two-tone gradient in the subclass's hue. Null when there is no subclass.
 */
export function subclassPanelBackground(
  subclass: string | null | undefined,
  opts?: { tint?: string; scrim?: [number, number] },
): string | null {
  if (!subclass) return null;
  const h = hue(subclass);
  const [a, b] = opts?.scrim ?? [0.42, 0.66];
  const tint = opts?.tint ? `${opts.tint}, ` : "";
  return (
    `${tint}linear-gradient(rgba(10,11,15,${a}), rgba(10,11,15,${b})), ` +
    `linear-gradient(135deg, hsl(${h} 38% 16%) 0%, hsl(${(h + 40) % 360} 32% 9%) 60%, hsl(${(h + 300) % 360} 30% 12%) 100%)`
  );
}


/**
 * The full-bleed backdrop for a player's sheet (Plan 97).
 *
 * A character's own ``background_url`` wins; without one we fall back to the
 * subclass gradient so a sheet is never bare. The scrim is layered on top of
 * the image so body text stays readable over any art.
 */
export function sheetBackground(
  backgroundUrl: string | null | undefined,
  subclass: string | null | undefined,
  opts?: { scrim?: [number, number] },
): string | null {
  const [a, b] = opts?.scrim ?? [0.62, 0.86];
  if (backgroundUrl) {
    return (
      `linear-gradient(rgba(10,11,15,${a}), rgba(10,11,15,${b})), ` +
      `url("${backgroundUrl}")`
    );
  }
  return subclassPanelBackground(subclass, { scrim: [a, b] });
}
