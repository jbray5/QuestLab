import { useMemo, useState } from "react";
import { Backpack, ChevronDown, ChevronRight, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryApi } from "../api/inventory";
import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import type { CharacterItem } from "../api/types";

import {
  PANEL_HEAD_STYLE,
  PANEL_ROW_STYLE,
  PANEL_STYLE,
  PANEL_TITLE_STYLE,
  REMOVE_BTN,
  rarityClass,
  rarityLabel,
  toggleStyle,
} from "./character-sheet/panelStyles";

interface Props {
  characterId: string;
  characterName: string;
  /** Start expanded (used inside the character sheet). */
  defaultOpen?: boolean;
  /** Hide all edit/mutate controls (Plan 26 player-view foundation). */
  readOnly?: boolean;
}

/**
 * Per-PC inventory panel (Plan 00019).
 *
 * Collapsed by default. When expanded: shows every inventory row with qty,
 * equipped, attuned toggles + a remove button. A search-and-add bar at the
 * bottom lets the DM hand out items without going through the session HUD.
 */
export default function InventoryPanel({
  characterId,
  characterName,
  defaultOpen = false,
  readOnly: _readOnly = false,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(defaultOpen);
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
      <div key={row.id} style={{ ...PANEL_ROW_STYLE, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 8rem", minWidth: 0 }}>
          {itemName}
          {row.quantity > 1 && (
            <span className="num" style={{ color: "var(--muted)", marginLeft: "0.3rem" }}>
              ×{row.quantity}
            </span>
          )}
        </span>
        <span className={isWeapon ? "badge badge-common" : rarityClass(rarity)}>
          {isWeapon ? "Weapon" : rarityLabel(rarity)}
        </span>
        <input
          type="number"
          min={0}
          value={row.quantity}
          aria-label={`Quantity of ${itemName}`}
          title="Quantity"
          className="num"
          onChange={(e) =>
            updateMutation.mutate({
              ciId: row.id,
              patch: { quantity: Math.max(0, Number(e.target.value)) },
            })
          }
          style={{ width: 56, fontSize: "0.8125rem", padding: "0.15rem 0.35rem" }}
        />
        <button
          className="btn btn-secondary"
          style={toggleStyle(row.equipped)}
          aria-pressed={row.equipped}
          onClick={() =>
            updateMutation.mutate({ ciId: row.id, patch: { equipped: !row.equipped } })
          }
          title={row.equipped ? "Equipped (click to un-equip)" : "Click to equip"}
        >
          {row.equipped ? "Equipped" : "Equip"}
        </button>
        <button
          className="btn btn-secondary"
          style={toggleStyle(row.attuned)}
          aria-pressed={row.attuned}
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
          style={REMOVE_BTN}
          onClick={() => {
            if (window.confirm(`Remove ${itemName} from ${characterName}?`)) {
              removeMutation.mutate(row.id);
            }
          }}
          title="Remove from inventory"
          aria-label={`Remove ${itemName}`}
        >
          <X size={15} />
        </button>
      </div>
    );
  }

  return (
    <div style={PANEL_STYLE}>
      <div style={PANEL_HEAD_STYLE} onClick={() => setOpen((p) => !p)}>
        <h4 style={PANEL_TITLE_STYLE}>
          <Backpack size={16} style={{ color: "var(--muted)" }} />
          Inventory
          {open && rows.length > 0 && (
            <span className="num" style={{ color: "var(--muted)", fontWeight: 400 }}>{rows.length}</span>
          )}
          {open && attunedCount > 0 && (
            <span
              style={{
                fontSize: "0.8125rem",
                fontWeight: 400,
                color: attunedCount >= 3 ? "var(--amber-text)" : "var(--muted)",
              }}
              title="Magic items a character can be attuned to at once: 3"
            >
              · attuned <span className="num">{attunedCount}/3</span>
            </span>
          )}
        </h4>
        {open ? (
          <ChevronDown size={16} style={{ color: "var(--muted)" }} />
        ) : (
          <ChevronRight size={16} style={{ color: "var(--muted)" }} />
        )}
      </div>

      {open && (
        <div style={{ marginTop: "0.6rem" }}>
          {error && (
            <p style={{ color: "var(--danger-text)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
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
              paddingTop: "0.6rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            <input
              placeholder="Search the compendium to add an item…"
              aria-label="Search the compendium to add an item"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: "100%", fontSize: "0.875rem" }}
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
                      fontSize: "0.875rem",
                      padding: "0.25rem 0.55rem",
                      minHeight: 0,
                      border: "none",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>+ {h.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.8125rem" }}>
                      {rarityLabel(h.rarity)}
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
