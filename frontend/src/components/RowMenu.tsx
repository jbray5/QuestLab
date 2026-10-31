import { useEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";

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
 */
export default function RowMenu({ items, label = "More actions" }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ padding: "0.3rem 0.5rem", minWidth: "2.375rem", lineHeight: 1 }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        <Ellipsis size={16} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 40,
            minWidth: 170,
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            padding: "0.25rem",
          }}
        >
          {items.map((it) => (
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
                minHeight: 40,
                padding: "0.5rem 0.75rem",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: it.disabled ? "not-allowed" : "pointer",
                color: it.danger ? "var(--danger-text)" : "var(--text)",
                opacity: it.disabled ? 0.45 : 1,
                font: "inherit",
                fontSize: "0.9375rem",
              }}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
