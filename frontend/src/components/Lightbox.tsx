import { useEffect, useState } from "react";

import type { LightboxDetail } from "../lib/lightbox";

/**
 * Lightbox — tap any portrait to see it big.
 *
 * One overlay for the whole app (mounted once in App.tsx). Any image opts
 * in with `{...zoomable(src, caption)}`: it gets a zoom cursor, keyboard
 * access, and a tap that opens the full-size art with a caption. Closes on
 * tap, ✕, or Escape. Works on player pages and DM pages alike.
 */

const CSS = `
.ql-lightbox { position: fixed; inset: 0; z-index: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 2.5vh 2vw; background: rgba(4,3,8,0.92); backdrop-filter: blur(6px); cursor: zoom-out; animation: qlLbIn 0.16s ease-out; }
.ql-lightbox img { max-width: 96vw; max-height: 84vh; object-fit: contain; border-radius: 12px; box-shadow: 0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(214,175,54,0.15); }
.ql-lightbox figcaption { font-family: Cinzel, Georgia, serif; color: #f0e6c8; letter-spacing: 0.06em; font-size: clamp(0.95rem, 2.6vw, 1.3rem); text-align: center; }
.ql-lightbox .x { position: fixed; top: max(10px, env(safe-area-inset-top)); right: 12px; width: 40px; height: 40px; border-radius: 50%; border: 1px solid rgba(240,230,200,0.35); background: rgba(10,8,16,0.7); color: #f0e6c8; font-size: 1.1rem; cursor: pointer; }
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
      <button className="x" aria-label="Close" onClick={() => setItem(null)}>✕</button>
      <img src={item.src} alt={item.caption ?? ""} onClick={(e) => e.stopPropagation()} style={{ cursor: "default" }} />
      {item.caption && <figcaption>{item.caption}</figcaption>}
    </figure>
  );
}
