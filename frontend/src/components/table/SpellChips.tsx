import { useQuery } from "@tanstack/react-query";

import { spellcastingApi } from "../../api/spellcasting";
import { spellsApi } from "../../api/spells";
import type { Spell } from "../../api/types";
import { FLAVOR_BY_KEY, flavorOf } from "../../engine/strikes";
import { useStrikeStore } from "../../stores/useStrikeStore";

/**
 * The spells a PC knows that do something the table can show (Plan 113): a
 * chip per damaging or healing spell, coloured by its type. One tap sets
 * the table's next hit to that type — so applying damage right after plays a
 * bolt in that colour — and, for a levelled spell, spends a slot of its level.
 */
export default function SpellChips({ pcId, characterClass }: { pcId: string; characterClass: string }) {
  const setFlavor = useStrikeStore((s) => s.setFlavor);
  const flavor = useStrikeStore((s) => s.flavor);
  const { data: known } = useQuery({ queryKey: ["char-spells", pcId], queryFn: () => spellcastingApi.listSpells(pcId) });
  const { data: catalog } = useQuery({
    queryKey: ["class-spells-all", characterClass],
    queryFn: () => spellsApi.list({ class_name: characterClass }),
    enabled: !!characterClass,
    staleTime: 10 * 60 * 1000,
  });
  const { data: slots, refetch } = useQuery({ queryKey: ["spell-slots", pcId], queryFn: () => spellcastingApi.slotState(pcId) });
  if (!known?.length || !catalog) return null;
  const byId = new Map<string, Spell>(catalog.map((s) => [s.id, s]));
  const rows = known
    .map((k) => byId.get(k.spell_id))
    .filter((s): s is Spell => !!s)
    .map((s) => ({ spell: s, flavor: flavorOf(s.damage_type, s.name) }))
    .filter((r) => r.flavor !== null)
    .sort((a, b) => a.spell.level - b.spell.level || a.spell.name.localeCompare(b.spell.name));
  if (!rows.length) return null;
  const cast = async (spell: Spell, f: string) => {
    setFlavor(f);
    if (spell.level > 0) {
      const lvl = slots?.levels?.[String(spell.level)];
      if (lvl && lvl.remaining > 0) {
        await spellcastingApi.expend(pcId, spell.level).catch(() => undefined);
        void refetch();
      }
    }
  };
  return (
    <div style={{ marginTop: "0.3rem" }}>
      <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginBottom: "0.2rem" }} title="Tap a spell as it is cast: the table's next hit takes its colour, and a levelled spell spends a slot">
        Cast
      </div>
      <div className="flex" style={{ flexWrap: "wrap", gap: "0.25rem" }}>
        {rows.map(({ spell, flavor: f }) => {
          const fl = FLAVOR_BY_KEY[f!];
          const on = flavor === f;
          const lvl = spell.level > 0 ? slots?.levels?.[String(spell.level)] : undefined;
          const dry = !!lvl && lvl.remaining <= 0;
          return (
            <button
              key={spell.id}
              className={on ? "btn btn-primary" : "btn btn-ghost"}
              style={{ fontSize: "0.62rem", padding: "0.05rem 0.4rem", borderColor: on ? fl.color : undefined, opacity: dry ? 0.5 : 1 }}
              onClick={() => void cast(spell, f!)}
              title={`${spell.name} — ${spell.level ? `level ${spell.level}` : "cantrip"} · ${fl.label}${dry ? " · no slots left" : ""}`}
            >
              {fl.emoji} {spell.name}
              {spell.level > 0 ? <span style={{ opacity: 0.6 }}> {spell.level}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
