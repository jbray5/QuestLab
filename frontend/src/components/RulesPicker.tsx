import { Lock } from "lucide-react";
import { RULESETS, rulesetBlurb, rulesetLabel, type Ruleset } from "../lib/ruleset";

/**
 * RulesPicker (Plan 131) — 2024 or 2014 rules for a campaign, as two big choices with a
 * plain line under each. Locked (with the reason) once the campaign has characters: every
 * character is built on its campaign's rules, and there's no converting one.
 */
export default function RulesPicker({
  value,
  onChange,
  locked = false,
  busy = false,
}: {
  value: Ruleset;
  onChange: (r: Ruleset) => void;
  locked?: boolean;
  busy?: boolean;
}) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <legend className="text-sm" style={{ fontWeight: 600, marginBottom: "0.4rem", padding: 0 }}>
        Rules
      </legend>
      <div role="radiogroup" aria-label="Rules" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.5rem" }}>
        {RULESETS.map((r) => {
          const on = value === r;
          return (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={locked || busy}
              onClick={() => {
                if (!on) onChange(r);
              }}
              className={on ? "btn btn-primary" : "btn btn-secondary"}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: "0.2rem",
                textAlign: "left",
                whiteSpace: "normal",
                minWidth: 0,
                minHeight: 44,
                padding: "0.55rem 0.75rem",
                opacity: locked && !on ? 0.55 : 1,
              }}
            >
              <span style={{ fontWeight: 700 }}>{rulesetLabel(r)}</span>
              <span className="text-sm" style={{ fontWeight: 400, lineHeight: 1.35, opacity: 0.9 }}>
                {rulesetBlurb(r)}
              </span>
            </button>
          );
        })}
      </div>
      {locked && (
        <p className="text-sm text-muted" style={{ margin: "0.45rem 0 0", display: "flex", gap: "0.35rem", alignItems: "center" }}>
          <Lock size={13} aria-hidden /> Locked: this campaign already has characters. Start a new campaign to use the
          other rules.
        </p>
      )}
    </fieldset>
  );
}
