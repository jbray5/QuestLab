import { useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tableApi } from "../api/table";
import type { BattleMap, FogRegion } from "../api/types";

/**
 * BattleMaps — the campaign's battle-map library + fog-region editor (Plan 42).
 *
 * The DM uploads Czepeku/Roll20 exports, sets a grid, and (optionally) paints
 * named fog regions at prep time. At the table those regions become one-tap
 * reveals, so nothing has to be drawn live while narrating on camera.
 */

type Tool = "rect" | "poly";

function readDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error("Could not read image dimensions"));
    img.src = URL.createObjectURL(file);
  });
}

function toImageCoords(svg: SVGSVGElement, clientX: number, clientY: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return { x: Math.round(p.x), y: Math.round(p.y) };
}

export default function BattleMaps() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: maps = [] } = useQuery({
    queryKey: ["battle-maps", campaignId],
    queryFn: () => tableApi.listMaps(campaignId as string),
    enabled: !!campaignId,
  });

  const selected = maps.find((m) => m.id === selectedId) ?? null;

  const createMut = useMutation({
    mutationFn: (payload: {
      name: string;
      image_url: string;
      width: number;
      height: number;
    }) => tableApi.createMap(campaignId as string, payload),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["battle-maps", campaignId] });
      setSelectedId(m.id);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (mapId: string) => tableApi.deleteMap(mapId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["battle-maps", campaignId] });
      setSelectedId(null);
    },
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploadError("");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const [{ w, h }, url] = await Promise.all([readDims(file), tableApi.uploadMap(file)]);
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
        await createMut.mutateAsync({ name, image_url: url, width: w, height: h });
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: 1400, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: "1rem" }}>
        <h1 style={{ fontFamily: "Cinzel Decorative, serif", color: "var(--gold)", margin: 0 }}>
          Battle Maps
        </h1>
        <div
          onDrop={(e) => {
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
          style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
        >
          {uploading && <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Uploading…</span>}
          <button className="btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
            ＋ Import maps
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      </div>
      {uploadError && <p style={{ color: "var(--danger, #ef5350)" }}>{uploadError}</p>}

      {!selected ? (
        <MapGrid maps={maps} onSelect={setSelectedId} onImport={() => fileRef.current?.click()} />
      ) : (
        <MapEditor
          map={selected}
          onBack={() => setSelectedId(null)}
          onDelete={() => deleteMut.mutate(selected.id)}
          onSaved={() => void qc.invalidateQueries({ queryKey: ["battle-maps", campaignId] })}
        />
      )}
    </div>
  );
}

