import { Lock } from "lucide-react";
import { RULESETS, rulesetBlurb, rulesetLabel, type Ruleset } from "../lib/ruleset";

/**
 * RulesPicker (Plan 131) — 2024 or 2014 rules for a campaign, as two big choices with a
 * plain line under each. Locked (with the reason) once the campaign has characters: every
 * character is built on its campaign's rules, and there's no converting one.
 *
 * Plan 133 — with `onCustomOrigin`, a 2014 campaign also shows the custom origin switch
 * (Tasha's optional rule). It is never locked: it changes how new characters are built.
 */
export default function RulesPicker({
  value,
  onChange,
  locked = false,
  busy = false,
  customOrigin = false,
  onCustomOrigin,
  customOriginBusy = false,
}: {
  value: Ruleset;
  onChange: (r: Ruleset) => void;
  locked?: boolean;
  busy?: boolean;
  /** Plan 133 — the campaign's custom origin switch (2014 only). */
  customOrigin?: boolean;
  /** Plan 133 — show the switch (on 2014 rules) and save a change. */
  onCustomOrigin?: (on: boolean) => void;
  customOriginBusy?: boolean;
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
      {onCustomOrigin && value === "2014" && (
        <label
          style={{
            display: "flex",
            gap: "0.6rem",
            alignItems: "flex-start",
            margin: "0.75rem 0 0",
            minHeight: 44,
            cursor: customOriginBusy ? "progress" : "pointer",
            fontSize: "0.875rem",
            color: "var(--text2)",
          }}
        >
          <input
            type="checkbox"
            checked={customOrigin}
            disabled={customOriginBusy}
            onChange={(e) => onCustomOrigin(e.target.checked)}
            style={{ width: 20, height: 20, flex: "none", marginTop: 2 }}
          />
          <span>
            <span style={{ fontWeight: 600, color: "var(--text)" }}>Custom origin</span>: players may put their
            race&apos;s ability bonuses on any abilities (the optional rule from Tasha&apos;s). It applies to characters
            built from now on.
          </span>
        </label>
      )}
    </fieldset>
  );
}
