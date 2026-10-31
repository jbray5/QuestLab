import { useEffect, useRef, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";
import type { RunbookScene, SessionRunbook } from "../../api/types";

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

/**
 * Plan 38 — click-to-edit wrapper for any text field in the runbook.
 *
 * Reads the current value from ``runbook`` (passed in), shows a small
 * pencil icon on hover, swaps in a textarea on click, PATCHes the
 * runbook on save. React Query invalidation on success refreshes the
 * displayed text everywhere it's rendered.
 */
export default function EditableRunbookText(props: Props) {
  const { sessionId, runbook, variant = "plain", fontSize } = props;
  const qc = useQueryClient();

  const initial = readValue(props, runbook);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing) {
      setDraft(initial);
      // focus after the textarea mounts
      const t = setTimeout(() => taRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
    // when not editing, keep draft in sync with the latest server value
    setDraft(initial);
  }, [editing, initial]);

  const save = useMutation({
    mutationFn: () => {
      const update = buildUpdate(props, draft, runbook);
      return sessionsApi.patchRunbook(sessionId, update);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["runbook", sessionId] });
      setEditing(false);
    },
  });

  if (!editing) {
    return (
      <div
        style={{ position: "relative", whiteSpace: "pre-wrap", paddingRight: 30 }}
        className="ql-editable-runbook"
      >
        <p style={renderStyle(variant, fontSize)}>
          {initial || (
            <span style={{ color: "var(--muted)", fontStyle: "italic" }}>
              (empty — click the pencil to add)
            </span>
          )}
        </p>
        <button
          onClick={() => setEditing(true)}
          className="ql-editable-runbook-pencil"
          title="Edit this text"
          aria-label="Edit this text"
          style={pencilStyle}
        >
          <Pencil size={13} aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <div>
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save.mutate();
        }}
        rows={Math.max(3, Math.min(14, draft.split("\n").length + 1))}
        style={{
          width: "100%",
          fontFamily: variant === "read_aloud" ? "var(--font-story)" : "inherit",
          fontStyle: variant === "read_aloud" ? "italic" : "normal",
          fontSize: fontSize ?? "0.95rem",
          lineHeight: 1.6,
          padding: "0.5rem 0.65rem",
          background: "var(--bg)",
          border: "1px solid var(--border2)",
          borderRadius: 8,
          color: "var(--text)",
          resize: "vertical",
        }}
      />
      <div style={{ display: "flex", gap: "0.4rem", marginTop: "0.35rem", alignItems: "center", flexWrap: "wrap", fontStyle: "normal", fontFamily: "var(--font-ui)" }}>
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || draft === initial}
          className="btn btn-secondary"
          style={{ minHeight: 28, fontSize: "0.8125rem", padding: "0.15rem 0.65rem", gap: "0.3rem" }}
          title="Save changes — Ctrl/Cmd+Enter"
        >
          {save.isPending ? "Saving…" : <><Check size={14} aria-hidden /> Save</>}
        </button>
        <button
          onClick={() => setEditing(false)}
          disabled={save.isPending}
          className="btn btn-ghost"
          style={{ minHeight: 28, fontSize: "0.8125rem", padding: "0.15rem 0.55rem", border: "none" }}
          title="Discard (Esc)"
        >
          Cancel
        </button>
        {save.isError && (
          <span style={{ fontSize: "0.75rem", color: "var(--danger-text)" }}>
            {(save.error as Error)?.message ?? "Save failed"}
          </span>
        )}
        <span style={{ fontSize: "0.75rem", color: "var(--muted)", marginLeft: "auto" }}>
          Ctrl/Cmd+Enter to save · Esc to cancel
        </span>
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
  opacity: 0.55,
  transition: "opacity 150ms ease, color 150ms ease",
};
