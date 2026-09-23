/**
 * What a figure wears that its model does not carry (Plan 113): a crown, a
 * harengon's ears. Keyed by the token's name — the one thing the table always
 * has — so Titania is crowned whichever model stands for her, and Dame
 * Goldenrod has her ears on any rig.
 */
export type Adornment = "crown" | "ears";

const RULES: [RegExp, Adornment][] = [
  [/titania|queen/i, "crown"],
  [/goldenrod|harengon|\bhare\b|rabbit|bunny/i, "ears"],
];

export function adornFor(label: string | null | undefined): Adornment | null {
  if (!label) return null;
  for (const [re, a] of RULES) if (re.test(label)) return a;
  return null;
}
