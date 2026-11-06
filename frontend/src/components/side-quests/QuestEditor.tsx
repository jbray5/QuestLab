import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Play, Plus, Send } from "lucide-react";

import { sideQuestsApi, type QuestStep, type SideQuest, type StepKind } from "../../api/sideQuests";
import { useIsCompact } from "../../hooks/useIsCompact";
import {
  BLANK_DRAFT,
  QUEST_LIMITS,
  STEP_KINDS,
  UNTITLED,
  backupBase,
  blankStep,
  changeKind,
  clearBackup,
  deleteStep,
  draftFromQuest,
  draftToInput,
  firstWords,
  hasBlankOption,
  incomingLinks,
  localProblems,
  moveStep,
  readBackup,
  stepName,
  writeBackup,
  type QuestDraft,
} from "../../lib/sideQuests";
import { plural } from "../../lib/plural";
import RowMenu from "../RowMenu";
import { ToggleChip } from "../homebrew/FormFrame";
import { ERR, HINT } from "../homebrew/options";
import QuestResults from "./QuestResults";
import SendSheet from "./SendSheet";
import StepCard from "./StepCard";
import TryIt from "./TryIt";

/**
 * QuestEditor (Plan 136): one quest, as a form. Title and teaser, then steps as numbered cards.
 *
 * Words are precious here, so unsaved work is copied to this device as it's typed and offered
 * back on the next visit. That covers what a confirm can't: the browser's back button, a sidebar
 * link, an expired session, or a phone closing a background tab.
 */

/** The step a problem sentence names, if it names one. */
function stepNumberIn(problem: string): number | null {
  const m = /^Step (\d+)\b/.exec(problem);
  return m ? Number(m[1]) : null;
}

