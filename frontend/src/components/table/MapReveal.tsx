import { useEffect, useState } from "react";

/**
 * MapReveal (Plan 64) — the "you have arrived" moment. When the DM stages
 * a new map mid-session, the player surface dips to black, the map art
 * breathes in under a slow Ken Burns zoom and a heavy vignette, the
 * location title lands center-frame, and the whole card dissolves into
 * the live board. Click/tap skips. Reduced motion gets a plain crossfade.
 *
 * Shared by the 2D projector (TableView) and the 3D player board.
 */

export interface RevealSubject {
  /** Unique per reveal (map id + sequence) so re-staging replays. */
  key: string;
  title: string;
  imageUrl: string;
}

const HOLD_MS = 5200;

const CSS = `
.ql-mapreveal {
  position: fixed; inset: 0; z-index: 90; background: #04030a;
  overflow: hidden; cursor: pointer;
  animation: qlRevealFadeOut 0.9s ease ${(HOLD_MS - 900) / 1000}s forwards;
}
.ql-mapreveal-art {
  position: absolute; inset: 0;
  background-size: cover; background-position: center;
  animation: qlRevealArt ${HOLD_MS / 1000}s cubic-bezier(0.25,0.1,0.25,1) forwards;
}
.ql-mapreveal-vignette {
  position: absolute; inset: 0;
  background:
    radial-gradient(120% 90% at 50% 45%, transparent 30%, rgba(4,3,10,0.55) 72%, rgba(4,3,10,0.95) 100%),
    linear-gradient(to bottom, rgba(4,3,10,0.65) 0%, transparent 22%, transparent 66%, rgba(4,3,10,0.85) 100%);
}
.ql-mapreveal-card {
  position: absolute; left: 0; right: 0; bottom: 16vh;
  display: flex; flex-direction: column; align-items: center; gap: 0.7rem;
  animation: qlRevealCard 1.1s cubic-bezier(0.16,1,0.3,1) 0.9s backwards;
}
.ql-mapreveal-sub {
  color: #c9b989; text-transform: uppercase; letter-spacing: 0.55em;
  font-size: clamp(0.65rem, 1.4vw, 0.95rem); font-family: Georgia, serif;
  padding-left: 0.55em; /* optically recenters the tracked-out caps */
}
.ql-mapreveal-title {
  color: #f2e3ae; font-family: Georgia, 'Palatino Linotype', serif;
  font-size: clamp(1.8rem, 5.5vw, 4.2rem); letter-spacing: 0.12em;
  text-align: center; text-shadow: 0 4px 30px rgba(0,0,0,0.95);
  padding: 0 6vw; text-wrap: balance;
}
.ql-mapreveal-rule {
  width: min(340px, 46vw); height: 2px; border-radius: 2px;
  background: linear-gradient(90deg, transparent, #d8b95c 30%, #d8b95c 70%, transparent);
  animation: qlRevealRule 1s cubic-bezier(0.16,1,0.3,1) 1.15s backwards;
}
@keyframes qlRevealArt {
  0% { opacity: 0; transform: scale(1.14); }
  14% { opacity: 1; }
  100% { opacity: 1; transform: scale(1.02); }
}
@keyframes qlRevealCard { from { opacity: 0; transform: translateY(2.5vh); } to { opacity: 1; transform: none; } }
@keyframes qlRevealRule { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes qlRevealFadeOut { to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .ql-mapreveal-art { animation: qlRevealFadeIn 0.4s ease forwards; }
  .ql-mapreveal-card, .ql-mapreveal-rule { animation-duration: 0.01s; animation-delay: 0s; }
}
@keyframes qlRevealFadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

/** Plays one cinematic per `subject.key`; self-dismisses, click skips. */
export default function MapReveal({ subject }: { subject: RevealSubject | null }) {
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    const timer = window.setTimeout(() => setDismissedKey(subject.key), HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [subject]);

  const visible = subject && subject.key !== dismissedKey ? subject : null;
  if (!visible) return null;
  return (
    <div
      className="ql-mapreveal"
      key={visible.key}
      aria-live="polite"
      onClick={() => setDismissedKey(visible.key)}
    >
      <style>{CSS}</style>
      <div className="ql-mapreveal-art" style={{ backgroundImage: `url(${visible.imageUrl})` }} />
      <div className="ql-mapreveal-vignette" />
      <div className="ql-mapreveal-card">
        <div className="ql-mapreveal-sub">You have arrived</div>
        <div className="ql-mapreveal-title">{visible.title}</div>
        <div className="ql-mapreveal-rule" />
      </div>
    </div>
  );
}
