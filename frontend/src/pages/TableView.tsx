import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListOrdered, Map as MapIcon } from "lucide-react";

import { api, apiBase } from "../api/client";
import type { TableProjection } from "../api/types";
import RemotePanel from "../components/table/RemotePanel";
import { tableApi } from "../api/table";
import MapCanvas from "../components/table/MapCanvas";
import JoinQr from "../components/table/JoinQr";
import TurnSplash, { type SplashSubject } from "../components/table/TurnSplash";
import MapReveal from "../components/table/MapReveal";
import DiceCinematic, { type TableRoll } from "../components/table/DiceCinematic";
import TableTracker, { TurnCorner } from "../components/table/TableTracker";
import { ROLL_TUMBLE_MS } from "../components/table/diceTiming";
import { rollLabel } from "../components/table/rollText";
import { useMapReveal } from "../hooks/useMapReveal";
import { usePlayIdentity } from "../hooks/usePlayIdentity";

/**
 * TableView — what the TV or projector shows (Plan 42). A capability URL
 * (/table/:sessionId, no auth, no DM chrome). It polls the player-safe
 * projection, subscribes to the table SSE topic for live pushes, crossfades
 * between scenes, and floats a cinematic title card. No foe HP or DM notes
 * ever reach this component.
 *
 * Plan 128 — the turn order comes first. With no battle map staged (most
 * tables) the screen is the big turn order: the round, whose turn it is, the
 * party's HP and the last roll, or the join QR before the fight. With a map
 * staged the map shows, with the order in a corner during a fight, and a
 * Map / Turn order switch in the bottom-left corner (or the T key, or
 * `?view=order`). Rolls reach the corner chip and the roll card only after
 * the die has landed, so nothing gives the result away mid-tumble.
 *
 * Plan 83 — with ``?pc=<id>`` it is also the remote-player window: a side panel
 * with the initiative order, the party's HP and a roll log, and the player's
 * own token becomes draggable (the server refuses any other token).
 */

type TvView = "map" | "order";

const CSS = `
.qtv-switch { position: fixed; left: 66px; bottom: 14px; z-index: 60; display: inline-flex;
  border: 1px solid var(--border2); border-radius: 999px; background: rgba(17,21,19,0.82); overflow: hidden;
  opacity: 0.55; transition: opacity 0.15s; }
.qtv-switch:hover, .qtv-switch:focus-within { opacity: 1; }
.qtv-switch button { min-height: 44px; padding: 0 14px; border: 0; background: transparent; color: var(--text2);
  font-family: var(--font-ui); font-size: 0.95rem; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.qtv-switch button[aria-pressed="true"] { background: var(--surface3); color: var(--text); }
.qtv-chip { position: fixed; right: 18px; bottom: 18px; z-index: 25; display: flex; align-items: baseline; gap: 0.6em;
  padding: 0.35em 0.9em; border-radius: 999px; border: 1px solid var(--accent-line); background: rgba(17,21,19,0.92);
  color: var(--text); font-family: var(--font-ui); font-size: clamp(1.125rem, 2.8vh, 1.8rem); max-width: 60vw;
  animation: qtvChipIn 0.35s ease; }
.qtv-chip-who { font-family: var(--font-story); font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qtv-chip-what { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qtv-chip-total { font-family: var(--font-mono); font-weight: 600; font-size: 1.5em; color: var(--accent-text); font-variant-numeric: tabular-nums; }
@keyframes qtvChipIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@media (max-width: 640px) { .qtv-chip { font-size: 1rem; right: 12px; bottom: 12px; max-width: calc(100vw - 24px); } }
`;

