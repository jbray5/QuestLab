import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import type { PowerAttack } from "../../api/homebrew";
import { powerAttackLine } from "../../lib/feats";

/**
 * Plan 135 — what a DM's homebrew feat says, under its name in a feat picker (the character
 * builder's improvement step and the level-up guide): the prerequisite (shown, not checked),
 * the power attack in plain words, and the DM's full text behind "Read the full feat".
 */
export default function HomebrewFeatText({
  prerequisite,
  powerAttack,
  description,
}: {
  prerequisite?: string;
  powerAttack?: Pick<PowerAttack, "to_hit" | "damage" | "weapons"> | null;
  description?: string;
}) {
  const [open, setOpen] = useState(false);
  const text = (description ?? "").trim();
  return (
    <>
      {prerequisite?.trim() && (
        <p className="note" style={{ marginTop: 6 }}>
          <b style={{ fontWeight: 600, color: "var(--text)" }}>Prerequisite:</b> {prerequisite.trim()} (your DM checks it)
        </p>
      )}
      {powerAttack && (
        <p className="note" style={{ marginTop: 6 }}>
          <b style={{ fontWeight: 600, color: "var(--text)" }}>Power attack:</b> {powerAttackLine(powerAttack)}. The attacks
          it fits get a toggle on your sheet.
        </p>
      )}
      {text && (
        <>
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            style={{ minHeight: 44, padding: "0.3rem 0.5rem", marginTop: 4, gap: 6 }}
          >
            {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
            {open ? "Hide the full text" : "Read the full feat"}
          </button>
          {open && (
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.9375rem",
                lineHeight: 1.55,
                color: "var(--text)",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
              }}
            >
              {text}
            </p>
          )}
        </>
      )}
    </>
  );
}
