import { useRef, useState } from "react";
import { Check, Circle, X } from "lucide-react";

import type { Campaign } from "../api/types";
import FeedbackSheet from "./FeedbackSheet";

// A sample campaign from before Plan 129 doesn't count as your own.
const SAMPLE_SUFFIX = "(sample)";

type StepKey = "own" | "players" | "phone" | "session" | "feedback";

const STEPS: { key: StepKey; title: string; body: string }[] = [
  {
    key: "own",
    title: "Start your campaign",
    body: "Manage campaigns, then New campaign. Add an arc and a first session.",
  },
  {
    key: "players",
    title: "Bring your players",
    body: "Characters shows the join link and a QR code. Each player builds their character on their phone.",
  },
  {
    key: "phone",
    title: "Open a player's phone",
    body: "On a character, Share player link, then open it on your phone. That is what your players see.",
  },
  {
    key: "session",
    title: "Run a real session",
    body: "Run opens the HUD. Start the fight rolls initiative; the players' phones follow along.",
  },
  {
    key: "feedback",
    title: "Tell Justin how it went",
    body: "Send feedback is in the menu on every page. One line is plenty.",
  },
];

function storageKey(email: string): string {
  return `ql-beta-welcome:${email.toLowerCase()}`;
}

function readTicks(email: string): { ticks: StepKey[]; hidden: boolean } {
  try {
    const raw = localStorage.getItem(storageKey(email));
    if (raw) return JSON.parse(raw);
  } catch {
    /* storage blocked: start fresh */
  }
  return { ticks: [], hidden: false };
}

/**
 * BetaWelcome (Plan 125) — the friends-beta checklist on the Dashboard.
 *
 * Five steps from first sign-in to a real night and a note back. Steps the
 * app can see tick themselves (your own campaign); the rest
 * the DM ticks. Hidden for good once dismissed; remembered per account on
 * this device.
 */
export default function BetaWelcome({ email, campaigns }: { email: string; campaigns: Campaign[] }) {
  const [state, setState] = useState(() => readTicks(email));
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // Where focus goes when the feedback sheet closes: its own Send feedback
  // button is gone by then (the step has ticked itself).
  const feedbackTickRef = useRef<HTMLButtonElement>(null);
  if (state.hidden || !email) return null;

  const auto: Partial<Record<StepKey, boolean>> = {
    own: campaigns.some((c) => !c.name.endsWith(SAMPLE_SUFFIX)),
  };
  const done = (k: StepKey) => !!auto[k] || state.ticks.includes(k);
  const count = STEPS.filter((s) => done(s.key)).length;

  function save(next: { ticks: StepKey[]; hidden: boolean }) {
    setState(next);
    try {
      localStorage.setItem(storageKey(email), JSON.stringify(next));
    } catch {
      /* fine: it just won't be remembered */
    }
  }

  return (
    <section
      className="card"
      aria-label="Welcome to the beta"
      style={{ marginBottom: "1.5rem", borderColor: "var(--accent-line)", background: "var(--accent-soft)" }}
    >
      <div className="flex" style={{ alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p className="eyebrow" style={{ margin: 0 }}>
            Beta · <span className="num">{count}</span> of <span className="num">{STEPS.length}</span> done
          </p>
          <h2 className="story" style={{ margin: "0.2rem 0 0.35rem", fontSize: "1.35rem" }}>
            Welcome to QuestLab
          </h2>
          <p style={{ margin: 0, color: "var(--text2)", lineHeight: 1.5 }}>
            Thanks for trying it early. Here's the path from here to a real night at your table.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          aria-label="Hide the beta checklist"
          title="Hide this checklist"
          onClick={() => save({ ...state, hidden: true })}
          style={{ minWidth: 44, minHeight: 44, padding: 0, justifyContent: "center" }}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <ol style={{ listStyle: "none", padding: 0, margin: "0.85rem 0 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {STEPS.map((s) => {
          const isDone = done(s.key);
          const automatic = !!auto[s.key];
          return (
            <li key={s.key} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start" }}>
              {/* Each tick is a named checkbox ("Start your campaign, checked").
                  Steps QuestLab can see tick themselves and say so. */}
              <button
                ref={s.key === "feedback" ? feedbackTickRef : undefined}
                type="button"
                role="checkbox"
                aria-checked={isDone}
                aria-label={automatic ? `${s.title} (ticked for you)` : s.title}
                title={automatic ? "Ticked for you when you did it" : isDone ? "Mark as not done" : "Mark as done"}
                disabled={automatic}
                onClick={() =>
                  save({
                    ...state,
                    ticks: isDone ? state.ticks.filter((t) => t !== s.key) : [...state.ticks, s.key],
                  })
                }
                className="btn btn-ghost"
                style={{ minWidth: 44, minHeight: 44, padding: 0, justifyContent: "center", flexShrink: 0, color: isDone ? "var(--teal-text)" : "var(--muted)" }}
              >
                {isDone ? <Check size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
              </button>
              <div style={{ paddingTop: "0.6rem", minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: isDone ? "var(--text2)" : "var(--text)", textDecoration: isDone ? "line-through" : "none" }}>
                  {s.title}
                </div>
                {!isDone && <div className="text-sm" style={{ color: "var(--text2)", lineHeight: 1.45 }}>{s.body}</div>}
                {!isDone && s.key === "feedback" && (
                  <button type="button" className="btn btn-secondary" style={{ marginTop: "0.4rem", minHeight: 44 }} onClick={() => setFeedbackOpen(true)}>
                    Send feedback
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {feedbackOpen && (
        <FeedbackSheet
          onClose={() => {
            setFeedbackOpen(false);
            if (!state.ticks.includes("feedback")) save({ ...state, ticks: [...state.ticks, "feedback"] });
            feedbackTickRef.current?.focus();
          }}
        />
      )}
    </section>
  );
}
