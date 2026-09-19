import { ABODE } from "./abode";
import { BEACH, BEACH_DAY } from "./beach";
import type { MapDef } from "./maps";
import { normalizeMap } from "./maps";
import { RESTWATER } from "./restwater";
import { TAVERN } from "./tavern";

/**
 * Every map the engine knows how to render, by id — normalized on the way in,
 * so what renders is what a builder would have built, not what an eye traced.
 */
export const MAPS: Record<string, MapDef> = Object.fromEntries(
  [BEACH_DAY, BEACH, TAVERN, RESTWATER, ABODE].map((m) => [m.id, normalizeMap(m)]),
);
