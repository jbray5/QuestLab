import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Map as MapIcon, PenLine, Plus, Square, X } from "lucide-react";
import { useToast } from "../components/Toast";
import RowMenu from "../components/RowMenu";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tableApi } from "../api/table";
import type { BattleMap, FogRegion } from "../api/types";
import { useIsCompact } from "../hooks/useIsCompact";
import ObsidianLink, { ObsidianNoteInput } from "../components/dm/ObsidianLink";

/**
 * BattleMaps — the campaign's battle-map library + fog-region editor (Plan 42).
 *
 * The DM uploads Czepeku/Roll20 exports, sets a grid, and (optionally) paints
 * named fog regions at prep time. At the table those regions become one-tap
 * reveals, so nothing has to be drawn live while narrating on camera.
 */

type Tool = "rect" | "poly";

/** Plan 71 — dimensions + a poster frame from a video file, all in-browser. */
function readVideo(file: File): Promise<{ w: number; h: number; poster: File }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = url;
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that video."));
    };
    video.onerror = fail;
    video.onloadeddata = () => {
      // Seek a hair in so the poster isn't a fade-from-black frame.
      video.currentTime = Math.min(0.5, (video.duration || 1) / 4);
    };
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return fail();
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (!blob) return fail();
        const base = file.name.replace(/\.[^.]+$/, "");
        resolve({
          w: video.videoWidth,
          h: video.videoHeight,
          poster: new File([blob], `${base}-poster.jpg`, { type: "image/jpeg" }),
        });
      }, "image/jpeg", 0.86);
    };
  });
}

/** Plan 82 — guess the 5-ft square size from the image: the common cell sizes
 *  that divide both edges into a plausible battle-map count. Null if none fit. */
