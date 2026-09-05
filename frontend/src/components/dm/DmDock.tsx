import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useIsCompact } from "../../hooks/useIsCompact";
import { useAuthStore } from "../../stores/useAuthStore";
import DmDockBody from "./DmDockBody";
import { readDockSession, rememberDockSession, sessionIdFromPath } from "./dmSession";

/**
 * DmDock — the DM's notes, floating over any DM page (Plan 75).
 *
 * The two-screen problem: the projector tab shows the players the table, the
 * DM's own half-window shows the HUD or the 3D board, and the notes were
 * always on some *other* tab. The dock is a draggable, resizable panel that
 * follows the DM across every DM page (HUD, 3D Board, NPCs, compendium…),
 * remembers where you put it, and toggles with the N key. "↗ Pop out" opens
 * the same notes in a small separate window you can park over Discord.
 *
 * Gated three ways: a signed-in DM, a DM route (never /table, /play, /join,
 * /market, /shop, /puzzle), and a session to attach to.
 */

const DM_ROUTE = /^\/(sessions|campaigns|adventures|admin|monsters|spells|weapons|magic-items)(\/|$)|^\/$/;
const RECT_KEY = "ql-dock-rect";
const OPEN_KEY = "ql-dock-open";
const DIM_KEY = "ql-dock-dim";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clampRect(r: Rect): Rect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(300, r.w), vw - 16);
  const h = Math.min(Math.max(240, r.h), vh - 16);
  return {
    w,
    h,
    x: Math.min(Math.max(0, r.x), vw - w),
    y: Math.min(Math.max(0, r.y), vh - h),
  };
}
function loadRect(): Rect {
  try {
    const raw = localStorage.getItem(RECT_KEY);
    if (raw) return clampRect(JSON.parse(raw) as Rect);
  } catch {
    /* fall through to the default */
  }
  return clampRect({ x: window.innerWidth - 424, y: 72, w: 408, h: 560 });
}
function saveRect(r: Rect) {
  try {
    localStorage.setItem(RECT_KEY, JSON.stringify(r));
  } catch {
    /* position just doesn't persist */
  }
}
function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function writeFlag(key: string, v: boolean) {
  try {
    localStorage.setItem(key, v ? "1" : "0");
  } catch {
    /* fine */
  }
}

export default function DmDock() {
  const { pathname } = useLocation();
  const dmEmail = useAuthStore((s) => s.dmEmail);
  const compact = useIsCompact(900);
  const urlSid = sessionIdFromPath(pathname);
  const [pinned, setPinned] = useState<string | null>(null);
  const [open, setOpen] = useState<boolean>(() => readFlag(OPEN_KEY, false));
  const [dim, setDim] = useState<boolean>(() => readFlag(DIM_KEY, false));
  const [rect, setRect] = useState<Rect>(loadRect);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (urlSid) rememberDockSession(urlSid);
  }, [urlSid]);

  const sid = pinned ?? urlSid ?? readDockSession();
  const isDmPage = !!dmEmail && DM_ROUTE.test(pathname) && !/\/notes$/.test(pathname);
  const active = isDmPage && !compact && !!sid;

  function toggle() {
    setOpen((v) => {
      writeFlag(OPEN_KEY, !v);
      return !v;
    });
  }

  // N toggles the dock — unless you're typing somewhere.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  // The browser's own resize handle writes width/height; mirror it into state.
  useEffect(() => {
    const el = panelRef.current;
    if (!el || !open) return;
    const ro = new ResizeObserver(() => {
      const b = el.getBoundingClientRect();
      setRect((prev) => {
        const next = { ...prev, w: Math.round(b.width), h: Math.round(b.height) };
        if (next.w === prev.w && next.h === prev.h) return prev;
        saveRect(next);
        return next;
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, active]);

  function onHeaderDown(e: React.PointerEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest("button,select,a,input")) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, rx: rect.x, ry: rect.y };
    const move = (ev: PointerEvent) => {
      setRect((prev) =>
        clampRect({ ...prev, x: start.rx + ev.clientX - start.x, y: start.ry + ev.clientY - start.y }),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setRect((r) => {
        saveRect(r);
        return r;
      });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function popOut() {
    if (!sid) return;
    window.open(
      `/sessions/${sid}/notes`,
      "ql-dm-notes",
      "popup=yes,width=460,height=720,resizable=yes,scrollbars=yes",
    );
  }

  if (!active) return null;

  if (!open) {
    return (
      <button
        onClick={toggle}
        title="DM notes — press N"
        aria-label="Open DM notes"
        style={{
          position: "fixed",
          right: 0,
          top: "60%",
          zIndex: 480,
          writingMode: "vertical-rl",
          padding: "10px 5px",
          background: "rgba(16,14,24,0.92)",
          border: "1px solid var(--gold)",
          borderRight: 0,
          borderRadius: "8px 0 0 8px",
          color: "var(--gold)",
          fontFamily: "Cinzel, Georgia, serif",
          fontSize: "0.7rem",
          letterSpacing: "0.1em",
          cursor: "pointer",
          boxShadow: "-4px 0 14px rgba(0,0,0,0.45)",
        }}
      >
        📝 NOTES · N
      </button>
    );
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="DM notes"
      style={{
        position: "fixed",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: 500,
        display: "flex",
        flexDirection: "column",
        resize: "both",
        overflow: "hidden",
        minWidth: 300,
        minHeight: 240,
        background: dim ? "rgba(16,14,24,0.62)" : "rgba(16,14,24,0.97)",
        backdropFilter: "blur(8px)",
        border: "1px solid var(--gold)",
        borderRadius: 12,
        boxShadow: "0 18px 48px rgba(0,0,0,0.6), 0 0 0 1px rgba(214,175,54,0.15)",
        transition: "background 0.2s",
      }}
    >
      <div
        onPointerDown={onHeaderDown}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "0.35rem 0.5rem 0.35rem 0.7rem",
          cursor: "move",
          userSelect: "none",
          borderBottom: "1px solid var(--border)",
          background: "rgba(214,175,54,0.06)",
        }}
        title="Drag to move · resize from the corner"
      >
        <strong style={{ fontFamily: "Cinzel, Georgia, serif", color: "var(--gold)", fontSize: "0.78rem", letterSpacing: "0.06em" }}>
          📝 DM Notes
        </strong>
        <span style={{ fontSize: "0.6rem", color: "var(--muted)" }}>N to hide</span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
          <button
            className="btn btn-ghost"
            style={{ fontSize: "0.66rem", padding: "0.05rem 0.4rem" }}
            onClick={() => {
              writeFlag(DIM_KEY, !dim);
              setDim(!dim);
            }}
            title={dim ? "Solid" : "See-through (watch the board behind it)"}
          >
            ◐
          </button>
          <button className="btn btn-ghost" style={{ fontSize: "0.66rem", padding: "0.05rem 0.4rem" }} onClick={popOut} title="Open in its own small window — park it over Discord">
            ↗ Pop out
          </button>
          <button className="btn btn-ghost" style={{ fontSize: "0.66rem", padding: "0.05rem 0.4rem" }} onClick={toggle} aria-label="Hide notes">
            ✕
          </button>
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <DmDockBody key={sid} sessionId={sid!} onSessionChange={setPinned} />
      </div>
    </div>
  );
}
