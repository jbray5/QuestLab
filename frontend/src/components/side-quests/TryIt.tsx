import { useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { MagicItem } from "../../api/items";
import type { QuestStep } from "../../api/sideQuests";
import { useIsCompact } from "../../hooks/useIsCompact";
import {
  UNTITLED,
  kindName,
  questImageSrc,
  questItemKey,
  resolveLinks,
  stepName,
  type QuestDraft,
} from "../../lib/sideQuests";
import FormFrame from "../homebrew/FormFrame";
import { HINT } from "../homebrew/options";

// The phone's own sizes (pages/player/QuestScreen.tsx), so this reads as a player will read it.
const BIG_BUTTON: React.CSSProperties = {
  width: "100%",
  minHeight: 54,
  fontSize: 17,
  borderRadius: 12,
  justifyContent: "center",
  whiteSpace: "normal",
  textAlign: "center",
};
const OPTION_BUTTON: React.CSSProperties = {
  width: "100%",
  minHeight: 56,
  padding: "12px 16px",
  fontSize: 16,
  borderRadius: 12,
  justifyContent: "flex-start",
  whiteSpace: "normal",
  textAlign: "left",
  overflowWrap: "anywhere",
};

/** The draft stops being playable here, and why. A DM-only note, so it's in the tool's voice. */
function Stop({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      style={{
        background: "var(--amber-soft)",
        color: "var(--amber-text)",
        borderRadius: 8,
        padding: "0.75rem",
        fontSize: "0.9375rem",
      }}
    >
      <strong style={{ display: "block", fontWeight: 600, marginBottom: "0.2rem" }}>The draft stops here.</strong>
      {children}
    </div>
  );
}

/** What arriving here would pay, in the phone's words. */
function WouldPay({ gp, items, damage }: { gp: number; items: string[]; damage?: string | null }) {
  if (!gp && !items.length && !damage) return null;
  return (
    <div
      style={{
        background: "var(--teal-soft)",
        borderRadius: 14,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontSize: 15,
        fontWeight: 600,
        overflowWrap: "anywhere",
      }}
    >
      {gp !== 0 && (
        <span>
          {gp > 0 ? "You got " : "You paid "}
          <span className="num">{Math.abs(gp).toLocaleString()} gp</span>
        </span>
      )}
      {items.map((name, i) => (
        <span key={i}>You got {name}</span>
      ))}
      {damage && <span>You take {damage} damage (never below 1 HP)</span>}
      <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text2)" }}>(Not really paid: this is a preview.)</span>
    </div>
  );
}

/** The step's picture and words, as the phone sets them. */
function StepWords({ step, index }: { step: QuestStep; index: number }) {
  return (
    <>
      {step.image_url && (
        <img
          src={questImageSrc(step.image_url)}
          alt=""
          style={{
            display: "block",
            width: "100%",
            maxHeight: 320,
            objectFit: "contain",
            borderRadius: 12,
            background: "var(--surface2)",
          }}
        />
      )}
      {step.text.trim() ? (
        <div
          style={{
            background: "var(--story-bg)",
            border: "1px solid var(--story-line)",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <p
            className="story"
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              fontSize: 19,
              lineHeight: 1.6,
              color: "var(--story-text)",
            }}
          >
            {step.text}
          </p>
        </div>
      ) : (
        step.kind !== "check" && <p style={{ ...HINT, margin: 0 }}>{stepName(index)} has no words yet.</p>
      )}
    </>
  );
}

/**
 * Try it: walks the form as it stands, saved or not, in a phone-sized frame. No server calls and
 * no rewards. A check offers both results so the DM can walk every branch.
 */
