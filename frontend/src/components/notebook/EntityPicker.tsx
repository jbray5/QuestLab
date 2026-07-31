import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { charactersApi } from "../../api/characters";
import { npcsApi } from "../../api/npcs";
import { itemsApi } from "../../api/items";
import { tableApi } from "../../api/table";

/**
 * EntityPicker — one search across PCs, NPCs, items, maps, and scene
 * presets (Plan 57). Serves the @ mention flow, the margin "+", and the
 * image block's in-app picker.
 *
 * Scene presets have no server list — they live in localStorage per
 * session (`ql-scenes-*`), so they're collected client-side, get
 * monogram tiles, and link nowhere.
 */

export interface EntityHit {
  kind: "pc" | "npc" | "item" | "map" | "preset";
  refId: string;
  name: string;
  thumb: string | null;
  sub: string;
}

const KIND_LABEL: Record<EntityHit["kind"], string> = {
  pc: "PC",
  npc: "NPC",
  item: "Item",
  map: "Map",
  preset: "Scene",
};

function localScenePresets(): EntityHit[] {
  const hits: EntityHit[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith("ql-scenes-")) continue;
    try {
      const list = JSON.parse(localStorage.getItem(key) || "[]") as { name: string }[];
      for (const p of list) {
        if (p?.name && !seen.has(p.name)) {
          seen.add(p.name);
          hits.push({ kind: "preset", refId: p.name, name: p.name, thumb: null, sub: "Scene" });
        }
      }
    } catch {
      // not a scenes key — skip
    }
  }
  return hits;
}

export function useEntities(campaignId: string) {
  const { data: pcs = [] } = useQuery({
    queryKey: ["nb-pcs", campaignId],
    queryFn: () => charactersApi.list(campaignId),
    enabled: !!campaignId,
    staleTime: 60_000,
  });
  const { data: npcs = [] } = useQuery({
    queryKey: ["nb-npcs", campaignId],
    queryFn: () => npcsApi.list(campaignId),
    enabled: !!campaignId,
    staleTime: 60_000,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["nb-items"],
    queryFn: () => itemsApi.list(),
    staleTime: 300_000,
  });
  const { data: maps = [] } = useQuery({
    queryKey: ["nb-maps", campaignId],
    queryFn: () => tableApi.listMaps(campaignId),
    enabled: !!campaignId,
    staleTime: 60_000,
  });

  return useMemo<EntityHit[]>(() => {
    const all: EntityHit[] = [
      ...pcs.map((p) => ({
        kind: "pc" as const,
        refId: p.id,
        name: p.character_name,
        thumb: p.portrait_url ?? null,
        sub: "PC",
      })),
      ...npcs.map((n) => ({
        kind: "npc" as const,
        refId: n.id,
        name: n.name,
        thumb: n.portrait_url ?? null,
        sub: n.role || "NPC",
      })),
      ...items.map((it) => ({
        kind: "item" as const,
        refId: it.id,
        name: it.name,
        thumb: it.image_url ?? null,
        sub: "Item",
      })),
      ...maps.map((m) => ({
        kind: "map" as const,
        refId: m.id,
        name: m.name,
        thumb: m.image_url ?? null,
        sub: "Map",
      })),
      ...localScenePresets(),
    ];
    return all;
  }, [pcs, npcs, items, maps]);
}

/** Monogram for entities without art. */
export function monogram(name: string): string {
  return name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/** App page an entity pin opens (new tab). Null = nowhere to go.
 * (_refId is unused today — entity list pages have no per-id routes yet.) */
export function entityHref(campaignId: string, kind: string, _refId: string): string | null {
  switch (kind) {
    case "pc":
      return `/campaigns/${campaignId}/characters`;
    case "npc":
      return `/campaigns/${campaignId}/npcs`;
    case "item":
      return `/items`;
    case "map":
      return `/campaigns/${campaignId}/battle-maps`;
    default:
      return null;
  }
}

export default function EntityPicker({
  campaignId,
  query,
  kinds,
  onPick,
  onClose,
}: {
  campaignId: string;
  /** Live filter text (from the @query or the picker's own input). */
  query: string;
  /** Restrict to these kinds (image picker wants art-bearing kinds). */
  kinds?: EntityHit["kind"][];
  onPick: (hit: EntityHit) => void;
  onClose: () => void;
}) {
  const entities = useEntities(campaignId);
  const [cursor, setCursor] = useState(0);

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    let pool = entities;
    if (kinds) pool = pool.filter((e) => kinds.includes(e.kind));
    if (q) pool = pool.filter((e) => e.name.toLowerCase().includes(q));
    return pool.slice(0, 12);
  }, [entities, query, kinds]);

  useEffect(() => setCursor(0), [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, hits.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      }
      if (e.key === "Enter" && hits[cursor]) {
        e.preventDefault();
        onPick(hits[cursor]);
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hits, cursor, onPick, onClose]);

  if (!hits.length) {
    return <div className="nb-picker nb-picker-empty">No matches — keep typing or Esc</div>;
  }
  return (
    <div className="nb-picker" role="listbox">
      {hits.map((h, i) => (
        <button
          key={`${h.kind}:${h.refId}`}
          className={`nb-picker-row${i === cursor ? " on" : ""}`}
          role="option"
          aria-selected={i === cursor}
          onMouseEnter={() => setCursor(i)}
          onClick={() => onPick(h)}
        >
          {h.thumb ? (
            <img src={h.thumb} alt="" className="nb-thumb" />
          ) : (
            <span className="nb-thumb nb-mono">{monogram(h.name)}</span>
          )}
          <span className="nb-picker-name">{h.name}</span>
          <span className="nb-picker-kind">{KIND_LABEL[h.kind]}</span>
        </button>
      ))}
    </div>
  );
}
