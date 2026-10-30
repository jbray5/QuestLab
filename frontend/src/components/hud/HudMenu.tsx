import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

export interface HudMenuItem {
  key: string;
  label: string;
  /** One line saying what it is for. */
  hint?: string;
  /** Marks the pick most people want. */
  recommended?: boolean;
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
 */
export default function HudMenu({
  label,
  title,
  items,
  footer,
}: {
  label: string;
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
        <span style={{ display: "block", color: "var(--text)", fontSize: "0.82rem" }}>
          {it.label}
          {it.recommended && (
            <span style={{ marginLeft: 6, fontSize: "0.62rem", color: "var(--gold)", letterSpacing: "0.06em" }}>
              RECOMMENDED
            </span>
          )}
        </span>
        {it.hint && <span style={{ display: "block", color: "var(--muted)", fontSize: "0.7rem", marginTop: 1 }}>{it.hint}</span>}
      </>
    );
    const style: React.CSSProperties = {
      display: "block",
      width: "100%",
      textAlign: "left",
      padding: "0.45rem 0.7rem",
      background: "transparent",
      border: "none",
      borderRadius: 6,
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
        className="btn btn-secondary"
        style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem" }}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((v) => !v)}
      >
        {label} ▾
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 60,
            minWidth: 260,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
            padding: "0.3rem",
          }}
        >
          {items.map(row)}
          {footer && footer.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid var(--border)", margin: "0.3rem 0.4rem" }} />
              <div style={{ fontSize: "0.6rem", letterSpacing: "0.1em", color: "var(--muted)", padding: "0.1rem 0.7rem" }}>
                MORE
              </div>
              {footer.map(row)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
