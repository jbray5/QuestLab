/**
 * Roll specs for the companion phone (Plan 122): every number becomes a roll,
 * with a plain sentence about where its bonus comes from.
 */
import type { TurnOption } from "../../api/play";
import type { PlayerCharacter } from "../../api/types";
import type { RollSpec } from "./rollContext";
import { ABILITIES, SKILLS, fmt, mod, profBonus, type AbilityKey } from "./rules";

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

/** The same attack, with Sneak Attack offered when it applies. */
export function weaponAttackSpec(pc: PlayerCharacter, o: TurnOption): RollSpec {
  const spec = attackSpec(pc, o);
  const sneak = sneakDice(pc);
  if (spec.damage && sneak && o.kind === "weapon" && /^dex|finesse|sneak attack applies|ranged/i.test(o.note)) spec.damage.sneakDice = sneak;
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
