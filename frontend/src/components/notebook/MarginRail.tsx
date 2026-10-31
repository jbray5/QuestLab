import { useState } from "react";
import { Lightbulb, StickyNote, X } from "lucide-react";

import type { Pin } from "../../api/notebooks";
import { entityHref, monogram } from "./EntityPicker";

/**
 * MarginRail (Plan 57) — the DM's margin. Entity faces, images and notes
 * live HERE, beside the writing, never in it.
 *
 * Older pages may still hold "ai" pins from a feature removed in Plan 124.
 * They render as plain "Suggestion" pins: read and dismiss only, with no
 * "insert into page" affordance.
 */

const KIND_LABEL: Record<string, string> = { pc: "PC", npc: "NPC", item: "Item", map: "Map", preset: "Scene" };

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
          {pin.kind === "ai" ? (
            <Lightbulb size={14} aria-label="Suggestion" />
          ) : pin.kind === "note" ? (
            <StickyNote size={14} aria-label="Note" />
          ) : (
            monogram(pin.name ?? "?")
          )}
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
        <button className="nb-pin-x" title="Dismiss" aria-label="Dismiss pin" onClick={() => onDismiss(pin.id)}>
          <X size={13} />
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
          <span className="nb-pin-kind">{KIND_LABEL[pin.entity_kind ?? ""] ?? pin.entity_kind}</span>
        </a>
      )}
      {pin.kind === "image" && pin.url && <img src={pin.url} alt="" className="nb-pin-image" />}
      {pin.kind === "note" && <div className="nb-pin-note">{pin.text}</div>}
      {pin.kind === "ai" && (
        <div>
          <div className="nb-pin-ai-text">{pin.text}</div>
          <div className="nb-pin-provenance">
            <Lightbulb size={11} aria-hidden /> Suggestion
            {pin.prompt ? ` · on: “${pin.prompt.slice(0, 40)}${(pin.prompt.length > 40 && "…") || ""}”` : ""}
          </div>
        </div>
      )}
      {collapsed && (
        <button className="nb-pin-collapse" onClick={() => setExpanded(false)}>
          Collapse
        </button>
      )}
    </div>
  );
}
