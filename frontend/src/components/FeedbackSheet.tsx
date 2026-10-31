import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Bug, Heart, HelpCircle, Lightbulb, X } from "lucide-react";

import { betaApi, type FeedbackKind } from "../api/beta";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { useIsCompact } from "../hooks/useIsCompact";
import PhoneSheet from "./PhoneSheet";

const KINDS: { key: FeedbackKind; label: string; icon: React.ReactNode; prompt: string }[] = [
  { key: "loved", label: "Loved it", icon: <Heart size={16} aria-hidden />, prompt: "What worked? Even one line helps." },
  { key: "confusing", label: "Confusing", icon: <HelpCircle size={16} aria-hidden />, prompt: "What were you trying to do, and where did it lose you?" },
  { key: "broken", label: "Broken", icon: <Bug size={16} aria-hidden />, prompt: "What did you tap, what happened, and what did you expect?" },
  { key: "idea", label: "Idea", icon: <Lightbulb size={16} aria-hidden />, prompt: "What would make your next session easier?" },
];

/**
 * FeedbackSheet (Plan 125) — the beta's two-tap feedback.
 *
 * Opens from the nav on any DM page. Pick a kind, write a line, send. The page
 * and screen size ride along so Justin can find what you mean. A bottom sheet
 * on phones, a small dialog on a laptop.
 *
 * Plan 128: focus starts in the text box (on a touch screen, on the title, so
 * the keyboard doesn't jump up), the kinds are a real radio group (arrow keys),
 * and "Thank you" is spoken when it appears.
 */
export default function FeedbackSheet({ onClose }: { onClose: () => void }) {
  const phone = useIsCompact(640);
  // A finger, not a keyboard: don't raise the on-screen keyboard uninvited.
  const touch = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;
  const location = useLocation();
  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const current = KINDS.find((k) => k.key === kind)!;
  const kindsRef = useRef<HTMLDivElement>(null);
  const thanksRef = useRef<HTMLDivElement>(null);

  // The form (and the button that had focus) is gone once it's sent: put focus
  // on the thank-you note so a keyboard user isn't dropped on the page.
  useEffect(() => {
    if (state === "sent") thanksRef.current?.focus({ preventScroll: true });
  }, [state]);

  async function send() {
    if (!text.trim()) return;
    setState("sending");
    try {
      await betaApi.sendFeedback({
        kind,
        text: text.trim(),
        page: `${location.pathname}${location.search}`.slice(0, 300),
        viewport: `${window.innerWidth}×${window.innerHeight}`,
      });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  /** Arrow keys move through the kinds, as in any radio group. */
  function onKindKey(e: React.KeyboardEvent, index: number) {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + KINDS.length) % KINDS.length;
    setKind(KINDS[next].key);
    kindsRef.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  }

  const body = (
    <>
      {/* Always mounted, so a screen reader hears "Thank you" when it lands. */}
      <div role="status" aria-live="polite">
        {state === "sent" && (
          <div
            ref={thanksRef}
            tabIndex={-1}
            className="ql-quiet-focus"
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "0.75rem" }}
          >
            <p className="story" style={{ fontSize: "1.2rem", margin: 0 }}>
              Thank you.
            </p>
            <p style={{ margin: 0, color: "var(--text2)", lineHeight: 1.5 }}>
              It went straight to Justin, with the page you were on. Every note gets read.
            </p>
          </div>
        )}
      </div>
      {state === "sent" ? (
        <button type="button" className="btn btn-primary" style={{ minHeight: 44, width: "100%" }} onClick={onClose}>
          Back to the table
        </button>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
          <div
            ref={kindsRef}
            role="radiogroup"
            aria-label="What kind of feedback"
            style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}
          >
            {KINDS.map((k, i) => {
              const on = k.key === kind;
              return (
                <button
                  key={k.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setKind(k.key)}
                  onKeyDown={(e) => onKindKey(e, i)}
                  className="btn btn-ghost"
                  style={{
                    minHeight: 44,
                    gap: "0.4rem",
                    border: `1px solid ${on ? "var(--accent-edge)" : "var(--border2)"}`,
                    background: on ? "var(--accent-active)" : "transparent",
                    color: on ? "var(--accent-active-text)" : "var(--text2)",
                  }}
                >
                  {k.icon} {k.label}
                </button>
              );
            })}
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.35rem", fontSize: "0.875rem", color: "var(--text2)" }}>
            {current.prompt}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={5}
              autoFocus={!touch}
              style={{ width: "100%", fontSize: 16, lineHeight: 1.5 }}
            />
          </label>
          {state === "error" && (
            <p role="alert" style={{ margin: 0, color: "var(--danger-text)", fontSize: "0.875rem" }}>
              That didn't send. Check your connection and try again.
            </p>
          )}
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 44 }}
            disabled={!text.trim() || state === "sending"}
            onClick={() => void send()}
          >
            {state === "sending" ? "Sending…" : "Send to Justin"}
          </button>
          <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--muted)" }}>
            Sent with the page you're on and your screen size. Nothing else.
          </p>
        </div>
      )}
    </>
  );

  if (phone) {
    return (
      <PhoneSheet title="Send feedback" onClose={onClose}>
        {body}
      </PhoneSheet>
    );
  }
  return <FeedbackDialog onClose={onClose}>{body}</FeedbackDialog>;
}

/** The laptop version: a small centred dialog with the same focus rules as a sheet. */
function FeedbackDialog({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const boxRef = useRef<HTMLDivElement>(null);
  useDialogFocus(boxRef, { onEscape: onClose });
  return createPortal(
    <>
      <div className="ql-sheet-backdrop" onClick={onClose} />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ql-feedback-title"
        tabIndex={-1}
        className="ql-quiet-focus"
        style={{
          position: "fixed",
          zIndex: 9001,
          inset: 0,
          margin: "auto",
          width: "min(460px, calc(100vw - 2rem))",
          height: "fit-content",
          maxHeight: "calc(100dvh - 2rem)",
          overflowY: "auto",
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 14,
          boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
          padding: "1rem 1.1rem 1.1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: "0.75rem" }}>
          <h2
            id="ql-feedback-title"
            data-dialog-title
            tabIndex={-1}
            className="story ql-quiet-focus"
            style={{ margin: 0, fontSize: "1.25rem", flex: 1 }}
          >
            Send feedback
          </h2>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label="Close"
            onClick={onClose}
            style={{ minWidth: 36, minHeight: 36, padding: 0, justifyContent: "center" }}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
