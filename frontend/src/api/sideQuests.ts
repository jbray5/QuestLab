import { api } from "./client";

// Plan 136 — side quests. A DM writes a small graph of steps and sends it to characters; each
// character gets a private run. The phone only ever gets the current step, with no DC or links.

export type StepKind = "read" | "choice" | "check" | "reply" | "end";

export interface QuestOption {
  label: string;
  next: string | null;
}

/** A step as the DM writes it. Which fields matter depends on `kind`. */
export interface QuestStep {
  id: string;
  kind: StepKind;
  /** The DM's words. Plain text: render line breaks, never HTML. */
  text: string;
  /** An upload ("/uploads/…") or an https link. */
  image_url: string | null;
  /** read, reply: the step that follows. */
  next: string | null;
  /** choice: 2 to 4. */
  options: QuestOption[];
  /** check: 1 to 3 skill names; the player picks one. */
  skills: string[];
  /** check: 1 to 30. Never sent to the phone. */
  dc: number | null;
  pass_next: string | null;
  fail_next: string | null;
  /** Paid when the step is reached. Negative is a cost: −1000 to 10000. */
  gp: number;
  /** Up to 5, granted when the step is reached. */
  item_ids: string[];
  /** choice, Plan 140: everyone on the quest sees the others' names on the options they picked. */
  party_sees: boolean;
  /** Plan 141 — HP lost on arrival: dice like "1d4" or a flat "3". Never below 1 HP. */
  damage: string | null;
  /** Plan 141 — character id to their own words in place of `text`. Each phone gets only its own. */
  text_for: Record<string, string>;
  /** check, Plan 143 — characters who pass without rolling. Can change after sending. */
  no_roll: string[];
}

export interface SideQuestInput {
  title: string;
  /** Shown on the phone's card before it's opened. */
  teaser: string;
  steps: QuestStep[];
  start_step: string | null;
}

export type RunStatus = "new" | "active" | "done";

export interface QuestRunSummary {
  run_id: string;
  character_id: string;
  character_name: string;
  status: RunStatus;
  opened_at: string | null;
  finished_at: string | null;
  /** Plan 142 — the DM trying it as this character: hidden from the party, nothing paid. */
  practice: boolean;
}

export interface SideQuest extends SideQuestInput {
  id: string;
  campaign_id: string;
  status: "draft" | "sent";
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  /** What has to be fixed before it can be sent, in plain words. Empty when it's ready. */
  problems: string[];
  runs: QuestRunSummary[];
}

export interface QuestLogEntry {
  step_id: string;
  /** A step kind, or "opened". */
  kind: string;
  at: string;
  option: string | null;
  skill: string | null;
  die: number | null;
  bonus: number | null;
  total: number | null;
  passed: boolean | null;
  real: boolean | null;
  reply: string | null;
  gp: number | null;
  items: string[];
  /** Plan 141 — HP it actually took. */
  damage?: number | null;
  /** Plan 143 — a check passed without a roll. */
  auto?: boolean | null;
  /** Plan 143, on kind "again": what the DM took back, couldn't take back, and the old party story. */
  taken_gp?: number | null;
  taken_items?: string[];
  kept_items?: string[];
  recap?: string | null;
}

export interface QuestRunDetail extends QuestRunSummary {
  step_id: string;
  log: QuestLogEntry[];
  /** Plan 138 — what the player told the party. It may not match the log, and that's allowed. */
  recap: string | null;
  recap_at: string | null;
}

export interface QuestPing {
  channel_id: string;
  npc_id: string;
  /** Posted to a shared channel, so keep it generic: a private quest's title would give it away. */
  content: string;
}

export interface SideQuestSendResult {
  quest: SideQuest;
  new_runs: number;
  /** Discord failed; the quest still went out. */
  ping_error: string | null;
}

// Saves and sends are quiet: the page shows the error next to the button.
export const sideQuestsApi = {
  list: (campaignId: string) => api.get<SideQuest[]>(`/campaigns/${campaignId}/side-quests`),
  get: (id: string) => api.get<SideQuest>(`/side-quests/${id}`),
  create: (campaignId: string, body: SideQuestInput) =>
    api.post<SideQuest>(`/campaigns/${campaignId}/side-quests`, body, { quiet: true }),
  update: (id: string, body: Partial<SideQuestInput>) =>
    api.patch<SideQuest>(`/side-quests/${id}`, body, { quiet: true }),
  remove: (id: string) => api.delete(`/side-quests/${id}`, { quiet: true }),
  send: (id: string, characterIds: string[], ping?: QuestPing) =>
    api.post<SideQuestSendResult>(
      `/side-quests/${id}/send`,
      { character_ids: characterIds, ping: ping ?? null },
      { quiet: true },
    ),
  runs: (id: string) => api.get<QuestRunDetail[]>(`/side-quests/${id}/runs`),
  /** Plan 142 — play it as a character, hidden from the party. Again starts over. */
  practice: (id: string, characterId: string) =>
    api.post<QuestRunSummary>(`/side-quests/${id}/practice`, { character_id: characterId }, { quiet: true }),
  removePractice: (id: string, runId: string) =>
    api.delete(`/side-quests/${id}/practice/${runId}`, { quiet: true }),
  /** Plan 143 — back to the start; `takeBack` undoes the last try's gold and items. */
  playAgain: (id: string, runId: string, takeBack: boolean) =>
    api.post<QuestRunDetail>(`/side-quests/${id}/runs/${runId}/again`, { take_back: takeBack }, { quiet: true }),
};

