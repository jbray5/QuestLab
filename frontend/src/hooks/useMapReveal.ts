import { useEffect, useState } from "react";

import type { RevealSubject } from "../components/table/MapReveal";

/**
 * Reveal-on-change helper: returns the subject to render, playing only
 * when the staged map id CHANGES after first observation — a player
 * opening the page mid-scene never sits through a cinematic.
 */
export function useMapReveal(
  mapId: string | null | undefined,
  imageUrl: string | null | undefined,
  title: string | null | undefined,
  onReveal?: () => void,
  videoUrl?: string | null,
): RevealSubject | null {
  const [subject, setSubject] = useState<RevealSubject | null>(null);
  const [seen, setSeen] = useState<{ id: string | null } | null>(null);

  useEffect(() => {
    if (mapId === undefined) return; // projection not loaded yet
    const id = mapId ?? null;
    if (seen === null) {
      setSeen({ id }); // first observation — no cinematic
      return;
    }
    if (id === seen.id) return;
    setSeen({ id });
    if (!id || !imageUrl) return; // map cleared — nothing to reveal
    setSubject({
      key: `${id}-${Date.now()}`,
      title: title?.trim() || "A new scene unfolds",
      imageUrl,
      videoUrl: videoUrl ?? null,
    });
    onReveal?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, imageUrl, title, videoUrl]);

  return subject;
}
