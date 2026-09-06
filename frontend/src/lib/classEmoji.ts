/**
 * classEmoji — the placeholder a PC wears before they have a portrait (Plan 83).
 * Every class used to be the same wizard; a fighter deserves a sword.
 */
const MAP: Record<string, string> = {
  barbarian: "🪓",
  bard: "🎵",
  cleric: "✨",
  druid: "🌿",
  fighter: "⚔️",
  monk: "👊",
  paladin: "🛡️",
  ranger: "🏹",
  rogue: "🗡️",
  sorcerer: "🔥",
  warlock: "👁️",
  wizard: "🧙",
};

export function classEmoji(cls?: string | null): string {
  return MAP[(cls ?? "").toLowerCase().trim()] ?? "🧝";
}
