/**
 * Roll specs for the companion phone (Plan 122): every number becomes a roll,
 * with a plain sentence about where its bonus comes from.
 */
import type { PlaySpell, TurnOption } from "../../api/play";
import type { PlayerCharacter } from "../../api/types";
import { addToDamage, powerAttackHint } from "../../lib/powerAttack";
import type { RollSpec } from "./rollContext";
import { ABILITIES, SKILLS, fmt, healingOf, mod, ordinal, profBonus, type AbilityKey } from "./rules";

const score = (pc: PlayerCharacter, k: AbilityKey) => pc[`score_${k}` as const] as number;
const abilityName = (k: AbilityKey) => ABILITIES.find((a) => a.key === k)?.name ?? k;

/** Sneak Attack dice for a rogue at this level (0 for everyone else). */
export const sneakDice = (pc: PlayerCharacter) => (pc.character_class === "Rogue" ? Math.ceil(pc.level / 2) : 0);

export function skillSpec(pc: PlayerCharacter, skill: string, bonus: number): RollSpec {
  const ab = SKILLS[skill]?.ability ?? "dex";
  const m = mod(score(pc, ab));
  const rank = Number((pc.skill_proficiencies as Record<string, number> | null)?.[skill] ?? 0);
  const prof = bonus - m;
  const why =
    rank > 0 && prof > 0
      ? `${fmt(bonus)} is your ${abilityName(ab)} ${fmt(m)} plus ${fmt(prof)} because you're ${rank >= 2 ? "an expert" : "trained"} in ${skill}.`
      : `${fmt(bonus)} is your ${abilityName(ab)} modifier.`;
  return { title: `${skill} check`, kind: "check", die: "d20", modifier: bonus, why };
}

export function saveSpec(pc: PlayerCharacter, abbr: string, bonus: number): RollSpec {
  const a = ABILITIES.find((x) => x.abbr === abbr);
  const m = a ? mod(score(pc, a.key)) : bonus;
  const prof = bonus - m;
  const why =
    prof > 0
      ? `${fmt(bonus)} is your ${a?.name ?? abbr} ${fmt(m)} plus ${fmt(prof)}: your class is trained in these saves.`
      : `${fmt(bonus)} is your ${a?.name ?? abbr} modifier.`;
  return { title: `${a?.name ?? abbr} save`, kind: "save", die: "d20", modifier: bonus, why };
}

export function abilitySpec(pc: PlayerCharacter, k: AbilityKey): RollSpec {
  const m = mod(score(pc, k));
  return { title: `${abilityName(k)} check`, kind: "check", die: "d20", modifier: m, why: `${fmt(m)} comes from your ${abilityName(k)} score of ${score(pc, k)}.` };
}

export function initiativeSpec(pc: PlayerCharacter): RollSpec {
  const m = mod(pc.score_dex);
  return { title: "Initiative", kind: "initiative", die: "d20", modifier: m, why: `${fmt(m)} is your Dexterity. Highest goes first.` };
}

export function attackSpec(pc: PlayerCharacter, o: TurnOption): RollSpec {
  const abbr = (o.note.split(" ")[0] || "").toLowerCase() as AbilityKey;
  const known = ABILITIES.some((a) => a.key === abbr);
  const toHit = o.to_hit ?? 0;
  const why = known
    ? `${fmt(toHit)} is your ${abilityName(abbr)} ${fmt(mod(score(pc, abbr)))} plus ${fmt(profBonus(pc.level))} because you're trained with it.`
    : o.kind === "cantrip" || o.kind === "spell"
      ? `${fmt(toHit)} is your spell attack bonus.`
      : `${fmt(toHit)} is your attack bonus.`;
  return {
    title: `${o.name} attack`,
    kind: "attack",
    die: "d20",
    modifier: toHit,
    why,
    damage: o.damage ? { dice: o.damage, type: o.damage_type } : undefined,
  };
}

/**
 * The same attack, with Sneak Attack offered when it applies.
 *
 * Plan 135: `powered` switches on the attack's power-attack trade (a homebrew feat's
 * "−5 to hit, +10 damage", `o.power_attack`): the roll and the damage change, and the
 * sentence says why. Natural weapons (kind "natural") roll here too.
 */
export function weaponAttackSpec(pc: PlayerCharacter, o: TurnOption, powered = false): RollSpec {
  const spec = attackSpec(pc, o);
  const sneak = sneakDice(pc);
  if (spec.damage && sneak && o.kind === "weapon" && /^dex|finesse|sneak attack applies|ranged/i.test(o.note)) spec.damage.sneakDice = sneak;
  const pa = powered ? o.power_attack : null;
  if (pa) {
    spec.modifier += pa.to_hit;
    if (spec.damage) spec.damage = { ...spec.damage, dice: addToDamage(spec.damage.dice, pa.damage) };
    spec.why = `${spec.why ?? ""} ${powerAttackHint(pa)} That makes ${fmt(spec.modifier)} to hit.`.trim();
  }
  return spec;
}

/** A save-based spell or feature: the caster rolls the damage; targets roll the save. */
export function damageSpec(o: TurnOption): RollSpec | null {
  const m = /(\d+)d(\d+)\s*([+-]\s*\d+)?/.exec(o.damage);
  if (!m) return null;
  return {
    title: `${o.name} damage`,
    kind: "damage",
    die: `d${m[2]}` as RollSpec["die"],
    count: Math.min(10, Number(m[1])),
    modifier: m[3] ? Number(m[3].replace(/\s/g, "")) : 0,
    why: o.save ? `Targets make a ${o.save} save; on a success they usually take half.` : undefined,
  };
}

/**
 * A healing spell's roll (Plan 128): Cure Wounds is 2d8 plus your spellcasting
 * modifier, with more dice from a higher slot. Null for spells that don't heal
 * (or that deal damage too: those keep their attack or save roll).
 *
 * @param ability - The spellcasting ability ("WIS"), from the spellcasting stats.
 * @param slotLevel - The slot it was cast with, or null for its own level.
 */
export function healSpec(pc: PlayerCharacter, spell: PlaySpell, ability: string | null | undefined, slotLevel: number | null): RollSpec | null {
  if (spell.damage_dice) return null;
  const h = healingOf(spell.description, spell.higher_levels);
  if (!h) return null;
  const k = (ability ?? "").toLowerCase().slice(0, 3) as AbilityKey;
  const known = ABILITIES.some((a) => a.key === k);
  const m = h.addMod && known ? mod(score(pc, k)) : 0;
  const above = slotLevel && slotLevel > spell.level ? slotLevel - spell.level : 0;
  const extra = h.perSlot && h.perSlot.sides === h.sides ? h.perSlot.count * above : 0;
  const count = Math.min(10, h.count + extra);
  const parts = [`${h.count}d${h.sides}`];
  if (extra) parts.push(`${extra}d${h.sides} more from the ${ordinal(slotLevel ?? 0)}-level slot`);
  if (h.addMod && known) parts.push(`your ${abilityName(k)} ${fmt(m)}`);
  if (h.plus) parts.push(String(h.plus));
  return {
    title: `${spell.name} healing`,
    kind: "heal",
    die: `d${h.sides}` as RollSpec["die"],
    count,
    modifier: h.plus + m,
    why: `${spell.name} heals ${parts.join(" plus ")}.`,
  };
}

/** "heals 2d8+3": a healing spell's dice in a line, for its row on the phone. */
export function healLabel(spec: RollSpec): string {
  return `heals ${spec.count ?? 1}${spec.die}${spec.modifier ? fmt(spec.modifier) : ""}`;
}
