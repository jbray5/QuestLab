import { useEffect, useMemo, useState } from "react";

interface Props {
  /** Trigger key — changing this fires a new burst. Pass roll-result + timestamp. */
  trigger: string | number | null;
  /** Number of particles. Default 36. */
  count?: number;
}

const COLORS = [
  "#f4d068",
  "#d6af36",
  "#9d7c1f",
  "#fff7d6",
  "#c0392b",
];

interface Particle {
  id: number;
  left: number;      // %
  dx: number;        // px horizontal drift
  delay: number;     // s
  duration: number;  // s
  color: string;
  size: number;
}

/**
 * Lightweight CSS-only confetti burst (Plan 00029).
 *
 * Renders ``count`` colored squares that fall + rotate from the top-center.
 * Self-cleans 2.5s after each new trigger so it doesn't pile up in the DOM.
 * Uses the ``ql-confetti-fall`` keyframe defined in ``index.css``.
 */
export default function Confetti({ trigger, count = 36 }: Props) {
  const [visible, setVisible] = useState(false);
  const particles = useMemo<Particle[]>(() => {
    if (!trigger) return [];
    return Array.from({ length: count }).map((_, i) => ({
      id: i,
      left: 50 + (Math.random() - 0.5) * 80,
      dx: (Math.random() - 0.5) * 320,
      delay: Math.random() * 0.15,
      duration: 1.6 + Math.random() * 1.2,
      color: COLORS[i % COLORS.length],
      size: 6 + Math.random() * 5,
    }));
  }, [trigger, count]);

  useEffect(() => {
    if (!trigger) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, [trigger]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 10000,
        overflow: "hidden",
      }}
    >
      {particles.map((p) => (
        <span
          key={p.id}
          style={
            {
              position: "absolute",
              top: 0,
              left: `${p.left}%`,
              width: p.size,
              height: p.size,
              background: p.color,
              borderRadius: 2,
              opacity: 0.95,
              "--ql-x": `${p.dx}px`,
              animation: `ql-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
              boxShadow: `0 0 8px ${p.color}55`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
