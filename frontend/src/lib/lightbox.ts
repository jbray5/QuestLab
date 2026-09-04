/**
 * Lightbox helpers — dispatch to the single overlay mounted in App.
 */

export interface LightboxDetail {
  src: string;
  caption?: string;
}

/** Open the shared lightbox for `src`. */
export function openLightbox(src: string, caption?: string) {
  window.dispatchEvent(new CustomEvent<LightboxDetail>("ql:lightbox", { detail: { src, caption } }));
}

/** Props to spread onto an <img> so a tap enlarges it. */
export function zoomable(src: string | null | undefined, caption?: string) {
  if (!src) return {};
  return {
    role: "button" as const,
    tabIndex: 0,
    title: "Tap to enlarge",
    style: { cursor: "zoom-in" as const },
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      openLightbox(src, caption);
    },
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(src, caption);
      }
    },
  };
}
