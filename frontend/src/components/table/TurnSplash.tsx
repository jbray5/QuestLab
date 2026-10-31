import { useEffect, useState } from "react";

/**
 * TurnSplash (Plan 61) — the video-game moment. When a PC's turn starts,
 * their standee art sweeps in over the board with a name plate, holds a
 * beat, and dissolves. Pointer-transparent; purely theatrical.
 *
 * Plan 128 — the band runs across the top of the screen. At the bottom it
 * covered the party's tokens and name plates for its whole three seconds.
 *
 * Shared by both player surfaces (2D TableView and the 3D board).
 */

export interface SplashSubject {
  /** Unique key per splash (token ref + a sequence) so repeats replay. */
  key: string;
  name: string;
  imageUrl: string | null;
}

const CSS = `
.ql-turnsplash {
  position: absolute; inset: 0; z-index: 60; pointer-events: none;
  display: flex; align-items: flex-start; justify-content: flex-start;
  padding: 3vh 0 0 5vw;
}
.ql-turnsplash-band {
  position: absolute; left: 0; right: 0; top: 3vh; height: 19vh;
  background: linear-gradient(90deg, rgba(17,21,19,0.94) 0%, rgba(17,21,19,0.62) 45%, transparent 80%);
  transform-origin: left center;
  animation: qlBandIn 0.28s cubic-bezier(0.16,1,0.3,1), qlBandOut 0.3s ease 2.4s forwards;
}
.ql-turnsplash-art {
  position: relative; height: 23vh; max-height: 300px;
  filter: drop-shadow(0 10px 24px rgba(0,0,0,0.7));
  animation: qlArtIn 0.34s cubic-bezier(0.16,1,0.3,1), qlArtOut 0.3s ease 2.38s forwards;
}
.ql-turnsplash-art img { height: 100%; display: block; }
.ql-turnsplash-plate {
  position: relative; align-self: flex-start; margin: 4.5vh 0 0 2vw;
  animation: qlPlateIn 0.4s cubic-bezier(0.16,1,0.3,1) 0.08s backwards, qlArtOut 0.3s ease 2.38s forwards;
}
.ql-turnsplash-name {
  font-family: var(--font-story); font-weight: 700;
  font-size: clamp(2rem, 7vh, 4.4rem); line-height: 1.05;
  color: var(--text); text-shadow: 0 2px 18px rgba(0,0,0,0.9);
}
.ql-turnsplash-sub {
  font-family: var(--font-ui); font-weight: 600;
  font-size: clamp(1.125rem, 2.8vh, 1.7rem);
  color: var(--accent-text); margin-bottom: 0.15rem;
}
.ql-turnsplash-rule {
  height: 2px; margin-top: 0.5rem; border-radius: 2px;
  background: linear-gradient(90deg, var(--accent), transparent);
  animation: qlRule 0.5s cubic-bezier(0.16,1,0.3,1) 0.15s backwards;
}
@keyframes qlBandIn { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes qlBandOut { to { opacity: 0; } }
@keyframes qlArtIn { from { transform: translateX(-14vw); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes qlArtOut { to { opacity: 0; transform: translateY(-1.2vh); } }
@keyframes qlPlateIn { from { transform: translateX(-3vw); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes qlRule { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) {
  .ql-turnsplash-band, .ql-turnsplash-art, .ql-turnsplash-plate, .ql-turnsplash-rule { animation-duration: 0.01s; }
}
`;

/** Renders one splash per `subject.key`, self-dismissing after ~2.8 s. */
export default function TurnSplash({ subject }: { subject: SplashSubject | null }) {
  // Derived visibility: the subject renders until its key is marked done.
  // (setState from useState is stable — safe to close over in the timer.)
  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!subject) return;
    const timer = window.setTimeout(() => setDismissedKey(subject.key), 2800);
    return () => window.clearTimeout(timer);
  }, [subject]);

  const visible = subject && subject.key !== dismissedKey ? subject : null;
  if (!visible) return null;
  return (
    <div className="ql-turnsplash" key={visible.key} aria-live="polite">
      <style>{CSS}</style>
      <div className="ql-turnsplash-band" />
      {visible.imageUrl && (
        <div className="ql-turnsplash-art">
          <img src={visible.imageUrl} alt="" />
        </div>
      )}
      <div className="ql-turnsplash-plate">
        <div className="ql-turnsplash-sub">Your turn</div>
        <div className="ql-turnsplash-name">{visible.name}</div>
        <div className="ql-turnsplash-rule" />
      </div>
    </div>
  );
}
