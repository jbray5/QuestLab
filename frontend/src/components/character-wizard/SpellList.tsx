import { useState } from "react";
import { BookOpen, Check } from "lucide-react";

import type { BuilderSpell } from "../../api/characterBuilder";
import PhoneSheet from "../PhoneSheet";
import { useIsCompact } from "../../hooks/useIsCompact";
import { ordinal, spellSummary } from "./rules";

/**
 * The spell picker's list (Plan 128). Names alone don't help a new player choose (persona run 3),
 * so each row shows the casting time, range and duration and the spell's opening lines, and the
 * row opens the full text: inline on a laptop, in a bottom sheet on a phone. The square on the
 * left picks the spell (44 px), and the details can pick it too.
 */

interface Props {
  spells: BuilderSpell[];
  picked: string[];
  onToggle?: (name: string) => void;
  /** Why an unpicked spell can't be picked right now ("4 of 4 picked"), or null. */
  blocked?: (s: BuilderSpell) => string | null;
  /** Locked rows (always prepared): shown picked, with this label and where it comes from. */
  locked?: (s: BuilderSpell) => string | null;
}

/** "V, S, M (a sprig of mistletoe)" → "words, gestures, a sprig of mistletoe". */
function componentWords(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .split(/, (?=[VSM]\b)/)
    .map((p) => (p === "V" ? "words" : p === "S" ? "gestures" : p.startsWith("M") ? p.replace(/^M \((.*)\)$/, "$1").replace(/^M$/, "a material") : p))
    .join(", ");
}

function metaLine(s: BuilderSpell): string {
  return [s.casting_time, s.range, s.duration].filter(Boolean).join(" · ");
}

function SpellDetail({ s, compact }: { s: BuilderSpell; compact: boolean }) {
  const rows: [string, string | undefined][] = [
    ["Level", s.level === 0 ? "Cantrip: no slot needed" : `${ordinal(s.level)} level`],
    ["Casting time", s.casting_time],
    ["Range", s.range],
    ["Duration", s.duration],
    ["Needs", componentWords(s.components)],
  ];
  return (
    <div className={`cc-spell-detail${compact ? " in-sheet" : ""}`}>
      <dl>
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="cc-spell-row"><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      {s.concentration && <p className="cc-spell-note">Concentration: it ends early if you cast another concentration spell, or fail a Constitution save when you take damage.</p>}
      {s.ritual && <p className="cc-spell-note">Ritual: you can cast it without a slot by taking 10 minutes longer.</p>}
      {(s.text ?? s.summary ?? "").split(/\n{2,}/).map((para, i) => <p key={i} className="cc-spell-text">{para}</p>)}
    </div>
  );
}

export default function SpellList({ spells, picked, onToggle, blocked, locked }: Props) {
  const compact = useIsCompact(640);
  const [openName, setOpenName] = useState<string | null>(null);
  const open = spells.find((s) => s.name === openName) ?? null;

  return (
    <>
      <ul className="cc-spells">
        {spells.map((s) => {
          const lock = locked?.(s) ?? null;
          const on = !!lock || picked.includes(s.name);
          const why = !on ? blocked?.(s) ?? null : null;
          const isOpen = openName === s.name;
          return (
            <li key={s.name} className={`cc-spell${on ? " on" : ""}`}>
              <div className="cc-spell-line">
                {lock ? (
                  <span className="cc-spell-pick locked" aria-hidden><Check size={18} /></span>
                ) : (
                  <button type="button" className="cc-spell-pick" aria-pressed={on} disabled={!!why}
                    aria-label={`${on ? "Take off" : "Pick"} ${s.name}`} title={why ?? undefined}
                    onClick={() => onToggle?.(s.name)}>
                    {on ? <Check size={18} aria-hidden /> : null}
                  </button>
                )}
                <button type="button" className="cc-spell-main" aria-expanded={isOpen} onClick={() => setOpenName(isOpen ? null : s.name)}>
                  <span className="cc-spell-name">
                    {s.name}
                    {lock && <span className="pill">{lock}</span>}
                  </span>
                  {metaLine(s) && <small className="cc-spell-meta">{metaLine(s)}</small>}
                  {(s.summary || s.text) && <small className="cc-spell-sum">{s.summary || spellSummary(s.text)}</small>}
                  {why && <small className="why">{why}</small>}
                </button>
                <span className="cc-spell-more" aria-hidden><BookOpen size={16} /></span>
              </div>
              {isOpen && !compact && <SpellDetail s={s} compact={false} />}
            </li>
          );
        })}
      </ul>
      {open && compact && (
        <PhoneSheet title={open.name} onClose={() => setOpenName(null)}>
          <SpellDetail s={open} compact />
          {onToggle && !locked?.(open) && (
            <div style={{ padding: "12px 0 4px" }}>
              {(() => {
                const on = picked.includes(open.name);
                const why = !on ? blocked?.(open) ?? null : null;
                return (
                  <>
                    {why && <p className="cc-spell-note">{why}</p>}
                    <button type="button" className={`btn ${on ? "btn-secondary" : "btn-primary"}`} style={{ width: "100%", minHeight: 48 }}
                      disabled={!!why} onClick={() => { onToggle(open.name); setOpenName(null); }}>
                      {on ? "Take it off my list" : "Pick this spell"}
                    </button>
                  </>
                );
              })()}
            </div>
          )}
          {locked?.(open) && <p className="cc-spell-note">Always prepared: it&rsquo;s on your sheet for free and doesn&rsquo;t count against your picks.</p>}
        </PhoneSheet>
      )}
    </>
  );
}