export default function TryIt({ draft, onClose }: { draft: QuestDraft; onClose: () => void }) {
  const qc = useQueryClient();
  const phone = useIsCompact(640);
  const steps = useMemo(() => resolveLinks(draft.steps), [draft.steps]);
  // Where the walk has been. Empty means the card the player sees before opening it.
  const [path, setPath] = useState<string[]>([]);
  const [stopped, setStopped] = useState<string | null>(null);

  const index = path.length ? steps.findIndex((s) => s.id === path[path.length - 1]) : -1;
  const step = index >= 0 ? steps[index] : null;

  /** Follow a link, or say why the walk can't. `gap` finishes the sentence for an empty link. */
  function follow(link: string | null, gap: string) {
    const target = steps.findIndex((s) => s.id === link);
    if (!link || target < 0) {
      setStopped(`${stepName(index)} doesn't say ${gap} yet.`);
    } else if (path.includes(link)) {
      setStopped(
        `This goes back to ${stepName(target)}, which they've already been through. Every path has to move forward before you can send it.`,
      );
    } else {
      setPath([...path, link]);
    }
  }

  function back() {
    if (stopped) setStopped(null);
    else setPath(path.slice(0, -1));
  }

  function startOver() {
    setStopped(null);
    setPath([]);
  }

  const itemNames = step
    ? step.item_ids.map((id) => qc.getQueryData<MagicItem>(questItemKey(id))?.name ?? "an item")
    : [];
  const labelled = step?.kind === "choice" ? step.options.filter((o) => o.label.trim()) : [];

  return (
    <FormFrame
      title="Try it"
      onClose={onClose}
      footer={
        // On a phone the dice tray floats over this corner, and the sheet has its own close button.
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", paddingRight: phone ? 60 : 0 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 44 }}
            disabled={!path.length && !stopped}
            onClick={back}
          >
            Back a step
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 44 }}
            disabled={!path.length && !stopped}
            onClick={startOver}
          >
            Start over
          </button>
          {!phone && (
            <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={onClose}>
              Close
            </button>
          )}
        </div>
      }
    >
      <p style={{ ...HINT, margin: "0 0 0.75rem" }}>
        This is what a player reads. Nothing here is saved or paid, and nobody sees it.
      </p>

      <div
        data-testid="try-it-phone"
        style={{
          maxWidth: 390,
          margin: "0 auto",
          minHeight: 380,
          background: "var(--surface)",
          border: "1px solid var(--border2)",
          borderRadius: 18,
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        <div className="story" style={{ fontWeight: 700, fontSize: 19, lineHeight: 1.2, overflowWrap: "anywhere" }}>
          {draft.title.trim() || UNTITLED}
        </div>

        {!draft.steps.length && <Stop>This quest has no steps yet.</Stop>}

        {draft.steps.length > 0 && !step && (
          <>
            <p style={{ margin: 0, color: "var(--text2)", overflowWrap: "anywhere" }}>
              {draft.teaser.trim() || <span style={HINT}>No teaser yet. This is where it shows.</span>}
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ ...BIG_BUTTON, marginTop: "auto" }}
              onClick={() => setPath([steps[0].id])}
            >
              Open
            </button>
          </>
        )}

        {step && (
          <>
            {step.kind !== "end" && <WouldPay gp={step.gp} items={itemNames} damage={step.damage} />}

            <StepWords step={step} index={index} />
            {Object.keys(step.text_for ?? {}).length > 0 && (
              <p style={{ ...HINT, margin: 0 }}>Some characters see their own words here instead.</p>
            )}

            {step.kind === "end" && <WouldPay gp={step.gp} items={itemNames} damage={step.damage} />}

            {stopped ? (
              <Stop>{stopped}</Stop>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "auto" }}>
                {step.kind === "read" && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={BIG_BUTTON}
                    onClick={() => follow(step.next, "what comes next")}
                  >
                    Continue
                  </button>
                )}

                {step.kind === "choice" && !labelled.length && <Stop>This choice has no options yet.</Stop>}
                {labelled.map((option, i) => (
                  <button
                    key={i}
                    type="button"
                    className="btn btn-secondary"
                    style={OPTION_BUTTON}
                    onClick={() => follow(option.next, `where "${option.label.trim()}" goes`)}
                  >
                    {option.label}
                  </button>
                ))}

                {step.kind === "check" && (
                  <>
                    {step.skills.length > 0 ? (
                      <p style={{ margin: 0, fontSize: "0.9375rem", color: "var(--text2)" }}>
                        They pick one to roll: {step.skills.join(", ")}.
                      </p>
                    ) : (
                      <p style={{ ...HINT, margin: 0 }}>No skills picked yet.</p>
                    )}
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={BIG_BUTTON}
                      onClick={() => follow(step.pass_next, "where a pass goes")}
                    >
                      Pretend they passed
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={BIG_BUTTON}
                      onClick={() => follow(step.fail_next, "where a fail goes")}
                    >
                      Pretend they failed
                    </button>
                  </>
                )}

                {step.kind === "reply" && (
                  <>
                    <label style={{ margin: 0, fontSize: 14 }}>
                      Your answer
                      <textarea
                        rows={4}
                        readOnly
                        placeholder="The player writes here. You read it in the results."
                        style={{ width: "100%", marginTop: "0.3rem", borderRadius: 12 }}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={BIG_BUTTON}
                      onClick={() => follow(step.next, "what comes after the reply")}
                    >
                      Send
                    </button>
                  </>
                )}

                {step.kind === "end" && (
                  <p style={{ margin: 0, color: "var(--muted)", fontSize: "0.9375rem", textAlign: "center" }}>
                    The quest is finished.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {step && (
        <p style={{ ...HINT, margin: "0.6rem auto 0", maxWidth: 390 }}>
          {stepName(index)}: {kindName(step.kind).toLowerCase()}
          {step.kind === "check" && step.dc !== null && `, DC ${step.dc}`}
          {step.kind === "choice" && labelled.length === 1 && ". A choice needs at least two options before you can send it"}
          .
        </p>
      )}
    </FormFrame>
  );
}
