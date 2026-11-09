import type {
  QuestLogEntry,
  QuestOption,
  QuestStep,
  RunStatus,
  SideQuest,
  SideQuestInput,
  StepKind,
} from "../api/sideQuests";
import { portraitSrc } from "./portrait";

/**
 * Plan 136 — the DM's side-quest editor, as plain functions.
 *
 * The form's state is the API's own `QuestStep`, with one addition: a link may hold
 * `NEXT_IN_LIST`, meaning "whichever step is below this one when I save". Reordering just moves
 * steps in the array, so those links follow the list, and links set to a real step id stay put.
 * `resolveLinks` swaps the marker for a real id (or nothing, on the last step), so the marker
 * never reaches the server.
 *
 * The limits mirror `domain/side_quest.py`, which is what enforces them.
 */

export const QUEST_LIMITS = {
  steps: 40,
  minOptions: 2,
  maxOptions: 4,
  skills: 3,
  items: 5,
  text: 4000,
  title: 120,
  teaser: 200,
  label: 120,
  gpMin: -1000,
  gpMax: 10000,
  dcMin: 1,
  dcMax: 30,
  ping: 2000,
} as const;

/** A link that follows the list. Only the form ever sees it. */
export const NEXT_IN_LIST = "~next-in-list";

/** The server needs a title, but a draft may not have one yet. */
export const UNTITLED = "Untitled quest";

/** The five kinds of step, in the words the form uses. */
export const STEP_KINDS: readonly { kind: StepKind; name: string; hint: string; placeholder: string }[] = [
  {
    kind: "read",
    name: "Story text",
    hint: "Words to read, then a Continue button.",
    placeholder: "What the player reads.",
  },
  {
    kind: "choice",
    name: "A choice",
    hint: "The player picks one of two to four options. Each can go somewhere different.",
    placeholder: "What the player reads before choosing.",
  },
  {
    kind: "check",
    name: "A skill check",
    hint: "The player picks a skill and rolls. A pass and a fail can go different ways.",
    placeholder: "What the player reads before rolling. You can leave this empty.",
  },
  {
    kind: "reply",
    name: "A written reply",
    hint: "The player writes something back to you. You read it in the results.",
    placeholder: "What the player reads, and what you want them to answer.",
  },
  {
    kind: "end",
    name: "An ending",
    hint: "The quest finishes here.",
    placeholder: "What the player reads at the end.",
  },
];

export interface QuestDraft {
  title: string;
  teaser: string;
  steps: QuestStep[];
}

export const BLANK_DRAFT: QuestDraft = { title: "", teaser: "", steps: [] };

/** A short id, unique within a quest. Works over plain http too, unlike `randomUUID`. */
export function newStepId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function blankOption(): QuestOption {
  return { label: "", next: NEXT_IN_LIST };
}

export function blankStep(kind: StepKind): QuestStep {
  return {
    id: newStepId(),
    kind,
    text: "",
    image_url: null,
    next: NEXT_IN_LIST,
    options: kind === "choice" ? [blankOption(), blankOption()] : [],
    skills: [],
    dc: null,
    pass_next: NEXT_IN_LIST,
    fail_next: NEXT_IN_LIST,
    gp: 0,
    item_ids: [],
    party_sees: false,
  };
}

/** Change what kind of step this is, keeping its words, picture and rewards. */
export function changeKind(step: QuestStep, kind: StepKind): QuestStep {
  const options =
    kind === "choice" && step.options.length < QUEST_LIMITS.minOptions
      ? [...step.options, ...Array.from({ length: QUEST_LIMITS.minOptions - step.options.length }, blankOption)]
      : step.options;
  return { ...step, kind, options };
}

function mapLinks(step: QuestStep, fn: (link: string | null) => string | null): QuestStep {
  return {
    ...step,
    next: fn(step.next),
    pass_next: fn(step.pass_next),
    fail_next: fn(step.fail_next),
    options: step.options.map((o) => ({ ...o, next: fn(o.next) })),
  };
}

/** Every link marked "Next in the list", made real. The last step's lead nowhere yet. */
export function resolveLinks(steps: QuestStep[]): QuestStep[] {
  return steps.map((step, i) => {
    const below = steps[i + 1]?.id ?? null;
    return mapLinks(step, (link) => (link === NEXT_IN_LIST ? below : link));
  });
}

/** The links that matter for this kind of step, including ones that lead nowhere yet. */
export function stepLinks(step: QuestStep): (string | null)[] {
  if (step.kind === "read" || step.kind === "reply") return [step.next];
  if (step.kind === "choice") return step.options.map((o) => o.next);
  if (step.kind === "check") return [step.pass_next, step.fail_next];
  return [];
}

