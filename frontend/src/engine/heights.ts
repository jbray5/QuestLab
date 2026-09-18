/**
 * How tall a figure stands on the immersive table, in feet (Plan 111) — the
 * same tables the projection uses server-side, for surfaces that preview a
 * figure without a token. Kept free of three.js so the DM's pages can import
 * it without pulling in the engine.
 */
/** One unit is five feet. */
export const FT_PER_UNIT = 5;
export const DEFAULT_HEIGHT_FT = 5.8;

const RACE: [string, number][] = [
  ["gnome", 3.5],
  ["halfling", 3.0],
  ["dwarf", 4.5],
  ["goliath", 7.5],
  ["dragonborn", 6.5],
  ["orc", 6.3],
  ["bugbear", 7.0],
  ["firbolg", 7.5],
  ["kobold", 3.0],
  ["goblin", 3.5],
  ["fairy", 2.5],
];
const SIZE: Record<string, number> = { tiny: 1.5, small: 3.5, medium: 6, large: 10, huge: 16, gargantuan: 24 };

export function heightFtForRace(race: string | null | undefined): number {
  const key = (race ?? "").toLowerCase();
  for (const [name, ft] of RACE) if (key.includes(name)) return ft;
  return DEFAULT_HEIGHT_FT;
}

export function heightFtForSize(size: string | null | undefined): number {
  return SIZE[(size ?? "").toLowerCase()] ?? SIZE.medium;
}
