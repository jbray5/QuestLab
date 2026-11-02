import { isMine, useMyEmail } from "../lib/homebrew";

/**
 * HomebrewChip (Plan 132) — the small "Yours" pill on a catalog row the DM made.
 * The shared SRD rows have no owner; a homebrew row carries its DM's email
 * (`isMine` in lib/homebrew.ts decides).
 */
export default function HomebrewChip({ title = "Your homebrew: only you see it" }: { title?: string }) {
  return (
    <span className="pill pill-teal" title={title} style={{ fontSize: "0.75rem" }}>
      Yours
    </span>
  );
}

/** The "Yours" chip, shown only when the signed-in DM made the row (SEC-003 owner). */
export function MineChip({ createdBy }: { createdBy: string | null | undefined }) {
  const me = useMyEmail();
  return isMine(createdBy, me) ? <HomebrewChip /> : null;
}
