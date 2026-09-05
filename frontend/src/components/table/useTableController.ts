import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import { tableApi } from "../../api/table";
import type { BattleMap, PlayerCharacter, TableStateRead, TableToken } from "../../api/types";

export type CanvasMode = "ping" | "place";

/**
 * useTableController — one brain for every DM surface that drives the projected
 * table (Plan 75). The Table console modal and the HUD's inline 🎮 Live pane both
 * read the same table state and share the same optimistic-PATCH helpers, so a
 * token dragged in one is exactly where you left it in the other. Every write
 * also nudges the HUD / 3D Board copies of the state so their "● live" markers
 * stay honest.
 */
export function useTableController(sessionId: string, campaignId: string, party: PlayerCharacter[]) {
  const qc = useQueryClient();
  const key = ["table-state", sessionId];
  const [mode, setMode] = useState<CanvasMode>("ping");
  const darkTimer = useRef<number | undefined>(undefined);
  const idc = useRef(0);
  // Time-salted so a reload never re-mints an id already on the board.
  const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(idc.current += 1)}`;

  const { data: state } = useQuery({
    queryKey: key,
    queryFn: () => tableApi.getState(sessionId),
  });
  const { data: maps = [] } = useQuery({
    queryKey: ["battle-maps", campaignId],
    queryFn: () => tableApi.listMaps(campaignId),
  });
  const { data: combat } = useQuery({
    queryKey: ["board-combat", sessionId],
    queryFn: () => sessionsApi.getCombatState(sessionId),
  });

  const activeMap: BattleMap | null = maps.find((m) => m.id === state?.active_map_id) ?? null;

  function syncSiblings() {
    void qc.invalidateQueries({ queryKey: ["hud-table", sessionId] });
    void qc.invalidateQueries({ queryKey: ["board-table", sessionId] });
  }
  function applyLocal(partial: Partial<TableStateRead>) {
    qc.setQueryData<TableStateRead>(key, (prev) => (prev ? { ...prev, ...partial } : prev));
  }
  function patchNow(partial: Partial<TableStateRead>) {
    applyLocal(partial);
    void tableApi.updateState(sessionId, partial).then(syncSiblings);
  }
  function setDarknessLive(v: number) {
    applyLocal({ darkness: v });
    window.clearTimeout(darkTimer.current);
    darkTimer.current = window.setTimeout(
      () => void tableApi.updateState(sessionId, { darkness: v }).then(syncSiblings),
      180,
    );
  }

  function toggleRegion(id: string) {
    const cur = state?.revealed_region_ids ?? [];
    patchNow({
      revealed_region_ids: cur.includes(id) ? cur.filter((r) => r !== id) : [...cur, id],
    });
  }

  function addPartyTokens() {
    if (!activeMap || !state) return;
    const existingRefs = new Set(state.tokens.map((t) => t.ref_id).filter(Boolean));
    const fresh: TableToken[] = party
      .filter((pc) => !existingRefs.has(pc.id))
      .map((pc, i) => ({
        id: `pc-${pc.id}`,
        kind: "pc" as const,
        ref_id: pc.id,
        label: pc.character_name,
        image_url: pc.portrait_url ?? null,
        x: activeMap.width * (0.28 + 0.11 * i),
        y: activeMap.height * 0.72,
        size: 1,
      }));
    if (fresh.length) patchNow({ tokens: [...state.tokens, ...fresh] });
  }

  function addToken(kind: "monster" | "custom") {
    if (!activeMap || !state) return;
    let label = "Marker";
    if (kind === "monster") {
      const name = window.prompt("Foe name (the 3D board's 🧍 Minifig uses it):", "Wolf");
      if (!name) return;
      label = name.slice(0, 60);
    }
    const t: TableToken = {
      id: genId(kind),
      kind,
      ref_id: null,
      label,
      image_url: null,
      x: activeMap.width * 0.5,
      y: activeMap.height * 0.4,
      size: 1,
    };
    patchNow({ tokens: [...state.tokens, t] });
  }

  function addFoesFromCombat() {
    if (!activeMap || !state || !combat) return;
    const existingRefs = new Set(state.tokens.map((t) => t.ref_id).filter(Boolean));
    // ref_id = SessionCombatant.id so HP bars + turn glow track monsters too (Plan 44).
    const fresh: TableToken[] = combat.combatants
      .filter((c) => !c.character_id && !existingRefs.has(c.id))
      .map((c, i) => ({
        id: `foe-${c.id}`,
        kind: "monster" as const,
        ref_id: c.id,
        label: c.name,
        image_url: null,
        x: activeMap.width * (0.3 + 0.1 * (i % 5)),
        y: activeMap.height * (0.22 + 0.12 * Math.floor(i / 5)),
        size: 1,
      }));
    if (fresh.length) patchNow({ tokens: [...state.tokens, ...fresh] });
  }

  function removeToken(id: string) {
    if (!state) return;
    patchNow({ tokens: state.tokens.filter((t) => t.id !== id) });
  }
  function moveTokenLocal(id: string, x: number, y: number) {
    applyLocal({ tokens: (state?.tokens ?? []).map((t) => (t.id === id ? { ...t, x, y } : t)) });
  }
  function commitTokens() {
    if (state) void tableApi.updateState(sessionId, { tokens: state.tokens }).then(syncSiblings);
  }

  function onCanvasDown(x: number, y: number) {
    if (mode === "ping") {
      void tableApi.ping(sessionId, x, y);
    } else if (mode === "place") {
      if (!state) return;
      const t: TableToken = {
        id: genId("mk"),
        kind: "custom",
        ref_id: null,
        label: "Marker",
        image_url: null,
        x,
        y,
        size: 1,
      };
      patchNow({ tokens: [...state.tokens, t] });
    }
  }

  // Plan 72 — one click flips a whole hostile faction to neutral.
  const groups = Array.from(
    new Set(
      (state?.tokens ?? [])
        .filter((t) => t.kind === "monster" && t.group)
        .map((t) => t.group as string),
    ),
  );
  function standDown(group: string) {
    void tableApi.standDown(sessionId, group).then(() => {
      void qc.invalidateQueries({ queryKey: key });
      syncSiblings();
    });
  }

  // Whose turn it is, expressed as the token ref the canvas glows.
  const activeCombatant =
    combat?.combatants.find((c) => c.id === combat.active_combatant_id) ?? null;
  const activeTokenRef = activeCombatant ? (activeCombatant.character_id ?? activeCombatant.id) : null;

  const revealedPolygons: number[][][] = activeMap
    ? (state?.revealed_region_ids ?? [])
        .map((id) => activeMap.regions.find((r) => r.id === id)?.points)
        .filter((p): p is number[][] => Array.isArray(p))
    : [];

  return {
    state,
    maps,
    combat,
    activeMap,
    mode,
    setMode,
    patchNow,
    setDarknessLive,
    toggleRegion,
    addPartyTokens,
    addToken,
    addFoesFromCombat,
    removeToken,
    moveTokenLocal,
    commitTokens,
    onCanvasDown,
    groups,
    standDown,
    activeTokenRef,
    revealedPolygons,
  };
}
