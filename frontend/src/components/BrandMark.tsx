/** The QuestLab mark: a d20 drawn as a line icon (Plan 121). Colour follows `color`. */
export default function BrandMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      className={className}
      aria-hidden
      style={{ color: "var(--accent)", flexShrink: 0 }}
    >
      <path d="M12 2l8.5 5v10L12 22l-8.5-5V7z" />
      <path d="M12 2v20M3.5 7l17 10M20.5 7l-17 10" />
    </svg>
  );
}
