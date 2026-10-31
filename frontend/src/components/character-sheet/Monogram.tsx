import { initials } from "../../lib/classEmoji";
import ClassCrest from "../ClassCrest";
import { hasClassCrest } from "../../lib/classGlyphs";

/**
 * The stand-in for a character or NPC without a portrait. A character with a
 * known class wears its class crest (Plan 127); anyone else gets their
 * initials, set in the story face on a quiet tile (Plan 121).
 */
export default function Monogram({
  name,
  size = 52,
  radius = 6,
  cls,
}: {
  name: string;
  size?: number;
  radius?: number;
  /** The character's class, for the crest. */
  cls?: string | null;
}) {
  if (hasClassCrest(cls)) return <ClassCrest cls={cls} size={size} radius={radius} title={`${name} (no picture yet)`} />;
  return (
    <div
      aria-hidden="true"
      className="story"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "var(--surface3)",
        border: "1px solid var(--border2)",
        color: "var(--text2)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: Math.round(size * 0.38),
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {initials(name)}
    </div>
  );
}
