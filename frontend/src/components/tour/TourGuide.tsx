import { useEffect, useLayoutEffect, useState } from "react";

import Flourish from "../Flourish";
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
 */
export default function TourGuide() {
  const { isOpen, stepIndex, next, prev, close } = useTourStore();
  const step: TourStep | undefined = TOUR_STEPS[stepIndex];
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Recompute the spotlight rect whenever the step changes or the
  // window resizes. Re-runs on next paint so the target has had a
  // chance to mount.
  useLayoutEffect(() => {
    if (!isOpen || !step) return;
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
  }, [isOpen, step, stepIndex]);

  // Keyboard nav.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      else if (e.key === "ArrowLeft") prev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, stepIndex]);

  if (!isOpen || !step) return null;

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  function handleNext() {
    if (isLast) close();
    else next();
  }

  // Card position: anchored to the spotlight if there's a target,
  // otherwise centered.
  const cardPos = rect
    ? placeCard(rect, step.placement ?? "right")
    : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };

  return (
    <div
      aria-modal
      role="dialog"
      aria-label={`Tour step ${stepIndex + 1} of ${TOUR_STEPS.length}: ${step.title}`}
      style={overlayWrapStyle}
    >
      {/* SVG scrim with optional spotlight cutout */}
      <svg
        width="100%"
        height="100%"
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
            stroke="#c9a84c"
            strokeWidth={2}
            style={{ pointerEvents: "none", filter: "drop-shadow(0 0 12px rgba(201,168,76,0.65))" }}
          />
        )}
      </svg>

      {/* The card */}
      <div
        className="ql-modal-in"
        onClick={(e) => e.stopPropagation()}
        style={{ ...cardStyle, ...cardPos } as React.CSSProperties}
      >
        <header style={cardHeaderStyle}>
          <span style={stepBadgeStyle}>
            Step {stepIndex + 1} / {TOUR_STEPS.length}
          </span>
          <button onClick={close} style={closeBtnStyle} title="Skip tour (Esc)">
            ✕
          </button>
        </header>
        <h3 style={cardTitleStyle}>{step.title}</h3>
        <Flourish width={140} />
        <p style={cardBodyStyle}>{step.body}</p>

        <footer style={cardFooterStyle}>
          <button
            onClick={prev}
            disabled={isFirst}
            className="btn btn-ghost"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem", visibility: isFirst ? "hidden" : "visible" }}
          >
            ← Back
          </button>
          <button onClick={close} className="btn btn-ghost" style={{ fontSize: "0.78rem", padding: "0.35rem 0.7rem" }}>
            Skip
          </button>
          <button
            onClick={handleNext}
            className="btn btn-primary"
            style={{ fontSize: "0.85rem", padding: "0.4rem 0.95rem" }}
          >
            {isLast ? "Finish ✓" : "Next →"}
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
  boxShadow: "0 8px 36px rgba(0,0,0,0.65), 0 0 36px rgba(201,168,76,0.15)",
  pointerEvents: "auto",
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "0.35rem",
};

const stepBadgeStyle: React.CSSProperties = {
  fontSize: "0.62rem",
  color: "var(--muted)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  fontFamily: "monospace",
};

const closeBtnStyle: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--muted)",
  width: 26,
  height: 26,
  cursor: "pointer",
  fontSize: "0.85rem",
  lineHeight: 1,
  padding: 0,
};

const cardTitleStyle: React.CSSProperties = {
  margin: "0.1rem 0 0",
  fontSize: "1.05rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
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
