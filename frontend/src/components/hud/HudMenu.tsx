import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";

export interface HudMenuItem {
  key: string;
  label: string;
  /** A small line icon (lucide, ~16px) shown before the label. */
  icon?: ReactNode;
  /** One line saying what it is for. */
  hint?: string;
  /** Marks the pick most people want. */
  recommended?: boolean;
  /** A destructive pick (ending, clearing): its label reads red. */
  danger?: boolean;
  disabled?: boolean;
  /** An action that stays on the page. */
  onSelect?: () => void;
  /** An in-app page. */
  to?: string;
  /** A page that opens in a new tab (e.g. the TV view). */
  href?: string;
}

/**
 * A compact dropdown for the HUD's top bar (review 10/30): nine buttons became
 * a few menus, each item with a one-line hint. Closes on a pick, a click
 * elsewhere, or Escape. Navigation items are real links (new tab works).
 * Lamplit (Plan 121): icon + short label on a neutral outline button.
 */
export default function HudMenu({
  label,
  icon,
  iconOnly = false,
  title,
  items,
  footer,
}: {
  label: string;
  /** A small line icon shown before the label. */
  icon?: ReactNode;
  /** Show only the icon (a "⋯" menu); the label becomes the accessible name. */
  iconOnly?: boolean;
  title?: string;
  items: HudMenuItem[];
  footer?: HudMenuItem[];
}) {
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

  const row = (it: HudMenuItem) => {
    const body = (
      <>
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: it.danger ? "var(--danger-text)" : "var(--text)",
            fontSize: "0.875rem",
            fontWeight: 500,
          }}
        >
          {it.icon && (
            <span aria-hidden style={{ display: "inline-flex", color: it.danger ? "var(--danger-text)" : "var(--muted)", width: 16 }}>
              {it.icon}
            </span>
          )}
          {it.label}
          {it.recommended && (
            <span className="pill" style={{ fontSize: "0.75rem", padding: "0 0.5rem", marginLeft: "auto" }}>
              Recommended
            </span>
          )}
        </span>
        {it.hint && (
          <span
            style={{
              display: "block",
              color: "var(--muted)",
              fontSize: "0.78rem",
              lineHeight: 1.4,
              marginTop: 2,
              paddingLeft: it.icon ? "calc(16px + 0.5rem)" : 0,
            }}
          >
            {it.hint}
          </span>
        )}
      </>
    );
    const style: React.CSSProperties = {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "0.5rem 0.7rem",
      background: "transparent",
      border: "none",
      borderRadius: 7,
      cursor: it.disabled ? "not-allowed" : "pointer",
      opacity: it.disabled ? 0.5 : 1,
      textDecoration: "none",
      font: "inherit",
    };
    const close = () => setOpen(false);
    if (it.to && !it.disabled) {
      return (
        <Link key={it.key} to={it.to} role="menuitem" style={style} className="ql-hud-menu-item" onClick={close}>
          {body}
        </Link>
      );
    }
    if (it.href && !it.disabled) {
      return (
        <a key={it.key} href={it.href} target="_blank" rel="noreferrer" role="menuitem" style={style} className="ql-hud-menu-item" onClick={close}>
          {body}
        </a>
      );
    }
    return (
      <button
        key={it.key}
        type="button"
        role="menuitem"
        style={style}
        className="ql-hud-menu-item"
        disabled={it.disabled}
        onClick={() => {
          close();
          it.onSelect?.();
        }}
      >
        {body}
      </button>
    );
  };

  return (
    <div ref={root} style={{ position: "relative" }}>
      <button
        type="button"
        className={iconOnly ? "btn btn-ghost" : "btn btn-secondary"}
        style={{
          minHeight: 30,
          padding: iconOnly ? "0.25rem 0.45rem" : "0.25rem 0.55rem 0.25rem 0.65rem",
          fontSize: "0.8125rem",
          gap: "0.4rem",
          background: open ? "var(--surface3)" : undefined,
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={iconOnly ? label : undefined}
        title={title ?? (iconOnly ? label : undefined)}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {!iconOnly && label}
        {!iconOnly && <ChevronDown size={14} aria-hidden style={{ color: "var(--muted)", marginLeft: -2 }} />}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 60,
            minWidth: 290,
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            borderRadius: 10,
            boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
            padding: "0.3rem",
          }}
        >
          {items.map(row)}
          {footer && footer.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid var(--border)", margin: "0.3rem 0.4rem" }} />
              <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--muted)", padding: "0.15rem 0.7rem" }}>
                More
              </div>
              {footer.map(row)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
