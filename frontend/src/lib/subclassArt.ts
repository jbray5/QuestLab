/**
 * Subclass-flavored background art (Plan 60c) — generated dark abstract
 * textures, one per subclass, served from the blob store. Deliberately
 * dark: consumers lay a scrim over them so text stays readable.
 *
 * Regenerate / extend with scripts/gen_subclass_card_art.py.
 */
export const SUBCLASS_CARD_ART: Record<string, string> = {
  "Soulknife":
    "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/9eb43275-c314-4adf-b9f5-917b729e3524-dtVEd2T3YDlwdMcWUoLONuRNoS544O.png",
  "Circle of Stars":
    "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/d8d651e0-eb18-476c-8024-559858407dbb-Te0IfpHUFCUlW4bG2uoBnfy3DdIrJS.png",
  "Oath of the Ancients":
    "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/ba6bf3cc-8c71-469a-b171-0e3a2fc9efd8-wpUg89LhJgUEBoyZlj58KENJa7zSYd.png",
  "Wild Magic":
    "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/cc01c109-6edb-42a0-a6c8-2138773321d8-7aEzqBbAmw8cH1zdof5bvmZfjcQDIm.png",
};

/**
 * Layered CSS background for a panel: optional tint, readability scrim,
 * then the subclass art. Returns null when the subclass has no art.
 */
export function subclassPanelBackground(
  subclass: string | null | undefined,
  opts?: { tint?: string; scrim?: [number, number] },
): string | null {
  const art = subclass ? SUBCLASS_CARD_ART[subclass] : undefined;
  if (!art) return null;
  const [a, b] = opts?.scrim ?? [0.42, 0.66];
  const tint = opts?.tint ? `${opts.tint}, ` : "";
  return (
    `${tint}linear-gradient(rgba(10,11,15,${a}), rgba(10,11,15,${b})), ` +
    `url(${art}) center/cover`
  );
}
