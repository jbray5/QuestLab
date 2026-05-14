import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryApi } from "../api/inventory";
import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import type { CharacterItem } from "../api/types";

interface Props {
  characterId: string;
  characterName: string;
}

/**
 * Per-PC inventory panel (Plan 00019).
 *
 * Collapsed by default. When expanded: shows every inventory row with qty,
 * equipped, attuned toggles + a remove button. A search-and-add bar at the
 * bottom lets the DM hand out items without going through the session HUD.
 */
export default function InventoryPanel({ characterId, characterName }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["inventory", characterId],
    queryFn: () => inventoryApi.list(characterId),
    enabled: open,
  });

  // Lookup of every item the PC has so we can render names without a join.
  const itemIds = useMemo(() => rows.map((r) => r.item_id), [rows]);
  const { data: allItems = [] } = useQuery({
    queryKey: ["items-for-inventory", characterId, itemIds.join(",")],
    queryFn: async () => {
      const list = await Promise.all(itemIds.map((id) => itemsApi.get(id)));
      return list;
    },
    enabled: open && itemIds.length > 0,
  });

  const itemsById: Record<string, MagicItem> = useMemo(() => {
    const m: Record<string, MagicItem> = {};
    for (const i of allItems) m[i.id] = i;
    return m;
  }, [allItems]);

  // Search compendium for adding new items.
  const { data: searchHits = [], isFetching: searchLoading } = useQuery({
    queryKey: ["item-search", search],
    queryFn: () => itemsApi.list({ q: search.trim() || undefined }),
    enabled: open && search.trim().length >= 2,
  });

  const attunedCount = rows.filter((r) => r.attuned).length;

  function refreshInventory() {
    qc.invalidateQueries({ queryKey: ["inventory", characterId] });
  }

  const addMutation = useMutation({
    mutationFn: (itemId: string) =>
      inventoryApi.add(characterId, { item_id: itemId, quantity: 1 }),
    onSuccess: () => {
      setError(null);
      refreshInventory();
    },
    onError: (e: Error) => setError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: {
      ciId: string;
      patch: { quantity?: number; equipped?: boolean; attuned?: boolean };
    }) => inventoryApi.update(characterId, vars.ciId, vars.patch),
    onSuccess: () => {
      setError(null);
      refreshInventory();
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (ciId: string) => inventoryApi.remove(characterId, ciId),
    onSuccess: () => refreshInventory(),
  });

  function renderRow(row: CharacterItem) {
    const item = itemsById[row.item_id];
    const itemName = item?.name ?? row.item_id.slice(0, 8) + "…";
    const isWeapon = !!item?.weapon_category;
    const rarity = item?.rarity ?? "Common";

    return (
      <div
        key={row.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.4rem 0.6rem",
          background: "var(--surface2)",
          border: "1px solid var(--border)",
          borderRadius: 4,
        }}
      >
        <span style={{ flex: 1, fontSize: "0.85rem" }}>
          {itemName}
          {row.quantity > 1 && (
            <span style={{ color: "var(--muted)", marginLeft: "0.3rem" }}>
              ×{row.quantity}
            </span>
          )}
        </span>
        <span
          className={`badge badge-${rarity === "Common" ? "draft" : "artifact"}`}
          style={{ fontSize: "0.65rem" }}
        >
          {isWeapon ? "Weapon" : rarity}
        </span>
        <input
          type="number"
          min={0}
          value={row.quantity}
          onChange={(e) =>
            updateMutation.mutate({
              ciId: row.id,
              patch: { quantity: Math.max(0, Number(e.target.value)) },
            })
          }
          style={{ width: 52, fontSize: "0.75rem", padding: "0.15rem 0.3rem" }}
        />
        <button
          className={`btn ${row.equipped ? "btn-primary" : "btn-ghost"}`}
          style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}
          onClick={() =>
            updateMutation.mutate({ ciId: row.id, patch: { equipped: !row.equipped } })
          }
          title={row.equipped ? "Equipped (click to un-equip)" : "Click to equip"}
        >
          {row.equipped ? "Equipped" : "Equip"}
        </button>
        <button
          className={`btn ${row.attuned ? "btn-primary" : "btn-ghost"}`}
          style={{ fontSize: "0.65rem", padding: "0.15rem 0.45rem" }}
          onClick={() =>
            updateMutation.mutate({ ciId: row.id, patch: { attuned: !row.attuned } })
          }
          title={
            row.attuned
              ? "Attuned (click to drop attunement)"
              : `Attune (currently ${attunedCount}/3)`
          }
        >
          {row.attuned ? "Attuned" : "Attune"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.65rem", padding: "0.15rem 0.4rem", opacity: 0.5 }}
          onClick={() => {
            if (window.confirm(`Remove ${itemName} from ${characterName}?`)) {
              removeMutation.mutate(row.id);
            }
          }}
          title="Remove from inventory"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: "0.75rem" }}>
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((p) => !p)}
      >
        <h4 style={{ margin: 0, fontSize: "0.9rem" }}>
          📦 Inventory{open && rows.length > 0 ? ` (${rows.length})` : ""}
          {open && attunedCount > 0 && (
            <span
              style={{
                fontSize: "0.7rem",
                marginLeft: "0.5rem",
                color: attunedCount >= 3 ? "var(--red)" : "var(--muted)",
              }}
            >
              · Attuned {attunedCount}/3
            </span>
          )}
        </h4>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {open ? "▾" : "▸"}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          {error && (
            <p style={{ color: "var(--red)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              {error}
            </p>
          )}

          {isLoading && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Loading…
            </p>
          )}

          {!isLoading && rows.length === 0 && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              No items. Use the search below to add some.
            </p>
          )}

          {!isLoading && rows.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
              {rows.map(renderRow)}
            </div>
          )}

          {/* Add from compendium */}
          <div
            style={{
              marginTop: "0.75rem",
              paddingTop: "0.5rem",
              borderTop: "1px dashed var(--border)",
            }}
          >
            <input
              placeholder="Search compendium to add an item…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", fontSize: "0.8rem" }}
            />
            {search.trim().length >= 2 && (
              <div
                style={{
                  marginTop: "0.4rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.2rem",
                  maxHeight: 200,
                  overflowY: "auto",
                }}
              >
                {searchLoading && (
                  <p className="text-muted text-sm">Searching…</p>
                )}
                {!searchLoading && searchHits.length === 0 && (
                  <p className="text-muted text-sm">No matches.</p>
                )}
                {searchHits.slice(0, 12).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => addMutation.mutate(h.id)}
                    disabled={addMutation.isPending}
                    className="btn btn-ghost"
                    style={{
                      fontSize: "0.75rem",
                      padding: "0.2rem 0.45rem",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>+ {h.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.65rem" }}>
                      {h.rarity}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
