import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * useDialogFocus — keyboard focus for a modal dialog or sheet (Plan 128).
 *
 * Mount it in a component that renders only while the dialog is open, with a
 * ref to the dialog's box:
 * - on open, focus moves inside: to `[data-autofocus]`, else the
 *   `[data-dialog-title]` heading, else the box itself (a child's own
 *   `autoFocus` wins, since focus is then already inside);
 * - Tab and Shift+Tab stay inside while it is open;
 * - Escape calls `onEscape`;
 * - on close, focus goes back to whatever had it before (the opener). If the
 *   opener is gone or hidden, to the dialog underneath, else to `<main>`.
 *
 * Open dialogs form a stack, so only the top one answers Tab and Escape.
 * Give the box `tabIndex={-1}` so it can hold focus as a last resort.
 */
export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  { onEscape }: { onEscape?: () => void } = {},
): void {
  // Who had focus before the dialog opened. Read on the first render, before
  // any autoFocus inside the dialog has moved it.
  const [opener] = useState<HTMLElement | null>(() =>
    typeof document === "undefined" ? null : (document.activeElement as HTMLElement | null),
  );
  const entryRef = useRef<StackEntry>({ root: null });

  // Open: join the stack and take focus. Close: give focus back.
  useEffect(() => {
    const entry = entryRef.current;
    const root = ref.current;
    entry.root = root;
    STACK.push(entry);
    if (root && !root.contains(document.activeElement)) {
      const target =
        root.querySelector<HTMLElement>("[data-autofocus]") ??
        root.querySelector<HTMLElement>("[data-dialog-title]") ??
        root;
      target.focus({ preventScroll: true });
    }
    return () => {
      const at = STACK.lastIndexOf(entry);
      if (at >= 0) STACK.splice(at, 1);
      // Still on the page: not really closed (Strict Mode re-running effects).
      if (root?.isConnected) return;
      const active = document.activeElement;
      // A caller that already moved focus somewhere sensible wins.
      if (active && active !== document.body && !(root && root.contains(active))) return;
      if (opener && opener !== document.body && canTakeFocus(opener)) {
        opener.focus({ preventScroll: true });
        if (document.activeElement === opener) return;
      }
      const under = STACK[STACK.length - 1]?.root;
      if (under && under.isConnected) {
        under.focus({ preventScroll: true });
        return;
      }
      document.getElementById("ql-main")?.focus({ preventScroll: true });
    };
  }, [ref, opener]);

  // Tab stays inside; Escape closes. Only the top dialog listens.
  useEffect(() => {
    const entry = entryRef.current;
    function onKey(e: KeyboardEvent) {
      if (STACK[STACK.length - 1] !== entry) return;
      const root = ref.current;
      if (!root) return;
      const active = document.activeElement as HTMLElement | null;
      // A modal this hook doesn't manage (a nested one, a confirm) owns focus.
      const modal = active?.closest('[aria-modal="true"]');
      if (modal && modal !== root) return;
      if (e.key === "Escape") {
        if (onEscape && !e.defaultPrevented) {
          e.preventDefault();
          onEscape();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items = tabbables(root);
      if (items.length === 0) {
        e.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (!active || !root.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && (active === first || isBefore(active, first))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || isBefore(last, active))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [ref, onEscape]);
}

/** True while any dialog using useDialogFocus is open (the nav drawer defers to it). */
export function isDialogOpen(): boolean {
  return STACK.length > 0;
}

interface StackEntry {
  root: HTMLElement | null;
}

const STACK: StackEntry[] = [];

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "iframe",
  "audio[controls]",
  "video[controls]",
  "summary",
  "[contenteditable]:not([contenteditable='false'])",
  "[tabindex]",
].join(",");

/** The elements Tab can land on inside `root`, in order. */
function tabbables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.tabIndex < 0 || el.closest("[inert]")) return false;
    if (el.getClientRects().length === 0) return false;
    if (getComputedStyle(el).visibility === "hidden") return false;
    // A radio group is one Tab stop: its checked radio (or its first).
    if (el instanceof HTMLInputElement && el.type === "radio" && el.name) {
      const group = Array.from(
        root.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${CSS.escape(el.name)}"]`),
      );
      const checked = group.find((r) => r.checked);
      return checked ? el === checked : el === group[0];
    }
    return true;
  });
}

/** True when `a` comes before `b` in the document. */
function isBefore(a: Node, b: Node): boolean {
  return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
}

/** The opener can only take focus back if it is still on the page and usable. */
function canTakeFocus(el: HTMLElement): boolean {
  if (!el.isConnected || el.closest("[inert]") || el.getClientRects().length === 0) return false;
  return !(el as HTMLButtonElement).disabled;
}