function guessGrid(w: number, h: number): number | null {
  const candidates = [70, 100, 96, 140, 50, 72, 128, 150, 200, 64, 80, 120, 60, 90, 75];
  for (const g of candidates) {
    if (w % g === 0 && h % g === 0) {
      const cols = w / g;
      const rows = h / g;
      if (cols >= 8 && cols <= 80 && rows >= 6 && rows <= 60) return g;
    }
  }
  return null;
}

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
  const toast = useToast();
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
      video_url?: string | null;
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
    // Plan 73 — one-time map-rights notice (personal-use packs are fine; never other people's files).
    try {
      if (!localStorage.getItem("ql-map-rights-ok")) {
        const ok = window.confirm(
          "Upload only maps you have the right to use at your own table: your own work, map packs you bought or back (personal-use), or free maps under their terms. Uploads stay private to your account. OK to continue?",
        );
        if (!ok) return;
        localStorage.setItem("ql-map-rights-ok", "1");
      }
    } catch {
      /* storage blocked — ask every time */
    }
    setUploadError("");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
        if (file.type.startsWith("video/")) {
          // Plan 71 — animated map: the browser reads the dimensions and
          // grabs a poster frame; both upload, and the map gets video_url.
          const { w, h, poster } = await readVideo(file);
          const [videoUrl, posterUrl] = await Promise.all([
            tableApi.uploadMap(file),
            tableApi.uploadMap(poster),
          ]);
          await createMut.mutateAsync({
            name,
            image_url: posterUrl,
            width: w,
            height: h,
            video_url: videoUrl,
          });
          continue;
        }
        const [{ w, h }, url] = await Promise.all([readDims(file), tableApi.uploadMap(file)]);
        const grid = guessGrid(w, h);
        await createMut.mutateAsync({ name, image_url: url, width: w, height: h, ...(grid ? { grid_size: grid } : {}) });
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="fade-in" style={{ maxWidth: 1400, margin: "0 auto" }}>
      <div
        className="flex"
        style={{ alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1.25rem" }}
      >
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Battle maps</h1>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            Maps for the table, with fog regions you reveal one tap at a time.
          </p>
        </div>
        <div
          onDrop={(e) => {
            e.preventDefault();
            void handleFiles(e.dataTransfer.files);
          }}
          onDragOver={(e) => e.preventDefault()}
          style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}
        >
          {uploading && <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>Uploading…</span>}
          <button
            className={selected ? "btn btn-secondary" : "btn btn-primary"}
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            <Plus size={16} /> Import maps
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,video/mp4,video/webm"
            multiple
            style={{ display: "none" }}
            onChange={(e) => void handleFiles(e.target.files)}
          />
        </div>
      </div>
      {uploadError && <p style={{ color: "var(--danger-text)" }}>{uploadError}</p>}

      {!selected ? (
        <MapGrid maps={maps} onSelect={setSelectedId} onImport={() => fileRef.current?.click()} />
      ) : (
        <MapEditor
          map={selected}
          onBack={() => setSelectedId(null)}
          onDelete={() => deleteMut.mutate(selected.id)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["battle-maps", campaignId] });
            toast.push("Map saved", "success");
          }}
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
        className="card card-clickable"
        style={{
          padding: "3rem 1.5rem",
          textAlign: "center",
          color: "var(--muted)",
          cursor: "pointer",
          border: "1px dashed var(--border2)",
        }}
      >
        <MapIcon size={28} style={{ marginBottom: "0.6rem", opacity: 0.8 }} />
        <p style={{ maxWidth: 460, margin: "0 auto" }}>
          Your battle maps live here, ready to put on the table. Drop map images or video loops
          (Czepeku, Roll20 exports, your own) here, or click to import.
        </p>
      </div>
    );
  }
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 240px), 1fr))",
        gap: "1rem",
      }}
    >
      {maps.map((m) => (
        <button
          key={m.id}
          className="card card-clickable"
          onClick={() => onSelect(m.id)}
          style={{
            padding: 0,
            overflow: "hidden",
            cursor: "pointer",
            textAlign: "left",
            color: "inherit",
            fontFamily: "inherit",
          }}
        >
          <div style={{ aspectRatio: "16 / 10", background: "var(--bg)", overflow: "hidden" }}>
            <img
              src={m.thumb_url ?? m.image_url}
              loading="lazy"
              decoding="async"
              alt={m.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
          <div style={{ padding: "0.65rem 0.85rem" }}>
            <div className="story" style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text)" }}>
              {m.name}
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
              <span className="num">
                {m.width}×{m.height}
              </span>
              {m.grid_size ? (
                <>
                  {" · "}
                  <span title="Pixels per 5-foot square">
                    <span className="num">{m.grid_size}</span> px squares
                  </span>
                </>
              ) : (
                " · no grid"
              )}
              {m.regions.length ? ` · ${m.regions.length} fog region${m.regions.length > 1 ? "s" : ""}` : ""}
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
  const compact = useIsCompact(720);
  const [name, setName] = useState(map.name);
  const [grid, setGrid] = useState<string>(map.grid_size ? String(map.grid_size) : "");
  const [dmNote, setDmNote] = useState<string | null>(map.dm_note ?? null);
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
        dm_note: dmNote,
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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) 280px",
        gap: "1.2rem",
      }}
    >
      <div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} /> All maps
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 0.15rem" }} />
          <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Draw a fog region:</span>
          <button
            className="btn btn-secondary"
            style={toolStyle(tool === "rect")}
            aria-pressed={tool === "rect"}
            onClick={() => setTool("rect")}
            title="Drag on the map to draw a rectangle"
          >
            <Square size={15} /> Rectangle
          </button>
          <button
            className="btn btn-secondary"
            style={toolStyle(tool === "poly")}
            aria-pressed={tool === "poly"}
            onClick={() => setTool("poly")}
            title="Click points on the map; double-click or Finish to close the shape"
          >
            <PenLine size={15} /> Polygon
          </button>
          {tool === "poly" && draftPoly.length >= 3 && (
            <button className="btn btn-secondary" onClick={finishPoly}>
              Finish region (<span className="num">{draftPoly.length}</span> points)
            </button>
          )}
          {tool === "poly" && draftPoly.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setDraftPoly([])}>Cancel draft</button>
          )}
        </div>

        <div
          style={{
            background: "var(--bg)",
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
                style={{ fill: "var(--accent)", fillOpacity: 0.22, stroke: "var(--accent)" }}
                strokeWidth={Math.max(2, map.width * 0.002)}
              />
            ))}
            {previewRect && (
              <rect
                x={previewRect.x}
                y={previewRect.y}
                width={previewRect.w}
                height={previewRect.h}
                style={{ fill: "var(--accent)", fillOpacity: 0.2, stroke: "var(--accent)" }}
                strokeDasharray="8 6"
                strokeWidth={Math.max(2, map.width * 0.002)}
              />
            )}
            {draftPoly.length > 0 && (
              <>
                <polyline
                  points={draftPoly.map((p) => `${p[0]},${p[1]}`).join(" ")}
                  fill="none"
                  style={{ stroke: "var(--accent)" }}
                  strokeWidth={Math.max(2, map.width * 0.002)}
                  strokeDasharray="8 6"
                />
                {draftPoly.map((p, i) => (
                  <circle
                    key={i}
                    cx={p[0]}
                    cy={p[1]}
                    r={Math.max(3, map.width * 0.004)}
                    style={{ fill: "var(--accent)" }}
                  />
                ))}
              </>
            )}
          </svg>
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <label style={ASIDE_LABEL}>
          Map name
          <input
            className="story"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", marginTop: 4, fontSize: "1.05rem", fontWeight: 700 }}
          />
        </label>
        {/* Plan 93 — DM-only: this location's page in the vault. Saved with the map. */}
        <label style={ASIDE_LABEL}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            Obsidian note
            <ObsidianLink dmNote={dmNote} compact />
          </span>
          <ObsidianNoteInput value={dmNote} onChange={setDmNote} />
        </label>
        <label style={ASIDE_LABEL} title="How many pixels wide one 5-foot square is in this image">
          Grid square size in pixels — leave blank for no grid
          <input
            type="number"
            value={grid}
            onChange={(e) => setGrid(e.target.value)}
            placeholder="e.g. 140"
            className="num"
            style={{ width: "100%", marginTop: 4 }}
          />
        </label>

        <div>
          <div style={{ ...ASIDE_LABEL, marginBottom: 6 }}>
            Fog regions — reveal these one tap at a time during play
          </div>
          {regions.length === 0 && (
            <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
              None yet. Draw one on the map with Rectangle or Polygon.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {regions.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={r.name}
                  aria-label="Region name"
                  onChange={(e) =>
                    setRegions((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))
                  }
                  style={{ flex: 1, fontSize: "0.875rem", padding: "0.35rem 0.55rem" }}
                />
                <button
                  className="btn btn-ghost"
                  style={{ padding: "0.3rem", minHeight: 0, border: "none", color: "var(--muted)" }}
                  onClick={() => setRegions((rs) => rs.filter((x) => x.id !== r.id))}
                  title="Delete region"
                  aria-label={`Delete region ${r.name}`}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className="btn btn-primary"
            style={{ flex: 1 }}
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? "Saving…" : "Save map"}
          </button>
          {/* Review 10/30 — deleting lives in the ⋯ menu and asks first. */}
          <RowMenu
            label={`More for ${map.name}`}
            items={[
              {
                label: "Delete map…",
                danger: true,
                confirm: `Delete "${map.name}"? This cannot be undone.`,
                onSelect: onDelete,
              },
            ]}
          />
        </div>
      </aside>
    </div>
  );
}

const ASIDE_LABEL: React.CSSProperties = { fontSize: "0.8125rem", color: "var(--text2)", margin: 0 };

/** A drawing-tool toggle: lit while it's the active tool. */
function toolStyle(on: boolean): React.CSSProperties {
  return {
    background: on ? "var(--accent-active)" : "transparent",
    color: on ? "var(--accent-active-text)" : "var(--text2)",
    borderColor: on ? "var(--accent-line)" : "var(--border2)",
  };
}
