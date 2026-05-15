import { useEffect, useRef, useState } from "react";

interface Props {
  /** Short heading shown at the top of the popover. */
  title: string;
  /** Body content. Multi-paragraph allowed via newlines or React children. */
  children: React.ReactNode;
  /** Visual size of the (?) badge. Defaults to "sm". */
  size?: "sm" | "md";
}

/**
 * DM-facing info tooltip (Plan 24 polish).
 *
 * A small "?" badge next to a feature heading. Click to toggle a popover
 * with a "when to use this" explanation aimed at new DMs. Clicks outside
 * or ESC closes. Click-toggle (not pure hover) so the DM can read at
 * leisure and copy from the popover if needed.
 */
export default function InfoTip({ title, children, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement | null>(null);

  // Click outside / ESC dismisses
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const dim = size === "md" ? 18 : 15;

  return (
    <span
      ref={containerRef}
      style={{ position: "relative", display: "inline-block", lineHeight: 1 }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Help: ${title}`}
        title={`What is ${title}? (click for DM help)`}
        style={{
          width: dim,
          height: dim,
          minWidth: dim,
          padding: 0,
          borderRadius: "50%",
          border: "1px solid var(--gold)",
          background: open ? "var(--gold)" : "transparent",
          color: open ? "var(--bg, #1a1a1a)" : "var(--gold)",
          fontFamily: "inherit",
          fontWeight: 700,
          fontSize: "0.7rem",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        ?
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          style={{
            position: "absolute",
            top: dim + 6,
            left: 0,
            zIndex: 200,
            width: 280,
            background: "var(--surface, #1f1f1f)",
            border: "1px solid var(--gold)",
            borderRadius: 6,
            padding: "0.6rem 0.75rem",
            boxShadow: "0 4px 16px rgba(0,0,0,0.55)",
            fontSize: "0.78rem",
            lineHeight: 1.45,
            color: "var(--text)",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: 400,
          }}
        >
          <div
            style={{
              fontWeight: 700,
              color: "var(--gold)",
              marginBottom: "0.3rem",
              fontFamily: "Cinzel Decorative, serif",
              letterSpacing: "0.04em",
            }}
          >
            {title}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{children}</div>
        </div>
      )}
    </span>
  );
}
