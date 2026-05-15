import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { inventoryApi } from "../../api/inventory";
import { itemsApi } from "../../api/items";
import type { CharacterItem, MagicItem } from "../../api/types";
import { rollD20 } from "./RollToast";
import type { RollResult } from "./RollToast";

interface Props {
  characterId: string;
  onRoll?: (roll: RollResult) => void;
  readOnly?: boolean;
}

/**
 * Equipped-weapons attack list (Plan 00022).
 *
 * Reads the PC's inventory, filters to equipped weapons, fetches each
 * weapon's full details (for damage_die + mastery), and asks the server
 * to compute the attack-preview against this PC. Clicking the row rolls
 * a d20+hit on the client and surfaces the result via ``onRoll``.
 */
export default function AttacksList({ characterId, onRoll, readOnly = false }: Props) {
  // PC's inventory
  const { data: inventory = [] } = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => inventoryApi.list(characterId),
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

  return (
    <div>
      <h4
        style={{
          fontSize: "0.7rem",
          margin: "0 0 0.4rem",
          color: "var(--muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}
      >
        Attacks (Equipped)
      </h4>
      {equippedWeapons.length === 0 && (
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          No equipped weapons. Equip one from the inventory below.
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        {equippedWeapons.map((entry, i) => {
          const preview = previewQueries[i]?.data;
          const isLoading = previewQueries[i]?.isLoading;
          return (
            <button
              key={entry.inv.id}
              disabled={!clickable || !preview}
              onClick={() => {
                if (!preview) return;
                const d20 = rollD20();
                onRoll?.({
                  label: `${entry.item.name} attack`,
                  d20,
                  mod: preview.hit_bonus,
                  breakdown: `${preview.ability} mod + prof = ${preview.hit_bonus >= 0 ? "+" : ""}${preview.hit_bonus}${entry.item.mastery ? ` · mastery: ${entry.item.mastery}` : ""}`,
                  damage: `${preview.damage_roll} ${preview.damage_type}`,
                });
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.4rem 0.6rem",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: clickable && preview ? "pointer" : "default",
                fontFamily: "inherit",
                color: "inherit",
                fontSize: "0.85rem",
                textAlign: "left",
              }}
              title={clickable ? `Roll attack with ${entry.item.name}` : ""}
            >
              <span style={{ flex: 1, fontWeight: 600 }}>{entry.item.name}</span>
              {isLoading ? (
                <span className="text-muted text-sm">…</span>
              ) : preview ? (
                <>
                  <span style={{ fontFamily: "monospace", color: "var(--gold)" }}>
                    {preview.hit_bonus >= 0 ? "+" : ""}
                    {preview.hit_bonus} hit
                  </span>
                  <span style={{ fontFamily: "monospace" }}>
                    {preview.damage_roll} {preview.damage_type}
                  </span>
                  {preview.mastery && (
                    <span
                      className="badge badge-artifact"
                      style={{ fontSize: "0.65rem" }}
                      title={`Weapon mastery: ${preview.mastery}`}
                    >
                      {preview.mastery}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-muted text-sm">attack-preview unavailable</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
