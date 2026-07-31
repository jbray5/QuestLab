import React from "react";

/**
 * markdownLite — the notebook's inline renderer (Plan 57).
 *
 * Deliberately tiny: **bold**, *italic*, `code`, @[Name](kind:id) mention
 * tokens, and [[Page Title]] internal links. Built as React nodes — no
 * innerHTML anywhere, so DM text can never become markup.
 */

export interface MentionSpan {
  name: string;
  kind: string;
  refId: string;
}

const TOKEN_RE =
  /(@\[[^\]]+\]\([^)]*\))|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g;

/** Parse one mention token like @[Mira](npc:abc). Returns null if malformed. */
export function parseMention(token: string): MentionSpan | null {
  const m = /^@\[([^\]]+)\]\(([^:)]+):([^)]*)\)$/.exec(token);
  return m ? { name: m[1], kind: m[2], refId: m[3] } : null;
}

/** Render a line of notebook text to React nodes. */
export function renderInline(
  text: string,
  opts: {
    onPageLink?: (title: string) => void;
    onMentionClick?: (m: MentionSpan) => void;
  } = {},
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(TOKEN_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = match[0];
    if (tok.startsWith("@[")) {
      const m = parseMention(tok);
      out.push(
        m ? (
          <span
            key={key++}
            className="nb-mention"
            role={opts.onMentionClick ? "link" : undefined}
            onClick={opts.onMentionClick ? () => opts.onMentionClick!(m) : undefined}
          >
            @{m.name}
          </span>
        ) : (
          tok
        ),
      );
    } else if (tok.startsWith("[[")) {
      const title = tok.slice(2, -2);
      out.push(
        <span
          key={key++}
          className="nb-pagelink"
          role={opts.onPageLink ? "link" : undefined}
          onClick={opts.onPageLink ? () => opts.onPageLink!(title) : undefined}
        >
          {title}
        </span>,
      );
    } else if (tok.startsWith("**")) {
      out.push(<b key={key++}>{tok.slice(2, -2)}</b>);
    } else if (tok.startsWith("*")) {
      out.push(<i key={key++}>{tok.slice(1, -1)}</i>);
    } else if (tok.startsWith("`")) {
      out.push(
        <code key={key++} className="nb-code">
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = idx + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Render multi-line text: paragraphs split on newlines. */
export function renderText(
  text: string,
  opts: Parameters<typeof renderInline>[1] = {},
): React.ReactNode {
  const lines = (text || "").split("\n");
  return lines.map((line, i) => (
    <React.Fragment key={i}>
      {i > 0 && <br />}
      {renderInline(line, opts)}
    </React.Fragment>
  ));
}

/** Serialize one block to markdown for "Copy as markdown". */
export function blockToMarkdown(block: {
  type: string;
  content: Record<string, unknown>;
}): string {
  const c = block.content || {};
  const text = String(c.text ?? "");
  const plain = text.replace(/@\[([^\]]+)\]\([^)]*\)/g, "@$1");
  switch (block.type) {
    case "text":
      return plain;
    case "verbatim":
      return plain
        .split("\n")
        .map((l) => `> 📖 ${l}`)
        .join("\n");
    case "prompt":
      return `**💬 ${plain}**`;
    case "key":
      return `*🗝 ${plain}*`;
    case "card": {
      const title = String(c.title ?? "");
      const beats = ((c.beats as string[]) || []).filter((b) => b.trim());
      return [`### 🗂 ${title}`, ...beats.map((b) => `- ${b}`)].join("\n");
    }
    case "sketch":
      return "*(sketch)*";
    case "image":
      return c.url ? `![${String(c.caption ?? "")}](${String(c.url)})` : "";
    case "divider":
      return "---";
    default:
      return "";
  }
}

/** Serialize a whole page to markdown. */
export function pageToMarkdown(title: string, blocks: { type: string; content: Record<string, unknown> }[]): string {
  return [`# ${title}`, "", ...blocks.map((b) => blockToMarkdown(b)).filter(Boolean)].join("\n\n");
}
