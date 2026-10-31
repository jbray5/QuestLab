import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

import Flourish from "../Flourish";
import { useDialogFocus } from "../../hooks/useDialogFocus";
import { useTourStore } from "../../stores/useTourStore";
import { TOUR_STEPS, type TourStep } from "./tour-steps";

/**
 * Spotlight tour overlay (Plan 00036).
 *
 * Renders nothing when the tour is closed. When open, paints a dark
 * scrim with a transparent "spotlight" cutout over the current step's
 * target element (if any) and a card with the step copy plus prev/next
 * controls.
 *
 * The spotlight is implemented as a single SVG ``<rect>`` covering the
 * viewport with a ``mask`` that cuts a hole at the target's bounding
 * box — cheaper and crisper than two-element CSS approaches.
 *
 * Keyboard (Plan 128): the card is a modal dialog. Focus moves to the step's
 * title when it opens and on every step (so a screen reader reads the new
 * step), Tab stays inside the card, Enter or the right arrow goes on, the left
 * arrow goes back, Escape skips, and focus returns to where it was afterwards.
 */
export default function TourGuide() {
  const isOpen = useTourStore((s) => s.isOpen);
  if (!isOpen) return null;
  return <TourCard />;
}

/** The open tour. Mounted only while open, so focus is taken and returned once. */
function TourCard() {
  const { stepIndex, next, prev, close } = useTourStore();
  const step: TourStep | undefined = TOUR_STEPS[stepIndex];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  useDialogFocus(cardRef, { onEscape: close });

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  // Recompute the spotlight rect whenever the step changes or the
  // window resizes. Re-runs on next paint so the target has had a
  // chance to mount.
  useLayoutEffect(() => {
    if (!step) return;
    function compute() {
      if (!step?.targetSelector) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.targetSelector);
      if (!el) {
        setRect(null);
        return;
      }
      const r = (el as HTMLElement).getBoundingClientRect();
      // A target in the closed phone nav drawer (or otherwise off screen) gets
      // no spotlight; the card shows centred instead (Plan 123).
      if (r.width === 0 || r.right <= 0 || r.left >= window.innerWidth) {
        setRect(null);
        return;
      }
      setRect(r);
      // Scroll into view if outside the viewport.
      const vh = window.innerHeight;
      if (r.top < 80 || r.bottom > vh - 80) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
    compute();
    window.addEventListener("resize", compute);
    const iv = window.setInterval(compute, 250); // catch layout shifts
    return () => {
      window.removeEventListener("resize", compute);
      window.clearInterval(iv);
    };
  }, [step, stepIndex]);

  // Every step puts focus on its title: nothing drops to <body> when a button
  // hides (Back on the first step), and a screen reader reads the new step.
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, [stepIndex]);

  // Arrow keys anywhere; Enter only when focus isn't on a button (a button's
  // own Enter is its click, so Enter on Back no longer also means Next).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      const onControl = !!t?.closest("button, a[href]");
      if (e.key === "ArrowRight" || (e.key === "Enter" && !onControl)) {
        e.preventDefault();
        if (isLast) close();
        else next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isLast, close, next, prev]);

  if (!step) return null;

  function handleNext() {
    if (isLast) close();
    else next();
  }

  // Card position: a bottom card on phones; otherwise anchored to the
  // spotlight if there's a target, or centred. Centring uses inset + auto
  // margins, not a transform: the ql-modal-in animation owns `transform`
  // and used to push the card off-centre (off-screen on a phone, Plan 123).
  const phone = window.innerWidth <= 640;
  const cardPos: React.CSSProperties = phone
    ? { left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom, 0px))", width: "auto" }
    : rect
      ? placeCard(rect, step.placement ?? "right")
      : { inset: 0, margin: "auto", height: "fit-content" };
  const tap = phone ? 44 : 36;

  return (
    <div style={overlayWrapStyle}>
      {/* SVG scrim with optional spotlight cutout */}
      <svg
        width="100%"
        height="100%"
        aria-hidden
        style={{ position: "fixed", inset: 0, pointerEvents: "auto" }}
        onClick={close}
      >
        <defs>
          <mask id="ql-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={Math.max(0, rect.left - 8)}
                y={Math.max(0, rect.top - 8)}
                width={rect.width + 16}
                height={rect.height + 16}
                rx={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0, 0, 0, 0.72)"
          mask="url(#ql-tour-mask)"
        />
        {rect && (
          <rect
            x={Math.max(0, rect.left - 8)}
            y={Math.max(0, rect.top - 8)}
            width={rect.width + 16}
            height={rect.height + 16}
            rx={10}
            fill="none"
            strokeWidth={2}
            style={{ stroke: "var(--accent)", pointerEvents: "none", filter: "drop-shadow(0 0 12px rgba(227,134,58,0.5))" }}
          />
        )}
      </svg>

      {/* The card */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label="Tour"
        tabIndex={-1}
        className="ql-modal-in ql-quiet-focus"
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, ...cardPos }}
      >
        <header style={cardHeaderStyle}>
          <span id="ql-tour-step" style={stepBadgeStyle}>
            Step <span className="num">{stepIndex + 1}</span> of <span className="num">{TOUR_STEPS.length}</span>
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Skip the tour"
            title="Skip the tour (Esc)"
            style={{ ...closeBtnStyle, width: tap, height: tap }}
          >
            <X size={18} aria-hidden />
          </button>
        </header>
        <h3
          ref={titleRef}
          id="ql-tour-title"
          tabIndex={-1}
          data-dialog-title
          aria-labelledby="ql-tour-step ql-tour-title"
          aria-describedby="ql-tour-body"
          className="ql-quiet-focus"
          style={cardTitleStyle}
        >
          {step.title}
        </h3>
        <Flourish width={140} />
        <p id="ql-tour-body" style={cardBodyStyle}>
          {step.body}
        </p>

        <footer style={cardFooterStyle}>
          <button
            type="button"
            onClick={prev}
            disabled={isFirst}
            className="btn btn-ghost"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem", visibility: isFirst ? "hidden" : "visible" }}
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
          <button
            type="button"
            onClick={close}
            className="btn btn-ghost"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleNext}
            className="btn btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.4rem 0.95rem" }}
          >
            {isLast ? (
              <>
                Finish <Check size={15} aria-hidden />
              </>
            ) : (
              <>
                Next <ArrowRight size={15} aria-hidden />
              </>
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function placeCard(rect: DOMRect, placement: TourStep["placement"]): React.CSSProperties {
  const PADDING = 18;
  const CARD_MAX_W = 360;
  const CARD_EST_H = 280;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let pos: React.CSSProperties = { position: "fixed" as const };

  if (placement === "right" && rect.right + PADDING + CARD_MAX_W <= vw) {
    pos = { ...pos, left: rect.right + PADDING, top: clamp(rect.top, 16, vh - CARD_EST_H - 16) };
  } else if (placement === "left" && rect.left - PADDING - CARD_MAX_W >= 0) {
    pos = { ...pos, right: vw - rect.left + PADDING, top: clamp(rect.top, 16, vh - CARD_EST_H - 16) };
  } else if (placement === "top" && rect.top - PADDING - CARD_EST_H >= 0) {
    pos = {
      ...pos,
      left: clamp(rect.left, 16, vw - CARD_MAX_W - 16),
      bottom: vh - rect.top + PADDING,
    };
  } else {
    // Default / bottom — also the fallback when the preferred side
    // doesn't fit.
    pos = {
      ...pos,
      left: clamp(rect.left, 16, vw - CARD_MAX_W - 16),
      top: Math.min(rect.bottom + PADDING, vh - CARD_EST_H - 16),
    };
  }
  return pos;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayWrapStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9500,
  pointerEvents: "auto",
};

const cardStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 9501,
  width: "min(360px, calc(100vw - 2rem))",
  background: "var(--bg, #1a1a1a)",
  border: "1px solid var(--gold)",
  borderRadius: 12,
  padding: "0.85rem 1.1rem 0.95rem",
  boxShadow: "0 8px 36px rgba(0,0,0,0.65)",
  pointerEvents: "auto",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.35rem",
};

const stepBadgeStyle: React.CSSProperties = {
  fontSize: "0.8125rem",
  color: "var(--muted)",
};

const closeBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "transparent",
  border: "1px solid var(--border2)",
  borderRadius: 8,
  color: "var(--text2)",
  cursor: "pointer",
  padding: 0,
};

const cardTitleStyle: React.CSSProperties = {
  margin: "0.1rem 0 0",
  fontSize: "1.05rem",
  color: "var(--gold)",
  fontFamily: "var(--font-story)",
  letterSpacing: "0.03em",
};

const cardBodyStyle: React.CSSProperties = {
  margin: "0 0 0.85rem",
  fontSize: "0.88rem",
  lineHeight: 1.55,
  color: "var(--text)",
};

const cardFooterStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.45rem",
  alignItems: "center",
  justifyContent: "space-between",
};
