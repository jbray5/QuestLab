import { useState } from "react";

import type { Pin } from "../../api/notebooks";
import { entityHref, monogram } from "./EntityPicker";

/**
 * MarginRail (Plan 57) — the DM's margin. Entity faces, images, notes,
 * and AI suggestions live HERE, beside the writing, never in it (Law 2).
 *
 * AI pins are tinted, carry a provenance line, and have keep/dismiss
 * only. There is deliberately no "insert into page" affordance anywhere
 * in this file (Law 1) — if the DM wants a phrase, he retypes it.
 */

export function PinCard({
  pin,
  campaignId,
  collapsed,
  onDismiss,
}: {
  pin: Pin;
  campaignId: string;
  collapsed?: boolean;
  onDismiss?: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  if (collapsed && !expanded) {
    // Read mode: a small portrait/chip along the edge; tap expands.
    const face =
      pin.kind === "entity" && pin.thumb ? (
        <img src={pin.thumb} alt={pin.name ?? ""} className="nb-pin-mini-img" />
      ) : pin.kind === "image" && pin.url ? (
        <img src={pin.url} alt="" className="nb-pin-mini-img" />
      ) : (
        <span className="nb-pin-mini-mono">
          {pin.kind === "ai" ? "🤖" : pin.kind === "note" ? "✎" : monogram(pin.name ?? "?")}
        </span>
      );
    return (
      <button className="nb-pin-mini" title={pin.name ?? pin.text ?? ""} onClick={() => setExpanded(true)}>
        {face}
      </button>
    );
  }

  return (
    <div className={`nb-pin nb-pin-${pin.kind}`}>
      {onDismiss && (
        <button className="nb-pin-x" title="Dismiss" onClick={() => onDismiss(pin.id)}>
          ✕
        </button>
      )}
      {pin.kind === "entity" && (
        <a
          className="nb-pin-entity"
          href={entityHref(campaignId, pin.entity_kind ?? "", pin.ref_id ?? "") ?? undefined}
          target="_blank"
          rel="noreferrer"
        >
          {pin.thumb ? (
            <img src={pin.thumb} alt="" className="nb-pin-face" />
          ) : (
            <span className="nb-pin-face nb-mono">{monogram(pin.name ?? "?")}</span>
          )}
          <span className="nb-pin-name">{pin.name}</span>
          <span className="nb-pin-kind">{pin.entity_kind}</span>
        </a>
      )}
      {pin.kind === "image" && pin.url && <img src={pin.url} alt="" className="nb-pin-image" />}
      {pin.kind === "note" && <div className="nb-pin-note">{pin.text}</div>}
      {pin.kind === "ai" && (
        <div>
          <div className="nb-pin-ai-text">{pin.text}</div>
          <div className="nb-pin-provenance">
            🤖 {pin.model ?? "AI"} · {pin.at ? new Date(pin.at).toLocaleTimeString() : ""}
            {pin.prompt ? ` · on: “${pin.prompt.slice(0, 40)}${(pin.prompt.length > 40 && "…") || ""}”` : ""}
          </div>
        </div>
      )}
      {collapsed && (
        <button className="nb-pin-collapse" onClick={() => setExpanded(false)}>
          collapse
        </button>
      )}
    </div>
  );
}

/** The margin header: Riff-on-selection + Ask-the-margin. */
export function AiMarginControls({
  selection,
  busy,
  onRiff,
  onAsk,
}: {
  selection: string;
  busy: boolean;
  onRiff: () => void;
  onAsk: (question: string) => void;
}) {
  const [q, setQ] = useState("");
  return (
    <div className="nb-ai-controls">
      <button
        className="nb-ghost"
        disabled={!selection || busy}
        title={selection ? `Riff on: “${selection.slice(0, 60)}”` : "Select text in the page first"}
        onClick={onRiff}
      >
        {busy ? "…thinking" : "✨ Riff on selection"}
      </button>
      <form
        className="nb-ask"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim() && !busy) {
            onAsk(q.trim());
            setQ("");
          }
        }}
      >
        <input
          className="nb-ask-input"
          placeholder="Ask the margin…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </form>
    </div>
  );
}
