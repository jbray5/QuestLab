import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sessionsApi } from "../../api/sessions";

/**
 * SessionNotesEditor — the session's running notes, autosaved as you type.
 *
 * One editor, three homes: the notes dock, the pop-out window, and the strip
 * under the HUD's board (Plan 76). Shows the server's notes until the DM
 * types; from then on the local draft (keyed to this session so a stale
 * draft can never leak into another session). Saves 700 ms after the last
 * keystroke and flushes on unmount.
 */
export default function SessionNotesEditor({
  sessionId,
  placeholder = "Tonight's notes — what happened, what they said, what you owe them next time. Saves as you type.",
  fontSize = "0.9rem",
}: {
  sessionId: string;
  placeholder?: string;
  fontSize?: string;
}) {
  const qc = useQueryClient();
  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => sessionsApi.get(sessionId),
  });

  const [draftState, setDraftState] = useState<{ sid: string; text: string } | null>(null);
  const draft = draftState && draftState.sid === sessionId ? draftState.text : (session?.actual_notes ?? "");
  const [status, setStatus] = useState<"idle" | "dirty" | "saving" | "saved" | "error">("idle");
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef({ draft: "", dirty: false });

  const save = useMutation({
    mutationFn: (text: string) => sessionsApi.updateNotes(sessionId, text),
    onSuccess: () => {
      setStatus("saved");
      latest.current.dirty = false;
      void qc.invalidateQueries({ queryKey: ["session", sessionId] });
    },
    onError: () => setStatus("error"),
  });
  function onChange(v: string) {
    setDraftState({ sid: sessionId, text: v });
    setStatus("dirty");
    latest.current = { draft: v, dirty: true };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setStatus("saving");
      save.mutate(v);
    }, 700);
  }
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if (latest.current.dirty) void sessionsApi.updateNotes(sessionId, latest.current.draft);
    },
    [sessionId],
  );
  function reload() {
    setDraftState(null);
    latest.current.dirty = false;
    setStatus("idle");
    void qc.invalidateQueries({ queryKey: ["session", sessionId] });
  }

  const statusText =
    status === "dirty" ? "…" : status === "saving" ? "saving" : status === "saved" ? "saved ✓" : status === "error" ? "not saved — retry" : "";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
      <textarea
        value={draft}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        style={{
          flex: 1,
          minHeight: 0,
          width: "100%",
          resize: "none",
          border: 0,
          borderRadius: 0,
          background: "transparent",
          color: "var(--text)",
          fontSize,
          lineHeight: 1.55,
          padding: "0.6rem 0.8rem",
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.2rem 0.7rem",
          borderTop: "1px solid var(--border)",
          fontSize: "0.64rem",
          color: status === "error" ? "var(--danger, #ef5350)" : "var(--muted)",
          flexShrink: 0,
        }}
      >
        <span>
          {session ? `Session ${session.session_number}${session.title ? ` · ${session.title}` : ""} — notes` : "Notes"}
        </span>
        <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {statusText}
          <button
            onClick={reload}
            className="btn btn-ghost"
            style={{ fontSize: "0.62rem", padding: "0 0.35rem" }}
            title="Reload from the server (if you edited notes elsewhere)"
          >
            ↻
          </button>
        </span>
      </div>
    </div>
  );
}
