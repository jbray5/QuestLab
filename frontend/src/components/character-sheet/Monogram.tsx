import { initials } from "../../lib/classEmoji";

/**
 * The stand-in for a character or NPC without a portrait (Plan 121): their
 * initials, set in the story face on a quiet tile. Replaces the class emoji.
 */
export default function Monogram({
  name,
  size = 52,
  radius = 6,
}: {
  name: string;
  size?: number;
  radius?: number;
}) {
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
