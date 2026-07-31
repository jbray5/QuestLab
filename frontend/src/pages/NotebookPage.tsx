import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  newId,
  notebooksApi,
  type Block,
  type BlockType,
  type Page,
  type Pin,
} from "../api/notebooks";
import { BLOCK_MENU, BlockEditor } from "../components/notebook/blocks";
import EntityPicker, { type EntityHit } from "../components/notebook/EntityPicker";
import { AiMarginControls, PinCard } from "../components/notebook/MarginRail";
import ReadMode from "../components/notebook/ReadMode";
import { pageToMarkdown } from "../components/notebook/markdownLite";
import { NOTEBOOK_CSS } from "../components/notebook/notebookCss";

/**
 * The Session Notebook (Plan 57) — campaigns/:campaignId/notebook.
 *
 * The constitution, enforced here:
 *   Law 1 — the ONLY functions that write `blocks` are driven by the
 *           DM's own typing/drawing. AI suggestions become pins; no code
 *           path moves pin text into a block.
 *   Law 2 — pins render in the rail beside the writing.
 *   Law 3 — this page talks only to the notebook API (+ uploads).
 *   Law 4 — read mode + print is the finished session.
 */

interface MentionState {
  blockId: string;
  /** Caret index where the "@" (or "[[") starts. */
  start: number;
  query: string;
  mode: "mention" | "pagelink";
}

