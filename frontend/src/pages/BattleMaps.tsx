import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeft, Hand, Map as MapIcon, PenLine, Plus, Square, X, ZoomIn, ZoomOut } from "lucide-react";
import { useToast } from "../components/Toast";
import RowMenu from "../components/RowMenu";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tableApi } from "../api/table";
import type { BattleMap, FogRegion } from "../api/types";
import { useIsCompact } from "../hooks/useIsCompact";
import ObsidianLink, { ObsidianNoteInput } from "../components/dm/ObsidianLink";
import {
  acrossRange,
  edgeProfiles,
  gridFromAcross,
  guessGrid,
  squaresLabel,
  squaresOf,
  suggestAcross,
  type EdgeProfiles,
  type GridGuess,
  type Squares,
} from "../lib/mapGrid";

/**
 * BattleMaps — the campaign's battle-map library + fog-area editor (Plan 42).
 *
 * The DM uploads Czepeku/Roll20/Inkarnate exports, sets the grid in squares,
 * and (optionally) draws named fog areas at prep time. At the table those areas
 * become one-tap reveals that a second tap hides again, so nothing has to be
 * drawn live while narrating on camera.
 *
 * Plan 133 (James, beta DM) — the editor fits the whole map in view and zooms
 * for detail, so a tall chase strip (25 × 75) is never cropped to a landscape
 * box. The grid is "N squares across" (stored as pixels per square, as before),
 * and the import guess asks rather than picking a size it isn't sure of.
 */

type Tool = "move" | "rect" | "poly";

/** Furthest the editor zooms in from "whole map". */
const ZOOM_MAX = 8;

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

/** The image's size, plus its edge profiles so the grid guess can look for drawn lines. */
function readImage(file: File): Promise<{ w: number; h: number; profiles: EdgeProfiles | null }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const profiles = edgeProfiles(img, w, h);
      URL.revokeObjectURL(url);
      resolve({ w, h, profiles });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image dimensions"));
    };
    img.src = url;
  });
}

/** A pointer position in image pixels, kept on the map. */
function toImageCoords(svg: SVGSVGElement, clientX: number, clientY: number, w: number, h: number) {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const p = pt.matrixTransform(ctm.inverse());
  return {
    x: Math.round(Math.min(w, Math.max(0, p.x))),
    y: Math.round(Math.min(h, Math.max(0, p.y))),
  };
}

/** Keep a drag going outside the frame. Some browsers refuse capture; drawing still works. */
function capture(e: React.PointerEvent<Element>) {
  try {
    e.currentTarget.setPointerCapture(e.pointerId);
  } catch {
    /* capture is a nicety */
  }
}

