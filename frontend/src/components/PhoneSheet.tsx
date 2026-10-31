import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * A bottom sheet for phones (Plan 123): the detail half of a list → detail page,
 * or a menu, slides up over the page. Tap outside, the close button or Escape to
 * dismiss; the page underneath keeps its scroll position.
 *
 * Render it only when open (`{picked && <PhoneSheet …/>}`). Pair with
 * `useIsCompact(640)` so desktops keep their side-by-side layout.
 */
export default function PhoneSheet({
  title,
  onClose,
  children,
  label,
}: {
  /** Shown in the sheet's header; a string reads in the story font. */
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Accessible name when `title` is not plain text. */
  label?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // Stop the page behind from scrolling while the sheet is up.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Portalled to <body> so no transformed ancestor can trap the fixed sheet.
  return createPortal(
    <>
      <div className="ql-sheet-backdrop" onClick={onClose} />
      <div
        className="ql-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
      >
        <div className="ql-sheet-head">
          <div
            className={typeof title === "string" ? "story" : undefined}
            style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.1rem", color: "var(--text)" }}
          >
            {title}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close"
            style={{ minWidth: 44, minHeight: 44, padding: 0, justifyContent: "center" }}
          >
            <X size={20} />
          </button>
        </div>
        <div className="ql-sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}
