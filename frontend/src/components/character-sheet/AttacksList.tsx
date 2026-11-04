import { useMemo, useState } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { attacksApi } from "../../api/attacks";
import { inventoryApi } from "../../api/inventory";
import { itemsApi, type MagicItem } from "../../api/items";
import type { CharacterItem, PowerAttackOffer } from "../../api/types";
import { useIsCompact } from "../../hooks/useIsCompact";
import { addToDamage, powerAttackHint, powerAttackLabel } from "../../lib/powerAttack";
import type { RollContext } from "./RollHelper";

interface Props {
  characterId: string;
  onRoll?: (ctx: RollContext) => void;
  readOnly?: boolean;
}

/** One row of the list: an equipped weapon's preview or a natural attack, as shown. */
interface Row {
  key: string;
  name: string;
  natural: boolean;
  hit: number;
  damage: string;
  damageType: string;
  breakdown: string;
  mastery: string | null;
  note: string;
  offer: PowerAttackOffer | null;
}

/**
 * Equipped-weapons attack list (Plan 00022).
 *
 * Reads the PC's inventory, filters to equipped weapons, fetches each
 * weapon's full details (for damage_die + mastery), and asks the server
 * to compute the attack-preview against this PC. Clicking the row rolls
 * a d20+hit on the client and surfaces the result via ``onRoll``.
 * Mastery comes from the preview, which has none for a PC on the 2014 rules.
 *
 * Plan 135: a homebrew race's natural weapons (claws, a bite) list after the weapons, marked
 * "natural". When one of the PC's homebrew feats has a "−5 to hit, +10 damage" trade that fits
 * an attack, the row has a toggle: off by default, per attack, not remembered. On, it changes
 * the shown to-hit and damage and the roll.
 */
