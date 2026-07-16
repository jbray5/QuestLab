import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { adventuresApi } from "../api/adventures";
import { charactersApi } from "../api/characters";
import { sessionsApi } from "../api/sessions";
import { tableApi } from "../api/table";
import type { BattleMap, SessionCombatant, TableStateRead, TableToken } from "../api/types";
import Board3D, { type GridKind, type StrikeFx } from "../components/board/Board3D";
import BoardTracker from "../components/board/BoardTracker";
import { useEventStream } from "../hooks/useEventStream";

/**
 * BoardView — the DM 3D tabletop page (Plan 44), /sessions/:sessionId/board.
 *
 * DM-auth, screen-shared. 3D board left, live combat tracker right. Token
 * positions live in TableState.tokens (the same store the 2D console PATCHes),
 * HP flows through the combat tracker — the board visualizes state, it never
 * owns it.
 */

const FLOAT_CSS = `
.board-dmg-float {
  position: absolute;
  top: -38px;
  left: 50%;
  transform: translateX(-50%);
  font-family: Cinzel, serif;
  font-size: 30px;
  font-weight: 800;
  color: #ff6b57;
  text-shadow: 0 2px 6px rgba(0,0,0,0.9);
  animation: board-dmg-rise 1.4s ease-out forwards;
  pointer-events: none;
  white-space: nowrap;
}
@keyframes board-dmg-rise {
  0%   { opacity: 0; transform: translate(-50%, 10px) scale(0.7); }
  15%  { opacity: 1; transform: translate(-50%, 0) scale(1.15); }
  30%  { transform: translate(-50%, -6px) scale(1); }
  100% { opacity: 0; transform: translate(-50%, -46px) scale(0.95); }
}
`;

