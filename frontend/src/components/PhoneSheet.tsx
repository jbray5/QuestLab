import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useDialogFocus } from "../hooks/useDialogFocus";

/**
 * A bottom sheet for phones (Plan 123): the detail half of a list → detail page,
 * or a menu, slides up over the page. Tap outside, the close button or Escape to
 * dismiss; the page underneath keeps its scroll position.
 *
 * Keyboard and screen readers (Plan 128): focus moves into the sheet when it
 * opens (to a child with `autoFocus` or `data-autofocus`, else the title), Tab
 * stays inside, and focus goes back to the opener on close.
 *
 * The on-screen keyboard (Plan 128): while a phone keyboard covers the bottom of
 * the screen, the sheet rides above it and the focused field scrolls into view.
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
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useDialogFocus(sheetRef, { onEscape: onClose });

  // Stop the page behind from scrolling while the sheet is up.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Keep the sheet above a phone keyboard. iOS lays the keyboard over the page
  // without resizing it, so a sheet pinned to the bottom sits under the keys;
  // visualViewport says how much of the screen is still visible. (Android with
  // `interactive-widget=resizes-content` resizes the page instead: nothing to do.)
  useEffect(() => {
    const sheet = sheetRef.current;
    const vv = window.visualViewport;
    if (!sheet || !vv) return;
    const body = sheet.querySelector<HTMLElement>(".ql-sheet-body");
    let frame = 0;
    let later = 0;

    const reveal = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!body || !el || !body.contains(el) || !isTextField(el)) return;
      const r = el.getBoundingClientRect();
      const b = body.getBoundingClientRect();
      // Show the field and a little of what follows it (usually its button).
      const below = Math.max(0, Math.min(56, b.height - r.height - 24));
      if (r.bottom + below > b.bottom) body.scrollTop += r.bottom + below - b.bottom;
      else if (r.top < b.top + 8) body.scrollTop -= b.top + 8 - r.top;
    };
    const update = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      // Pinch zoom also shrinks the visual viewport; only lift for a keyboard.
      if (vv.scale <= 1.01 && covered > 60) {
        sheet.style.bottom = `${Math.round(covered)}px`;
        sheet.style.maxHeight = `${Math.round(vv.height - 8)}px`;
      } else {
        sheet.style.bottom = "";
        sheet.style.maxHeight = "";
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
    };
    const onFocusIn = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(reveal);
      // Once more after the keyboard has finished sliding up.
      window.clearTimeout(later);
      later = window.setTimeout(reveal, 350);
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    sheet.addEventListener("focusin", onFocusIn);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(later);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      sheet.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  const named = label ?? (typeof title === "string" ? title : undefined);

  // Portalled to <body> so no transformed ancestor can trap the fixed sheet.
  return createPortal(
    <>
      <div className="ql-sheet-backdrop" onClick={onClose} />
      <div
        ref={sheetRef}
        className="ql-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={named}
        aria-labelledby={named === undefined && title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className="ql-sheet-head">
          {title ? (
            <h2
              id={titleId}
              data-dialog-title
              tabIndex={-1}
              className={`ql-sheet-title${typeof title === "string" ? " story" : ""}`}
            >
              {title}
            </h2>
          ) : (
            <div style={{ flex: 1 }} />
          )}
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close"
            style={{ minWidth: 44, minHeight: 44, padding: 0, justifyContent: "center" }}
          >
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="ql-sheet-body">{children}</div>
      </div>
    </>,
    document.body,
  );
}

/** Fields that raise the phone keyboard. */
function isTextField(el: HTMLElement): boolean {
  if (el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !["checkbox", "radio", "range", "button", "submit", "reset", "file", "color", "image"].includes(el.type);
}
