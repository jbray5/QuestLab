import { useId, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ImagePlus, Plus, Trash2, X } from "lucide-react";

import type { QuestOption, QuestStep, StepKind } from "../../api/sideQuests";
import {
  QUEST_LIMITS,
  STEP_KINDS,
  allLinksSame,
  blankOption,
  questImageSrc,
  rewardSummary,
  stepName,
} from "../../lib/sideQuests";
import ImageUpload from "../ImageUpload";
import { ERR, HINT, SKILL_LIST, andList } from "../homebrew/options";
import { IntInput, LinkSelect } from "./fields";
import RewardsPanel from "./RewardsPanel";

const ICON_BUTTON: React.CSSProperties = { padding: "0.25rem 0.5rem", minHeight: 34, flexShrink: 0 };

/** The skills a check accepts: chips to remove, and a select to add (18 chips would fill a phone). */
function SkillPicker({
  skills,
  locked,
  onChange,
}: {
  skills: string[];
  locked: boolean;
  onChange: (skills: string[]) => void;
}) {
  const id = useId();
  const full = skills.length >= QUEST_LIMITS.skills;
  return (
    <div>
      <label htmlFor={id}>Skills they can use</label>
      {skills.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.4rem" }}>
          {skills.map((skill) => (
            <button
              key={skill}
              type="button"
              className="btn btn-secondary"
              disabled={locked}
              aria-label={`Remove ${skill}`}
              style={{ minHeight: 34, padding: "0.2rem 0.6rem", gap: "0.35rem" }}
              onClick={() => onChange(skills.filter((s) => s !== skill))}
            >
              {skill}
              {!locked && <X size={14} aria-hidden />}
            </button>
          ))}
        </div>
      )}
      {!locked && !full && (
        <select
          id={id}
          value=""
          style={{ width: "100%", maxWidth: 320 }}
          onChange={(e) => e.target.value && onChange([...skills, e.target.value])}
        >
          <option value="">{skills.length ? "Add another skill" : "Pick a skill"}</option>
          {SKILL_LIST.filter((s) => !skills.includes(s)).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      )}
      <p style={HINT}>The player picks which one and rolls with their own bonus. Up to three.</p>
    </div>
  );
}

/** One option of a choice: the words on its button, and where it goes. */
function OptionRow({
  option,
  index,
  steps,
  stepIndex,
  locked,
  phone,
  canRemove,
  onChange,
  onRemove,
}: {
  option: QuestOption;
  index: number;
  steps: QuestStep[];
  stepIndex: number;
  locked: boolean;
  phone: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<QuestOption>) => void;
  onRemove: () => void;
}) {
  const id = useId();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)",
        gap: "0.5rem 0.75rem",
        padding: "0.6rem 0.75rem",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
          <label htmlFor={id} style={{ margin: 0 }}>
            Option {index + 1}
          </label>
          {canRemove && (
            <button
              type="button"
              className="btn btn-ghost"
              aria-label={`Remove option ${index + 1} from ${stepName(stepIndex)}`}
              title="Remove this option"
              style={{ ...ICON_BUTTON, minHeight: 28, padding: "0 0.4rem" }}
              onClick={onRemove}
            >
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
        <input
          id={id}
          type="text"
          className="story"
          maxLength={QUEST_LIMITS.label}
          placeholder="What this button says."
          value={option.label}
          style={{ width: "100%", marginTop: "0.3rem" }}
          onChange={(e) => onChange({ label: e.target.value })}
        />
      </div>
      <LinkSelect
        label="Goes to"
        value={option.next}
        steps={steps}
        selfIndex={stepIndex}
        disabled={locked}
        onChange={(next) => onChange({ next })}
      />
    </div>
  );
}

