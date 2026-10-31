/**
 * Send feedback from the player's phone (Plan 128). Players have no account,
 * so the note goes through the player link and is filed under the character.
 *
 * The sheet hangs from the top of the screen, so the box and Send stay clear
 * of the phone's keyboard. It takes focus when it opens, Escape closes it, and
 * "Thank you" is announced. The page address sent along has the link's secret
 * taken out: the note already says which character it came from.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bug, Heart, HelpCircle, Lightbulb, X } from "lucide-react";

import { playApi } from "../../api/play";
import { usePlayer } from "./playerContext";

type Kind = "loved" | "confusing" | "broken" | "idea";

const KINDS: { key: Kind; label: string; icon: React.ReactNode; prompt: string }[] = [
  { key: "loved", label: "Loved it", icon: <Heart size={16} aria-hidden />, prompt: "What worked for you? Even one line helps." },
  { key: "confusing", label: "Confusing", icon: <HelpCircle size={16} aria-hidden />, prompt: "What were you trying to do, and where did it lose you?" },
  { key: "broken", label: "Broken", icon: <Bug size={16} aria-hidden />, prompt: "What did you tap, what happened, and what did you expect?" },
  { key: "idea", label: "Idea", icon: <Lightbulb size={16} aria-hidden />, prompt: "What would make your phone better at the table?" },
];

export default function PlayerFeedback({ onClose }: { onClose: () => void }) {
  const { pcId, pc } = usePlayer();
  const location = useLocation();
  const [kind, setKind] = useState<Kind>("idea");
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const current = KINDS.find((k) => k.key === kind)!;

  const titleRef = useRef<HTMLHeadingElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    titleRef.current?.focus();
  }, []);
  useEffect(() => {
    if (state === "sent") backRef.current?.focus();
  }, [state]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setState("sending");
    // Never send the link's secret along: "/play/<link>?tab=journal".
    const rest = location.pathname.startsWith(`/play/${pcId}`) ? location.pathname.slice(`/play/${pcId}`.length) : "";
    try {
      await playApi.sendFeedback(pcId, {
        kind,
        text: body,
        page: `/play/<link>${rest}${location.search}`.slice(0, 300),
        viewport: `${window.innerWidth}×${window.innerHeight}`,
      });
      setState("sent");
    } catch {
      setState("error");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ql-player-feedback-title"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", justifyContent: "flex-start", padding: "12px 12px 0" }}
    >
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(5, 8, 7, 0.6)", border: "none", cursor: "default" }} />
      <section className="ql-modal-in" style={{ position: "relative", maxWidth: 536, width: "100%", margin: "0 auto", borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border2)", padding: "12px 16px 16px", display: "flex", flexDirection: "column", gap: 12, maxHeight: "calc(100dvh - 24px)", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <h2 id="ql-player-feedback-title" ref={titleRef} tabIndex={-1} className="story" style={{ margin: 0, flex: 1, fontSize: 20, fontWeight: 700, outline: "none" }}>
            Send feedback
          </h2>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: 44, height: 44, border: "none", background: "transparent", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        {state === "sent" ? (
          <div role="status" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <p className="story" style={{ margin: 0, fontSize: 19 }}>Thank you.</p>
            <p style={{ margin: 0, color: "var(--text2)", lineHeight: 1.5 }}>It went to the person who makes QuestLab. Every note gets read.</p>
            <button ref={backRef} type="button" className="btn btn-primary" onClick={onClose} style={{ minHeight: 48 }}>
              Back to my character
            </button>
          </div>
        ) : (
          <>
            <div role="radiogroup" aria-label="What kind of feedback" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 6 }}>
              {KINDS.map((k) => {
                const on = k.key === kind;
                return (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setKind(k.key)}
                    className="btn btn-ghost"
                    style={{ minHeight: 44, gap: 6, border: `1px solid ${on ? "var(--accent-edge)" : "var(--border2)"}`, background: on ? "var(--accent-active)" : "transparent", color: on ? "var(--accent-active-text)" : "var(--text2)" }}
                  >
                    {k.icon} {k.label}
                  </button>
                );
              })}
            </div>
            <label htmlFor="ql-player-feedback-text" style={{ margin: 0, fontSize: 14, color: "var(--text2)" }}>
              {current.prompt}
            </label>
            <textarea
              id="ql-player-feedback-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4000}
              rows={4}
              style={{ width: "100%", fontSize: 16, lineHeight: 1.5, borderRadius: 12 }}
            />
            {state === "error" && (
              <p role="alert" style={{ margin: 0, color: "var(--danger-text)", fontSize: 14 }}>
                That didn't send. Check your connection and try again.
              </p>
            )}
            <button type="button" className="btn btn-primary" disabled={!text.trim() || state === "sending"} onClick={() => void send()} style={{ minHeight: 48 }}>
              {state === "sending" ? "Sending…" : "Send"}
            </button>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              Sent with <span className="story">{pc.character_name}</span>'s name, the screen you're on and its size. Nothing else.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