function MapGrid({
  maps,
  onSelect,
  onImport,
}: {
  maps: BattleMap[];
  onSelect: (id: string) => void;
  onImport: () => void;
}) {
  if (maps.length === 0) {
    return (
      <div
        onClick={onImport}
        className="card"
        style={{
          padding: "3rem",
          textAlign: "center",
          color: "var(--muted)",
          cursor: "pointer",
          border: "2px dashed var(--border)",
          borderRadius: 12,
        }}
      >
        <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🗺️</div>
        Drop your Czepeku / Roll20 map exports here, or click to import.
      </div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "1rem",
      }}
    >
      {maps.map((m) => (
        <button
          key={m.id}
          className="card"
          onClick={() => onSelect(m.id)}
          style={{
            padding: 0,
            overflow: "hidden",
            borderRadius: 12,
            cursor: "pointer",
            textAlign: "left",
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ aspectRatio: "16 / 10", background: "#0a0a10", overflow: "hidden" }}>
            <img
              src={m.image_url}
              alt={m.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
          <div style={{ padding: "0.6rem 0.8rem" }}>
            <div style={{ fontWeight: 700, color: "var(--text)" }}>{m.name}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
              {m.width}×{m.height}
              {m.grid_size ? ` · ${m.grid_size}px grid` : " · gridless"}
              {m.regions.length ? ` · ${m.regions.length} region${m.regions.length > 1 ? "s" : ""}` : ""}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function MapEditor({
  map,
  onBack,
  onDelete,
  onSaved,
}: {
  map: BattleMap;
  onBack: () => void;
  onDelete: () => void;
  onSaved: () => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [name, setName] = useState(map.name);
  const [grid, setGrid] = useState<string>(map.grid_size ? String(map.grid_size) : "");
  const [regions, setRegions] = useState<FogRegion[]>(map.regions ?? []);
  const [tool, setTool] = useState<Tool>("rect");
  const [draftPoly, setDraftPoly] = useState<number[][]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragNow, setDragNow] = useState<{ x: number; y: number } | null>(null);
  const idc = useRef(0);

  const saveMut = useMutation({
    mutationFn: () =>
      tableApi.updateMap(map.id, {
        name: name.trim() || map.name,
        grid_size: grid ? Math.max(8, parseInt(grid, 10)) : null,
        regions,
      }),
    onSuccess: onSaved,
  });

  const nextId = () => {
    idc.current += 1;
    return `r${Date.now().toString(36)}${idc.current}`;
  };

  function addRegion(points: number[][]) {
    if (points.length < 3) return;
    setRegions((r) => [...r, { id: nextId(), name: `Region ${r.length + 1}`, points }]);
  }

  function onDown(e: React.PointerEvent) {
    if (!svgRef.current) return;
    const p = toImageCoords(svgRef.current, e.clientX, e.clientY);
    if (tool === "rect") {
      setDragStart(p);
      setDragNow(p);
    } else {
      setDraftPoly((d) => [...d, [p.x, p.y]]);
    }
  }
  function onMove(e: React.PointerEvent) {
    if (tool === "rect" && dragStart && svgRef.current) {
      setDragNow(toImageCoords(svgRef.current, e.clientX, e.clientY));
    }
  }
  function onUp() {
    if (tool === "rect" && dragStart && dragNow) {
      const x1 = Math.min(dragStart.x, dragNow.x);
      const y1 = Math.min(dragStart.y, dragNow.y);
      const x2 = Math.max(dragStart.x, dragNow.x);
      const y2 = Math.max(dragStart.y, dragNow.y);
      if (x2 - x1 > 5 && y2 - y1 > 5) {
        addRegion([
          [x1, y1],
          [x2, y1],
          [x2, y2],
          [x1, y2],
        ]);
      }
      setDragStart(null);
      setDragNow(null);
    }
  }
  function finishPoly() {
    addRegion(draftPoly);
    setDraftPoly([]);
  }

  const previewRect = useMemo(() => {
    if (!dragStart || !dragNow) return null;
    const x = Math.min(dragStart.x, dragNow.x);
    const y = Math.min(dragStart.y, dragNow.y);
    return { x, y, w: Math.abs(dragNow.x - dragStart.x), h: Math.abs(dragNow.y - dragStart.y) };
  }, [dragStart, dragNow]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "1.2rem" }}>
      <div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap" }}>
          <button className="btn btn-ghost" onClick={onBack}>← Library</button>
          <button
            className={tool === "rect" ? "btn" : "btn btn-ghost"}
            onClick={() => setTool("rect")}
          >
            ▭ Rectangle
          </button>
          <button
            className={tool === "poly" ? "btn" : "btn btn-ghost"}
            onClick={() => setTool("poly")}
          >
            ✎ Polygon
          </button>
          {tool === "poly" && draftPoly.length >= 3 && (
            <button className="btn" onClick={finishPoly}>Finish region ({draftPoly.length} pts)</button>
          )}
          {tool === "poly" && draftPoly.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setDraftPoly([])}>Cancel draft</button>
          )}
        </div>

        <div
          style={{
            background: "#0a0a10",
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid var(--border)",
            maxHeight: "72vh",
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${map.width} ${map.height}`}
            style={{ width: "100%", height: "auto", display: "block", touchAction: "none", cursor: "crosshair" }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onDoubleClick={() => tool === "poly" && finishPoly()}
          >
            <image href={map.image_url} x={0} y={0} width={map.width} height={map.height} />
            {regions.map((r) => (
              <polygon
                key={r.id}
                points={r.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                fill="rgba(214,175,54,0.22)"
                stroke="var(--gold, #d6af36)"
                strokeWidth={Math.max(2, map.width * 0.002)}
              />
            ))}
            {previewRect && (
              <rect
                x={previewRect.x}
                y={previewRect.y}
                width={previewRect.w}
                height={previewRect.h}
                fill="rgba(214,175,54,0.2)"
                stroke="var(--gold)"
                strokeDasharray="8 6"
                strokeWidth={Math.max(2, map.width * 0.002)}
              />
            )}
            {draftPoly.length > 0 && (
              <>
                <polyline
                  points={draftPoly.map((p) => `${p[0]},${p[1]}`).join(" ")}
                  fill="none"
                  stroke="var(--gold)"
                  strokeWidth={Math.max(2, map.width * 0.002)}
                  strokeDasharray="8 6"
                />
                {draftPoly.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={Math.max(3, map.width * 0.004)} fill="var(--gold)" />
                ))}
              </>
            )}
          </svg>
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
        <label style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          Map name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginTop: 4 }} />
        </label>
        <label style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          Grid size (px per square) — blank = gridless
          <input
            type="number"
            value={grid}
            onChange={(e) => setGrid(e.target.value)}
            placeholder="e.g. 140"
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>

        <div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: 4 }}>
            Fog regions — reveal these one tap at a time during play
          </div>
          {regions.length === 0 && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", fontStyle: "italic" }}>
              None yet. Draw with the tools on the map.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {regions.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={r.name}
                  onChange={(e) =>
                    setRegions((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))
                  }
                  style={{ flex: 1, fontSize: "0.75rem" }}
                />
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0 0.4rem", color: "var(--danger, #ef5350)" }}
                  onClick={() => setRegions((rs) => rs.filter((x) => x.id !== r.id))}
                  title="Delete region"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <button className="btn" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Saving…" : "Save map"}
        </button>
        <button
          className="btn btn-ghost"
          style={{ color: "var(--danger, #ef5350)" }}
          onClick={() => {
            if (confirm(`Delete "${map.name}"? This cannot be undone.`)) onDelete();
          }}
        >
          Delete map
        </button>
      </aside>
    </div>
  );
}
