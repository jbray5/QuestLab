import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  Check,
  GripVertical,
  List,
  NotebookPen,
  PanelRight,
  Play,
  Plus,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

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
import { PinCard } from "../components/notebook/MarginRail";
import ReadMode from "../components/notebook/ReadMode";
import { pageToMarkdown } from "../components/notebook/markdownLite";
import { NOTEBOOK_CSS } from "../components/notebook/notebookCss";
import PhoneSheet from "../components/PhoneSheet";
import { useIsCompact } from "../hooks/useIsCompact";

/**
 * The Session Notebook (Plan 57) — campaigns/:campaignId/notebook.
 *
 * The constitution, enforced here:
 *   Law 1 — the ONLY functions that write `blocks` are driven by the
 *           DM's own typing/drawing. No code path moves pin text into a
 *           block.
 *   Law 2 — pins render in the rail beside the writing.
 *   Law 3 — this page talks only to the notebook API (+ uploads).
 *   Law 4 — read mode + print is the finished session.
 *
 * Phones (Plan 123): one column. The notebooks/pages sidebar and the margin
 * open as bottom sheets, and the focused block gets a thumb-sized toolbar
 * (add below, move up/down, delete) in place of the hover gutter.
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
  const phone = useIsCompact(640);
  const [sheet, setSheet] = useState<"pages" | "margin" | null>(null);
  const [activeBlock, setActiveBlock] = useState<string | null>(null);

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
  // Open the first notebook by default — set during render (the sanctioned
  // derived-state pattern; an effect would cascade a second render).
  if (!notebookId && notebooks.length) setNotebookId(notebooks[0].id);

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
  // Each fresh server copy replaces the working copy — reset during render,
  // keyed on the copy it came from (no effect, so no cascading render).
  const [docSource, setDocSource] = useState<Page | null>(null);
  if (pageQ.data && pageQ.data !== docSource) {
    setDocSource(pageQ.data);
    setDoc(pageQ.data);
  }

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

  // Phones have no drag: the block toolbar moves a block one step instead.
  function moveBlock(idx: number, dir: -1 | 1) {
    mutate((d) => {
      const to = idx + dir;
      if (to < 0 || to >= d.blocks.length) return d;
      const blocks = [...d.blocks];
      [blocks[idx], blocks[to]] = [blocks[to], blocks[idx]];
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

  // ── Selection: new pins anchor to the block the DM last selected in ───────
  const [selection, setSelection] = useState<{ text: string; blockId: string }>({ text: "", blockId: "" });

  // ── Margin geometry: pins render at their block's height ─────────────────
  const blockRefs = useRef(new Map<string, HTMLDivElement>());
  const [offsets, setOffsets] = useState<Map<string, number>>(new Map());
  useEffect(() => {
    const next = new Map<string, number>();
    blockRefs.current.forEach((el, id) => next.set(id, el.offsetTop));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the state IS the post-layout DOM measurement
    setOffsets(next);
  }, [doc?.blocks, doc?.pins]);

  // Rail entries: sort by anchor-block offset, then stack using each pin's
  // MEASURED height — fixed estimates made tall pins overlap unreadably.
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-layout measurement, guarded so it settles
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
        <h1>Session notebook</h1>
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

  // Pins anchor to the selected text's block, else the block being edited.
  const pinAnchor = () => selection.blockId || activeBlock || doc?.blocks[0]?.id || "";

  const newNotebook = async () => {
    const title = prompt("Notebook title:", "Session 5");
    if (!title?.trim()) return;
    const nb = await notebooksApi.create(campaignId, title.trim());
    qc.invalidateQueries({ queryKey: ["notebooks", campaignId] });
    setNotebookId(nb.id);
  };

  const newPage = async () => {
    if (!notebookId) return;
    const title = prompt("Page title:", "Homecoming");
    if (!title?.trim()) return;
    const pg = await notebooksApi.createPage(notebookId, title.trim());
    qc.invalidateQueries({ queryKey: ["nb-pages", notebookId] });
    setPageId(pg.id);
    setSheet(null);
  };

  // ── The notebooks/pages list: a sidebar on desktop, a sheet on a phone ──
  const sidebar = (
    <>
      <div className="nb-side-head">
        <span className="nb-side-title">
          <NotebookPen size={14} aria-hidden /> Notebooks
        </span>
        <button className="nb-ghost" title="New notebook" aria-label="New notebook" onClick={newNotebook}>
          <Plus size={14} />
        </button>
      </div>

      <input
        className="nb-search"
        aria-label="Search all notebooks"
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
                setSheet(null);
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
                aria-current={n.id === notebookId ? "true" : undefined}
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
          {notebookId && (
            <>
              <div className="nb-side-head">
                <span>Pages</span>
                <button className="nb-ghost" title="New page" aria-label="New page" onClick={newPage}>
                  <Plus size={14} />
                </button>
              </div>
              <div className="nb-pagelist">
                {pages.map((p) => (
                  <button
                    key={p.id}
                    className={`nb-pg${p.id === pageId ? " on" : ""}`}
                    aria-current={p.id === pageId ? "page" : undefined}
                    onClick={() => {
                      setPageId(p.id);
                      setSheet(null);
                    }}
                  >
                    {p.is_runbook && (
                      <Play size={12} aria-label="Session runbook" style={{ marginRight: 4, verticalAlign: -1 }} />
                    )}
                    {p.title}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );

  // ── The margin's header: "pin something" ──
  const marginTools = (
    <>
      <button
        className={`nb-ghost nb-rail-add${addingPin ? " nb-on" : ""}`}
        aria-expanded={addingPin}
        onClick={() => setAddingPin((v) => !v)}
      >
        <Plus size={14} /> Pin
      </button>
      {addingPin && (
        <div className="nb-rail-adder">
          <input
            className="nb-picker-search"
            autoFocus
            aria-label="Pin an entity or a note"
            placeholder="Pin an entity… (or type a note and press Enter)"
            value={pinQuery}
            onChange={(e) => setPinQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && pinQuery.trim() && doc) {
                addPin({
                  block_id: pinAnchor(),
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
                block_id: pinAnchor(),
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
    </>
  );

  const pinCount = doc?.pins.length ?? 0;
  const lastIdx = (doc?.blocks.length ?? 0) - 1;

  return (
    <div className="nb-root">
      <style>{NOTEBOOK_CSS}</style>

      {/* ── Sidebar (desktop) ── */}
      {!phone && <aside className="nb-sidebar">{sidebar}</aside>}

      {/* ── Editor column ── */}
      <main className="nb-main">
        {phone && (
          <div className="nb-phonebar">
            <button className="nb-ghost" onClick={() => setSheet("pages")}>
              <List size={16} /> Pages
            </button>
            <span className="nb-dim nb-phonebar-where">
              {notebooks.find((n) => n.id === notebookId)?.title ?? ""}
            </span>
            {doc && (
              <button className="nb-ghost" data-shot="margin" onClick={() => setSheet("margin")}>
                <PanelRight size={16} /> Margin
                {pinCount > 0 && <span className="nb-count num">{pinCount}</span>}
              </button>
            )}
          </div>
        )}
        {notebooksQ.isSuccess && notebooks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <NotebookPen size={28} />
            </div>
            <p style={{ maxWidth: 460, margin: "0 auto 1rem" }}>
              Write each session here: read-aloud text, questions for players, quick sketches, and the
              faces you mention pinned in the margin. Start with a notebook for the campaign&rsquo;s
              next session.
            </p>
            <button className="btn btn-primary" onClick={newNotebook}>
              <Plus size={16} /> New notebook
            </button>
          </div>
        ) : !doc ? (
          pagesQ.isSuccess && pages.length === 0 ? (
            <div className="empty-state">
              <p style={{ maxWidth: 420, margin: "0 auto 1rem" }}>
                This notebook has no pages yet. Create the first one; it becomes the session.
              </p>
              <button className="btn btn-primary" onClick={newPage}>
                <Plus size={16} /> New page
              </button>
            </div>
          ) : (
            <div className="nb-dim nb-pad">Loading…</div>
          )
        ) : (
          <>
            <div className="nb-toolbar">
              <input
                className="nb-title"
                aria-label="Page title"
                value={doc.title}
                onChange={(e) => mutate((d) => ({ ...d, title: e.target.value }))}
              />
              <span className={`nb-saved nb-saved-${saveState}`} role="status">
                {saveState === "saved" && (
                  <>
                    <Check size={13} /> Saved
                  </>
                )}
                {saveState === "saving" && "Saving…"}
                {saveState === "dirty" && "Editing"}
                {saveState === "error" && (
                  <>
                    <TriangleAlert size={13} /> Not saved — retrying on next edit
                  </>
                )}
              </span>
              <button className="nb-ghost" title="Undo (structural)" onClick={undo}>
                <Undo2 size={14} /> Undo
              </button>
              <button
                className={`nb-ghost${doc.is_runbook ? " nb-on" : ""}`}
                aria-pressed={doc.is_runbook}
                title="Promote: flag this page as the session runbook (the only promotion there is)"
                onClick={() => mutate((d) => ({ ...d, is_runbook: !d.is_runbook }), true)}
              >
                {doc.is_runbook ? <Check size={14} /> : <Play size={14} />}
                {doc.is_runbook ? "Runbook" : "Make runbook"}
              </button>
              <button className="nb-ghost" data-shot="read" onClick={() => setReading(true)}>
                <BookOpen size={14} /> Read
              </button>
            </div>

            <div className="nb-editor">
              {doc.blocks.map((block, idx) => (
                <div
                  key={block.id}
                  className={`nb-block${phone && activeBlock === block.id ? " nb-active" : ""}`}
                  ref={(el) => {
                    if (el) blockRefs.current.set(block.id, el);
                    else blockRefs.current.delete(block.id);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(idx)}
                  onFocusCapture={() => setActiveBlock(block.id)}
                  onPointerDownCapture={phone ? () => setActiveBlock(block.id) : undefined}
                >
                  <div className="nb-block-gutter">
                    <span
                      className="nb-drag"
                      title="Drag to reorder"
                      draggable
                      onDragStart={() => (dragIdx.current = idx)}
                    >
                      <GripVertical size={14} aria-hidden />
                    </span>
                    <button
                      className="nb-gutter-btn"
                      title="Add block below"
                      aria-label="Add block below"
                      onClick={() => setSlashFor(insertBlockAfter(block.id, "text"))}
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      className="nb-gutter-btn"
                      title="Delete block"
                      aria-label="Delete block"
                      onClick={() => removeBlock(block.id)}
                    >
                      <X size={13} />
                    </button>
                  </div>

                  <div className="nb-block-body">
                    <BlockEditor
                      block={block}
                      campaignId={campaignId}
                      textProps={textProps}
                      onContent={(content) => setBlockContent(block.id, content, block.type === "sketch")}
                    />

                    {phone && activeBlock === block.id && (
                      <div className="nb-block-tools">
                        <button
                          className="nb-ghost"
                          onClick={() => setSlashFor(insertBlockAfter(block.id, "text"))}
                        >
                          <Plus size={16} /> Add below
                        </button>
                        <button
                          className="nb-ghost"
                          aria-label="Move block up"
                          disabled={idx === 0}
                          onClick={() => moveBlock(idx, -1)}
                        >
                          <ArrowUp size={16} />
                        </button>
                        <button
                          className="nb-ghost"
                          aria-label="Move block down"
                          disabled={idx === lastIdx}
                          onClick={() => moveBlock(idx, 1)}
                        >
                          <ArrowDown size={16} />
                        </button>
                        <button
                          className="nb-ghost"
                          aria-label="Delete block (Undo brings it back)"
                          onClick={() => removeBlock(block.id)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}

                    {slashFor === block.id && (
                      <div className="nb-slash">
                        {BLOCK_MENU.filter((m) =>
                          m.label
                            .toLowerCase()
                            .includes(String(block.content.text ?? "").replace("/", "").trim().toLowerCase()),
                        ).map((m) => (
                          <button key={m.type} className="nb-slash-row" onClick={() => changeType(block.id, m.type)}>
                            <span className="nb-slash-icon">
                              <m.icon size={16} aria-hidden />
                            </span>
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

      {/* ── Margin rail (desktop): pins sit beside their block ── */}
      {!phone && (
        <aside className="nb-rail">
          {marginTools}
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
      )}

      {/* ── Phones: the sidebar and the margin open as bottom sheets ── */}
      {phone && sheet === "pages" && (
        <PhoneSheet title="Notebooks and pages" onClose={() => setSheet(null)}>
          <div className="nb-sheet">{sidebar}</div>
        </PhoneSheet>
      )}
      {phone && sheet === "margin" && doc && (
        <PhoneSheet title="Margin" onClose={() => setSheet(null)}>
          <div className="nb-sheet">
            <p className="nb-dim" style={{ margin: "0 0 0.75rem", fontSize: "0.875rem" }}>
              Faces, notes and pictures that sit beside the page. A pin goes next to the block you
              were last editing.
            </p>
            {marginTools}
            <div className="nb-sheet-pins">
              {railEntries.map(({ pin }) => (
                <PinCard key={pin.id} pin={pin} campaignId={campaignId} onDismiss={dismissPin} />
              ))}
              {pinCount === 0 && <div className="nb-dim">Nothing pinned yet.</div>}
            </div>
          </div>
        </PhoneSheet>
      )}

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
