import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

/**
 * Counts frames for a few seconds once the scene has settled and says so if
 * the machine is not keeping up (Plan 113). Renders nothing.
 */
export function FpsProbe({
  onSlow,
  after = 3000,
  span = 3000,
  threshold = 24,
}: {
  onSlow: (fps: number) => void;
  /** Milliseconds to ignore while things load. */
  after?: number;
  /** Milliseconds to count over. */
  span?: number;
  threshold?: number;
}) {
  const t0 = useRef<number | null>(null);
  const frames = useRef(0);
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    if (t0.current === null) {
      t0.current = now;
      return;
    }
    const t = now - t0.current;
    if (t < after) return;
    frames.current += 1;
    if (t >= after + span) {
      done.current = true;
      const fps = frames.current / (span / 1000);
      if (fps < threshold) onSlow(fps);
    }
  });
  return null;
}
