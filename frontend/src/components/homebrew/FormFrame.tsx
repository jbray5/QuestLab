import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useIsCompact } from "../../hooks/useIsCompact";
import PhoneSheet from "../PhoneSheet";
import { ERR, HINT } from "./options";

/**
 * FormFrame (Plan 133) — the frame for the race and subclass forms: a bottom sheet with the
 * save bar pinned to its foot on a phone, a centred dialog with a header and footer on a
 * laptop (MonsterForm's layout). A stray click outside never closes a long form; Escape
 * and the close button go through `onClose`, which asks first when there are changes.
 */
export default function FormFrame({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const phone = useIsCompact(640);
  if (phone) {
    return (
      <PhoneSheet title={title} onClose={onClose}>
        <div className="ql-tap">{children}</div>
        <div
          className="ql-tap"
          style={{
            position: "sticky",
            bottom: "-1rem",
            margin: "1rem -1rem -1rem",
            padding: "0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom, 0px))",
            background: "var(--surface)",
            borderTop: "1px solid var(--border)",
            zIndex: 1,
          }}
        >
          {footer}
        </div>
      </PhoneSheet>
    );
  }
  return (
    <DesktopDialog title={title} onClose={onClose} footer={footer}>
      {children}
    </DesktopDialog>
  );
}

function DesktopDialog({
  title,
  onClose,
  footer,
  children,
}: {
  title: string;
  onClose: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useDialogFocus(box, { onEscape: onClose });
  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(5, 8, 7, 0.8)",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "2rem 1rem",
        overflowY: "auto",
      }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="fade-in ql-quiet-focus"
        style={{
          background: "var(--bg)",
          border: "1px solid var(--border2)",
          borderRadius: 12,
          maxWidth: 720,
          width: "100%",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100dvh - 4rem)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "0.85rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
          }}
        >
          <h2 data-dialog-title tabIndex={-1} className="story ql-quiet-focus" style={{ margin: 0, fontSize: "1.35rem", minWidth: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{ width: 36, height: 36, minHeight: 0, padding: 0, flexShrink: 0, justifyContent: "center" }}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <div style={{ padding: "1rem 1.25rem", overflowY: "auto", flex: 1 }}>{children}</div>
        <footer style={{ padding: "0.7rem 1.25rem", borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
          {footer}
        </footer>
      </div>
    </div>,
    document.body,
  );
}

/** A section heading inside a form, with an optional plain-words hint under it. */
export function FormSection({ title, hint, children }: { title: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <section style={{ marginTop: "1.25rem" }}>
      <h3
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "0.9375rem",
          fontWeight: 600,
          color: "var(--text)",
          margin: 0,
          paddingBottom: "0.3rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
      </h3>
      {hint && <p style={{ ...HINT, margin: "0.35rem 0 0.6rem" }}>{hint}</p>}
      {!hint && <div style={{ height: "0.6rem" }} />}
      {children}
    </section>
  );
}

/** A toggle chip (a multi-select option): pressed reads in the accent colour. */
export function ToggleChip({
  on,
  onClick,
  children,
  phone,
  label,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  phone: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={on ? "btn btn-secondary" : "btn btn-ghost"}
      style={{
        minHeight: phone ? 44 : 34,
        padding: "0.3rem 0.75rem",
        border: `1px solid ${on ? "var(--accent-line)" : "var(--border2)"}`,
        background: on ? "var(--accent-soft)" : "transparent",
        color: on ? "var(--accent-text)" : "var(--text2)",
        fontWeight: on ? 600 : 400,
        fontSize: "0.875rem",
      }}
    >
      {children}
    </button>
  );
}

/** The save bar: what to fix, the server's refusal, then Cancel and Save. */
export function SaveBar({
  phone,
  problems,
  serverError,
  saving,
  saveLabel,
  onCancel,
  onSave,
  onFixName,
}: {
  phone: boolean;
  problems: number;
  serverError: string | null;
  saving: boolean;
  saveLabel: string;
  onCancel: () => void;
  onSave: () => void;
  /** Shown with a name clash (the 409 says "its own name"): one tap back to the name. */
  onFixName: () => void;
}) {
  return (
    <>
      {problems > 0 && (
        <p role="alert" style={{ ...ERR, margin: "0 0 0.5rem" }}>
          {problems === 1 ? "One thing needs a fix" : `${problems} things need a fix`}: see the red notes above.
        </p>
      )}
      {serverError && (
        <p role="alert" style={{ ...ERR, margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
          {serverError}
          {/own name/i.test(serverError) && (
            <>
              {" "}
              <button
                type="button"
                className="btn btn-ghost"
                onClick={onFixName}
                style={{ minHeight: phone ? 44 : undefined, padding: "0.2rem 0.5rem", fontSize: "0.875rem" }}
              >
                Change the name
              </button>
            </>
          )}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving} style={{ minHeight: 44 }}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSave}
          disabled={saving}
          style={{ minHeight: 44, flex: phone ? 1 : undefined, justifyContent: "center" }}
        >
          {saving ? "Saving…" : saveLabel}
        </button>
      </div>
    </>
  );
}
