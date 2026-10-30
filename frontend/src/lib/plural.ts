/**
 * "1 arc", "2 arcs" (review 10/30: the dashboard read "1 adventures").
 *
 * @param n - The count.
 * @param one - The singular word.
 * @param many - The plural, when it isn't just `one + "s"` (e.g. "NPCs" is fine, "foes" too).
 */
export function plural(n: number, one: string, many?: string): string {
  return `${n} ${n === 1 ? one : (many ?? `${one}s`)}`;
}

/** Just the word for a count: `word(1, "arc")` → "arc", `word(3, "arc")` → "arcs". */
export function word(n: number, one: string, many?: string): string {
  return n === 1 ? one : (many ?? `${one}s`);
}
