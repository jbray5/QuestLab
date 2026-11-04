import { Eye, EyeOff } from "lucide-react";

import type { FogRegion } from "../../api/types";

/**
 * FogAreaChips — the map's fog areas as one-tap switches (Plan 133).
 *
 * James (beta DM) could reveal an area at the table but couldn't see how to
 * hide it again: the chips only showed an eye icon. Each chip now says whether
 * the players can see that area, and a tap flips it either way. Shared by the
 * HUD's Live pane and the Table console so both say the same thing.
 */

interface Props {
  regions: FogRegion[];
  revealedIds: string[];
  fogOn: boolean;
  onToggle: (id: string) => void;
  /** The host's small-button style. */
  btnStyle: React.CSSProperties;
}

/** Inline icon props: small, decorative, sitting on the text baseline. */
const ICO = { size: 14, "aria-hidden": true, style: { verticalAlign: "-2px" } } as const;

export default function FogAreaChips({ regions, revealedIds, fogOn, onToggle, btnStyle }: Props) {
  if (regions.length === 0) return null;
  return (
    <div role="group" aria-label="Fog areas" style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
      <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>Fog areas, tap to reveal or hide:</span>
      {regions.map((r) => {
        const on = revealedIds.includes(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onToggle(r.id)}
            className={on ? "btn" : "btn btn-ghost"}
            style={btnStyle}
            aria-pressed={on}
            title={on ? "The players can see this. Tap to hide it again." : "Hidden from the players. Tap to reveal it."}
          >
            {on ? <Eye {...ICO} /> : <EyeOff {...ICO} />} {r.name}
            <span style={{ opacity: 0.72 }}> · {on ? "shown" : "hidden"}</span>
          </button>
        );
      })}
      {!fogOn && (
        <span style={{ fontSize: "0.66rem", color: "var(--muted)" }}>
          Fog is off, so the players see the whole map.
        </span>
      )}
    </div>
  );
}