/** The window's inner height, live. */
function useViewportHeight(): number {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("resize", onChange);
      return () => window.removeEventListener("resize", onChange);
    },
    () => window.innerHeight,
    () => 800,
  );
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
      grid_size?: number;
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
    // Plan 133 — say what the grid guess did, so a wrong size is never silent.
    const guesses: (GridGuess | null)[] = [];
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
          const guess = guessGrid(w, h);
          await createMut.mutateAsync({
            name,
            image_url: posterUrl,
            width: w,
            height: h,
            video_url: videoUrl,
            ...(guess ? { grid_size: guess.gridPx } : {}),
          });
          guesses.push(guess);
          continue;
        }
        const [{ w, h, profiles }, url] = await Promise.all([readImage(file), tableApi.uploadMap(file)]);
        const guess = guessGrid(w, h, profiles);
        await createMut.mutateAsync({
          name,
          image_url: url,
          width: w,
          height: h,
          ...(guess ? { grid_size: guess.gridPx } : {}),
        });
        guesses.push(guess);
      }
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
    if (guesses.length === 1) {
      const g = guesses[0];
      if (g) {
        const from = g.source === "lines" ? "the grid lines on the map" : "the image size";
        toast.push(`Grid set to ${squaresLabel(g)}, from ${from}. Check that it lines up.`, "success");
      } else {
        toast.push("How many squares across is this map? Set it next to the map.", "info");
      }
    } else if (guesses.length > 1) {
      const unset = guesses.filter((g) => !g).length;
      toast.push(
        unset
          ? `Imported ${guesses.length} maps. ${unset} still need their squares set.`
          : `Imported ${guesses.length} maps with their grids set. Check that they line up.`,
        "success",
      );
    }
  }

  return (
    // `.ql-s6`: thumb-sized controls on a phone (index.css, Plan 123 S6).
    // UX-003 — the whole page takes dropped files (the empty state invites a drop),
    // except while a map is open in the editor, which has its own pointer work.
    <div
      className="fade-in ql-s6"
      style={{ maxWidth: 1400, margin: "0 auto" }}
      onDragOver={(e) => {
        if (!selected && e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (selected || !e.dataTransfer.files.length) return;
        e.preventDefault();
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <div
        className="flex"
        style={{ alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: "1.25rem", flexWrap: "wrap" }}
      >
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Battle maps</h1>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            Maps for the table, with fog areas you reveal and hide with a tap.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center" }}>
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
        // Keyed: importing from inside the editor opens the new map with fresh fields.
        <MapEditor
          key={selected.id}
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
          Your battle maps live here, ready to put on the table. Drag map images or video loops
          here (map packs you own, Roll20 exports, your own drawings), or tap to choose files.
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
      {maps.map((m) => {
        // Plan 133 — a tall strip or a long corridor shows whole on its card, not a middle slice.
        const aspect = m.width / m.height;
        const strip = aspect < 1 || aspect > 2.4;
        const areas = m.regions.length;
        return (
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
                style={{ width: "100%", height: "100%", objectFit: strip ? "contain" : "cover", display: "block" }}
              />
            </div>
            <div style={{ padding: "0.65rem 0.85rem" }}>
              <div className="story" style={{ fontWeight: 700, fontSize: "1.1rem", color: "var(--text)" }}>
                {m.name}
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--muted)" }} title={`${m.width} × ${m.height} pixels`}>
                {m.grid_size ? (
                  <span className="num">{squaresLabel(squaresOf(m.width, m.height, m.grid_size))}</span>
                ) : (
                  "Squares not set yet"
                )}
                {areas ? ` · ${areas} fog area${areas > 1 ? "s" : ""}` : ""}
              </div>
            </div>
          </button>
        );
      })}
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
  const W = map.width;
  const H = map.height;
  const svgRef = useRef<SVGSVGElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Where to keep the view centred after a zoom, and a mouse drag-to-scroll in progress.
  const pendingCenter = useRef<{ cx: number; cy: number } | null>(null);
  const panFrom = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const compact = useIsCompact(720);
  const phone = useIsCompact(640);
  const vh = useViewportHeight();
  const [frameW, setFrameW] = useState(0);
  const [name, setName] = useState(map.name);
  // The grid is edited in squares; `grid_size` stays pixels per square.
  const initialAcross = map.grid_size ? String(squaresOf(W, H, map.grid_size).across) : "";
  const [acrossText, setAcrossText] = useState(initialAcross);
  const [showGrid, setShowGrid] = useState(true);
  // A zoom factor over "whole map", or "width": fill the frame's width, re-fit as it resizes.
  const [zoomSetting, setZoomSetting] = useState<number | "width">(1);
  const [dmNote, setDmNote] = useState<string | null>(map.dm_note ?? null);
  const [regions, setRegions] = useState<FogRegion[]>(map.regions ?? []);
  // On a phone a finger scrolls the page until a drawing tool is picked.
  const [tool, setTool] = useState<Tool>(phone ? "move" : "rect");
  const [draftPoly, setDraftPoly] = useState<number[][]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragNow, setDragNow] = useState<{ x: number; y: number } | null>(null);
  // The rectangle being dragged, read by the pointer handlers. The state above only
  // draws the preview: fast input can outrun a render and leave the handlers stale.
  const drag = useRef<{ x: number; y: number } | null>(null);
  const idc = useRef(0);

  // ── Grid, in squares ──
  const typed = acrossText.trim() !== "";
  const fromAcross = typed ? gridFromAcross(W, H, Number(acrossText)) : null;
  // An untouched field keeps the stored size exactly, even where it isn't a whole count.
  const touched = acrossText !== initialAcross;
  const gridPx: number | null = touched ? (fromAcross?.gridPx ?? null) : map.grid_size;
  const gridInvalid = typed && !fromAcross;
  // The grid as squares, for "× 75 down" and the readout over the map.
  const squares: Squares | null = !gridPx
    ? null
    : touched && fromAcross
      ? { across: Number(acrossText), down: fromAcross.down, exact: fromAcross.exact }
      : squaresOf(W, H, gridPx);
  const range = acrossRange(W);
  const suggestions = gridPx ? [] : suggestAcross(W, H);

  // ── The frame: the whole map in view, zoom for detail ──
  const availW = frameW > 0 ? frameW : 720;
  const maxH = Math.max(220, Math.round(vh * (phone ? 0.62 : 0.72)));
  const fit = Math.min(availW / W, maxH / H);
  const fitWidthZoom = availW / (W * fit);
  const zoom = zoomSetting === "width" ? Math.max(1, fitWidthZoom) : zoomSetting;
  const scale = fit * zoom;
  const dispW = Math.max(1, Math.round(W * scale));
  const dispH = Math.max(1, Math.round(H * scale));
  const frameH = Math.max(1, Math.round(H * fit));
  const unit = 1 / scale; // image pixels per screen pixel: strokes and handles stay a fixed size
  const zoomedIn = zoom > 1.001;

  // Measure the scrolling frame (React 19 callback ref with cleanup).
  const attachFrame = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setFrameW(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function zoomTo(next: number | "width") {
    const sc = scrollRef.current;
    if (sc) {
      pendingCenter.current = {
        cx: dispW <= sc.clientWidth ? 0.5 : (sc.scrollLeft + sc.clientWidth / 2) / dispW,
        cy: dispH <= sc.clientHeight ? 0.5 : (sc.scrollTop + sc.clientHeight / 2) / dispH,
      };
    }
    setZoomSetting(next === "width" ? next : Math.min(ZOOM_MAX, Math.max(1, next)));
  }
  // Keep the same spot in the middle of the frame across a zoom.
  useLayoutEffect(() => {
    const sc = scrollRef.current;
    const c = pendingCenter.current;
    if (!sc || !c) return;
    pendingCenter.current = null;
    sc.scrollLeft = c.cx * sc.scrollWidth - sc.clientWidth / 2;
    sc.scrollTop = c.cy * sc.scrollHeight - sc.clientHeight / 2;
  }, [zoomSetting]);

  const saveMut = useMutation({
    mutationFn: () =>
      tableApi.updateMap(map.id, {
        name: name.trim() || map.name,
        grid_size: gridPx,
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
    setRegions((r) => [...r, { id: nextId(), name: `Area ${r.length + 1}`, points }]);
  }

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (tool === "move") {
      // Touch scrolls natively (touch-action); a mouse drags the view.
      const sc = scrollRef.current;
      if (e.pointerType === "mouse" && sc && zoomedIn) {
        panFrom.current = { x: e.clientX, y: e.clientY, left: sc.scrollLeft, top: sc.scrollTop };
        capture(e);
      }
      return;
    }
    if (!svgRef.current) return;
    const p = toImageCoords(svgRef.current, e.clientX, e.clientY, W, H);
    if (tool === "rect") {
      drag.current = p;
      setDragStart(p);
      setDragNow(p);
      // Keep the drag even when the pointer leaves the frame.
      capture(e);
    } else {
      setDraftPoly((d) => [...d, [p.x, p.y]]);
    }
  }
  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const pan = panFrom.current;
    const sc = scrollRef.current;
    if (pan && sc) {
      sc.scrollLeft = pan.left - (e.clientX - pan.x);
      sc.scrollTop = pan.top - (e.clientY - pan.y);
      return;
    }
    if (tool === "rect" && drag.current && svgRef.current) {
      setDragNow(toImageCoords(svgRef.current, e.clientX, e.clientY, W, H));
    }
  }
  function onUp(e: React.PointerEvent<SVGSVGElement>) {
    panFrom.current = null;
    const start = drag.current;
    drag.current = null;
    if (tool === "rect" && start && svgRef.current) {
      const end = toImageCoords(svgRef.current, e.clientX, e.clientY, W, H);
      const x1 = Math.min(start.x, end.x);
      const y1 = Math.min(start.y, end.y);
      const x2 = Math.max(start.x, end.x);
      const y2 = Math.max(start.y, end.y);
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
  /** The browser took the pointer back (a system gesture): drop the drag, draw nothing. */
  function onCancel() {
    panFrom.current = null;
    drag.current = null;
    setDragStart(null);
    setDragNow(null);
  }
  function finishPoly() {
    addRegion(draftPoly);
    setDraftPoly([]);
  }

  const previewRect =
    dragStart && dragNow
      ? {
          x: Math.min(dragStart.x, dragNow.x),
          y: Math.min(dragStart.y, dragNow.y),
          w: Math.abs(dragNow.x - dragStart.x),
          h: Math.abs(dragNow.y - dragStart.y),
        }
      : null;

  // The grid as one path, so the DM can see at a glance whether it lines up.
  let gridPath = "";
  if (gridPx && showGrid) {
    for (let x = gridPx; x < W - 0.5; x += gridPx) gridPath += `M${x} 0V${H}`;
    for (let y = gridPx; y < H - 0.5; y += gridPx) gridPath += `M0 ${y}H${W}`;
  }

  const gridBlock = (
    <div
      style={
        gridPx
          ? undefined
          : {
              border: "1px solid var(--accent-line)",
              background: "var(--accent-active)",
              borderRadius: 10,
              padding: "0.7rem 0.8rem",
            }
      }
    >
      <label htmlFor="map-across" style={{ ...ASIDE_LABEL, fontWeight: 600, color: "var(--text)" }}>
        {gridPx ? "Grid" : "How many squares across is this map?"}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
        <input
          id="map-across"
          type="number"
          inputMode="numeric"
          min={range.min}
          max={range.max}
          step={1}
          value={acrossText}
          onChange={(e) => setAcrossText(e.target.value)}
          placeholder="e.g. 25"
          className="num"
          aria-describedby="map-grid-help"
          aria-invalid={gridInvalid || undefined}
          style={{ width: 120 }}
        />
        <span style={{ fontSize: "0.875rem", color: "var(--text2)" }} aria-live="polite">
          squares across
          {squares && (
            <>
              {" × "}
              {squares.exact ? "" : "about "}
              <span className="num">{squares.down}</span> down
            </>
          )}
        </span>
      </div>
      {gridInvalid && (
        <p role="alert" style={{ color: "var(--danger-text)", fontSize: "0.8125rem", margin: "0.4rem 0 0" }}>
          Type a whole number of squares from <span className="num">{range.min}</span> to{" "}
          <span className="num">{range.max}</span>.
        </p>
      )}
      <p id="map-grid-help" style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: "0.4rem 0 0" }}>
        {gridPx ? (
          <>
            1 square = 5 ft · <span className="num">{gridPx}</span> pixels per square. Clear it for a map
            with no grid.
          </>
        ) : (
          "Count the squares along the top edge, or check the grid settings in the app you made it with. Leave it blank for a map with no grid."
        )}
      </p>
      {suggestions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 8 }}>
          <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Fits this image:</span>
          {suggestions.map((n) => (
            <button
              key={n}
              type="button"
              className="btn btn-secondary"
              style={{ padding: "0.2rem 0.6rem", minHeight: 0 }}
              onClick={() => setAcrossText(String(n))}
              title={`Try ${n} squares across`}
            >
              <span className="num">{n}</span>
            </button>
          ))}
        </div>
      )}
      {gridPx && (
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: "0.8125rem", color: "var(--text2)" }}>
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          Show the grid on the map
        </label>
      )}
    </div>
  );

  const zoomBtn: React.CSSProperties = { padding: "0.25rem 0.55rem", minHeight: 0 };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "minmax(0, 1fr) 300px",
        gap: "1.2rem",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn btn-ghost" onClick={onBack}>
            <ArrowLeft size={16} /> All maps
          </button>
          <span style={{ width: 1, height: 24, background: "var(--border)", margin: "0 0.15rem" }} />
          <button
            className="btn btn-secondary"
            style={toolStyle(tool === "move")}
            aria-pressed={tool === "move"}
            onClick={() => setTool("move")}
            title="Scroll the map without drawing"
          >
            <Hand size={15} /> Move
          </button>
          <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>Draw a fog area:</span>
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
              Finish area (<span className="num">{draftPoly.length}</span> points)
            </button>
          )}
          {tool === "poly" && draftPoly.length > 0 && (
            <button className="btn btn-ghost" onClick={() => setDraftPoly([])}>Cancel draft</button>
          )}
        </div>
        {/* Phones (Plan 123): there's no double-click or hover — say how touch works. */}
        {phone && (
          <p className="text-sm text-muted" style={{ margin: "0 0 0.6rem" }}>
            {tool === "move"
              ? "Drag to scroll. Pick Rectangle or Polygon to draw a fog area."
              : tool === "rect"
                ? "Drag a finger across the map to draw a rectangle."
                : "Tap each corner on the map, then Finish area."}
          </p>
        )}
        {/* Phone and narrow windows: the grid sits above the map, not below a long scroll. */}
        {compact && <div style={{ marginBottom: "0.75rem" }}>{gridBlock}</div>}

        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
          {/* On a phone the grid box right above already says this; the zoom row stays one line. */}
          {!phone && (
            <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
              {squares ? <span className="num">{squaresLabel(squares)}</span> : "No grid yet"}
            </span>
          )}
          <span style={{ marginLeft: "auto" }} />
          <button
            className="btn btn-ghost"
            style={zoomBtn}
            onClick={() => zoomTo(1)}
            disabled={!zoomedIn}
            aria-pressed={!zoomedIn}
            title="Fit the whole map in view"
          >
            Whole map
          </button>
          {fitWidthZoom > 1.25 && (
            <button
              className="btn btn-ghost"
              style={zoomBtn}
              onClick={() => zoomTo("width")}
              aria-pressed={zoomSetting === "width"}
              title="Fill the width and scroll down the map"
            >
              Fit width
            </button>
          )}
          <button
            className="btn btn-ghost ql-s6-sq"
            style={zoomBtn}
            onClick={() => zoomTo(zoom / 1.5)}
            disabled={!zoomedIn}
            aria-label="Zoom out"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            className="btn btn-ghost ql-s6-sq"
            style={zoomBtn}
            onClick={() => zoomTo(zoom * 1.5)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="Zoom in"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
        </div>

        <div
          style={{
            background: "var(--bg)",
            borderRadius: 10,
            overflow: "hidden",
            border: "1px solid var(--border)",
          }}
        >
          <div
            ref={attachFrame}
            data-testid="map-frame"
            style={{ height: frameH, overflow: zoomedIn ? "auto" : "hidden", overscrollBehavior: "contain" }}
          >
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              width={dispW}
              height={dispH}
              style={{
                display: "block",
                margin: "0 auto",
                touchAction: tool === "move" ? "manipulation" : "none",
                cursor: tool === "move" ? (zoomedIn ? "grab" : "default") : "crosshair",
              }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onCancel}
              onDoubleClick={() => tool === "poly" && finishPoly()}
            >
              <image href={map.image_url} x={0} y={0} width={W} height={H} />
              {gridPath && (
                // Thin enough to check alignment without hiding the art, even at whole-map size.
                <g pointerEvents="none" fill="none">
                  <path d={gridPath} style={{ stroke: "var(--bg)" }} strokeOpacity={0.3} strokeWidth={2 * unit} />
                  <path d={gridPath} style={{ stroke: "var(--accent)" }} strokeOpacity={0.6} strokeWidth={0.75 * unit} />
                </g>
              )}
              {regions.map((r) => {
                const cx = r.points.reduce((a, p) => a + p[0], 0) / (r.points.length || 1);
                const cy = r.points.reduce((a, p) => a + p[1], 0) / (r.points.length || 1);
                return (
                  <g key={r.id} pointerEvents="none">
                    <polygon
                      points={r.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
                      style={{ fill: "var(--accent)", fillOpacity: 0.22, stroke: "var(--accent)" }}
                      strokeWidth={2 * unit}
                    />
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={13 * unit}
                      fontWeight={700}
                      style={{ fill: "var(--text)", stroke: "var(--bg)" }}
                      strokeWidth={3 * unit}
                      paintOrder="stroke"
                    >
                      {r.name}
                    </text>
                  </g>
                );
              })}
              {previewRect && (
                <rect
                  x={previewRect.x}
                  y={previewRect.y}
                  width={previewRect.w}
                  height={previewRect.h}
                  style={{ fill: "var(--accent)", fillOpacity: 0.2, stroke: "var(--accent)" }}
                  strokeDasharray={`${8 * unit} ${6 * unit}`}
                  strokeWidth={2 * unit}
                />
              )}
              {draftPoly.length > 0 && (
                <>
                  <polyline
                    points={draftPoly.map((p) => `${p[0]},${p[1]}`).join(" ")}
                    fill="none"
                    style={{ stroke: "var(--accent)" }}
                    strokeWidth={2 * unit}
                    strokeDasharray={`${8 * unit} ${6 * unit}`}
                  />
                  {draftPoly.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={5 * unit} style={{ fill: "var(--accent)" }} />
                  ))}
                </>
              )}
            </svg>
          </div>
        </div>
      </div>

      <aside style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
        <label style={ASIDE_LABEL}>
          Map name
          <input
            className="story ql-s6-keep"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%", marginTop: 4, fontSize: "1.05rem", fontWeight: 700 }}
          />
        </label>
        {!compact && gridBlock}
        {/* Plan 93 — DM-only: this location's page in the vault. Saved with the map.
            Plan 128 — a small "Link an Obsidian note" button until a DM uses it (Marco). */}
        <div style={ASIDE_LABEL}>
          {dmNote && (
            <label
              htmlFor="map-obsidian-note"
              style={{ display: "flex", alignItems: "center", gap: "0.4rem", margin: "0 0 4px", font: "inherit", color: "inherit" }}
            >
              Obsidian note
              <ObsidianLink dmNote={dmNote} compact />
            </label>
          )}
          <ObsidianNoteInput id="map-obsidian-note" value={dmNote} onChange={setDmNote} />
        </div>

        <div>
          <div style={{ ...ASIDE_LABEL, fontWeight: 600, color: "var(--text)" }}>Fog areas</div>
          {/* Plan 133 — James couldn't see how to hide things: say how fog works, once. */}
          <p style={{ fontSize: "0.8125rem", color: "var(--text2)", margin: "0.3rem 0 0.5rem" }}>
            Turn on fog at the table and the whole map starts covered. Draw the areas you&rsquo;ll
            reveal during play; you can hide them again any time.
          </p>
          {regions.length === 0 && (
            <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: 0 }}>
              None yet. Pick Rectangle or Polygon and draw on the map.
            </p>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {regions.map((r) => (
              <div key={r.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  value={r.name}
                  aria-label="Fog area name"
                  onChange={(e) =>
                    setRegions((rs) => rs.map((x) => (x.id === r.id ? { ...x, name: e.target.value } : x)))
                  }
                  style={{ flex: 1, minWidth: 0, fontSize: "0.875rem", padding: "0.35rem 0.55rem" }}
                />
                <button
                  className="btn btn-ghost ql-s6-sq"
                  style={{ padding: "0.3rem", minHeight: 0, border: "none", color: "var(--muted)" }}
                  onClick={() => setRegions((rs) => rs.filter((x) => x.id !== r.id))}
                  title="Delete this fog area"
                  aria-label={`Delete fog area ${r.name}`}
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
            disabled={saveMut.isPending || gridInvalid}
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
