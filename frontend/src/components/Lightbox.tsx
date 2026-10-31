import { useEffect, useState } from "react";
import { X } from "lucide-react";

import type { LightboxDetail } from "../lib/lightbox";

/**
 * Lightbox — tap any portrait to see it big.
 *
 * One overlay for the whole app (mounted once in App.tsx). Any image opts
 * in with `{...zoomable(src, caption)}`: it gets a zoom cursor, keyboard
 * access, and a tap that opens the full-size art with a caption. Closes on
 * tap, the close button, or Escape. Works on player pages and DM pages alike.
 */

const CSS = `
.ql-lightbox { position: fixed; inset: 0; z-index: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 2.5vh 2vw; background: rgba(5, 8, 7, 0.92); backdrop-filter: blur(6px); cursor: zoom-out; animation: qlLbIn 0.16s ease-out; }
.ql-lightbox img { max-width: 96vw; max-height: 84vh; object-fit: contain; border-radius: 12px; box-shadow: 0 24px 80px rgba(0,0,0,0.7); }
.ql-lightbox figcaption { font-family: var(--font-story); font-weight: 700; color: var(--text); font-size: clamp(1.05rem, 2.6vw, 1.4rem); text-align: center; }
.ql-lightbox .x { position: fixed; top: max(10px, env(safe-area-inset-top)); right: 12px; width: 40px; height: 40px; border-radius: 50%; border: 1px solid var(--border2); background: var(--surface); color: var(--text); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
.ql-lightbox .x:hover { background: var(--surface3); }
@keyframes qlLbIn { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ql-lightbox { animation: none; } }
`;

export default function Lightbox() {
  const [item, setItem] = useState<LightboxDetail | null>(null);

  useEffect(() => {
    const open = (e: Event) => setItem((e as CustomEvent<LightboxDetail>).detail);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") setItem(null);
    };
    window.addEventListener("ql:lightbox", open);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("ql:lightbox", open);
      window.removeEventListener("keydown", key);
    };
  }, []);

  if (!item) return null;
  return (
    <figure className="ql-lightbox" onClick={() => setItem(null)} style={{ margin: 0 }}>
      <style>{CSS}</style>
      <button className="x" aria-label="Close" onClick={() => setItem(null)}>
        <X size={18} />
      </button>
      <img src={item.src} alt={item.caption ?? ""} onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }} />
      {item.caption && <figcaption>{item.caption}</figcaption>}
    </figure>
  );
}
