/**
 * What a hit is, and how the table plays it (Plan 113). The HUD's chip row and
 * the engine's bolts both read this; it imports nothing from three so the HUD
 * can take it without the renderer.
 */
export interface Flavor {
  key: string;
  label: string;
  emoji: string;
  /** The bolt's and burst's colour. */
  color: string;
}

export const FLAVORS: Flavor[] = [
  { key: "weapon", label: "weapon", emoji: "⚔", color: "#d9d9e3" },
  { key: "fire", label: "fire", emoji: "🔥", color: "#ff7a1f" },
  { key: "cold", label: "cold", emoji: "❄", color: "#7fd3ff" },
  { key: "lightning", label: "lightning", emoji: "⚡", color: "#fff05a" },
  { key: "thunder", label: "thunder", emoji: "🔊", color: "#c8d0ff" },
  { key: "acid", label: "acid", emoji: "🧪", color: "#9dff3d" },
  { key: "poison", label: "poison", emoji: "☠", color: "#5ee06a" },
  { key: "necrotic", label: "necrotic", emoji: "💀", color: "#9a4dff" },
  { key: "radiant", label: "radiant", emoji: "✨", color: "#ffe9a3" },
  { key: "force", label: "force", emoji: "🌀", color: "#e05cff" },
  { key: "psychic", label: "psychic", emoji: "🧠", color: "#ff5ccf" },
  { key: "heal", label: "heal", emoji: "💚", color: "#6dff9c" },
];

export const FLAVOR_BY_KEY: Record<string, Flavor> = Object.fromEntries(FLAVORS.map((f) => [f.key, f]));

export function flavorColor(key?: string | null): string {
  return (FLAVOR_BY_KEY[key ?? ""] ?? FLAVOR_BY_KEY.weapon).color;
}

/** The flavour a spell's damage type (and, failing that, its name) implies; null when it implies nothing. */
export function flavorOf(damageType: string | null | undefined, name = ""): string | null {
  const k = (damageType ?? "").toLowerCase().trim();
  if (k && k !== "heal" && FLAVOR_BY_KEY[k]) return k;
  if (/bludgeon|pierc|slash/.test(k)) return "weapon";
  if (/cure|heal|restor|revivify|vitality|prayer of/i.test(name)) return "heal";
  return null;
}

export type StrikeKind = "melee" | "shoot" | "cast";

/** How a strike plays: a swing when the attacker stands beside the target, an arrow when not; a spell is always cast. */
export function strikeKind(flavor: string | null | undefined, distCells: number): StrikeKind {
  if (flavor && flavor !== "weapon") return "cast";
  return distCells <= 1.75 ? "melee" : "shoot";
}

/** Milliseconds after the strike starts: when the bolt leaves the hand, and when the blow lands. */
export const TIMING: Record<StrikeKind, { launch: number; impact: number }> = {
  melee: { launch: 0, impact: 300 },
  shoot: { launch: 150, impact: 380 },
  cast: { launch: 260, impact: 620 },
};