export default function TableView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [params] = useSearchParams();
  const pcId = params.get("pc");
  const remote = !!pcId;
  // SEC-002 — `?pc=` is the player's link key; their token is matched by id.
  const myPcId = usePlayIdentity(pcId)?.pc_id ?? null;
  // A player's phone starts with the map in view; a laptop has room for the panel.
  const [panelOpen, setPanelOpen] = useState(() => !window.matchMedia("(max-width: 640px)").matches);
  // Plan 128 — the room TV: map or turn order, when a map is staged at all.
  // `?panel=1` (the old way to ask for the order) still opens the order.
  const [view, setView] = useState<TvView>(() =>
    params.get("view") === "order" || params.get("panel") === "1" ? "order" : "map",
  );
  const [rollLog, setRollLog] = useState<TableRoll[]>([]);
  const seedRef = useRef<TableRoll[]>([]);
  const qc = useQueryClient();
  const [ping, setPing] = useState<{ x: number; y: number; key: number } | null>(null);
  const pingCounter = useRef(0);
  // Combat cinema (Plan 61): floating numbers + the turn splash.
  type FxEntry = { id: string; refId: string; kind: "damage" | "heal" | "ko"; amount: number | null };
  const [fx, setFx] = useState<FxEntry[]>([]);
  const fxCounter = useRef(0);
  const [splash, setSplash] = useState<SplashSubject | null>(null);
  const splashCounter = useRef(0);
  const [tableRoll, setTableRoll] = useState<TableRoll | null>(null);
  const rollCounter = useRef(0);
  const lastActive = useRef<string | null>(null);

  const { data, refetch, isLoading, isError, error } = useQuery({
    queryKey: ["table-projection", sessionId],
    queryFn: () => tableApi.getProjection(sessionId as string),
    enabled: !!sessionId,
    refetchOnWindowFocus: true,
  });

  // Keep refetch in a ref so the SSE effect never tears down on re-render.
  const refetchRef = useRef(refetch);
  useEffect(() => {
    refetchRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (!sessionId) return;
    const base = apiBase();
    const es = new EventSource(`${base}/stream/table/${sessionId}`);
    const timers = new Set<number>();
    const onUpdate = () => {
      void refetchRef.current();
    };
    const onPing = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { x: number; y: number };
        pingCounter.current += 1;
        setPing({ x: d.x, y: d.y, key: pingCounter.current });
      } catch {
        /* ignore malformed */
      }
    };
    const onFx = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as { kind?: string; ref_id?: string; amount?: number };
        if (!d.kind || !d.ref_id || d.kind === "ko") return;
        fxCounter.current += 1;
        const id = `fx-${fxCounter.current}`;
        const entry = {
          id,
          refId: d.ref_id,
          kind: d.kind as "damage" | "heal",
          amount: typeof d.amount === "number" ? d.amount : null,
        };
        setFx((cur) => [...cur, entry]);
        window.setTimeout(() => setFx((cur) => cur.filter((q) => q.id !== id)), 1500);
      } catch {
        /* ignore malformed */
      }
    };
    const onRoll = (e: MessageEvent) => {
      try {
        const d = JSON.parse(e.data) as {
          roller?: string; die?: string; rolls?: number[]; modifier?: number; total?: number; label?: string;
        };
        if (!d.die || !Array.isArray(d.rolls) || typeof d.total !== "number") return;
        rollCounter.current += 1;
        const roll: TableRoll = {
          key: `roll-${rollCounter.current}`,
          roller: d.roller || "Someone",
          die: d.die,
          rolls: d.rolls,
          modifier: d.modifier ?? 0,
          total: d.total,
          label: d.label ?? null,
        };
        setTableRoll(roll);
        // Plan 128 — the log (corner chip, roll card, panel) learns the result
        // when the die lands, not while it is still tumbling.
        const t = window.setTimeout(() => {
          timers.delete(t);
          setRollLog((cur) => [roll, ...(cur.length ? cur : seedRef.current)].slice(0, 14));
        }, ROLL_TUMBLE_MS);
        timers.add(t);
      } catch {
        /* ignore malformed */
      }
    };
    es.addEventListener("table.roll", onRoll as EventListener);
    es.addEventListener("table.updated", onUpdate as EventListener);
    es.addEventListener("table.fx", onFx as EventListener);
    es.addEventListener("table.ping", onPing as EventListener);
    es.addEventListener("message", onUpdate as EventListener);
    return () => {
      es.close();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [sessionId]);

  // Plan 128 — T switches the room TV between the map and the turn order.
  useEffect(() => {
    if (remote) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "t" && e.key !== "T") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      setView((v) => (v === "order" ? "map" : "order"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [remote]);

  // A PC's turn opens with a splash (Plan 61).
  useEffect(() => {
    const ref = data?.active_token_ref ?? null;
    if (ref === lastActive.current) return;
    lastActive.current = ref;
    if (!ref) return;
    const token = data?.tokens.find((t) => (t.ref_id ?? t.id) === ref);
    if (!token || token.kind !== "pc") return;
    splashCounter.current += 1;
    setSplash({
      key: `${ref}-${splashCounter.current}`,
      name: token.label || "Your turn",
      imageUrl: token.image_url ?? null,
    });
  }, [data]);

  const mapId = data?.map?.id ?? "none";
  const title = data?.title ?? "";

  // Plan 83 — the player's own token: drag locally, commit on release.
  const myToken = myPcId ? (data?.tokens.find((t) => t.ref_id === myPcId) ?? null) : null;
  function moveMine(id: string, x: number, y: number) {
    if (!myToken || id !== myToken.id) return;
    qc.setQueryData<TableProjection>(["table-projection", sessionId], (prev) =>
      prev ? { ...prev, tokens: prev.tokens.map((t) => (t.id === id ? { ...t, x, y } : t)) } : prev,
    );
  }
  function dropMine(id: string, x: number, y: number) {
    if (!myToken || !pcId || id !== myToken.id) return;
    void api
      .post(`/play/${pcId}/table/move`, { session_id: sessionId, x, y })
      .catch(() => void refetchRef.current());
  }
  // Plan 85 — a refreshed or late window starts with the last rolls. Derived,
  // not copied into state: live rolls stack on top of these once they land.
  const seeded: TableRoll[] = [...(data?.recent_rolls ?? [])].reverse().map((r, i) => ({
    key: `seed-${i}`,
    roller: String(r.roller ?? "Someone"),
    die: String(r.die ?? "d20"),
    rolls: Array.isArray(r.rolls) ? (r.rolls as number[]) : [],
    modifier: Number(r.modifier ?? 0),
    total: Number(r.total ?? 0),
    label: (r.label as string | undefined) ?? null,
  }));
  useEffect(() => {
    seedRef.current = seeded;
  });
  const rolls = rollLog.length ? rollLog : seeded;
  const lastRoll = rolls[0] ?? null;

  // Plan 64 — staging a new map mid-session plays the scene card.
  // The map's own name rides the same payload object as the art, so it
  // can never lag the map change the way the scene title can.
  const reveal = useMapReveal(
    data ? (data.map?.id ?? null) : undefined,
    data?.map?.image_url,
    data?.map?.name || data?.title,
    undefined,
    data?.map?.video_url,
  );

  const hasMap = !!data?.map;
  // The big turn order: always without a map; with one, when the TV asks for it.
  const tracker = !!data && (!hasMap || (!remote && view === "order"));
  const fighting = !!data?.combat_running && (data?.initiative.length ?? 0) > 0;

  return (
    <div
      style={
        {
          position: "fixed",
          inset: 0,
          background: "radial-gradient(120% 120% at 50% 40%, #0b0b12 0%, #050509 70%, #020205 100%)",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          "--tv-head": "13vh",
        } as React.CSSProperties
      }
    >
      <style>{CSS}</style>
      {isLoading && <div className="ql-table-msg">Setting the scene…</div>}
      {isError && (
        <div className="ql-table-msg">
          {String(error?.message ?? "").toLowerCase().includes("not found")
            ? "This table link isn’t active any more. Ask your DM for a fresh one."
            : "The DM’s link is quiet. Waiting for the table to reconnect…"}
        </div>
      )}

      {data && tracker && (
        <TableTracker projection={data} rolls={rolls} meRef={myPcId} showJoin={!remote} />
      )}

      {data && !tracker && (
        <div key={mapId} className="ql-scene-fade" style={{ width: "100%", height: "100%" }}>
          <MapCanvas
            map={data.map}
            fogOn={data.fog_on}
            revealedRegions={data.revealed_regions}
            brushReveals={data.brush_reveals}
            tokens={data.tokens}
            darkness={data.darkness}
            activeTokenRef={data.active_token_ref}
            defeatedRefs={data.defeated_refs}
            ping={ping}
            fx={fx}
            editable={!!myToken}
            onTokenMove={moveMine}
            onTokenDragEnd={dropMine}
            tvLabels
          />
        </div>
      )}

      {data && !tracker && !remote && <TurnCorner projection={data} />}

      {data && !tracker && remote && (
        <RemotePanel
          projection={data}
          rolls={rolls}
          pcId={myPcId}
          open={panelOpen}
          onToggle={() => setPanelOpen((v) => !v)}
          canDrag={!!myToken}
        />
      )}
      {lastRoll && !tracker && !(remote && panelOpen) && (
        <div
          className="qtv-chip"
          key={lastRoll.key}
          title={`${lastRoll.rolls.join(" + ")}${lastRoll.modifier ? ` ${lastRoll.modifier > 0 ? "+" : "−"} ${Math.abs(lastRoll.modifier)}` : ""}`}
        >
          <span className="qtv-chip-who">{lastRoll.roller}</span>
          <span className="qtv-chip-what">{rollLabel(lastRoll.label) ?? lastRoll.die}</span>
          <span className="qtv-chip-total">{lastRoll.total}</span>
        </div>
      )}

      {!tracker && <TurnSplash subject={splash} />}
      <MapReveal subject={reveal} />
      <DiceCinematic
        roll={tableRoll}
        dock={tracker ? "side" : "top"}
        clearRight={fighting && !tracker && !remote}
      />
      {data?.campaign_id && !remote && (
        <JoinQr
          campaignId={data.campaign_id}
          forcedOpen={data.join_qr_on}
          hideButton={tracker && !fighting}
        />
      )}
      {data && hasMap && !remote && (
        <div className="qtv-switch" role="group" aria-label="What the screen shows">
          <button
            type="button"
            aria-pressed={view === "map"}
            onClick={() => setView("map")}
            title="The battle map, with the turn order in a corner during a fight (T)"
          >
            <MapIcon size={18} aria-hidden="true" /> Map
          </button>
          <button
            type="button"
            aria-pressed={view === "order"}
            onClick={() => setView("order")}
            title="The turn order and rolls, big (T)"
          >
            <ListOrdered size={18} aria-hidden="true" /> Turn order
          </button>
        </div>
      )}

      {title && !tracker && (
        <div key={title} className="ql-title-card" aria-live="polite">
          <div className="ql-title-rule" />
          <div className="ql-title-text">{title}</div>
          <div className="ql-title-rule" />
        </div>
      )}
    </div>
  );
}