/** A step of the quest, as one card of a form. */
/** Plan 141 — some characters' own words for this step, in place of the shared text. */
function WordsFor({
  step,
  roster,
  onChange,
}: {
  step: QuestStep;
  roster: { id: string; name: string }[];
  onChange: (patch: Partial<QuestStep>) => void;
}) {
  const set = (id: string, text: string) => {
    const next = { ...step.text_for };
    if (text) next[id] = text;
    else delete next[id];
    onChange({ text_for: next });
  };
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.75rem",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <p style={{ ...HINT, margin: 0 }}>
        A character with words here sees them instead of the text above. Leave a box empty for the shared text. Each
        phone only ever gets its own.
      </p>
      {roster.length === 0 && <p style={{ ...HINT, margin: 0 }}>This campaign has no characters yet.</p>}
      {roster.map((pc) => (
        <div key={pc.id}>
          <label htmlFor={`words-${step.id}-${pc.id}`}>{pc.name}</label>
          <textarea
            id={`words-${step.id}-${pc.id}`}
            className="story"
            rows={3}
            maxLength={QUEST_LIMITS.text}
            value={step.text_for?.[pc.id] ?? ""}
            onChange={(e) => set(pc.id, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

/** Plan 143 — characters who pass this check without rolling. A ruling, so it stays open once sent. */
function NoRollFor({
  step,
  roster,
  onChange,
}: {
  step: QuestStep;
  roster: { id: string; name: string }[];
  onChange: (patch: Partial<QuestStep>) => void;
}) {
  const chosen = step.no_roll ?? [];
  const [open, setOpen] = useState(chosen.length > 0);
  if (roster.length === 0) return null;
  const names = roster.filter((pc) => chosen.includes(pc.id)).map((pc) => pc.name);
  const toggle = (id: string, on: boolean) =>
    onChange({ no_roll: on ? [...chosen.filter((c) => c !== id), id] : chosen.filter((c) => c !== id) });
  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: 0 }}
      >
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        No roll for
        {names.length > 0 && <span style={{ color: "var(--accent-text)" }}>{names.join(", ")}</span>}
      </button>
      {open && (
        <fieldset style={{ border: "none", margin: 0, padding: "0.25rem 0 0" }}>
          <legend style={{ ...HINT, margin: "0 0 0.4rem", padding: 0 }}>
            They pass without rolling and go where a pass goes. You can change this after it&rsquo;s sent.
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 1rem" }}>
            {roster.map((pc) => (
              <label
                key={pc.id}
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", minHeight: 44, margin: 0 }}
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(pc.id)}
                  onChange={(e) => toggle(pc.id, e.target.checked)}
                />
                {pc.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}

export default function StepCard({
  step,
  index,
  steps,
  comesFrom,
  locked,
  phone,
  roster,
  focusOnMount,
  onChange,
  onKind,
  onMove,
  onDelete,
}: {
  step: QuestStep;
  index: number;
  steps: QuestStep[];
  /** Positions of the steps that lead here. */
  comesFrom: number[];
  /** Sent: only words and pictures can change. */
  locked: boolean;
  phone: boolean;
  /** Plan 141 — the campaign's characters, for their own words. */
  roster: { id: string; name: string }[];
  /** Just added: start typing straight away. */
  focusOnMount: boolean;
  onChange: (patch: Partial<QuestStep>) => void;
  onKind: (kind: StepKind) => void;
  onMove: (delta: -1 | 1) => void;
  onDelete: () => void;
}) {
  const textId = useId();
  const kindId = useId();
  const [showPicture, setShowPicture] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const [showRewards, setShowRewards] = useState(false);
  const ownWords = Object.keys(step.text_for ?? {}).length;
  const [showWords, setShowWords] = useState(false);
  const kind = STEP_KINDS.find((k) => k.kind === step.kind) ?? STEP_KINDS[0];
  const name = stepName(index);
  const rewards = rewardSummary(step);
  const lines = step.text.split("\n").length + Math.ceil(step.text.length / (phone ? 34 : 70));

  function setOption(i: number, patch: Partial<QuestOption>) {
    onChange({ options: step.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) });
  }

  function setPicture(url: string) {
    const clean = url.trim();
    if (!clean.startsWith("https://") && !clean.startsWith("/uploads/")) {
      setPictureError("A picture has to be an upload or an https:// link.");
      return;
    }
    setPictureError(null);
    onChange({ image_url: clean });
  }

  return (
    <section id={`quest-step-${index + 1}`} className="card" aria-label={name} style={{ scrollMarginTop: "1rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
        <h3 style={{ margin: 0, fontFamily: "var(--font-ui)", fontSize: "1rem", fontWeight: 600, flexShrink: 0 }}>
          {name}
        </h3>
        <select
          id={kindId}
          aria-label={`What kind of step ${name} is`}
          value={step.kind}
          disabled={locked}
          style={{ width: "auto", flex: "1 1 8rem", maxWidth: 220, minWidth: 0 }}
          onChange={(e) => onKind(e.target.value as StepKind)}
        >
          {STEP_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.name}
            </option>
          ))}
        </select>
        {!locked && (
          <div style={{ display: "flex", gap: "0.25rem", marginLeft: "auto" }}>
            <button
              type="button"
              className="btn btn-ghost ql-s6-sq"
              style={ICON_BUTTON}
              disabled={index === 0}
              aria-label={`Move ${name} up`}
              title="Move up"
              onClick={() => onMove(-1)}
            >
              <ChevronUp size={18} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-ghost ql-s6-sq"
              style={ICON_BUTTON}
              disabled={index === steps.length - 1}
              aria-label={`Move ${name} down`}
              title="Move down"
              onClick={() => onMove(1)}
            >
              <ChevronDown size={18} aria-hidden />
            </button>
            <button
              type="button"
              className="btn btn-ghost ql-s6-sq"
              style={ICON_BUTTON}
              aria-label={`Delete ${name}`}
              title="Delete this step"
              onClick={onDelete}
            >
              <Trash2 size={16} aria-hidden />
            </button>
          </div>
        )}
      </div>

      <p style={{ ...HINT, margin: "0.4rem 0 0.75rem" }}>
        {index === 0 ? (
          "The quest starts here."
        ) : comesFrom.length ? (
          `Comes after ${andList(comesFrom.map(stepName))}.`
        ) : (
          <span style={{ color: "var(--amber-text)" }}>Nothing leads here yet, so players can't reach it.</span>
        )}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div>
          <label htmlFor={textId}>What the player reads</label>
          <textarea
            id={textId}
            className="story"
            autoFocus={focusOnMount}
            rows={Math.min(16, Math.max(phone ? 5 : 4, lines))}
            maxLength={QUEST_LIMITS.text}
            placeholder={kind.placeholder}
            value={step.text}
            style={{ width: "100%", fontSize: "1.05rem", scrollMarginBottom: "7rem" }}
            onChange={(e) => onChange({ text: e.target.value })}
          />
          {step.text.length > QUEST_LIMITS.text - 400 && (
            <p style={HINT}>
              <span className="num">{step.text.length}</span> of <span className="num">{QUEST_LIMITS.text}</span>{" "}
              characters.
            </p>
          )}
        </div>

        {step.kind === "reply" && (
          <p style={{ ...HINT, margin: 0 }}>The player writes an answer here. You read it in the results.</p>
        )}

        {step.kind === "choice" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {step.options.map((option, i) => (
              <OptionRow
                key={i}
                option={option}
                index={i}
                steps={steps}
                stepIndex={index}
                locked={locked}
                phone={phone}
                canRemove={!locked && step.options.length > QUEST_LIMITS.minOptions}
                onChange={(patch) => setOption(i, patch)}
                onRemove={() => onChange({ options: step.options.filter((_, j) => j !== i) })}
              />
            ))}
            {!locked && step.options.length < QUEST_LIMITS.maxOptions && (
              <div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onChange({ options: [...step.options, blankOption()] })}
                >
                  <Plus size={16} aria-hidden /> Add an option
                </button>
              </div>
            )}
            {/* Plan 140. A display setting, so it stays open after the quest goes out. */}
            <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: "0.25rem", cursor: "pointer", fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={!!step.party_sees}
                onChange={(e) => onChange({ party_sees: e.target.checked })}
                style={{ width: 20, height: 20, flex: "none" }}
              />
              Show the party who picked what
            </label>
            <p style={{ ...HINT, margin: 0 }}>
              Everyone on this quest sees the others&rsquo; names on the options they picked here, so they can split up
              the work. Their phones say so before they pick.
            </p>
          </div>
        )}

        {step.kind === "check" && (
          <>
            <SkillPicker skills={step.skills} locked={locked} onChange={(skills) => onChange({ skills })} />
            <IntInput
              label="DC"
              value={step.dc}
              min={QUEST_LIMITS.dcMin}
              max={QUEST_LIMITS.dcMax}
              disabled={locked}
              hint="The total they need to reach. Players never see this."
              onChange={(dc) => onChange({ dc })}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)",
                gap: "0.5rem 0.75rem",
              }}
            >
              <LinkSelect
                label="If they pass"
                value={step.pass_next}
                steps={steps}
                selfIndex={index}
                disabled={locked}
                onChange={(pass_next) => onChange({ pass_next })}
              />
              <LinkSelect
                label="If they fail"
                value={step.fail_next}
                steps={steps}
                selfIndex={index}
                disabled={locked}
                onChange={(fail_next) => onChange({ fail_next })}
              />
            </div>
            <NoRollFor step={step} roster={roster} onChange={onChange} />
          </>
        )}

        {(step.kind === "read" || step.kind === "reply") && (
          <LinkSelect
            label="Then go to"
            value={step.next}
            steps={steps}
            selfIndex={index}
            disabled={locked}
            onChange={(next) => onChange({ next })}
          />
        )}

        {step.kind === "end" && <p style={{ ...HINT, margin: 0 }}>The quest finishes here.</p>}

        {!locked && allLinksSame(step, steps) && (
          <p style={{ ...HINT, margin: 0 }}>
            {step.kind === "check" ? "A pass and a fail" : "All the options"} go to the same step right now. Pick a
            different step for one of them to make it branch.
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {!step.image_url && (
            <button
              type="button"
              className="btn btn-ghost"
              aria-expanded={showPicture}
              onClick={() => setShowPicture((open) => !open)}
            >
              <ImagePlus size={16} aria-hidden /> {showPicture ? "No picture for now" : "Add a picture"}
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={showRewards}
            onClick={() => setShowRewards((open) => !open)}
          >
            {showRewards ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            Rewards when reached
            {rewards && (
              <span className="num" style={{ color: "var(--accent-text)" }}>
                {rewards}
              </span>
            )}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            aria-expanded={showWords}
            onClick={() => setShowWords((open) => !open)}
          >
            {showWords ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            Words for one character
            {ownWords > 0 && (
              <span className="num" style={{ color: "var(--accent-text)" }}>
                {ownWords}
              </span>
            )}
          </button>
        </div>

        {(step.image_url || showPicture) && (
          <div>
            <ImageUpload
              currentUrl={questImageSrc(step.image_url) ?? null}
              onUrlChange={setPicture}
              label="Picture"
              size={phone ? 110 : 140}
            />
            {pictureError && <p style={ERR}>{pictureError}</p>}
            {step.image_url && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: "0.4rem" }}
                onClick={() => {
                  setShowPicture(false);
                  onChange({ image_url: null });
                }}
              >
                Remove the picture
              </button>
            )}
          </div>
        )}

        {showRewards && <RewardsPanel step={step} locked={locked} onChange={onChange} />}
        {showWords && <WordsFor step={step} roster={roster} onChange={onChange} />}
      </div>
    </section>
  );
}
