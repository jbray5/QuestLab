import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Check, Plus, Swords, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import type { Encounter, RunbookScene, SessionRunbook } from "../../api/types";
import { useIsCompact } from "../../hooks/useIsCompact";
import { keepAboveKeyboard } from "./keepAboveKeyboard";

/** A scene as prep writes it; `encounter_id` links the fight the HUD can load (Plan 128). */
type Scene = RunbookScene & { encounter_id?: string | null };

interface Draft {
  scenes: Scene[];
  opening: string;
  closing: string;
}

type SaveState = "saved" | "saving" | "error";

interface Props {
  /** The session whose runbook this is. */
  sessionId: string;
  /** The runbook as loaded; the editor keeps its own copy from here on. */
  runbook: SessionRunbook;
  /** This arc's encounters, for the "fight in this scene" picker. */
  encounters: Encounter[];
}

const AUTOSAVE_MS = 900;

function blankScene(n: number): Scene {
  return { title: `Scene ${n}`, read_aloud: "", dm_notes: "", estimated_minutes: 20 };
}

/** The shape each scene is saved in: the four fields the HUD reads, plus a fight link. */
function cleanScene(s: Scene): Scene {
  const out: Scene = {
    title: s.title ?? "",
    read_aloud: s.read_aloud ?? "",
    dm_notes: s.dm_notes ?? "",
    estimated_minutes: Math.max(0, Math.floor(Number(s.estimated_minutes) || 0)),
  };
  if (s.encounter_id !== undefined) out.encounter_id = s.encounter_id || null;
  return out;
}

/** Rows for a text box that grows with what is written (wrapped lines estimated). */
function rowsFor(text: string, perLine: number, min: number, max: number): number {
  const lines = text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(line.length / perLine)), 0);
  return Math.max(min, Math.min(max, lines + 1));
}

/**
 * The runbook, written on the prep page (Plan 128 — Lena's ONE thing).
 *
 * Scenes are added, renamed, reordered and deleted here; each scene's read-aloud
 * and notes are real text boxes that save themselves a moment after typing stops
 * and stay above a phone's keyboard. A scene can name the fight it holds, which
 * the HUD's Script loads into the tracker. Everything goes back through the one
 * runbook PATCH, the whole scenes list at a time, so the HUD reads exactly this.
 */
