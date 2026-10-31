/**
 * classEmoji — the placeholder a PC wears before they have a portrait (Plan 83).
 * Every class used to be the same wizard; a fighter deserves a sword.
 *
 * Plan 121 (Lamplit): emoji are no longer used as icons. DM screens show an
 * initials monogram instead (`initials()` below, drawn by
 * components/character-sheet/Monogram). `classEmoji` stays for the pages that
 * have not been revisited yet.
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

/**
 * Up to two initials for a name: first and last word, skipping quoted
 * nicknames and parentheticals — 'Thaelen "Thane" Amakiir' → "TA".
 */
export function initials(name?: string | null): string {
  const words = (name ?? "")
    .split(/\s+/)
    .filter((w) => w && !/^["'“‘(]/.test(w))
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ""))
    .filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0])[0] ?? "";
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] ?? "" : "";
  return (first + last).toUpperCase();
}
