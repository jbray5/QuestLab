import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ellipsis } from "lucide-react";

import { useIsCompact } from "../hooks/useIsCompact";
import PhoneSheet from "./PhoneSheet";

export interface RowMenuItem {
  label: string;
  onSelect: () => void;
  /** Destructive: drawn in red, and asks first with `confirm`. */
  danger?: boolean;
  /** The question to ask before running it — name the thing being deleted. */
  confirm?: string;
  disabled?: boolean;
}

/**
 * The "⋯" overflow menu for list rows (review 10/30). Destructive actions
 * live here, never as a one-click button beside the row's everyday ones,
 * and always ask first in words that name what is about to go.
 * Phones (Plan 123): the list opens as a bottom sheet, so it never runs off
 * the screen edge and every pick is thumb-sized. On desktop the popover is
 * portalled and placed from the button, so a card's `overflow: hidden` (the
 * last session in an arc) can't clip it, and it opens upward near the bottom.
 */
export default function RowMenu({ items, label = "More actions" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; bottom: number; right: number; up: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const phone = useIsCompact(640);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btn.current?.getBoundingClientRect();
    if (r) {
      setPos({
        top: r.bottom + 4,
        bottom: window.innerHeight - r.top + 4,
        right: Math.max(8, window.innerWidth - r.right),
        // Not enough room below for the list: open it upward.
        up: window.innerHeight - r.bottom < 48 * items.length + 24,
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    // On a phone the sheet's backdrop and Escape handler close it.
    if (!open || phone) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (root.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // The popover is placed in screen coordinates: any scroll or resize closes it.
    const onMove = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, phone]);

  const list = items.map((it) => (
    <button
      key={it.label}
      type="button"
      role="menuitem"
      className="ql-hud-menu-item"
      disabled={it.disabled}
      onClick={() => {
        setOpen(false);
        if (it.confirm && !window.confirm(it.confirm)) return;
        it.onSelect();
      }}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        minHeight: phone ? 48 : 40,
        padding: phone ? "0.75rem 0.5rem" : "0.5rem 0.75rem",
        background: "transparent",
        border: "none",
        borderRadius: 6,
        cursor: it.disabled ? "not-allowed" : "pointer",
        color: it.danger ? "var(--danger-text)" : "var(--text)",
        opacity: it.disabled ? 0.45 : 1,
        font: "inherit",
        fontSize: phone ? "1rem" : "0.9375rem",
      }}
    >
      {it.label}
    </button>
  ));

  return (
    <div ref={root} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button
        ref={btn}
        type="button"
        className="btn btn-ghost"
        style={{
          padding: "0.3rem 0.5rem",
          minWidth: phone ? 44 : "2.375rem",
          minHeight: phone ? 44 : undefined,
          lineHeight: 1,
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={toggle}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {open && phone && (
        // Rendered inside `root` so React's click bubbling still stops at the
        // row (the sheet itself is portalled to <body>).
        <PhoneSheet
          title={<span style={{ fontFamily: "var(--font-ui)", fontWeight: 600 }}>{label}</span>}
          label={label}
          onClose={() => setOpen(false)}
        >
          <div role="menu" aria-label={label}>
            {list}
          </div>
        </PhoneSheet>
      )}
      {open &&
        !phone &&
        pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            // React events still bubble to `root`, which stops them at the row.
            style={{
              position: "fixed",
              right: pos.right,
              ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
              zIndex: 400,
              minWidth: 170,
              background: "var(--surface)",
              border: "1px solid var(--border2)",
              borderRadius: 8,
              boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
              padding: "0.25rem",
            }}
          >
            {list}
          </div>,
          document.body,
        )}
    </div>
  );
}
