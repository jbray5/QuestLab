import { createPortal } from "react-dom";

import type { Block, Page, Pin } from "../../api/notebooks";
import { renderText } from "./markdownLite";
import { PinCard } from "./MarginRail";
import SketchBlock, { type SketchContent } from "./SketchBlock";

/**
 * ReadMode (Plan 57, Law 4) — a finished page IS the session.
 *
 * Renders into a portal directly under <body> (outside #root) so the
 * print stylesheet can hide the entire app and print ONLY this: the
 * paper fallback is a feature. First card pins sticky to the top;
 * margin pins collapse to small faces along the edge.
 */

function ReadBlock({ block, onPageLink }: { block: Block; onPageLink: (t: string) => void }) {
  const c = block.content || {};
  const text = String(c.text ?? "");
  switch (block.type) {
    case "text":
      return <p className="nbr-text">{renderText(text, { onPageLink })}</p>;
    case "verbatim":
      return (
        <blockquote className="nbr-verbatim">
          <span className="nbr-badge">📖 READ</span>
          {renderText(text, { onPageLink })}
        </blockquote>
      );
    case "prompt":
      return (
        <p className="nbr-prompt">
          <span className="nbr-badge">💬 ASK</span>
          {renderText(text, { onPageLink })}
        </p>
      );
    case "key":
      return <p className="nbr-key">🗝 {renderText(text, { onPageLink })}</p>;
    case "card":
      return (
        <div className="nbr-card">
          <div className="nbr-card-title">🗂 {String(c.title ?? "")}</div>
          <ul>
            {((c.beats as string[]) ?? [])
              .filter((b) => b.trim())
              .map((b, i) => (
                <li key={i}>{renderText(b, { onPageLink })}</li>
              ))}
          </ul>
        </div>
      );
    case "sketch":
      return <SketchBlock content={c as unknown as SketchContent} readOnly />;
    case "image":
      return c.url ? (
        <figure className="nbr-image">
          <img src={String(c.url)} alt={String(c.caption ?? "")} />
          {!!c.caption && <figcaption>{String(c.caption)}</figcaption>}
        </figure>
      ) : null;
    case "divider":
      return <hr className="nbr-divider" />;
    default:
      return null;
  }
}

export default function ReadMode({
  page,
  campaignId,
  onClose,
  onPageLink,
  onCopyMarkdown,
  onPrint,
}: {
  page: Page;
  campaignId: string;
  onClose: () => void;
  onPageLink: (title: string) => void;
  onCopyMarkdown: () => void;
  onPrint: () => void;
}) {
  const blocks = page.blocks ?? [];
  const firstCardIdx = blocks.findIndex((b) => b.type === "card");
  const firstCard = firstCardIdx >= 0 ? blocks[firstCardIdx] : null;
  const rest = blocks.filter((_, i) => i !== firstCardIdx);
  const pinsByBlock = new Map<string, Pin[]>();
  for (const pin of page.pins ?? []) {
    const list = pinsByBlock.get(pin.block_id) ?? [];
    list.push(pin);
    pinsByBlock.set(pin.block_id, list);
  }

  return createPortal(
    <div className="nb-read-overlay">
      <div className="nbr-chrome">
        <button className="nb-ghost" onClick={onClose}>
          ← back to writing
        </button>
        <span className="nbr-chrome-title">{page.title}</span>
        <span style={{ flex: 1 }} />
        <button className="nb-ghost" onClick={onCopyMarkdown}>
          ⧉ Copy as markdown
        </button>
        <button className="nb-ghost" onClick={onPrint}>
          🖨 Print
        </button>
      </div>

      <div className="nbr-page">
        <h1 className="nbr-title">{page.title}</h1>

        {firstCard && (
          <div className="nbr-sticky-card">
            <ReadBlock block={firstCard} onPageLink={onPageLink} />
          </div>
        )}

        {rest.map((block) => (
          <div key={block.id} className="nbr-row">
            <ReadBlock block={block} onPageLink={onPageLink} />
            {!!pinsByBlock.get(block.id)?.length && (
              <div className="nbr-row-pins">
                {pinsByBlock.get(block.id)!.map((pin) => (
                  <PinCard key={pin.id} pin={pin} campaignId={campaignId} collapsed />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}
