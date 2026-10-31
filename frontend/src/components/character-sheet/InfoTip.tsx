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
          border: `1px solid ${open ? "var(--accent-line)" : "var(--border2)"}`,
          background: open ? "var(--accent-active)" : "transparent",
          color: open ? "var(--accent-active-text)" : "var(--muted)",
          fontFamily: "inherit",
          fontWeight: 600,
          fontSize: "0.75rem",
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
            maxWidth: "calc(100vw - 2rem)",
            background: "var(--surface)",
            border: "1px solid var(--border2)",
            borderRadius: 8,
            padding: "0.65rem 0.8rem",
            boxShadow: "0 10px 28px rgba(0,0,0,0.5)",
            fontSize: "0.875rem",
            lineHeight: 1.5,
            color: "var(--text2)",
            textTransform: "none",
            letterSpacing: "normal",
            fontWeight: 400,
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontWeight: 600,
              color: "var(--text)",
              marginBottom: "0.3rem",
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
