import { useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import type { RunbookScene, SessionRunbook } from "../../api/types";
import { useIsCompact } from "../../hooks/useIsCompact";
import { keepAboveKeyboard } from "./keepAboveKeyboard";

type SceneField = "read_aloud" | "dm_notes" | "title";
type TopField = "opening_scene" | "closing_hooks";

interface BaseProps {
  /** The session whose runbook is being edited. */
  sessionId: string;
  /** The current runbook payload (used as the merge base for PATCH). */
  runbook: SessionRunbook;
  /** Visual style — read_aloud (italic, gold) vs dm_notes (purple). */
  variant?: "read_aloud" | "dm_notes" | "plain";
  /** Optional render-text override (defaults to currently-stored value). */
  fontSize?: string;
}

type Props = BaseProps &
  (
    | {
        kind: "top";
        field: TopField;
      }
    | {
        kind: "scene";
        sceneIndex: number;
        field: SceneField;
      }
  );

/** What the field is called in buttons and labels ("Edit the read-aloud"). */
const FIELD_NAMES: Record<SceneField | TopField, string> = {
  read_aloud: "the read-aloud",
  dm_notes: "your notes",
  title: "the title",
  opening_scene: "the opening",
  closing_hooks: "the closing hooks",
};

/**
 * Plan 38 — click-to-edit wrapper for any text field in the runbook.
 *
 * Reads the current value from ``runbook`` (passed in), shows a pencil, and
 * swaps in a textarea when the text or the pencil is clicked; PATCHes the
 * runbook on save. React Query invalidation on success refreshes the displayed
 * text everywhere it's rendered.
 *
 * Plan 128 — the HUD's Script on a phone: the pencil is thumb-sized, an empty
 * field is a "write it" button rather than a hint to find a pencil, the text box
 * stays above the keyboard, and focus comes back to the pencil afterwards.
 * Prep has the full editor (scenes added, renamed, reordered); this is for a
 * quick fix mid-session.
 */
export default function EditableRunbookText(props: Props) {
  const { sessionId, runbook, variant = "plain", fontSize } = props;
  const qc = useQueryClient();
  const phone = useIsCompact(640);
  const name = FIELD_NAMES[props.field];

  const initial = readValue(props, runbook);
  // null while reading; the text being written while editing.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const editBtnRef = useRef<HTMLButtonElement | null>(null);

  function stopEditing() {
    setDraft(null);
    // The textarea is gone after this render; put focus back on the pencil.
    window.requestAnimationFrame(() => editBtnRef.current?.focus());
  }

  const save = useMutation({
    mutationFn: (value: string) => {
      const update = buildUpdate(props, value, runbook);
      return sessionsApi.patchRunbook(sessionId, update);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runbook", sessionId] });
      stopEditing();
    },
  });

  if (!editing) {
    if (!initial) {
      return (
        <button
          ref={editBtnRef}
          type="button"
          onClick={() => setDraft("")}
          className="btn btn-ghost"
          style={{
            minHeight: phone ? 44 : 32,
            fontSize: "0.875rem",
            fontStyle: "normal",
            fontFamily: "var(--font-ui)",
            color: "var(--muted)",
            border: "1px dashed var(--border2)",
            gap: "0.4rem",
          }}
        >
          <Pencil size={14} aria-hidden /> Write {name}
        </button>
      );
    }
    return (
      <div
        style={{ position: "relative", whiteSpace: "pre-wrap", paddingRight: phone ? 50 : 36 }}
        className="ql-editable-runbook"
      >
        {/* The text itself opens the editor too (Marco clicked it and got no cursor). */}
        <p style={{ ...renderStyle(variant, fontSize), cursor: "text" }} onClick={() => setDraft(initial)}>
          {initial}
        </p>
        <button
          ref={editBtnRef}
          type="button"
          onClick={() => setDraft(initial)}
          className="ql-editable-runbook-pencil"
          title={`Edit ${name}`}
          aria-label={`Edit ${name}`}
          style={{ ...pencilStyle, width: phone ? 44 : 30, height: phone ? 44 : 30 }}
        >
          <Pencil size={phone ? 16 : 14} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        autoFocus
        aria-label={`Edit ${name}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => keepAboveKeyboard(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            stopEditing();
          }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save.mutate(draft);
        }}
        rows={Math.max(3, Math.min(14, draft.split(/\r?\n/).length + 1))}
        style={{
          width: "100%",
          fontFamily: variant === "read_aloud" ? "var(--font-story)" : "inherit",
          fontStyle: variant === "read_aloud" ? "italic" : "normal",
          fontSize: phone ? 16 : (fontSize ?? "0.95rem"),
          lineHeight: 1.6,
          padding: "0.5rem 0.65rem",
          background: "var(--bg)",
          border: "1px solid var(--border2)",
          borderRadius: 8,
          color: "var(--text)",
          resize: "vertical",
          maxHeight: phone ? "38vh" : undefined,
          scrollMarginBottom: 72,
        }}
      />
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem", alignItems: "center", flexWrap: "wrap", fontStyle: "normal", fontFamily: "var(--font-ui)" }}>
        <button
          type="button"
          onClick={() => save.mutate(draft)}
          disabled={save.isPending || draft === initial}
          className="btn btn-secondary"
          style={{ minHeight: phone ? 44 : 28, fontSize: "0.8125rem", padding: "0.15rem 0.75rem", gap: "0.3rem" }}
          title="Save changes (Ctrl or Cmd + Enter)"
        >
          {save.isPending ? "Saving…" : <><Check size={14} aria-hidden /> Save</>}
        </button>
        <button
          type="button"
          onClick={stopEditing}
          disabled={save.isPending}
          className="btn btn-ghost"
          style={{ minHeight: phone ? 44 : 28, fontSize: "0.8125rem", padding: "0.15rem 0.65rem", border: "none" }}
          title="Discard (Esc)"
        >
          Cancel
        </button>
        {save.isError && (
          <span role="alert" style={{ fontSize: "0.75rem", color: "var(--danger-text)" }}>
            {(save.error as Error)?.message ?? "Save failed"}
          </span>
        )}
        {!phone && (
          <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "auto" }}>
            Ctrl or Cmd + Enter saves · Esc cancels
          </span>
        )}
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────

function readValue(props: Props, runbook: SessionRunbook): string {
  if (props.kind === "top") {
    return (runbook[props.field] as string | null | undefined) ?? "";
  }
  const scenes = (runbook.scenes ?? []) as RunbookScene[];
  const scene = scenes[props.sceneIndex];
  if (!scene) return "";
  return (scene[props.field] as string | undefined) ?? "";
}

function buildUpdate(
  props: Props,
  newValue: string,
  runbook: SessionRunbook,
): Partial<SessionRunbook> {
  if (props.kind === "top") {
    return { [props.field]: newValue } as Partial<SessionRunbook>;
  }
  // For scene-level edits we send the whole scenes array back with the one
  // field replaced. The backend PATCH replaces the scenes column wholesale.
  const scenes = ((runbook.scenes ?? []) as RunbookScene[]).map((s, i) =>
    i === props.sceneIndex ? { ...s, [props.field]: newValue } : s,
  );
  return { scenes } as Partial<SessionRunbook>;
}

function renderStyle(
  variant: "read_aloud" | "dm_notes" | "plain",
  fontSize?: string,
): React.CSSProperties {
  if (variant === "read_aloud") {
    return {
      fontSize: fontSize ?? "1.02rem",
      lineHeight: 1.7,
      fontStyle: "italic",
      margin: 0,
    };
  }
  if (variant === "dm_notes") {
    return {
      fontSize: fontSize ?? "0.95rem",
      lineHeight: 1.6,
      margin: 0,
    };
  }
  return {
    fontSize: fontSize ?? "0.95rem",
    lineHeight: 1.5,
    margin: 0,
  };
}

const pencilStyle: React.CSSProperties = {
  position: "absolute",
  top: 0,
  right: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 26,
  height: 26,
  background: "var(--surface)",
  border: "1px solid var(--border2)",
  borderRadius: 6,
  color: "var(--muted)",
  padding: 0,
  cursor: "pointer",
  opacity: 0.8,
  transition: "opacity 150ms ease, color 150ms ease",
};
