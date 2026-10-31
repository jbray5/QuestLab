import type { ReactNode } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";

/**
 * A fold-out section of a wizard step (Plan 128): a 52 px header row with the title, a one-line
 * summary of what is picked (or still to do) and a chevron; the body shows when open. Long steps
 * (a Human's skills, the spell list, the class choices) become a few short decisions instead of
 * one 2,000 px page on a phone.
 */
export default function Fold({
  id,
  title,
  summary,
  done,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: ReactNode;
  /** What is picked, or what is still needed. */
  summary?: ReactNode;
  /** Shows a check: this part is complete. */
  done?: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`cc-asi ${open ? "open" : ""}`}>
      <button type="button" className="cc-asi-head" aria-expanded={open} aria-controls={`${id}-body`} onClick={onToggle}>
        <span className="cc-asi-title">{title}</span>
        <span className="cc-asi-sum">
          {done && <Check size={14} aria-hidden style={{ color: "var(--teal-text)", verticalAlign: "-2px", marginRight: 4 }} />}
          {summary}
        </span>
        {open ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
      </button>
      {open && (
        <div id={`${id}-body`} className="cc-asi-body">
          {children}
        </div>
      )}
    </section>
  );
}