export default function NotebookPage() {
  const { campaignId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();

  // ── Sidebar data ──────────────────────────────────────────────────────────
  const notebooksQ = useQuery({
    queryKey: ["notebooks", campaignId],
    queryFn: () => notebooksApi.list(campaignId),
    enabled: !!campaignId,
    retry: false,
  });
  const notebooks = notebooksQ.data ?? [];
  const disabled =
    notebooksQ.isError && String(notebooksQ.error).toLowerCase().includes("not enabled");

  const [notebookId, setNotebookId] = useState<string>("");
  useEffect(() => {
    if (!notebookId && notebooks.length) setNotebookId(notebooks[0].id);
  }, [notebooks, notebookId]);

  const pagesQ = useQuery({
    queryKey: ["nb-pages", notebookId],
    queryFn: () => notebooksApi.pages(notebookId),
    enabled: !!notebookId,
  });
  const pages = pagesQ.data ?? [];

  const pageId = params.get("page") ?? "";
  const setPageId = useCallback(
    (id: string) => setParams(id ? { page: id } : {}, { replace: false }),
    [setParams],
  );
  useEffect(() => {
    if (!pageId && pages.length) setPageId(pages[0].id);
  }, [pages, pageId, setPageId]);

  // ── The open page (local working copy; server is the save target) ─────────
  const pageQ = useQuery({
    queryKey: ["nb-page", pageId],
    queryFn: () => notebooksApi.page(pageId),
    enabled: !!pageId,
  });
  const [doc, setDoc] = useState<Page | null>(null);
  useEffect(() => {
    if (pageQ.data) setDoc(pageQ.data);
  }, [pageQ.data]);

  // ── Autosave (debounced) + trustworthy indicator ─────────────────────────
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const saveTimer = useRef<number>(undefined);
  const save = useMutation({
    mutationFn: (d: Page) =>
      notebooksApi.savePage(d.id, {
        title: d.title,
        blocks: d.blocks,
        pins: d.pins,
        is_runbook: d.is_runbook,
      }),
    onSuccess: () => {
      setSaveState("saved");
      qc.invalidateQueries({ queryKey: ["nb-pages", notebookId] });
    },
    onError: () => setSaveState("error"),
  });

  // ── Undo (snapshots of the document) ──────────────────────────────────────
  const undoStack = useRef<Page[]>([]);

  const mutate = useCallback(
    (updater: (d: Page) => Page, snapshot = false) => {
      setDoc((cur) => {
        if (!cur) return cur;
        if (snapshot) {
          undoStack.current.push(cur);
          if (undoStack.current.length > 60) undoStack.current.shift();
        }
        const next = updater(cur);
        setSaveState("dirty");
        window.clearTimeout(saveTimer.current);
        saveTimer.current = window.setTimeout(() => {
          setSaveState("saving");
          save.mutate(next);
        }, 800);
        return next;
      });
    },
    [save],
  );

  function undo() {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setDoc(prev);
    setSaveState("saving");
    window.clearTimeout(saveTimer.current);
    save.mutate(prev);
  }

  // ── Blocks ────────────────────────────────────────────────────────────────
  const focusBlock = useRef<string | null>(null);

  function setBlockContent(blockId: string, content: Record<string, unknown>, snapshot = false) {
    mutate(
      (d) => ({
        ...d,
        blocks: d.blocks.map((b) => (b.id === blockId ? { ...b, content } : b)),
      }),
      snapshot,
    );
  }

  function insertBlockAfter(afterId: string | null, type: BlockType): string {
    const id = newId();
    const fresh: Block = {
      id,
      type,
      content: type === "card" ? { title: "", beats: [] } : type === "sketch" ? { paths: [], height: 260 } : { text: "" },
    };
    mutate((d) => {
      const idx = afterId ? d.blocks.findIndex((b) => b.id === afterId) : d.blocks.length - 1;
      const blocks = [...d.blocks];
      blocks.splice(idx + 1, 0, fresh);
      return { ...d, blocks };
    }, true);
    focusBlock.current = id;
    return id;
  }

  function removeBlock(blockId: string) {
    mutate(
      (d) => ({
        ...d,
        blocks: d.blocks.filter((b) => b.id !== blockId),
        pins: d.pins.filter((p) => p.block_id !== blockId),
      }),
      true,
    );
  }

  function changeType(blockId: string, type: BlockType) {
    mutate(
      (d) => ({
        ...d,
        blocks: d.blocks.map((b) =>
          b.id === blockId
            ? {
                id: b.id,
                type,
                content:
                  type === "card"
                    ? { title: "", beats: [] }
                    : type === "sketch"
                      ? { paths: [], height: 260 }
                      : type === "image" || type === "divider"
                        ? {}
                        : { text: String(b.content.text ?? "") },
              }
            : b,
        ),
      }),
      true,
    );
    setSlashFor(null);
    focusBlock.current = blockId;
  }

  // drag reorder
  const dragIdx = useRef<number | null>(null);
  function onDrop(targetIdx: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === targetIdx) return;
    mutate((d) => {
      const blocks = [...d.blocks];
      const [moved] = blocks.splice(from, 1);
      blocks.splice(targetIdx, 0, moved);
      return { ...d, blocks };
    }, true);
  }

  // ── Mentions and page links ───────────────────────────────────────────────
  const [mention, setMention] = useState<MentionState | null>(null);
  const [slashFor, setSlashFor] = useState<string | null>(null);

  function addPin(pin: Omit<Pin, "id">) {
    mutate((d) => ({ ...d, pins: [...d.pins, { ...pin, id: newId() }] }), true);
  }

  function dismissPin(pinId: string) {
    mutate((d) => ({ ...d, pins: d.pins.filter((p) => p.id !== pinId) }), true);
  }

  function onTextChange(block: Block, value: string, el: HTMLTextAreaElement) {
    setBlockContent(block.id, { ...block.content, text: value });
    const caret = el.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    const link = upto.lastIndexOf("[[");
    if (link >= 0 && link > at && !upto.slice(link + 2).includes("]]")) {
      setMention({ blockId: block.id, start: link, query: upto.slice(link + 2), mode: "pagelink" });
      return;
    }
    if (at >= 0) {
      const q = upto.slice(at + 1);
      const spaces = (q.match(/ /g) || []).length;
      // Live query: short, single-line, at most one space ("Sister Maren"),
      // and not the inside of an already-inserted token (short or long form).
      if (!q.includes("\n") && q.length <= 30 && spaces <= 1 && !q.startsWith("[") && !q.includes("](")) {
        setMention({ blockId: block.id, start: at, query: q, mode: "mention" });
        return;
      }
    }
    setMention(null);
    // Slash menu: block is exactly "/" or "/query"
    if (block.type === "text" && /^\/\w*$/.test(value.trim())) setSlashFor(block.id);
    else if (slashFor === block.id) setSlashFor(null);
  }

  function pickMention(hit: EntityHit) {
    if (!mention || !doc) return;
    const block = doc.blocks.find((b) => b.id === mention.blockId);
    if (!block) return;
    const text = String(block.content.text ?? "");
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 1 + mention.query.length);
    // Short token — the page reads clean; kind/id ride on the margin pin.
    const token = `@[${hit.name}]`;
    mutate((d) => {
      const blocks = d.blocks.map((b) =>
        b.id === mention.blockId ? { ...b, content: { ...b.content, text: `${before}${token} ${after}` } } : b,
      );
      // The killer feature: the face appears in the margin as he types her scene.
      const pins: Pin[] = [
        ...d.pins,
        {
          id: newId(),
          block_id: mention.blockId,
          kind: "entity",
          entity_kind: hit.kind,
          ref_id: hit.refId,
          name: hit.name,
          thumb: hit.thumb,
        },
      ];
      return { ...d, blocks, pins };
    }, true);
    setMention(null);
    focusBlock.current = mention.blockId;
  }

  function pickPageLink(title: string) {
    if (!mention || !doc) return;
    const block = doc.blocks.find((b) => b.id === mention.blockId);
    if (!block) return;
    const text = String(block.content.text ?? "");
    const before = text.slice(0, mention.start);
    const after = text.slice(mention.start + 2 + mention.query.length);
    setBlockContent(mention.blockId, { ...block.content, text: `${before}[[${title}]] ${after}` }, true);
    setMention(null);
  }

  function onTextKeyDown(block: Block, e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // The picker's capture-phase listener consumed arrows/Enter already.
    if (e.defaultPrevented) return;
    const el = e.currentTarget;
    if (e.key === "Enter" && !e.shiftKey && el.selectionStart === el.value.length) {
      e.preventDefault();
      setMention(null);
      insertBlockAfter(block.id, "text");
    }
    if (e.key === "Backspace" && el.value === "" && (doc?.blocks.length ?? 0) > 1) {
      e.preventDefault();
      removeBlock(block.id);
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && el.value === "") {
      e.preventDefault();
      undo();
    }
  }

  // ── Selection → riff ──────────────────────────────────────────────────────
  const [selection, setSelection] = useState<{ text: string; blockId: string }>({ text: "", blockId: "" });
  const [aiBusy, setAiBusy] = useState(false);

  async function runRiff(ask: { selection?: string; question?: string; blockId?: string }) {
    if (!doc) return;
    setAiBusy(true);
    try {
      const res = await notebooksApi.riff(doc.id, {
        selection: ask.selection,
        question: ask.question,
        block_id: ask.blockId,
      });
      // Law 1: suggestions become PINS. They are never written to blocks.
      const anchor = ask.blockId || doc.blocks[0]?.id || "";
      mutate((d) => ({
        ...d,
        pins: [
          ...d.pins,
          ...res.suggestions.map((s) => ({
            id: newId(),
            block_id: anchor,
            kind: "ai" as const,
            text: s,
            model: res.model,
            at: res.at,
            prompt: res.prompt,
          })),
        ],
      }), true);
    } finally {
      setAiBusy(false);
    }
  }

  // ── Margin geometry: pins render at their block's height ─────────────────
  const blockRefs = useRef(new Map<string, HTMLDivElement>());
  const [offsets, setOffsets] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const next = new Map<string, number>();
    blockRefs.current.forEach((el, id) => next.set(id, el.offsetTop));
    setOffsets(next);
  }, [doc?.blocks, doc?.pins]);

  // Rail entries: sort by anchor-block offset, then stack using each pin's
  // MEASURED height — fixed estimates made tall AI pins overlap unreadably.
  const pinRefs = useRef(new Map<string, HTMLDivElement>());
  const [pinHeights, setPinHeights] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const next = new Map<string, number>();
    pinRefs.current.forEach((el, id) => next.set(id, el.offsetHeight));
    // Only update when something actually changed, or this loops forever.
    let changed = next.size !== pinHeights.size;
    if (!changed) {
      for (const [id, h] of next) {
        if (pinHeights.get(id) !== h) {
          changed = true;
          break;
        }
      }
    }
    if (changed) setPinHeights(next);
  });

  const railEntries = useMemo(() => {
    if (!doc) return [] as { pin: Pin; top: number }[];
    const entries: { pin: Pin; top: number }[] = [];
    let floor = 0;
    const sorted = [...doc.pins].sort(
      (a, b) => (offsets.get(a.block_id) ?? 0) - (offsets.get(b.block_id) ?? 0),
    );
    for (const pin of sorted) {
      const want = offsets.get(pin.block_id) ?? 0;
      const top = Math.max(want, floor);
      entries.push({ pin, top });
      floor = top + (pinHeights.get(pin.id) ?? 90) + 8;
    }
    return entries;
  }, [doc, offsets, pinHeights]);

  // ── Margin "+" ────────────────────────────────────────────────────────────
  const [addingPin, setAddingPin] = useState(false);
  const [pinQuery, setPinQuery] = useState("");

  // ── Search ────────────────────────────────────────────────────────────────
  const [searchQ, setSearchQ] = useState("");
  const searchResults = useQuery({
    queryKey: ["nb-search", campaignId, searchQ],
    queryFn: () => notebooksApi.search(campaignId, searchQ),
    enabled: searchQ.trim().length >= 2,
  });

  // ── Read mode ─────────────────────────────────────────────────────────────
  const [reading, setReading] = useState(false);

  function openPageByTitle(title: string) {
    const hit = pages.find((p) => p.title.toLowerCase() === title.toLowerCase());
    if (hit) {
      setReading(false);
      setPageId(hit.id);
    }
  }

  async function copyMarkdown() {
    if (!doc) return;
    await navigator.clipboard.writeText(pageToMarkdown(doc.title, doc.blocks));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (disabled) {
    return (
      <div>
        <style>{NOTEBOOK_CSS}</style>
        <h1>📓 Session Notebook</h1>
        <div className="card">
          The notebook ships dark. Set <code>NOTEBOOK_ENABLED=true</code> on the API deployment,
          redeploy, and this page lights up. Nothing else in the app is affected.
        </div>
      </div>
    );
  }

  const textProps = (block: Block) => ({
    value: String(block.content.text ?? ""),
    autoFocus: focusBlock.current === block.id,
    onChange: (v: string, el: HTMLTextAreaElement) => onTextChange(block, v, el),
    onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => onTextKeyDown(block, e),
    onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const el = e.currentTarget;
      const text = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0).trim();
      if (text) setSelection({ text, blockId: block.id });
    },
  });

  return (
    <div className="nb-root">
      <style>{NOTEBOOK_CSS}</style>

      {/* ── Sidebar ── */}
      <aside className="nb-sidebar">
        <div className="nb-side-head">
          <span>📓 Notebooks</span>
          <button
            className="nb-ghost"
            title="New notebook"
            onClick={async () => {
              const title = prompt("Notebook title:", "Session 5");
              if (!title?.trim()) return;
              const nb = await notebooksApi.create(campaignId, title.trim());
              qc.invalidateQueries({ queryKey: ["notebooks", campaignId] });
              setNotebookId(nb.id);
            }}
          >
            ＋
          </button>
        </div>

        <input
          className="nb-search"
          placeholder="Search all notebooks…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
        />
        {searchQ.trim().length >= 2 ? (
          <div className="nb-search-results">
            {(searchResults.data ?? []).map((h) => (
              <button
                key={h.page_id}
                className="nb-hit"
                onClick={() => {
                  setNotebookId(h.notebook_id);
                  setPageId(h.page_id);
                  setSearchQ("");
                }}
              >
                <div className="nb-hit-title">
                  {h.page_title} <span className="nb-dim">· {h.notebook_title}</span>
                </div>
                <div className="nb-hit-snippet">{h.snippet}</div>
              </button>
            ))}
            {searchResults.data?.length === 0 && <div className="nb-dim nb-pad">No matches.</div>}
          </div>
        ) : (
          <>
            <div className="nb-nblist">
              {notebooks.map((n) => (
                <button
                  key={n.id}
                  className={`nb-nb${n.id === notebookId ? " on" : ""}`}
                  onClick={() => setNotebookId(n.id)}
                  onDoubleClick={async () => {
                    const t = prompt("Rename notebook:", n.title);
                    if (t?.trim()) {
                      await notebooksApi.rename(n.id, t.trim());
                      qc.invalidateQueries({ queryKey: ["notebooks", campaignId] });
                    }
                  }}
                >
                  {n.title}
                </button>
              ))}
            </div>
            <div className="nb-side-head">
              <span>Pages</span>
              <button
                className="nb-ghost"
                title="New page"
                onClick={async () => {
                  if (!notebookId) return;
                  const title = prompt("Page title:", "Homecoming");
                  if (!title?.trim()) return;
                  const pg = await notebooksApi.createPage(notebookId, title.trim());
                  qc.invalidateQueries({ queryKey: ["nb-pages", notebookId] });
                  setPageId(pg.id);
                }}
              >
                ＋
              </button>
            </div>
            <div className="nb-pagelist">
              {pages.map((p) => (
                <button
                  key={p.id}
                  className={`nb-pg${p.id === pageId ? " on" : ""}`}
                  onClick={() => setPageId(p.id)}
                >
                  {p.is_runbook && <span title="Session runbook">▶ </span>}
                  {p.title}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      {/* ── Editor column ── */}
      <main className="nb-main">
        {!doc ? (
          <div className="nb-dim nb-pad">
            {pages.length === 0 && notebookId
              ? "Create the first page — it becomes the session."
              : "Loading…"}
          </div>
        ) : (
          <>
            <div className="nb-toolbar">
              <input
                className="nb-title"
                value={doc.title}
                onChange={(e) => mutate((d) => ({ ...d, title: e.target.value }))}
              />
              <span className={`nb-saved nb-saved-${saveState}`}>
                {saveState === "saved" && "✓ saved"}
                {saveState === "saving" && "… saving"}
                {saveState === "dirty" && "· editing"}
                {saveState === "error" && "⚠ not saved — retrying on next edit"}
              </span>
              <button className="nb-ghost" title="Undo (structural)" onClick={undo}>
                ↶ Undo
              </button>
              <button
                className={`nb-ghost${doc.is_runbook ? " nb-on" : ""}`}
                title="Promote: flag this page as the session runbook (the only promotion there is)"
                onClick={() => mutate((d) => ({ ...d, is_runbook: !d.is_runbook }), true)}
              >
                {doc.is_runbook ? "▶ Runbook ✓" : "▶ Make runbook"}
              </button>
              <button className="nb-ghost" onClick={() => setReading(true)}>
                📖 Read
              </button>
            </div>

            <div className="nb-editor">
              {doc.blocks.map((block, idx) => (
                <div
                  key={block.id}
                  className="nb-block"
                  ref={(el) => {
                    if (el) blockRefs.current.set(block.id, el);
                    else blockRefs.current.delete(block.id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(idx)}
                >
                  <div className="nb-block-gutter">
                    <span
                      className="nb-drag"
                      title="Drag to reorder"
                      draggable
                      onDragStart={() => (dragIdx.current = idx)}
                    >
                      ⋮⋮
                    </span>
                    <button
                      className="nb-gutter-btn"
                      title="Add block below"
                      onClick={() => setSlashFor(insertBlockAfter(block.id, "text"))}
                    >
                      ＋
                    </button>
                    <button className="nb-gutter-btn" title="Delete block" onClick={() => removeBlock(block.id)}>
                      ✕
                    </button>
                  </div>

                  <div className="nb-block-body">
                    <BlockEditor
                      block={block}
                      campaignId={campaignId}
                      textProps={textProps}
                      onContent={(content) => setBlockContent(block.id, content, block.type === "sketch")}
                    />

                    {slashFor === block.id && (
                      <div className="nb-slash">
                        {BLOCK_MENU.filter((m) =>
                          m.label
                            .toLowerCase()
                            .includes(String(block.content.text ?? "").replace("/", "").trim().toLowerCase()),
                        ).map((m) => (
                          <button key={m.type} className="nb-slash-row" onClick={() => changeType(block.id, m.type)}>
                            <span className="nb-slash-icon">{m.icon}</span>
                            <b>{m.label}</b>
                            <span className="nb-dim">{m.hint}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {mention?.blockId === block.id && mention.mode === "mention" && (
                      <EntityPicker
                        campaignId={campaignId}
                        query={mention.query}
                        onPick={pickMention}
                        onClose={() => setMention(null)}
                      />
                    )}
                    {mention?.blockId === block.id && mention.mode === "pagelink" && (
                      <div className="nb-picker">
                        {pages
                          .filter((p) => p.title.toLowerCase().includes(mention.query.toLowerCase()))
                          .slice(0, 8)
                          .map((p) => (
                            <button key={p.id} className="nb-picker-row" onClick={() => pickPageLink(p.title)}>
                              <span className="nb-picker-name">[[{p.title}]]</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </main>

      {/* ── Margin rail ── */}
      <aside className="nb-rail">
        <AiMarginControls
          selection={selection.text}
          busy={aiBusy}
          onRiff={() => runRiff({ selection: selection.text, blockId: selection.blockId })}
          onAsk={(q) => runRiff({ question: q, blockId: selection.blockId || doc?.blocks[0]?.id })}
        />
        <button className="nb-ghost nb-rail-add" onClick={() => setAddingPin((v) => !v)}>
          ＋ pin
        </button>
        {addingPin && (
          <div className="nb-rail-adder">
            <input
              className="nb-picker-search"
              autoFocus
              placeholder="Pin an entity… (or type a note and press Enter)"
              value={pinQuery}
              onChange={(e) => setPinQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && pinQuery.trim() && doc) {
                  addPin({
                    block_id: selection.blockId || doc.blocks[0]?.id || "",
                    kind: "note",
                    text: pinQuery.trim(),
                  });
                  setPinQuery("");
                  setAddingPin(false);
                }
              }}
            />
            <EntityPicker
              campaignId={campaignId}
              query={pinQuery}
              onPick={(h) => {
                if (!doc) return;
                addPin({
                  block_id: selection.blockId || doc.blocks[0]?.id || "",
                  kind: "entity",
                  entity_kind: h.kind,
                  ref_id: h.refId,
                  name: h.name,
                  thumb: h.thumb,
                });
                setPinQuery("");
                setAddingPin(false);
              }}
              onClose={() => setAddingPin(false)}
            />
          </div>
        )}

        <div className="nb-rail-pins">
          {railEntries.map(({ pin, top }) => (
            <div
              key={pin.id}
              className="nb-rail-slot"
              style={{ top }}
              ref={(el) => {
                if (el) pinRefs.current.set(pin.id, el);
                else pinRefs.current.delete(pin.id);
              }}
            >
              <PinCard pin={pin} campaignId={campaignId} onDismiss={dismissPin} />
            </div>
          ))}
        </div>
      </aside>

      {reading && doc && (
        <ReadMode
          page={doc}
          campaignId={campaignId}
          onClose={() => setReading(false)}
          onPageLink={openPageByTitle}
          onCopyMarkdown={copyMarkdown}
          onPrint={() => window.print()}
        />
      )}
    </div>
  );
}