export default function AttacksList({ characterId, onRoll, readOnly = false }: Props) {
  const phone = useIsCompact(640);
  // Plan 135 — which rows have the power-attack trade switched on (row key → on).
  const [powered, setPowered] = useState<Record<string, boolean>>({});

  // PC's inventory
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => inventoryApi.list(characterId),
  });

  // Plan 135 — natural attacks from the PC's homebrew race (none for SRD races).
  const { data: natural = [] } = useQuery({
    queryKey: ["natural-attacks", characterId],
    queryFn: () => attacksApi.natural(characterId),
    staleTime: 30_000,
  });

  // Fetch each inventory item's details (we need weapon stats)
  const itemIds = useMemo(() => inventory.map((r) => r.item_id), [inventory]);
  const itemQueries = useQueries({
    queries: itemIds.map((id) => ({
      queryKey: ["item", id],
      queryFn: () => itemsApi.get(id),
      staleTime: 60_000,
    })),
  });
  const itemsById: Record<string, MagicItem> = useMemo(() => {
    const m: Record<string, MagicItem> = {};
    itemQueries.forEach((q, i) => {
      if (q.data) m[itemIds[i]] = q.data;
    });
    return m;
  }, [itemQueries, itemIds]);

  // Equipped weapon rows
  const equippedWeapons: { inv: CharacterItem; item: MagicItem }[] = useMemo(() => {
    return inventory
      .filter((r) => r.equipped)
      .map((r) => ({ inv: r, item: itemsById[r.item_id] }))
      .filter(
        (e): e is { inv: CharacterItem; item: MagicItem } =>
          !!e.item && !!e.item.weapon_category && !!e.item.damage_die,
      );
  }, [inventory, itemsById]);

  // Fetch attack previews from the server for each equipped weapon
  const previewQueries = useQueries({
    queries: equippedWeapons.map(({ item }) => ({
      queryKey: ["attack-preview", item.id, characterId],
      queryFn: () => itemsApi.attackPreview(item.id, characterId),
      staleTime: 30_000,
    })),
  });

  const clickable = !readOnly && !!onRoll;

  const weaponRows: (Row | "loading" | "missing")[] = equippedWeapons.map((entry, i) => {
    const preview = previewQueries[i]?.data;
    if (previewQueries[i]?.isLoading) return "loading";
    if (!preview) return "missing";
    return {
      key: entry.inv.id,
      name: entry.item.name,
      natural: false,
      hit: preview.hit_bonus,
      damage: preview.damage_roll,
      damageType: preview.damage_type,
      // The server leaves mastery out for a 2014 PC (Plan 131: no weapon mastery).
      breakdown: `${preview.ability} mod + prof${preview.magic_bonus ? ` + ${preview.magic_bonus} magic` : ""}${preview.mastery ? ` · mastery: ${preview.mastery}` : ""}`,
      mastery: preview.mastery,
      note: "",
      offer: preview.power_attack ?? null,
    };
  });
  const naturalRows: Row[] = natural.map((a) => ({
    key: a.key,
    name: a.name,
    natural: true,
    hit: a.hit_bonus,
    damage: a.damage_roll,
    damageType: a.damage_type,
    breakdown: `${a.ability} mod + prof · natural weapon`,
    mastery: null,
    note: a.note,
    offer: a.power_attack,
  }));

  const renderRow = (row: Row) => {
    const on = !!row.offer && !!powered[row.key];
    const hit = row.hit + (on && row.offer ? row.offer.to_hit : 0);
    const damage = on && row.offer ? addToDamage(row.damage, row.offer.damage) : row.damage;
    return (
      <div key={row.key} style={{ display: "flex", alignItems: "stretch", gap: "0.3rem", flexWrap: "wrap" }}>
        <button
          disabled={!clickable}
          onClick={() =>
            onRoll?.({
              label: `${row.name} attack`,
              mod: hit,
              breakdown: `${row.breakdown}${on && row.offer ? ` · ${powerAttackLabel(row.offer)}` : ""}`,
              damage: `${damage} ${row.damageType}`,
            })
          }
          style={{ ...rowStyle, cursor: clickable ? "pointer" : "default", minHeight: phone ? 44 : undefined }}
          title={clickable ? `Roll attack with ${row.name}${row.note ? ` (${row.note})` : ""}` : row.note}
        >
          <span style={{ flex: 1, fontWeight: 500, minWidth: 0, overflowWrap: "anywhere" }}>
            {row.name}
            {row.natural && (
              <span style={{ fontWeight: 400, color: "var(--muted)" }} title="A natural weapon of this character's race: no item needed">
                {" "}· natural
              </span>
            )}
          </span>
          <span title="Added to the d20 attack roll">
            <span className="num" style={{ color: on ? "var(--accent-text)" : "var(--text)" }}>
              {hit >= 0 ? "+" : ""}
              {hit}
            </span>{" "}
            <span style={{ color: "var(--muted)" }}>to hit</span>
          </span>
          <span className="num" style={{ color: on ? "var(--accent-text)" : "var(--text2)" }}>
            {damage} {row.damageType}
          </span>
          {row.mastery && (
            <span className="pill" title={`Weapon mastery: ${row.mastery}`}>
              {row.mastery}
            </span>
          )}
          {row.note && <span style={{ fontSize: "0.8125rem", color: "var(--muted)", flexBasis: "100%" }}>{row.note}</span>}
        </button>
        {row.offer && (
          <button
            type="button"
            aria-pressed={on}
            onClick={() => setPowered((p) => ({ ...p, [row.key]: !p[row.key] }))}
            title={`${powerAttackHint(row.offer)} Tap to ${on ? "switch it off" : "use it on this attack"}.`}
            aria-label={`${powerAttackHint(row.offer)} ${on ? "On" : "Off"}.`}
            style={{
              ...toggleStyle,
              minHeight: phone ? 44 : undefined,
              background: on ? "var(--accent-soft)" : "var(--surface2)",
              borderColor: on ? "var(--accent-line)" : "var(--border)",
              color: on ? "var(--accent-text)" : "var(--text2)",
            }}
          >
            <span className="num">{powerAttackLabel(row.offer)}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div>
      <h4
        style={{
          fontSize: "0.9375rem",
          fontWeight: 600,
          margin: "0 0 0.5rem",
          color: "var(--text)",
        }}
      >
        Attacks{" "}
        <span style={{ fontWeight: 400, color: "var(--muted)" }}>
          · {naturalRows.length > 0 ? "weapons and natural attacks" : "equipped weapons"}
        </span>
      </h4>
      {equippedWeapons.length === 0 && naturalRows.length === 0 && (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          No equipped weapons. Equip one from the inventory below.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {weaponRows.map((row, i) =>
          typeof row === "string" ? (
            <div key={equippedWeapons[i].inv.id} style={{ ...rowStyle, cursor: "default" }}>
              <span style={{ flex: 1, fontWeight: 500 }}>{equippedWeapons[i].item.name}</span>
              <span className="text-muted text-sm">{row === "loading" ? "…" : "attack-preview unavailable"}</span>
            </div>
          ) : (
            renderRow(row)
          ),
        )}
        {naturalRows.map(renderRow)}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  flex: "1 1 240px",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.4rem 0.6rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
  color: "inherit",
  fontSize: "0.875rem",
  textAlign: "left",
  flexWrap: "wrap",
};

const toggleStyle: React.CSSProperties = {
  flex: "0 0 auto",
  padding: "0.3rem 0.6rem",
  border: "1px solid var(--border)",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: "0.8125rem",
  cursor: "pointer",
};