export default function BoardView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const qc = useQueryClient();

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId!),
    enabled: !!sessionId,
  });
  const { data: adventure } = useQuery({
    queryKey: ["adventure", session?.adventure_id],
    queryFn: () => adventuresApi.get(session!.adventure_id),
    enabled: !!session?.adventure_id,
  });
  const campaignId = adventure?.campaign_id;

  const stateKey = ["table-state", sessionId];
  const { data: state } = useQuery({
    queryKey: stateKey,
    queryFn: () => tableApi.getState(sessionId!),
    enabled: !!sessionId,
  });
  const { data: maps = [] } = useQuery({
    queryKey: ["battle-maps", campaignId],
    queryFn: () => tableApi.listMaps(campaignId!),
    enabled: !!campaignId,
  });
  const { data: combat } = useQuery({
    queryKey: ["board-combat", sessionId],
    queryFn: () => sessionsApi.getCombatState(sessionId!),
    enabled: !!sessionId,
  });
  const { data: allChars = [] } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  useEventStream("table", sessionId, () => {
    void qc.invalidateQueries({ queryKey: stateKey });
    void qc.invalidateQueries({ queryKey: ["board-combat", sessionId] });
  });

  const activeMap: BattleMap | null = maps.find((m) => m.id === state?.active_map_id) ?? null;

  const party = useMemo(() => {
    const attending = new Set(session?.attending_pc_ids ?? []);
    return attending.size > 0 ? allChars.filter((c) => attending.has(c.id)) : allChars;
  }, [session, allChars]);

  const combatantByRef = useMemo(() => {
    const m = new Map<string, SessionCombatant>();
    for (const c of combat?.combatants ?? []) {
      m.set(c.id, c);
      if (c.character_id) m.set(c.character_id, c);
    }
    return m;
  }, [combat]);

  const activeRef = useMemo(() => {
    if (!combat || combat.combat_state !== "running" || !combat.active_combatant_id) return null;
    const c = combat.combatants.find((x) => x.id === combat.active_combatant_id);
    return c ? (c.character_id ?? c.id) : null;
  }, [combat]);

  const [gridKind, setGridKind] = useState<GridKind | null>(null);
  const effectiveGrid: GridKind = gridKind ?? (activeMap?.grid_size ? "hex" : "off");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [attackArmed, setAttackArmed] = useState(false);
  const [pendingAttack, setPendingAttack] = useState<{ attackerId: string; targetId: string } | null>(null);
  const [dmgDraft, setDmgDraft] = useState("");
  const [strike, setStrike] = useState<StrikeFx | null>(null);
  const seq = useRef(0);
  const strikeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape") {
        setSelectedId(null);
        setAttackArmed(false);
        setPendingAttack(null);
      }
      if ((e.key === "a" || e.key === "A") && selectedId) setAttackArmed((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  function applyLocal(partial: Partial<TableStateRead>) {
    qc.setQueryData<TableStateRead>(stateKey, (prev) => (prev ? { ...prev, ...partial } : prev));
  }
  function patchTokens(tokens: TableToken[]) {
    applyLocal({ tokens });
    void tableApi.updateState(sessionId!, { tokens });
  }

  function commitMove(id: string, x: number, y: number) {
    patchTokens((state?.tokens ?? []).map((t) => (t.id === id ? { ...t, x, y } : t)));
  }

  function addPartyTokens() {
    if (!activeMap || !state) return;
    const existing = new Set(state.tokens.map((t) => t.ref_id).filter(Boolean));
    const fresh: TableToken[] = party
      .filter((pc) => !existing.has(pc.id))
      .map((pc, i) => ({
        id: `pc-${pc.id}`,
        kind: "pc" as const,
        ref_id: pc.id,
        label: pc.character_name,
        image_url: pc.portrait_url ?? null,
        x: activeMap.width * (0.3 + 0.1 * i),
        y: activeMap.height * 0.75,
        size: 1,
      }));
    if (fresh.length) patchTokens([...state.tokens, ...fresh]);
  }

  function addFoesFromCombat() {
    if (!activeMap || !state || !combat) return;
    const existing = new Set(state.tokens.map((t) => t.ref_id).filter(Boolean));
    const fresh: TableToken[] = combat.combatants
      .filter((c) => !c.character_id && !existing.has(c.id))
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
    if (fresh.length) patchTokens([...state.tokens, ...fresh]);
  }

  function fireStrike(fx: Omit<StrikeFx, "seq">) {
    seq.current += 1;
    setStrike({ ...fx, seq: seq.current });
    window.clearTimeout(strikeTimer.current);
    strikeTimer.current = window.setTimeout(() => setStrike(null), 1600);
  }

  async function applyDamage(miss: boolean) {
    if (!pendingAttack) return;
    const { attackerId, targetId } = pendingAttack;
    setPendingAttack(null);
    setAttackArmed(false);
    if (miss) {
      fireStrike({ attackerId, targetId, amount: "miss" });
      return;
    }
    const amount = Math.max(0, Math.floor(Number(dmgDraft) || 0));
    if (amount <= 0) return;
    fireStrike({ attackerId, targetId, amount });
    const target = state?.tokens.find((t) => t.id === targetId);
    const comb = target?.ref_id ? combatantByRef.get(target.ref_id) : null;
    if (comb) {
      const hp = Math.max(0, comb.hp_current - amount);
      await sessionsApi.patchCombatant(sessionId!, comb.id, {
        hp_current: hp,
        ...(hp === 0 && comb.type !== "pc" ? { defeated: true } : {}),
      });
      void qc.invalidateQueries({ queryKey: ["board-combat", sessionId] });
    }
  }

  const targetToken = pendingAttack ? state?.tokens.find((t) => t.id === pendingAttack.targetId) : null;
  const selectedToken = selectedId ? state?.tokens.find((t) => t.id === selectedId) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#06060b", display: "flex", flexDirection: "column" }}>
      <style>{FLOAT_CSS}</style>

      {/* header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.8rem",
          padding: "0.4rem 0.9rem",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface, #101016)",
          flexWrap: "wrap",
        }}
      >
        <Link to={`/sessions/${sessionId}/hud`} style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
          ← HUD
        </Link>
        <strong style={{ fontFamily: "Cinzel, serif", color: "var(--gold)", fontSize: "0.95rem" }}>
          🎲 3D Board{session ? ` — ${session.title}` : ""}
        </strong>
        <select
          value={state?.active_map_id ?? ""}
          onChange={(e) => {
            applyLocal({ active_map_id: e.target.value || null });
            void tableApi.updateState(sessionId!, { active_map_id: e.target.value || null });
          }}
          style={{ fontSize: "0.78rem" }}
        >
          <option value="">— pick a map —</option>
          {maps.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <div style={{ display: "flex", gap: 4 }}>
          {(["hex", "square", "off"] as const).map((k) => (
            <button
              key={k}
              className={effectiveGrid === k ? "btn" : "btn btn-ghost"}
              style={{ fontSize: "0.72rem", padding: "0.15rem 0.5rem" }}
              onClick={() => setGridKind(k)}
            >
              {k === "hex" ? "⬡ Hex" : k === "square" ? "▦ Square" : "Grid off"}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "var(--muted)" }}>
          T top · Y tilt · click token → click ground to move · A arm attack · Esc deselect
        </span>
      </header>

      {/* body */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {activeMap ? (
            <Board3D
              map={activeMap}
              tokens={state?.tokens ?? []}
              combatantByRef={combatantByRef}
              activeRef={activeRef}
              gridKind={effectiveGrid}
              selectedId={selectedId}
              attackArmed={attackArmed}
              strike={strike}
              onSelect={(id) => {
                setSelectedId(id);
                if (!id) setAttackArmed(false);
              }}
              onMoveCommit={commitMove}
              onPickTarget={(attackerId, targetId) => {
                setPendingAttack({ attackerId, targetId });
                setDmgDraft("");
              }}
            />
          ) : (
            <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.9rem", textAlign: "center", padding: "2rem" }}>
              <div>
                No active map. Pick one in the header — or upload maps under
                <br />
                Campaign → Battle Maps first.
              </div>
            </div>
          )}

          {selectedToken && (
            <div style={{ position: "absolute", left: 12, bottom: 12, background: "rgba(6,6,12,0.8)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.3rem 0.7rem", fontSize: "0.75rem", color: "var(--text)" }}>
              Selected: <strong>{selectedToken.label}</strong>
              {attackArmed ? " — ⚔ ARMED: click a target" : " — click ground to move, A to attack"}
            </div>
          )}

          {/* damage prompt */}
          {pendingAttack && targetToken && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(3,3,7,0.45)" }}>
              <div style={{ background: "var(--surface, #16161c)", border: "1px solid var(--border)", borderRadius: 12, padding: "1rem 1.2rem", display: "flex", flexDirection: "column", gap: "0.7rem", minWidth: 260 }}>
                <strong style={{ fontFamily: "Cinzel, serif", color: "var(--gold)", fontSize: "0.9rem" }}>
                  ⚔ Damage to {targetToken.label}
                </strong>
                <input
                  autoFocus
                  type="number"
                  min={0}
                  value={dmgDraft}
                  onChange={(e) => setDmgDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void applyDamage(false);
                    if (e.key === "Escape") setPendingAttack(null);
                  }}
                  placeholder="damage"
                  style={{ fontSize: "1.1rem", textAlign: "center" }}
                />
                <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                  <button className="btn" onClick={() => void applyDamage(false)}>
                    Hit ⚔
                  </button>
                  <button className="btn btn-ghost" onClick={() => void applyDamage(true)}>
                    Miss
                  </button>
                  <button className="btn btn-ghost" onClick={() => setPendingAttack(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* sidebar */}
        <aside
          style={{
            width: 320,
            borderLeft: "1px solid var(--border)",
            background: "var(--surface, #101016)",
            padding: "0.8rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.8rem",
            minHeight: 0,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button className="btn btn-ghost" style={{ fontSize: "0.72rem" }} onClick={addPartyTokens} disabled={!activeMap}>
              + Party
            </button>
            <button className="btn btn-ghost" style={{ fontSize: "0.72rem" }} onClick={addFoesFromCombat} disabled={!activeMap || !combat?.combatants?.length}>
              + Foes (from combat)
            </button>
          </div>
          <BoardTracker sessionId={sessionId!} combat={combat} />
        </aside>
      </div>
    </div>
  );
}