/** Which steps (by position) lead to each step, to show on its card. */
export function incomingLinks(steps: QuestStep[]): Map<string, number[]> {
  const from = new Map<string, number[]>();
  resolveLinks(steps).forEach((step, i) => {
    for (const link of new Set(stepLinks(step))) {
      if (link) from.set(link, [...(from.get(link) ?? []), i]);
    }
  });
  return from;
}

/** Move a step up or down the list. Links to real steps don't change. */
export function moveStep(steps: QuestStep[], index: number, delta: -1 | 1): QuestStep[] {
  const target = index + delta;
  if (target < 0 || target >= steps.length) return steps;
  const next = [...steps];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Remove a step and clear every link to it, so the server's problems list names them. */
export function deleteStep(steps: QuestStep[], id: string): QuestStep[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) => mapLinks(s, (link) => (link === id ? null : link)));
}

/**
 * A saved quest as the form's state.
 *
 * The server only stores real ids, so a link saved as a step id comes back as that step. A link
 * with nothing in it on the last step is still waiting for a step to be written below it, so it
 * goes back to "Next in the list". Anywhere else, nothing means a deleted step cleared it.
 */
export function draftFromQuest(quest: SideQuest): QuestDraft {
  const last = quest.steps.length - 1;
  const steps = quest.steps.map((step, i) => {
    const open = i === last ? mapLinks(step, (link) => link ?? NEXT_IN_LIST) : step;
    return open.kind === "choice" && quest.status !== "sent" ? changeKind(open, "choice") : open;
  });
  return { title: quest.title === UNTITLED ? "" : quest.title, teaser: quest.teaser, steps };
}

/** Only the fields this kind of step uses. An option with no words isn't saved. */
function cleanStep(step: QuestStep): QuestStep {
  const clean: QuestStep = {
    ...step,
    text: step.text,
    next: null,
    options: [],
    skills: [],
    dc: null,
    pass_next: null,
    fail_next: null,
    party_sees: step.kind === "choice" && !!step.party_sees,
  };
  if (step.kind === "read" || step.kind === "reply") clean.next = step.next;
  if (step.kind === "choice") {
    clean.options = step.options
      .map((o) => ({ ...o, label: o.label.trim() }))
      .filter((o) => o.label);
  }
  if (step.kind === "check") {
    clean.skills = step.skills;
    clean.dc = step.dc;
    clean.pass_next = step.pass_next;
    clean.fail_next = step.fail_next;
  }
  return clean;
}

/**
 * The form's state as the API wants it.
 *
 * Once a quest has gone out its structure is frozen, and the server compares every field. So a
 * sent quest's steps go back as they came, with only the words changed.
 */
export function draftToInput(draft: QuestDraft, sent: boolean): SideQuestInput {
  const resolved = resolveLinks(draft.steps);
  const steps = sent
    ? resolved.map((s) => ({ ...s, options: s.options.map((o) => ({ ...o, label: o.label.trim() })) }))
    : resolved.map(cleanStep);
  return {
    title: draft.title.trim() || UNTITLED,
    teaser: draft.teaser.trim(),
    steps,
    start_step: steps[0]?.id ?? null,
  };
}

/** What only the form can tell: things the server can't see or would refuse outright. */
export function localProblems(draft: QuestDraft): string[] {
  return draft.title.trim() ? [] : ["The quest needs a title."];
}

/** A sent quest can't lose an option, so an empty label has to be refused before the server does. */
export function hasBlankOption(steps: QuestStep[]): boolean {
  return steps.some((s) => s.kind === "choice" && s.options.some((o) => !o.label.trim()));
}

/** "Step 3". The server's problems list uses the same words. */
export function stepName(index: number): string {
  return `Step ${index + 1}`;
}

export function kindName(kind: StepKind): string {
  return STEP_KINDS.find((k) => k.kind === kind)?.name ?? "A step";
}

/** The first few words of a step, or what kind it is if it has none yet. */
export function firstWords(step: QuestStep): string {
  const words = step.text.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return `(${kindName(step.kind).toLowerCase()}, nothing written yet)`;
  const start = words.slice(0, 6).join(" ");
  const cut = start.length > 44 ? `${start.slice(0, 44).trimEnd()}…` : start;
  return words.length > 6 && !cut.endsWith("…") ? `${cut}…` : cut;
}

/** "Step 3: first words of its text", for a link's select. */
export function stepOptionLabel(step: QuestStep, index: number): string {
  return `${stepName(index)}: ${firstWords(step)}`;
}

