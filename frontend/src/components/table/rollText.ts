/**
 * Words for a table roll (Plan 128). The HUD's Table roll sends its dice
 * expression as the label ("1d20", "2d6+3"), which only repeats the die the
 * TV already names, so those are dropped; "Dagger attack" and the like stay.
 */
export function rollLabel(label: string | null | undefined): string | null {
  const text = (label ?? "").trim();
  if (!text) return null;
  return /^\d*d\d+(\s*[+\-−]\s*\d+)?$/i.test(text) ? null : text;
}
