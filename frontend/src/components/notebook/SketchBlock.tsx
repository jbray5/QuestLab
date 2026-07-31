import { useEffect, useRef, useState } from "react";

/**
 * SketchBlock — the napkin (Plan 57).
 *
 * Custom pointer-events SVG canvas, chosen over embedding a sketch
 * library: zero dependencies, stylus/touch/mouse are first-class through
 * pointer events, and SVG paths print crisp at any scale. Smoothing is
 * quadratic Béziers through segment midpoints — the perfect-freehand
 * look without the dependency.
 *
 * Tools per spec and nothing more: pen ×3 weights, 6 inks, eraser
 * (removes whole strokes), undo/redo, clear. Height-resizable.
 */

export interface SketchPath {
  d: string;
  color: string;
  w: number;
}

export interface SketchContent {
  paths: SketchPath[];
  height: number;
}

// Inks from the app palette + parchment/bone tones that read on dark.
const INKS = ["#e8e6df", "#e0a94d", "#9fc4d4", "#c96f6f", "#7fae7a", "#8f86c9"];
const WEIGHTS = [2, 4, 7];

interface Point {
  x: number;
  y: number;
}

/** Midpoint-quadratic smoothing: M p0, then Q through each midpoint. */
function toPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length < 3) {
    const p = points[0];
    return `M ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${points[points.length - 1].x.toFixed(1)} ${points[points.length - 1].y.toFixed(1)}`;
  }
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  return d;
}

/** Sample a path's points back out for eraser hit-testing. */
function pathPoints(d: string): Point[] {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  const pts: Point[] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });
  return pts;
}

export default function SketchBlock({
  content,
  readOnly,
  onChange,
}: {
  content: SketchContent;
  readOnly?: boolean;
  onChange?: (next: SketchContent) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<SketchPath[]>(content.paths ?? []);
  const [height, setHeight] = useState(content.height || 260);
  const [ink, setInk] = useState(INKS[0]);
  const [weight, setWeight] = useState(WEIGHTS[1]);
  const [erasing, setErasing] = useState(false);
  const [live, setLive] = useState<Point[] | null>(null);
  // undo/redo — snapshots of the path list
  const undoStack = useRef<SketchPath[][]>([]);
  const redoStack = useRef<SketchPath[][]>([]);

  // Keep local state in sync if the page reloads this block.
  useEffect(() => {
    setPaths(content.paths ?? []);
    setHeight(content.height || 260);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(next: SketchPath[], nextHeight = height) {
    undoStack.current.push(paths);
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
    setPaths(next);
    onChange?.({ paths: next, height: nextHeight });
  }

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    redoStack.current.push(paths);
    setPaths(prev);
    onChange?.({ paths: prev, height });
  }

  function redo() {
    const next = redoStack.current.pop();
    if (!next) return;
    undoStack.current.push(paths);
    setPaths(next);
    onChange?.({ paths: next, height });
  }

  function local(e: React.PointerEvent): Point {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function eraseAt(p: Point) {
    const hit = paths.findIndex((path) =>
      pathPoints(path.d).some((q) => Math.hypot(q.x - p.x, q.y - p.y) < path.w + 8),
    );
    if (hit >= 0) commit(paths.filter((_, i) => i !== hit));
  }

  function down(e: React.PointerEvent) {
    if (readOnly) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = local(e);
    if (erasing) {
      eraseAt(p);
    } else {
      setLive([p]);
    }
  }

  function move(e: React.PointerEvent) {
    if (readOnly) return;
    if (erasing && e.buttons) {
      eraseAt(local(e));
      return;
    }
    if (!live) return;
    const p = local(e);
    const lastP = live[live.length - 1];
    // Skip sub-pixel jitter; keeps paths small.
    if (Math.hypot(p.x - lastP.x, p.y - lastP.y) < 1.5) return;
    setLive([...live, p]);
  }

  function up() {
    if (!live) return;
    if (live.length > 1) commit([...paths, { d: toPath(live), color: ink, w: weight }]);
    setLive(null);
  }

  return (
    <div className="nb-sketch">
      {!readOnly && (
        <div className="nb-sketch-tools">
          {INKS.map((c) => (
            <button
              key={c}
              className={`nb-ink${ink === c && !erasing ? " on" : ""}`}
              style={{ background: c }}
              title="Ink"
              onClick={() => {
                setInk(c);
                setErasing(false);
              }}
            />
          ))}
          <span className="nb-tool-gap" />
          {WEIGHTS.map((w) => (
            <button
              key={w}
              className={`nb-weight${weight === w && !erasing ? " on" : ""}`}
              title={`Pen ${w}px`}
              onClick={() => {
                setWeight(w);
                setErasing(false);
              }}
            >
              <span style={{ width: w + 2, height: w + 2, background: "currentColor", borderRadius: "50%", display: "inline-block" }} />
            </button>
          ))}
          <span className="nb-tool-gap" />
          <button
            className={`nb-tool${erasing ? " on" : ""}`}
            title="Eraser (removes strokes)"
            onClick={() => setErasing((v) => !v)}
          >
            ⌫
          </button>
          <button className="nb-tool" title="Undo" onClick={undo}>
            ↶
          </button>
          <button className="nb-tool" title="Redo" onClick={redo}>
            ↷
          </button>
          <button
            className="nb-tool"
            title="Clear sketch"
            onClick={() => {
              if (paths.length && confirm("Clear the sketch?")) commit([]);
            }}
          >
            ✕
          </button>
        </div>
      )}

      <svg
        ref={svgRef}
        className="nb-sketch-canvas"
        style={{ height, touchAction: "none", cursor: readOnly ? "default" : erasing ? "cell" : "crosshair" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        {paths.map((p, i) => (
          <path key={i} d={p.d} stroke={p.color} strokeWidth={p.w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {live && (
          <path d={toPath(live)} stroke={ink} strokeWidth={weight} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>

      {!readOnly && (
        <div
          className="nb-sketch-resize"
          title="Drag to resize"
          onPointerDown={(e) => {
            e.preventDefault();
            const startY = e.clientY;
            const startH = height;
            const onMove = (ev: PointerEvent) => {
              const h = Math.max(120, Math.min(900, startH + ev.clientY - startY));
              setHeight(h);
            };
            const onUp = (ev: PointerEvent) => {
              window.removeEventListener("pointermove", onMove);
              window.removeEventListener("pointerup", onUp);
              const h = Math.max(120, Math.min(900, startH + ev.clientY - startY));
              onChange?.({ paths, height: h });
            };
            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
          }}
        >
          ⋮⋮
        </div>
      )}
    </div>
  );
}
