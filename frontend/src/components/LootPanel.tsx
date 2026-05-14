import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { charactersApi } from "../api/characters";
import { itemsApi } from "../api/items";
import { sessionsApi } from "../api/sessions";
import type { GameSession, PlayerCharacter } from "../api/types";

interface Props {
  sessionId: string;
  /** UUIDs of attending PCs. Empty = show all PCs in the campaign. */
  attendingPcIds: string[];
  /** Campaign id used to load PC roster when the session has no explicit attendees. */
  campaignId: string;
  /** Start expanded (used when rendered inside the HUD's loot modal). */
  defaultOpen?: boolean;
}

const RARITIES = ["any", "Common", "Uncommon", "Rare", "VeryRare", "Legendary", "Artifact"] as const;

const RARITY_BADGE: Record<string, string> = {
  Common: "draft",
  Uncommon: "ready",
  Rare: "primary",
  VeryRare: "artifact",
  Legendary: "artifact",
  Artifact: "artifact",
};

/**
 * Mid-session magic-item handout panel (Plan 00016).
 *
 * Search the magic items compendium by name + rarity, pick a PC, click "Give".
 * The handout is logged to the session's notes via POST /sessions/:id/handouts.
 * No new persistence beyond appending to actual_notes — keeps scope minimal.
 */
export default function LootPanel({
  sessionId,
  attendingPcIds,
  campaignId,
  defaultOpen = false,
}: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [rarity, setRarity] = useState<(typeof RARITIES)[number]>("any");
  const [open, setOpen] = useState(defaultOpen);
  const [pcSelection, setPcSelection] = useState<Record<string, string>>({});
  const [lastHandout, setLastHandout] = useState<string | null>(null);

  // Item search — only fire when the panel is open AND user has typed or set a rarity.
  const itemsEnabled = open && (query.trim().length > 0 || rarity !== "any");
  const { data: items = [], isFetching: itemsLoading } = useQuery({
    queryKey: ["loot-items", query, rarity],
    queryFn: () =>
      itemsApi.list({
        q: query.trim() || undefined,
        rarity: rarity === "any" ? undefined : rarity,
      }),
    enabled: itemsEnabled,
  });

  // PC roster — load campaign PCs once panel opens.
  const { data: allPcs = [] } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId),
    enabled: open && !!campaignId,
  });

  const attendingPcs: PlayerCharacter[] = useMemo(() => {
    if (attendingPcIds.length === 0) return allPcs;
    const ids = new Set(attendingPcIds);
    return allPcs.filter((pc) => ids.has(pc.id));
  }, [allPcs, attendingPcIds]);

  const handout = useMutation({
    mutationFn: ({ pcId, itemId }: { pcId: string; itemId: string }) =>
      sessionsApi.recordHandout(sessionId, pcId, itemId),
    onSuccess: (updated: GameSession, vars) => {
      // Refresh the session query so the notes textarea picks up the new line.
      qc.invalidateQueries({ queryKey: ["session", sessionId] });
      qc.setQueryData(["session", sessionId], updated);
      const itemName = items.find((i) => i.id === vars.itemId)?.name ?? "item";
      const pcName = attendingPcs.find((p) => p.id === vars.pcId)?.character_name ?? "PC";
      setLastHandout(`Gave ${itemName} to ${pcName}`);
    },
  });

  const visible = items.slice(0, 25);

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", cursor: "pointer" }}
        onClick={() => setOpen((p) => !p)}
      >
        <h3 style={{ margin: 0 }}>💰 Loot — hand out an item</h3>
        <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
          {open ? "▾" : "▸"}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: "0.75rem" }}>
          <div className="flex gap-2" style={{ marginBottom: "0.75rem", flexWrap: "wrap" }}>
            <input
              placeholder="Search items by name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{ flex: "2 1 180px", fontSize: "0.85rem" }}
            />
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value as (typeof RARITIES)[number])}
              style={{ flex: "1 1 120px", fontSize: "0.85rem" }}
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {r === "VeryRare" ? "Very Rare" : r === "any" ? "Any rarity" : r}
                </option>
              ))}
            </select>
          </div>

          {!itemsEnabled && (
            <p className="text-muted text-sm" style={{ margin: 0 }}>
              Type a name or pick a rarity to browse the compendium.
            </p>
          )}

          {itemsEnabled && itemsLoading && (
            <p className="text-muted text-sm">Searching…</p>
          )}

          {itemsEnabled && !itemsLoading && items.length === 0 && (
            <p className="text-muted text-sm">No items match.</p>
          )}

          {itemsEnabled && lastHandout && (
            <p
              className="text-sm"
              style={{
                color: "var(--green2, #4caf50)",
                marginBottom: "0.5rem",
              }}
            >
              ✓ {lastHandout}
            </p>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: 360, overflowY: "auto" }}>
            {visible.map((item) => {
              const pcId = pcSelection[item.id] ?? attendingPcs[0]?.id ?? "";
              const badge = RARITY_BADGE[item.rarity] ?? "draft";
              return (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.4rem 0.6rem",
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                  }}
                >
                  <span style={{ flex: 1, fontSize: "0.85rem" }}>{item.name}</span>
                  <span className={`badge badge-${badge}`} style={{ fontSize: "0.65rem" }}>
                    {item.rarity}
                  </span>
                  <select
                    value={pcId}
                    onChange={(e) =>
                      setPcSelection((p) => ({ ...p, [item.id]: e.target.value }))
                    }
                    disabled={attendingPcs.length === 0}
                    style={{ fontSize: "0.75rem", maxWidth: 140 }}
                  >
                    {attendingPcs.length === 0 ? (
                      <option value="">No PCs</option>
                    ) : (
                      attendingPcs.map((pc) => (
                        <option key={pc.id} value={pc.id}>
                          {pc.character_name}
                        </option>
                      ))
                    )}
                  </select>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: "0.7rem", padding: "0.2rem 0.55rem" }}
                    disabled={!pcId || handout.isPending}
                    onClick={() => handout.mutate({ pcId, itemId: item.id })}
                    title="Log this item as given to the selected PC"
                  >
                    Give
                  </button>
                </div>
              );
            })}
          </div>

          {items.length > visible.length && (
            <p className="text-muted text-sm" style={{ marginTop: "0.5rem" }}>
              Showing first {visible.length} of {items.length} — refine your search to narrow down.
            </p>
          )}

          {handout.isError && (
            <p style={{ color: "var(--red)", fontSize: "0.85rem", marginTop: "0.5rem" }}>
              {(handout.error as Error).message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
