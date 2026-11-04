/**
 * Plan 135 — a homebrew feat's "−5 to hit, +10 damage" trade (Sharpshooter-style), shown as a
 * toggle on the attacks it fits: the DM's sheet (AttacksList) and the phone (Now tab).
 */
import type { PowerAttackOffer } from "../api/types";

/** A signed number with a real minus sign: "−5", "+10". */
function signed(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : `+${n}`;
}

/** The toggle's label: "−5 / +10 (Deadeye)". */
export function powerAttackLabel(offer: PowerAttackOffer): string {
  return `${signed(offer.to_hit)} / ${signed(offer.damage)} (${offer.feat})`;
}

/** Plain words for a newcomer: "Deadeye: take −5 to hit for +10 damage." */
export function powerAttackHint(offer: PowerAttackOffer): string {
  return `${offer.feat}: take ${signed(offer.to_hit)} to hit for ${signed(offer.damage)} damage.`;
}

/**
 * A damage roll with a flat amount added: "1d8+3" + 10 → "1d8+13", "1d6" → "1d6+10",
 * "1d8-1" → "1d8+9", a flat "4" → "14".
 */
export function addToDamage(expr: string, n: number): string {
  const s = expr.trim();
  if (/^\d+$/.test(s)) return String(Number(s) + n);
  const m = /^(.*\d+d\d+)\s*([+-]\s*\d+)?$/i.exec(s);
  if (!m) return n ? `${s}${n > 0 ? "+" : ""}${n}` : s;
  const flat = (m[2] ? Number(m[2].replace(/\s/g, "")) : 0) + n;
  return flat === 0 ? m[1] : `${m[1]}${flat > 0 ? "+" : ""}${flat}`;
}
