import { CLASS_GLYPHS } from "../lib/classGlyphs";

/**
 * ClassCrest — a character's picture until a real one is uploaded.
 *
 * The class's glyph (drawn by people: game-icons.net, CC BY 3.0, see
 * lib/classGlyphs.ts) in parchment on a soft field of the class's colour.
 * No emoji, nothing generated. Square with rounded corners by default, a
 * circle with `round`. Renders nothing for a class it doesn't know, so
 * callers fall back to initials.
 */
export default function ClassCrest({
  cls,
  size = 52,
  round = false,
  radius = 8,
  title,
}: {
  cls?: string | null;
  size?: number;
  round?: boolean;
  radius?: number;
  /** Accessible name; decorative (hidden) when omitted. */
  title?: string;
}) {
  const key = (cls ?? "").trim().toLowerCase();
  const glyph = CLASS_GLYPHS[key];
  if (!glyph) return null;
  const tint = `var(--class-${key})`;
  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      title={title}
      style={{
        width: size,
        height: size,
        flexShrink: 0,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: round ? "50%" : radius,
        background: `radial-gradient(circle at 50% 30%, color-mix(in srgb, ${tint} 42%, var(--surface2)) 0%, color-mix(in srgb, ${tint} 14%, var(--surface2)) 62%, var(--surface2) 100%)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tint} 50%, var(--border2))`,
        userSelect: "none",
      }}
    >
      <svg
        viewBox="0 0 512 512"
        width={Math.round(size * (round ? 0.56 : 0.62))}
        height={Math.round(size * (round ? 0.56 : 0.62))}
        aria-hidden="true"
        focusable="false"
        style={{ display: "block" }}
      >
        <path d={glyph.d} fill="var(--text)" fillOpacity={0.92} />
      </svg>
    </span>
  );
}