/** Whether every way out of a choice or check goes to the same place, which is rarely meant. */
export function allLinksSame(step: QuestStep, steps: QuestStep[]): boolean {
  const index = steps.findIndex((s) => s.id === step.id);
  const resolved = resolveLinks(steps)[index];
  if (!resolved || (resolved.kind !== "choice" && resolved.kind !== "check")) return false;
  const links = stepLinks(resolved);
  return links.length >= 2 && !!links[0] && new Set(links).size === 1;
}

/** A step's picture for an `<img>`. Each upload has its own name, so one fixed version will do. */
export function questImageSrc(url: string | null | undefined): string | undefined {
  return portraitSrc(url, "quest");
}

/** "+25 gp", "−10 gp". A cost that empties a purse can be part of a gold piece. */
export function formatGp(gp: number): string {
  const size = Math.abs(gp);
  const text = Number.isInteger(size) ? String(size) : size.toFixed(2).replace(/0$/, "");
  return `${gp < 0 ? "−" : "+"}${text} gp`;
}

/** The query key of one reward item. The preview reads names from here, as it makes no server calls. */
export function questItemKey(id: string): string[] {
  return ["side-quest-item", id];
}

/** Rewards in a few words, for the collapsed area on a step's card. */
export function rewardSummary(step: QuestStep): string {
  const bits: string[] = [];
  if (step.gp) bits.push(formatGp(step.gp));
  if (step.item_ids.length) bits.push(step.item_ids.length === 1 ? "1 item" : `${step.item_ids.length} items`);
  return bits.join(", ");
}

// ── What players did ────────────────────────────────────────────────────────

export const RUN_STATUS: Record<RunStatus, { word: string; pill: string }> = {
  new: { word: "Not opened", pill: "pill" },
  active: { word: "Playing", pill: "pill pill-next" },
  done: { word: "Finished", pill: "pill pill-teal" },
};

/** "Rolled Stealth: 14 + 5 = 19, passed", and "with a real die" when it was one. */
export function rollLine(entry: QuestLogEntry): string {
  const bonus = entry.bonus ?? 0;
  const sum = `${entry.die} ${bonus < 0 ? "−" : "+"} ${Math.abs(bonus)} = ${entry.total}`;
  const result = entry.passed ? "passed" : "failed";
  return `Rolled ${entry.skill}: ${sum}, ${result}${entry.real ? ", with a real die" : ""}`;
}

/** The lines one log entry makes in a timeline. A reply is handled apart: it's shown in full. */
export function logLines(entry: QuestLogEntry): string[] {
  const lines: string[] = [];
  if (entry.kind === "choice" && entry.option) lines.push(`Chose: ${entry.option}`);
  if (entry.kind === "check" && entry.skill) lines.push(rollLine(entry));
  return lines;
}

/** What arriving somewhere paid: gold first, then item names. */
export function logRewards(entry: QuestLogEntry): string[] {
  return [...(entry.gp ? [formatGp(entry.gp)] : []), ...entry.items.map((name) => `Got: ${name}`)];
}

// ── A copy of unsaved work on this device ───────────────────────────────────

interface Backup {
  /** The server version this was edited from. A newer one there means this copy is out of date. */
  base: string | null;
  draft: QuestDraft;
}

function backupKey(campaignId: string, questId: string | null): string {
  return `ql-side-quest-draft:${questId ?? `new:${campaignId}`}`;
}

/** Which server copy a backup was edited from: it no longer applies once that has moved on. */
export function backupBase(quest: SideQuest | null | undefined): string | null {
  return quest ? `${quest.status}:${quest.updated_at}` : null;
}

/** Unsaved work from an earlier visit, if there is any and it still applies. */
export function readBackup(campaignId: string, questId: string | null, base: string | null): QuestDraft | null {
  try {
    const raw = localStorage.getItem(backupKey(campaignId, questId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Backup;
    if (parsed.base !== base || !Array.isArray(parsed.draft?.steps)) return null;
    return parsed.draft;
  } catch {
    return null;
  }
}

export function writeBackup(campaignId: string, questId: string | null, base: string | null, draft: QuestDraft): void {
  try {
    localStorage.setItem(backupKey(campaignId, questId), JSON.stringify({ base, draft } satisfies Backup));
  } catch {
    // Storage full or blocked. The copy is a safety net, so the form carries on without it.
  }
}

export function clearBackup(campaignId: string, questId: string | null): void {
  try {
    localStorage.removeItem(backupKey(campaignId, questId));
  } catch {
    // As above.
  }
}