export default function RunbookEditor({ sessionId, runbook, encounters }: Props) {
  const qc = useQueryClient();
  const phone = useIsCompact(640);
  const [draft, setDraft] = useState<Draft>(() => ({
    scenes: ((runbook.scenes ?? []) as Scene[]).map(cleanScene),
    opening: runbook.opening_scene ?? "",
    closing: runbook.closing_hooks ?? "",
  }));
  const [active, setActive] = useState(0);
  const [status, setStatus] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const [showOpening, setShowOpening] = useState(() => !!runbook.opening_scene);
  const [showClosing, setShowClosing] = useState(() => !!runbook.closing_hooks);

  // The save loop works from refs so a save in flight never loses later typing.
  const latest = useRef<Draft>(draft);
  const rev = useRef(0);
  const savedRev = useRef(0);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef(false);
  const queued = useRef(false);
  const titleRef = useRef<HTMLInputElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const focusNext = useRef<"title" | "heading" | null>(null);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (inFlight.current) {
      queued.current = true;
      return;
    }
    if (rev.current === savedRev.current) return;
    inFlight.current = true;
    try {
      do {
        queued.current = false;
        const sent = rev.current;
        const d = latest.current;
        const saved = await sessionsApi.patchRunbook(sessionId, {
          scenes: d.scenes.map(cleanScene),
          opening_scene: d.opening,
          closing_hooks: d.closing,
        });
        // The HUD's Script and the dock read this cache: they see it without a refetch.
        qc.setQueryData(["runbook", sessionId], saved);
        savedRev.current = sent;
      } while (queued.current);
      setError("");
      setStatus(rev.current === savedRev.current ? "saved" : "saving");
    } catch (e) {
      setError((e as Error).message || "Couldn't save.");
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [sessionId, qc]);

  // Leaving the page with typing not yet saved: send it on the way out.
  useEffect(() => () => void flush(), [flush]);

  // Focus moves after the render that made its target (a new scene's title, or
  // the scene heading after a delete), never into a field the DM didn't ask for.
  useEffect(() => {
    if (focusNext.current === "title" && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    } else if (focusNext.current === "heading") {
      headingRef.current?.focus();
    }
    focusNext.current = null;
  });

  function commit(next: Draft, immediate = false) {
    latest.current = next;
    rev.current += 1;
    setDraft(next);
    setStatus("saving");
    window.clearTimeout(timer.current);
    if (immediate) void flush();
    else timer.current = window.setTimeout(() => void flush(), AUTOSAVE_MS);
  }

  const scenes = draft.scenes;
  const idx = Math.min(active, Math.max(0, scenes.length - 1));
  const scene = scenes[idx];

  function editScene(patch: Partial<Scene>, immediate = false) {
    const next = latest.current.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    commit({ ...latest.current, scenes: next }, immediate);
  }
  function addScene() {
    const next = [...latest.current.scenes, blankScene(latest.current.scenes.length + 1)];
    focusNext.current = "title";
    setActive(next.length - 1);
    commit({ ...latest.current, scenes: next }, true);
  }
  function moveScene(dir: -1 | 1) {
    const to = idx + dir;
    if (to < 0 || to >= scenes.length) return;
    const next = [...latest.current.scenes];
    [next[idx], next[to]] = [next[to], next[idx]];
    setActive(to);
    commit({ ...latest.current, scenes: next }, true);
  }
  function deleteScene() {
    if (!scene) return;
    const named = scene.title.trim() || `scene ${idx + 1}`;
    const hasText = !!(scene.read_aloud.trim() || scene.dm_notes.trim());
    if (!window.confirm(`Delete "${named}"?${hasText ? " Its read-aloud and notes go with it." : ""}`)) return;
    const next = latest.current.scenes.filter((_, i) => i !== idx);
    focusNext.current = "heading";
    setActive(Math.max(0, idx - 1));
    commit({ ...latest.current, scenes: next }, true);
  }

  const tap = phone ? 44 : 34;
  const fieldLabel: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 600, color: "var(--muted)", margin: "0 0 0.3rem" };
  const textBox: React.CSSProperties = {
    resize: "vertical",
    lineHeight: 1.6,
    // Phones: a box never taller than the screen above the keyboard; it scrolls inside.
    maxHeight: phone ? "38vh" : undefined,
    scrollMarginTop: 72,
    scrollMarginBottom: 24,
  };
  const encounterExists = !!scene?.encounter_id && encounters.some((e) => e.id === scene.encounter_id);

  return (
    <div className="ql-tap">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: "1 1 auto" }}>Session runbook</h2>
        <SaveStatus status={status} error={error} onRetry={() => void flush()} />
      </div>

      {showOpening ? (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <label htmlFor="rb-opening" style={fieldLabel}>Opening: read this before the first scene</label>
          <textarea
            id="rb-opening"
            className="story"
            value={draft.opening}
            onChange={(e) => commit({ ...latest.current, opening: e.target.value })}
            onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
            onBlur={() => void flush()}
            rows={rowsFor(draft.opening, phone ? 34 : 70, 3, 10)}
            placeholder="The scene as the players first see it…"
            style={{ ...textBox, fontStyle: "italic", fontSize: phone ? 16 : "1.05rem" }}
          />
        </div>
      ) : null}

      {/* The scenes, as tabs; the last one adds another. */}
      <div
        role="group"
        aria-label="Scenes"
        style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.85rem" }}
      >
        {scenes.map((s, i) => (
          <button
            key={i}
            type="button"
            className="btn btn-ghost"
            aria-pressed={i === idx}
            onClick={() => setActive(i)}
            title={s.title}
            style={{
              minHeight: tap,
              maxWidth: phone ? "100%" : 260,
              fontSize: "0.875rem",
              padding: "0.25rem 0.7rem",
              ...(i === idx
                ? { background: "var(--accent-active)", color: "var(--accent-active-text)", borderColor: "var(--accent-line)" }
                : {}),
            }}
          >
            <span className="num">{i + 1}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{s.title.trim() || "Untitled"}</span>
          </button>
        ))}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={addScene}
          style={{ minHeight: tap, fontSize: "0.875rem", padding: "0.25rem 0.8rem" }}
        >
          <Plus size={16} aria-hidden /> Add scene
        </button>
      </div>

      {!scene && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <p className="text-muted" style={{ margin: 0, lineHeight: 1.55 }}>
            No scenes yet. Add one for each part of the night: where it happens, what you read aloud and what you need
            to remember.
          </p>
        </div>
      )}

      {scene && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <h3
            ref={headingRef}
            tabIndex={-1}
            style={{ margin: "0 0 0.75rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--muted)", outline: "none" }}
          >
            Scene <span className="num">{idx + 1}</span> of <span className="num">{scenes.length}</span>
          </h3>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0, 1fr) 150px",
              gap: "0.75rem",
              marginBottom: "0.85rem",
            }}
          >
            <div>
              <label htmlFor="rb-title" style={fieldLabel}>Scene title</label>
              <input
                id="rb-title"
                ref={titleRef}
                className="story"
                value={scene.title}
                onChange={(e) => editScene({ title: e.target.value })}
                onBlur={() => void flush()}
                enterKeyHint="next"
                placeholder="e.g. The miller's plea"
                style={{ fontSize: phone ? 16 : "1.15rem", fontWeight: 700 }}
              />
            </div>
            <div>
              <label htmlFor="rb-minutes" style={fieldLabel}>About how long (minutes)</label>
              <input
                id="rb-minutes"
                type="number"
                inputMode="numeric"
                min={0}
                className="num"
                value={scene.estimated_minutes || ""}
                placeholder="20"
                onChange={(e) => editScene({ estimated_minutes: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                onBlur={() => void flush()}
              />
            </div>
          </div>

          <label htmlFor="rb-read" style={fieldLabel}>Read aloud</label>
          <textarea
            id="rb-read"
            className="story"
            value={scene.read_aloud}
            onChange={(e) => editScene({ read_aloud: e.target.value })}
            onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
            onBlur={() => void flush()}
            rows={rowsFor(scene.read_aloud, phone ? 34 : 70, 4, 14)}
            placeholder="What the players hear as the scene opens…"
            style={{
              ...textBox,
              fontStyle: "italic",
              fontSize: phone ? 16 : "1.05rem",
              background: "var(--story-bg)",
              borderColor: "var(--story-line)",
              color: "var(--story-text)",
              marginBottom: "0.85rem",
            }}
          />

          <label htmlFor="rb-notes" style={fieldLabel}>Your notes (only you see these)</label>
          <textarea
            id="rb-notes"
            value={scene.dm_notes}
            onChange={(e) => editScene({ dm_notes: e.target.value })}
            onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
            onBlur={() => void flush()}
            rows={rowsFor(scene.dm_notes, phone ? 38 : 80, 4, 14)}
            placeholder="Who's here, what they want, the DC to notice the trap…"
            style={{ ...textBox, fontSize: phone ? 16 : "0.95rem", marginBottom: "0.85rem" }}
          />

          {encounters.length > 0 && (
            <div style={{ marginBottom: "0.85rem" }}>
              <label htmlFor="rb-fight" style={{ ...fieldLabel, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Swords size={14} aria-hidden /> The fight in this scene
              </label>
              <select
                id="rb-fight"
                value={encounterExists ? (scene.encounter_id as string) : ""}
                onChange={(e) => editScene({ encounter_id: e.target.value || null }, true)}
              >
                <option value="">No fight</option>
                {encounters.map((enc) => (
                  <option key={enc.id} value={enc.id}>
                    {enc.name}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: "0.8125rem", color: "var(--muted)", margin: "0.3rem 0 0" }}>
                At the table, the HUD&rsquo;s Script can load it into the turn order.
              </p>
            </div>
          )}

          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => moveScene(-1)}
              disabled={idx === 0}
              aria-label={`Move ${scene.title.trim() || "this scene"} earlier`}
              style={{ minHeight: tap, fontSize: "0.875rem", padding: "0.25rem 0.7rem" }}
            >
              <ArrowUp size={16} aria-hidden /> Earlier
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => moveScene(1)}
              disabled={idx >= scenes.length - 1}
              aria-label={`Move ${scene.title.trim() || "this scene"} later`}
              style={{ minHeight: tap, fontSize: "0.875rem", padding: "0.25rem 0.7rem" }}
            >
              <ArrowDown size={16} aria-hidden /> Later
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={deleteScene}
              style={{ minHeight: tap, fontSize: "0.875rem", padding: "0.25rem 0.7rem", marginLeft: "auto" }}
            >
              <Trash2 size={16} aria-hidden /> Delete scene
            </button>
          </div>

          {scenes.length > 1 && (
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setActive(idx - 1)}
                disabled={idx === 0}
                style={{ minHeight: tap, flex: 1 }}
              >
                ← Previous scene
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setActive(idx + 1)}
                disabled={idx >= scenes.length - 1}
                style={{ minHeight: tap, flex: 1 }}
              >
                Next scene →
              </button>
            </div>
          )}
        </div>
      )}

      {showClosing ? (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <label htmlFor="rb-closing" style={fieldLabel}>Closing hooks: where the night can end</label>
          <textarea
            id="rb-closing"
            value={draft.closing}
            onChange={(e) => commit({ ...latest.current, closing: e.target.value })}
            onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
            onBlur={() => void flush()}
            rows={rowsFor(draft.closing, phone ? 38 : 80, 3, 10)}
            placeholder="A cliffhanger, a reward, a question for next time…"
            style={{ ...textBox, fontSize: phone ? 16 : "0.95rem" }}
          />
        </div>
      ) : null}

      {(!showOpening || !showClosing) && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          {!showOpening && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowOpening(true)}
              style={{ minHeight: tap, fontSize: "0.875rem", padding: "0.25rem 0.7rem" }}
            >
              <Plus size={15} aria-hidden /> Opening read-aloud
            </button>
          )}
          {!showClosing && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowClosing(true)}
              style={{ minHeight: tap, fontSize: "0.875rem", padding: "0.25rem 0.7rem" }}
            >
              <Plus size={15} aria-hidden /> Closing hooks
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** "Saved", "Saving…" or "Not saved" with a retry, beside the runbook's heading. */
function SaveStatus({ status, error, onRetry }: { status: SaveState; error: string; onRetry: () => void }) {
  if (status === "error") {
    return (
      <span role="alert" style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem", color: "var(--danger-text)" }}>
        <AlertTriangle size={15} aria-hidden /> Not saved{error ? `: ${error}` : ""}
        <button type="button" className="btn btn-ghost" onClick={onRetry} style={{ fontSize: "0.8125rem", padding: "0.2rem 0.6rem", minHeight: 32 }}>
          Try again
        </button>
      </span>
    );
  }
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
        fontSize: "0.875rem",
        color: status === "saved" ? "var(--teal-text)" : "var(--muted)",
      }}
    >
      {status === "saved" && <Check size={15} aria-hidden />}
      {status === "saved" ? "Saved" : "Saving…"}
    </span>
  );
}
