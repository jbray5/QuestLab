/**
 * Decorative gold flourish — a horizontal rule with a centered diamond
 * and tapering filigree on each side (Plan 00029). Drop in between
 * sections to give the page a parchment-grimoire feel.
 *
 * Usage:
 *   <Flourish />            // default width
 *   <Flourish width={140} /> // narrower for cards
 */

interface Props {
  /** Width in pixels (the SVG scales to it). Defaults to 220. */
  width?: number;
  /** Stroke color — defaults to the theme gold. */
  color?: string;
  /** Optional inline margin override. */
  style?: React.CSSProperties;
}

export default function Flourish({
  width = 220,
  color = "var(--gold)",
  style,
}: Props) {
  return (
    <svg
      aria-hidden
      role="presentation"
      viewBox="0 0 220 18"
      width={width}
      height={Math.round(width * 18 / 220)}
      style={{ display: "block", margin: "0.5rem auto", ...style }}
      fill="none"
      stroke={color}
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Left tapering line */}
      <line x1="2" y1="9" x2="90" y2="9" />
      {/* Left curl */}
      <path d="M86 9 Q92 4 99 9 Q92 14 86 9 Z" fill={color} stroke="none" opacity="0.65" />
      {/* Center diamond */}
      <path d="M110 2 L118 9 L110 16 L102 9 Z" fill={color} stroke="none" />
      {/* Right curl */}
      <path d="M134 9 Q128 4 121 9 Q128 14 134 9 Z" fill={color} stroke="none" opacity="0.65" />
      {/* Right tapering line */}
      <line x1="130" y1="9" x2="218" y2="9" />
    </svg>
  );
}