// ── The phone's side: no DCs, no links, no later steps ─────────────────────

export interface QuestCard {
  run_id: string;
  title: string;
  teaser: string;
  status: RunStatus;
  sent_at: string | null;
  finished_at: string | null;
  /** Plan 142. */
  practice: boolean;
}

export interface QuestStepView {
  id: string;
  kind: StepKind;
  text: string;
  image_url: string | null;
  /** `index` is what goes back in the move. `taken_by` (Plan 140): who else picked it. */
  options: { index: number; label: string; taken_by: string[] }[];
  /** The character's real bonuses. */
  skills: { name: string; bonus: number }[];
  /** Plan 140 — the party will see this pick. */
  party_sees_pick: boolean;
  /** Plan 143 — this character passes without rolling (`skills` is empty). */
  no_roll?: boolean;
}

/** What just happened: the roll, and what arriving at this step paid. */
export interface QuestOutcome {
  die: number | null;
  bonus: number | null;
  total: number | null;
  passed: boolean | null;
  real: boolean | null;
  skill: string | null;
  gp: number;
  items: string[];
  /** Plan 141 — HP it took. */
  damage: number;
  /** Plan 143 — passed without a roll. */
  no_roll?: boolean;
}

export interface QuestHistoryItem {
  step_id: string;
  kind: StepKind;
  text: string;
  image_url: string | null;
  option: string | null;
  skill: string | null;
  total: number | null;
  passed: boolean | null;
  /** Plan 139 — they answered. The words never come back from the server. */
  replied: boolean;
  /** Plan 143 — a check they passed without rolling. */
  no_roll?: boolean;
}

export interface QuestRunView {
  run_id: string;
  title: string;
  status: RunStatus;
  step: QuestStepView;
  outcome: QuestOutcome | null;
  history: QuestHistoryItem[];
  /** Plan 138 — what this player has told the party about it, if anything. */
  recap: string | null;
  /** Plan 142 — nothing is paid or taken, and the party can't see it. */
  practice: boolean;
}

/** Plan 138 — a recap as the party gets it: who and their words, nothing about the quest. */
export interface PartyRecap {
  character_name: string;
  text: string;
  at: string;
  mine: boolean;
}

/** A move. `step_id` guards a double tap: a stale one changes nothing. */
export interface QuestMove {
  step_id: string;
  option?: number;
  skill?: string;
  /** A real die the player rolled, 1 to 20. Left out, the server rolls. */
  real?: number;
  reply?: string;
}

// `key` is the player-link key, the same one `playApi` takes. All quiet: the quest screen shows
// errors in place, and `list` runs on every phone's Now screen, so a failure must not toast.
export const playQuestsApi = {
  list: (key: string) => api.get<QuestCard[]>(`/play/${key}/side-quests`, { quiet: true }),
  get: (key: string, runId: string) =>
    api.get<QuestRunView>(`/play/${key}/side-quests/${runId}`, { quiet: true }),
  open: (key: string, runId: string) =>
    api.post<QuestRunView>(`/play/${key}/side-quests/${runId}/open`, {}, { quiet: true }),
  advance: (key: string, runId: string, move: QuestMove) =>
    api.post<QuestRunView>(`/play/${key}/side-quests/${runId}/advance`, move, { quiet: true }),
  recaps: (key: string) => api.get<PartyRecap[]>(`/play/${key}/side-quests/recaps`, { quiet: true }),
  /** Empty words take it back. */
  shareRecap: (key: string, runId: string, text: string) =>
    api.put<QuestRunView>(`/play/${key}/side-quests/${runId}/recap`, { text }, { quiet: true }),
  /** Plan 142 — a practice run back to the first step. */
  startOver: (key: string, runId: string) =>
    api.post<QuestRunView>(`/play/${key}/side-quests/${runId}/start-over`, {}, { quiet: true }),
};
