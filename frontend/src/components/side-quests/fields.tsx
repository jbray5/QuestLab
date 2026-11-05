import { useId, useState } from "react";

import type { QuestStep } from "../../api/sideQuests";
import { NEXT_IN_LIST, stepName, stepOptionLabel } from "../../lib/sideQuests";
import { HINT } from "../homebrew/options";

/** A label, then a whole number field. Keeps what's being typed ("-") until the field loses focus. */
export function IntInput({
  label,
  value,
  min,
  max,
  placeholder,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  const [typing, setTyping] = useState<string | null>(null);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      {/* type="number" with no inputMode: an iPhone then offers a minus key. */}
      <input
        id={id}
        type="number"
        step={1}
        min={min}
        max={max}
        className="num"
        placeholder={placeholder}
        disabled={disabled}
        style={{ maxWidth: 200 }}
        value={typing ?? (value === null ? "" : String(value))}
        onChange={(e) => {
          setTyping(e.target.value);
          const n = parseInt(e.target.value, 10);
          onChange(Number.isNaN(n) ? null : Math.min(max, Math.max(min, n)));
        }}
        onBlur={() => setTyping(null)}
      />
      {hint && <p style={HINT}>{hint}</p>}
    </div>
  );
}

/** Where a step leads: "Next in the list", or any other step by its number and first words. */
export function LinkSelect({
  label,
  value,
  steps,
  selfIndex,
  disabled,
  onChange,
}: {
  label: string;
  value: string | null;
  steps: QuestStep[];
  selfIndex: number;
  disabled?: boolean;
  onChange: (link: string | null) => void;
}) {
  const id = useId();
  const selfId = steps[selfIndex]?.id;
  const known = value === NEXT_IN_LIST || (value !== selfId && steps.some((s) => s.id === value));
  const below = steps[selfIndex + 1] ? stepName(selfIndex + 1) : "nothing below yet";
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        style={{ width: "100%" }}
        disabled={disabled}
        value={known ? (value as string) : ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        {!known && <option value="">Pick a step</option>}
        <option value={NEXT_IN_LIST}>Next in the list ({below})</option>
        {steps.map((step, i) =>
          i === selfIndex ? null : (
            <option key={step.id} value={step.id}>
              {stepOptionLabel(step, i)}
            </option>
          ),
        )}
      </select>
    </div>
  );
}
