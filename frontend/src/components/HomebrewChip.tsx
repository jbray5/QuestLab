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
