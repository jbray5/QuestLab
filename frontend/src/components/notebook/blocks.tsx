import React, { useEffect, useRef, useState } from "react";

import type { Block, BlockType } from "../../api/notebooks";
import { uploadImage } from "../../api/notebooks";
import EntityPicker, { type EntityHit } from "./EntityPicker";
import SketchBlock, { type SketchContent } from "./SketchBlock";

/**
 * Block editors (Plan 57). Text-ish blocks are plain textareas — native
 * undo, IME, and selection for free. Mentions insert `@[Name](kind:id)`
 * tokens; the page wires token insertion to margin-pin creation.
 */

export const BLOCK_MENU: { type: BlockType; icon: string; label: string; hint: string }[] = [
  { type: "text", icon: "¶", label: "Text", hint: "markdown paragraph" },
  { type: "verbatim", icon: "📖", label: "Verbatim", hint: "read-aloud script" },
  { type: "prompt", icon: "💬", label: "Prompt", hint: "a question aimed at a player" },
  { type: "key", icon: "🗝", label: "Key", hint: "DM key — muted, scannable" },
  { type: "card", icon: "🗂", label: "Card", hint: "title + up to 5 beats" },
  { type: "sketch", icon: "🖊", label: "Sketch", hint: "freehand canvas" },
  { type: "image", icon: "🖼", label: "Image", hint: "picker or paste" },
  { type: "divider", icon: "―", label: "Divider", hint: "scene break" },
];

const PLACEHOLDER: Partial<Record<BlockType, string>> = {
  text: "Write, or “/” for a block, “@” for a face…",
  verbatim: "📖 Read aloud…",
  prompt: "💬 Ask a player… (start with their name)",
  key: "🗝 DM key — never read aloud…",
};

/** Autosized textarea that grows with content. */
export function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  onSelect,
  placeholder,
  className,
  autoFocus,
}: {
  value: string;
  onChange: (v: string, el: HTMLTextAreaElement) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect?: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      rows={1}
      placeholder={placeholder}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value, e.target)}
      onKeyDown={onKeyDown}
      onSelect={onSelect}
    />
  );
}

/** The 🗂 index card editor: title + up to 5 one-line beats. */
export function CardEditor({
  content,
  onChange,
}: {
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const title = String(content.title ?? "");
  const beats = ((content.beats as string[]) ?? []).slice(0, 5);
  const shown = beats.length < 5 ? [...beats, ""] : beats;
  return (
    <div className="nb-card-block">
      <input
        className="nb-card-title"
        value={title}
        placeholder="🗂 Card title…"
        onChange={(e) => onChange({ ...content, title: e.target.value })}
      />
      {shown.map((b, i) => (
        <input
          key={i}
          className="nb-card-beat"
          value={b}
          placeholder={`beat ${i + 1}`}
          onChange={(e) => {
            const next = [...shown];
            next[i] = e.target.value;
            onChange({ ...content, beats: next.filter((x, j) => x.trim() || j === i).slice(0, 5) });
          }}
        />
      ))}
    </div>
  );
}

/** The image block: in-app picker (art-bearing kinds) or paste. */
export function ImageBlockEditor({
  campaignId,
  content,
  onChange,
}: {
  campaignId: string;
  content: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const url = String(content.url ?? "");
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  if (url) {
    return (
      <figure className="nb-image">
        <img src={url} alt={String(content.caption ?? "")} />
        <input
          className="nb-image-caption"
          value={String(content.caption ?? "")}
          placeholder="caption (optional)"
          onChange={(e) => onChange({ ...content, caption: e.target.value })}
        />
        <button className="nb-tool nb-image-clear" title="Remove image" onClick={() => onChange({})}>
          ✕
        </button>
      </figure>
    );
  }

  return (
    <div
      className="nb-image-empty"
      tabIndex={0}
      onPaste={async (e) => {
        const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
        if (!file) return;
        e.preventDefault();
        setBusy(true);
        try {
          const uploaded = await uploadImage(file, file.name || "pasted.png");
          onChange({ ...content, url: uploaded });
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? (
        <span>Uploading…</span>
      ) : picking ? (
        <div className="nb-image-pick">
          <input
            className="nb-picker-search"
            autoFocus
            placeholder="Search maps, faces, item art…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <EntityPicker
            campaignId={campaignId}
            query={q}
            kinds={["map", "npc", "pc", "item"]}
            onPick={(h: EntityHit) => {
              if (h.thumb) onChange({ ...content, url: h.thumb, caption: h.name });
              setPicking(false);
            }}
            onClose={() => setPicking(false)}
          />
        </div>
      ) : (
        <>
          <button className="nb-ghost" onClick={() => setPicking(true)}>
            🖼 Pick from the app
          </button>
          <span className="nb-dim"> — or click here and paste an image</span>
        </>
      )}
    </div>
  );
}

/** Read-only textarea substitute typing for the divider. */
export function Divider() {
  return <hr className="nb-divider" />;
}

/** One block in edit mode; the page supplies text-change plumbing. */
export function BlockEditor({
  block,
  campaignId,
  textProps,
  onContent,
}: {
  block: Block;
  campaignId: string;
  /** Props for text-ish blocks, wired by the page (mentions, keys). */
  textProps: (block: Block) => {
    value: string;
    autoFocus?: boolean;
    onChange: (v: string, el: HTMLTextAreaElement) => void;
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  };
  onContent: (content: Record<string, unknown>) => void;
}) {
  switch (block.type) {
    case "text":
    case "verbatim":
    case "prompt":
    case "key":
      return (
        <AutoTextarea
          className={`nb-ta nb-${block.type}`}
          placeholder={PLACEHOLDER[block.type]}
          {...textProps(block)}
        />
      );
    case "card":
      return <CardEditor content={block.content} onChange={onContent} />;
    case "sketch":
      return (
        <SketchBlock
          content={block.content as unknown as SketchContent}
          onChange={(c) => onContent(c as unknown as Record<string, unknown>)}
        />
      );
    case "image":
      return <ImageBlockEditor campaignId={campaignId} content={block.content} onChange={onContent} />;
    case "divider":
      return <Divider />;
    default:
      return null;
  }
}
