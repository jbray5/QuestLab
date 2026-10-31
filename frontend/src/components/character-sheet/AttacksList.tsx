import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

import { inventoryApi } from "../../api/inventory";
import { itemsApi, type MagicItem } from "../../api/items";
import type { CharacterItem } from "../../api/types";
import type { RollContext } from "./RollHelper";

interface Props {
  characterId: string;
  onRoll?: (ctx: RollContext) => void;
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
          fontSize: "0.9375rem",
          fontWeight: 600,
          margin: "0 0 0.5rem",
          color: "var(--text)",
        }}
      >
        Attacks <span style={{ fontWeight: 400, color: "var(--muted)" }}>· equipped weapons</span>
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
                onRoll?.({
                  label: `${entry.item.name} attack`,
                  mod: preview.hit_bonus,
                  breakdown: `${preview.ability} mod + prof${entry.item.mastery ? ` · mastery: ${entry.item.mastery}` : ""}`,
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
                borderRadius: 6,
                cursor: clickable && preview ? "pointer" : "default",
                fontFamily: "inherit",
                color: "inherit",
                fontSize: "0.875rem",
                textAlign: "left",
                flexWrap: "wrap",
              }}
              title={clickable ? `Roll attack with ${entry.item.name}` : ""}
            >
              <span style={{ flex: 1, fontWeight: 500 }}>{entry.item.name}</span>
              {isLoading ? (
                <span className="text-muted text-sm">…</span>
              ) : preview ? (
                <>
                  <span title="Added to the d20 attack roll">
                    <span className="num" style={{ color: "var(--text)" }}>
                      {preview.hit_bonus >= 0 ? "+" : ""}
                      {preview.hit_bonus}
                    </span>{" "}
                    <span style={{ color: "var(--muted)" }}>to hit</span>
                  </span>
                  <span className="num" style={{ color: "var(--text2)" }}>
                    {preview.damage_roll} {preview.damage_type}
                  </span>
                  {preview.mastery && (
                    <span
                      className="pill"
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
