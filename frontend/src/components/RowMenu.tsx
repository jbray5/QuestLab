import { useEffect, useRef, useState } from "react";

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
        style={{ fontSize: "0.85rem", padding: "0.2rem 0.55rem", lineHeight: 1 }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={() => setOpen((v) => !v)}
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 40,
            minWidth: 160,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
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
                padding: "0.4rem 0.65rem",
                background: "transparent",
                border: "none",
                borderRadius: 6,
                cursor: it.disabled ? "not-allowed" : "pointer",
                color: it.danger ? "var(--red)" : "var(--text)",
                font: "inherit",
                fontSize: "0.9rem",
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