function scrollToStep(number: number) {
  document.getElementById(`quest-step-${number}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** "Add a step": the five kinds, in plain words. */
function AddStep({
  open,
  atLimit,
  phone,
  onToggle,
  onPick,
}: {
  open: boolean;
  atLimit: boolean;
  phone: boolean;
  onToggle: () => void;
  onPick: (kind: StepKind) => void;
}) {
  if (atLimit) {
    return <p style={HINT}>A quest can have {QUEST_LIMITS.steps} steps at most.</p>;
  }
  if (!open) {
    return (
      <div>
        <button type="button" className="btn btn-secondary" style={{ minHeight: phone ? 44 : 38 }} onClick={onToggle}>
          <Plus size={16} aria-hidden /> Add a step
        </button>
      </div>
    );
  }
  return (
    <div className="card" role="group" aria-label="Add a step">
      <div style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.5rem" }}>What kind of step?</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {STEP_KINDS.map((k) => (
          <button
            key={k.kind}
            type="button"
            className="btn btn-ghost"
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              minHeight: 44,
              padding: "0.5rem 0.75rem",
              textAlign: "left",
              whiteSpace: "normal",
              border: "1px solid var(--border2)",
            }}
            onClick={() => onPick(k.kind)}
          >
            <span style={{ display: "block", fontWeight: 600, color: "var(--text)" }}>{k.name}</span>
            <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--muted)", fontWeight: 400 }}>
              {k.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The save bar stays in reach while a long quest scrolls. It's fixed, not sticky, because the
 * window scrolls here while `<main>` only grows, so sticky would never catch. It sits beside the
 * sidebar (which is a drawer at 900 px and under), and leaves room for the dice tray's button.
 */
function BottomBar({ children }: { children: ReactNode }) {
  const drawer = useIsCompact(900);
  return createPortal(
    <div
      className="ql-s6"
      style={{
        position: "fixed",
        left: drawer ? 0 : 224,
        right: 0,
        bottom: 0,
        zIndex: 10,
        padding: `0.6rem 4.75rem calc(0.6rem + env(safe-area-inset-bottom, 0px)) ${drawer ? "0.75rem" : "4.75rem"}`,
        background: "var(--surface)",
        borderTop: "1px solid var(--border2)",
      }}
    >
      <div style={{ maxWidth: 780, margin: "0 auto" }}>{children}</div>
    </div>,
    document.body,
  );
}

/** What's left before it can be sent: the server's list, each with a jump to its step. */
function WhatsLeft({
  saved,
  dirty,
  serverProblems,
  local,
}: {
  saved: boolean;
  dirty: boolean;
  serverProblems: string[];
  local: string[];
}) {
  const problems = [...local, ...serverProblems];
  return (
    <section className="card" aria-label="What's left before you can send it">
      <div style={{ fontSize: "0.9375rem", fontWeight: 600 }}>What&rsquo;s left before you can send it</div>
      {!saved && <p style={{ ...HINT, marginBottom: 0 }}>Save it and this lists anything still to fix.</p>}
      {saved && !problems.length && !dirty && (
        <p style={{ margin: "0.35rem 0 0", color: "var(--teal-text)", fontSize: "0.9375rem" }}>
          Nothing. It&rsquo;s ready to send.
        </p>
      )}
      {saved && problems.length > 0 && (
        <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {problems.map((problem, i) => {
            const number = stepNumberIn(problem);
            return (
              <li key={i} style={{ fontSize: "0.9375rem", color: "var(--amber-text)" }}>
                {number ? (
                  <button
                    type="button"
                    onClick={() => scrollToStep(number)}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0.1rem 0",
                      font: "inherit",
                      color: "inherit",
                      textAlign: "left",
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                      cursor: "pointer",
                    }}
                  >
                    {problem}
                  </button>
                ) : (
                  problem
                )}
              </li>
            );
          })}
        </ul>
      )}
      {saved && dirty && (
        <p style={{ ...HINT, marginBottom: 0 }}>You&rsquo;ve changed things since the last save. Save to check again.</p>
      )}
    </section>
  );
}

export default function QuestEditor({
  campaignId,
  quest,
  onClose,
  onCreated,
}: {
  campaignId: string;
  /** The server's copy, kept fresh by the page. Null until a new quest's first save. */
  quest: SideQuest | null;
  onClose: () => void;
  onCreated: (quest: SideQuest) => void;
}) {
  const qc = useQueryClient();
  const phone = useIsCompact(640);
  const titleId = useId();
  const teaserId = useId();
  const questId = quest?.id ?? null;
  const sent = quest?.status === "sent";

  // What the form opened with, and any unsaved work from an earlier visit.
  const [opening] = useState(() => ({
    base: quest ? draftFromQuest(quest) : BLANK_DRAFT,
    backup: readBackup(campaignId, questId, backupBase(quest)),
  }));
  const [draft, setDraft] = useState<QuestDraft>(opening.backup ?? opening.base);
  const [savedAs, setSavedAs] = useState(() => JSON.stringify(opening.base));
  const [restored, setRestored] = useState(() => !!opening.backup);
  const [tab, setTab] = useState<"results" | "edit">(sent && !opening.backup ? "results" : "edit");
  const [addOpen, setAddOpen] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [trying, setTrying] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const dirty = JSON.stringify(draft) !== savedAs;
  const local = localProblems(draft);
  const serverProblems = quest?.problems ?? [];
  const canSend = !!quest && !dirty && !local.length && !serverProblems.length;
  const left = local.length + serverProblems.length;
  const comesFrom = incomingLinks(draft.steps);

  // Keep a copy of unsaved work on this device.
  const base = backupBase(quest);
  useEffect(() => {
    if (dirty) writeBackup(campaignId, questId, base, draft);
    else clearBackup(campaignId, questId);
  }, [dirty, draft, campaignId, questId, base]);

  const save = useMutation({
    mutationFn: (snapshot: QuestDraft) => {
      const input = draftToInput(snapshot, sent);
      if (!quest) return sideQuestsApi.create(campaignId, input);
      if (sent) return sideQuestsApi.update(quest.id, { title: input.title, teaser: input.teaser, steps: input.steps });
      return sideQuestsApi.update(quest.id, input);
    },
    onSuccess: (saved, snapshot) => {
      qc.setQueryData(["side-quest", saved.id], saved);
      qc.invalidateQueries({ queryKey: ["side-quests", campaignId] });
      setSavedAs(JSON.stringify(snapshot));
      setRestored(false);
      setNotice(null);
      if (!quest) {
        clearBackup(campaignId, null);
        onCreated(saved);
      }
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => sideQuestsApi.remove(id),
    onSuccess: () => {
      clearBackup(campaignId, questId);
      qc.invalidateQueries({ queryKey: ["side-quests", campaignId] });
      onClose();
    },
  });

  function saveNow() {
    if (sent && hasBlankOption(draft.steps)) {
      setFormError("Every option needs its words, because this quest has already gone out.");
      return;
    }
    setFormError(null);
    save.mutate(draft);
  }

  function setSteps(update: (steps: QuestStep[]) => QuestStep[]) {
    setDraft((now) => ({ ...now, steps: update(now.steps) }));
  }

  function patchStep(id: string, patch: Partial<QuestStep>) {
    setSteps((steps) => steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addStep(kind: StepKind) {
    const step = blankStep(kind);
    setSteps((steps) => [...steps, step]);
    setJustAdded(step.id);
    setAddOpen(false);
  }

  function removeStep(step: QuestStep, index: number) {
    const words = step.text.trim() ? ` ("${firstWords(step)}")` : "";
    const linked = comesFrom.get(step.id)?.length;
    const tail = linked ? " Links to it are cleared, so those steps will need a new place to go." : "";
    if (window.confirm(`Delete ${stepName(index)}${words}?${tail}`)) {
      setSteps((steps) => deleteStep(steps, step.id));
    }
  }

  function leave() {
    if (dirty && !window.confirm("Close without saving? Your changes will be lost.")) return;
    clearBackup(campaignId, questId);
    onClose();
  }

  const barButton: React.CSSProperties = phone
    ? { flex: "1 1 0", minWidth: 0, justifyContent: "center", padding: "0 0.35rem", fontSize: "0.875rem" }
    : { justifyContent: "center" };
  const shownTitle = draft.title.trim() || (quest ? UNTITLED : "New quest");
  const deleteQuestion = sent
    ? `Delete "${shownTitle}"? It leaves players' phones, and what they chose and wrote goes with it. Gold and items already paid stay on their sheets.`
    : `Delete the draft "${shownTitle}"? This can't be undone.`;

  return (
    <div className="fade-in ql-s6" style={{ maxWidth: 780, margin: "0 auto" }}>
      <div style={{ marginBottom: "0.5rem" }}>
        <button type="button" className="btn btn-ghost" style={{ paddingLeft: "0.25rem" }} onClick={leave}>
          <ChevronLeft size={18} aria-hidden /> Quest creator
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <h1 className="story" style={{ margin: 0, flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
          {shownTitle}
        </h1>
        <span className={sent ? "pill pill-teal" : "pill"} style={{ marginTop: "0.5rem", flexShrink: 0 }}>
          {sent ? "Sent" : "Draft"}
        </span>
        {quest && (
          <RowMenu
            label="More for this quest"
            items={[
              {
                label: "Delete this quest",
                danger: true,
                confirm: deleteQuestion,
                onSelect: () => remove.mutate(quest.id),
              },
            ]}
          />
        )}
      </div>

      {notice && (
        <p role="status" style={{ margin: "0 0 0.75rem", color: "var(--teal-text)", fontSize: "0.9375rem" }}>
          {notice}
        </p>
      )}
      {remove.error && (
        <p role="alert" style={{ ...ERR, margin: "0 0 0.75rem" }}>
          {remove.error.message}
        </p>
      )}

      {sent && (
        <div
          role="group"
          aria-label="This quest"
          style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginBottom: "0.75rem" }}
        >
          <ToggleChip on={tab === "results"} phone={phone} onClick={() => setTab("results")}>
            What players did
          </ToggleChip>
          <ToggleChip on={tab === "edit"} phone={phone} onClick={() => setTab("edit")}>
            Words and pictures
          </ToggleChip>
        </div>
      )}

      {sent && tab === "results" && quest && (
        <>
          <QuestResults quest={quest} />
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-secondary" onClick={() => setSending(true)}>
              <Send size={16} aria-hidden /> Send to more characters
            </button>
          </div>
        </>
      )}

      {tab === "edit" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {restored && (
            <div
              role="status"
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.5rem 0.75rem",
                padding: "0.6rem 0.9rem",
                background: "var(--amber-soft)",
                color: "var(--amber-text)",
                borderRadius: 8,
                fontSize: "0.9375rem",
              }}
            >
              <span style={{ flex: "1 1 240px" }}>You had changes here that weren&rsquo;t saved. They&rsquo;re back.</span>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setDraft(opening.base);
                  setRestored(false);
                }}
              >
                Throw them away
              </button>
            </div>
          )}

          {sent && (
            <p style={{ margin: 0, color: "var(--text2)", fontSize: "0.9375rem" }}>
              This quest has gone out, so you can only change its words and pictures now. Players may be partway through
              it, so its links, checks and rewards stay as they are.
            </p>
          )}

          <section className="card" aria-label="Title and teaser">
            <div className="form-group">
              <label htmlFor={titleId}>Title</label>
              <input
                id={titleId}
                type="text"
                className="story"
                maxLength={QUEST_LIMITS.title}
                value={draft.title}
                placeholder="What the quest is called."
                style={{ fontSize: "1.125rem" }}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div>
              <label htmlFor={teaserId}>Teaser</label>
              <input
                id={teaserId}
                type="text"
                className="story"
                maxLength={QUEST_LIMITS.teaser}
                value={draft.teaser}
                onChange={(e) => setDraft({ ...draft, teaser: e.target.value })}
              />
              <p style={HINT}>Shown on the player&rsquo;s phone before they open it.</p>
            </div>
          </section>

          {draft.steps.map((step, index) => (
            <StepCard
              key={step.id}
              step={step}
              index={index}
              steps={draft.steps}
              comesFrom={comesFrom.get(step.id) ?? []}
              locked={sent}
              phone={phone}
              focusOnMount={justAdded === step.id}
              onChange={(patch) => patchStep(step.id, patch)}
              onKind={(kind) => setSteps((steps) => steps.map((s) => (s.id === step.id ? changeKind(s, kind) : s)))}
              onMove={(delta) => setSteps((steps) => moveStep(steps, index, delta))}
              onDelete={() => removeStep(step, index)}
            />
          ))}

          {!sent && (
            <AddStep
              open={addOpen || !draft.steps.length}
              atLimit={draft.steps.length >= QUEST_LIMITS.steps}
              phone={phone}
              onToggle={() => setAddOpen(true)}
              onPick={addStep}
            />
          )}

          {!sent && <WhatsLeft saved={!!quest} dirty={dirty} serverProblems={serverProblems} local={local} />}
        </div>
      )}

      {tab === "edit" && (
        <BottomBar>
          {(save.error || formError) && (
            <p role="alert" style={{ ...ERR, margin: "0 0 0.4rem", fontSize: "0.875rem", overflowWrap: "anywhere" }}>
              {formError ?? save.error?.message}
            </p>
          )}
          <div style={{ display: "flex", flexWrap: phone ? "wrap" : "nowrap", alignItems: "center", gap: "0.35rem 0.5rem" }}>
            <span
              role="status"
              style={{ flex: phone ? "1 1 100%" : 1, minWidth: 0, fontSize: "0.875rem", color: "var(--muted)" }}
            >
              {dirty
                ? "Not saved yet"
                : !quest
                  ? "Nothing to save yet"
                  : sent
                    ? "All saved"
                    : left
                      ? `Saved. ${plural(left, "thing")} left before you can send it.`
                      : "Saved. Ready to send."}
            </span>
            <div style={{ display: "flex", gap: "0.35rem", flex: phone ? "1 1 100%" : undefined, minWidth: 0 }}>
              <button type="button" className="btn btn-ghost" style={barButton} onClick={() => setTrying(true)}>
                <Play size={16} aria-hidden /> Try it
              </button>
              <button
                type="button"
                className={dirty ? "btn btn-primary" : "btn btn-secondary"}
                style={barButton}
                disabled={!dirty || save.isPending}
                onClick={saveNow}
              >
                {save.isPending ? "Saving…" : sent ? "Save changes" : "Save draft"}
              </button>
              {!sent && (
                <button
                  type="button"
                  className={canSend ? "btn btn-primary" : "btn btn-secondary"}
                  style={barButton}
                  disabled={!canSend}
                  title={canSend ? undefined : "Save it and fix what's left first."}
                  onClick={() => setSending(true)}
                >
                  <Send size={16} aria-hidden /> Send
                </button>
              )}
            </div>
          </div>
        </BottomBar>
      )}
      {/* Room to scroll the last card clear of the bar. */}
      {tab === "edit" && <div aria-hidden style={{ height: phone ? "7.5rem" : "4.5rem" }} />}

      {trying && <TryIt draft={draft} onClose={() => setTrying(false)} />}
      {sending && quest && (
        <SendSheet
          quest={quest}
          onClose={() => setSending(false)}
          onSent={(result) => {
            qc.setQueryData(["side-quest", result.quest.id], result.quest);
            qc.invalidateQueries({ queryKey: ["side-quests", campaignId] });
            qc.invalidateQueries({ queryKey: ["side-quest-runs", result.quest.id] });
            setNotice(result.new_runs ? `Sent to ${plural(result.new_runs, "character")}.` : "Nobody new to send it to.");
            setTab("results");
          }}
        />
      )}
    </div>
  );
}
