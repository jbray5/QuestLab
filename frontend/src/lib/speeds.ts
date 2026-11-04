/**
 * Plan 135 — speeds besides walking (fly, swim, climb, burrow), which a homebrew race gives
 * and the DM's edit form changes. Shown next to the walking speed on the sheet and the phone.
 */

export type SpeedKind = "fly" | "swim" | "climb" | "burrow";
export const SPEED_KINDS: SpeedKind[] = ["fly", "swim", "climb", "burrow"];
export type Speeds = Partial<Record<SpeedKind, number>>;

/** The speeds that are set, in the usual order: [["fly", 30], ["swim", 40]]. */
export function speedList(speeds: Speeds | null | undefined): [SpeedKind, number][] {
  return SPEED_KINDS.filter((k) => (speeds?.[k] ?? 0) > 0).map((k) => [k, speeds![k]!]);
}

/** "fly 30 · swim 40", or "" when there are none. */
export function otherSpeedsLine(speeds: Speeds | null | undefined): string {
  return speedList(speeds)
    .map(([k, ft]) => `${k} ${ft}`)
    .join(" · ");
}

/** A tooltip in full: "Speed: 30 ft walking; fly 30 ft, swim 40 ft." */
export function speedTitle(walk: number, speeds: Speeds | null | undefined): string {
  const others = speedList(speeds).map(([k, ft]) => `${k} ${ft} ft`);
  return others.length ? `Speed: ${walk} ft walking; ${others.join(", ")}.` : "Speed: feet moved per turn";
}

/**
 * A speed field's problem in the server's words (domain/homebrew.check_speeds), or null.
 * Blank and 0 mean none.
 */
export function speedProblem(kind: SpeedKind, raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const ft = Number(s);
  if (ft === 0) return null;
  if (!Number.isInteger(ft) || ft < 5 || ft > 120 || ft % 5 !== 0) {
    return `The ${kind} speed goes from 5 to 120 feet, in steps of 5.`;
  }
  return null;
}

/** Form fields → the API's speeds ({} when none): blank and 0 are dropped. */
export function speedsFromFields(fields: Record<SpeedKind, string>): Speeds {
  const out: Speeds = {};
  for (const k of SPEED_KINDS) {
    const ft = Number(fields[k].trim());
    if (fields[k].trim() && Number.isFinite(ft) && ft > 0) out[k] = ft;
  }
  return out;
}

/** The API's speeds → form fields ("" for none). */
export function fieldsFromSpeeds(speeds: Speeds | null | undefined): Record<SpeedKind, string> {
  return {
    fly: speeds?.fly ? String(speeds.fly) : "",
    swim: speeds?.swim ? String(speeds.swim) : "",
    climb: speeds?.climb ? String(speeds.climb) : "",
    burrow: speeds?.burrow ? String(speeds.burrow) : "",
  };
}
