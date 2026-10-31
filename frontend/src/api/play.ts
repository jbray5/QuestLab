// Player-scope API client (Plan 00025).
//
// Mirrors the DM /characters endpoints but lives under /play/{key}/* and
// does not require any auth header — the link key in the URL is the implicit
// secret. Used by the player's phone (frontend/src/pages/player/).
//
// Plan 128 — reads are quiet (the phone shows its own states, never a raw
// "Character not found." toast), the sheet read keeps its HTTP status so a
// replaced link can be told from a network blip, and writes that used to
// toast still do, except when the link itself is gone: then the phone is told
// (`ql:play-link-gone`) and shows "This link was replaced".

import { api, apiBase, type RequestOptions } from "./client";
import { friendlyApiError } from "./errors";
import type {
  CharacterFeature,
  CharacterItem,
  CharacterSpell,
  PlayerCharacter,
  SpellSlotStateRead,
  SpellcastingStats,
} from "./types";

export interface PlayerStatePatch {
  temp_hp?: number;
  heroic_inspiration?: boolean;
  concentration_on?: string | null;
  exhaustion?: number;
  cp?: number;
  sp?: number;
  ep?: number;
  gp?: number;
  pp?: number;
  /** Plan 128 — the player's own name ("What should we call you?"), 1–100 characters. */
  player_name?: string;
}

/** A player-link request that failed, with its HTTP status (0 = no answer at all). */
export class PlayRequestError extends Error {
  status: number;
  /** For a replaced pre-token link (410), the party it belonged to. */
  campaignId: string | null;

  constructor(status: number, message: string, campaignId: string | null = null) {
    super(message);
    this.name = "PlayRequestError";
    this.status = status;
    this.campaignId = campaignId;
  }
}

/** True when the link itself no longer opens a sheet (unknown or replaced). */
export function isLinkGone(e: unknown): e is PlayRequestError {
  return e instanceof PlayRequestError && (e.status === 404 || e.status === 410);
}

/** The sheet, read with its status kept (see PlayRequestError). */
async function getSheet(key: string): Promise<PlayerCharacter> {
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/play/${encodeURIComponent(key)}`);
  } catch {
    throw new PlayRequestError(0, "No connection. Check your Wi-Fi and try again.");
  }
  if (res.ok) return (await res.json()) as PlayerCharacter;
  const body = await res.json().catch(() => ({}));
  const detail = body?.detail;
  const campaignId =
    detail && typeof detail === "object" && typeof detail.campaign_id === "string" ? detail.campaign_id : null;
  throw new PlayRequestError(res.status, friendlyApiError(detail, res.statusText), campaignId);
}

/** The words the API answers with when a link no longer opens a sheet (404 or 410). */
const GONE = new Set(["Character not found.", "Gone"]);

/**
 * A write that used to toast its errors: it still does, unless the link is
 * gone, in which case the phone hears `ql:play-link-gone` and re-checks it.
 */
async function playWrite<T>(key: string, call: (opts: RequestOptions) => Promise<T>): Promise<T> {
  try {
    return await call({ quiet: true });
  } catch (e) {
    const message = (e as Error).message;
    const event = GONE.has(message)
      ? new CustomEvent("ql:play-link-gone", { detail: { key } })
      : new CustomEvent("ql:api-error", { detail: { message } });
    if (typeof window !== "undefined") window.dispatchEvent(event);
    throw e;
  }
}

/** One class feature the character has, as the phone lists it (group C2's endpoint). */
export interface ClassFeature {
  name: string;
  level: number;
  source: string;
  note: string | null;
}

/** One row of the running fight's order, as a player's phone sees it (Plan 122). */
export interface OrderRow {
  name: string;
  initiative: number;
  side: "party" | "foe" | "other";
  you: boolean;
  current: boolean;
  defeated: boolean;
}

export interface TurnState {
  active: boolean;
  session_id?: string;
  round?: number;
  active_combatant_name?: string;
  order?: OrderRow[];
}

/** One thing a character can do on a turn (Plan 122). */
export interface TurnOption {
  key: string;
  name: string;
  kind: string;
  to_hit: number | null;
  save: string | null;
  damage: string;
  damage_type: string;
  spell_level: number;
  uses_left: number | null;
  note: string;
}

/** What a character can do on a turn, grouped by what it costs (Plan 122). */
export interface TurnKit {
  speed: number;
  action: TurnOption[];
  bonus: TurnOption[];
  reaction: TurnOption[];
  free: TurnOption[];
  basic_actions: string[];
  tips: string[];
}

/** A spell on the player's list, with its catalog details (Plan 39). */
export interface PlaySpell {
  id: string;
  spell_id: string;
  prepared: boolean;
  name: string;
  level: number;
  school: string;
  casting_time: string;
  range: string;
  components_v: boolean;
  components_s: boolean;
  components_m: string | null;
  duration: string;
  is_ritual: boolean;
  is_concentration: boolean;
  description: string;
  higher_levels: string | null;
  damage_dice: string | null;
  damage_type: string | null;
  save_ability: string | null;
  attack_type: string | null;
}

export interface RollRequest {
  die: string;
  count?: number;
  modifier?: number;
  label?: string;
  mode?: "normal" | "advantage" | "disadvantage";
  real?: number[];
}

export interface RollResult {
  die: string;
  rolls: number[];
  kept: number[];
  mode: "normal" | "advantage" | "disadvantage";
  real: boolean;
  modifier: number;
  total: number;
  session_id: string;
}

export interface CombatState {
  in_combat: boolean;
  conditions: string[];
  defeated: boolean;
}

export interface VisibleNpc {
  id: string;
  name: string;
  role: string | null;
  race: string | null;
  appearance: string | null;
  location: string | null;
  status: string;
  portrait_url: string | null;
}

/** SEC-002 — what a player link resolves to. `pc_id` identifies; only `play_key` opens the sheet. */
export interface PlayLink {
  play_key: string;
  pc_id: string;
  campaign_id: string;
}

const Q = { quiet: true } as const;

export const playApi = {
  get: (pcId: string) => getSheet(pcId),
  spellcastingStats: (pcId: string) =>
    api.get<SpellcastingStats>(`/play/${pcId}/spellcasting-stats`, Q),
  skillBonuses: (pcId: string) =>
    api.get<Record<string, number>>(`/play/${pcId}/skill-bonuses`, Q),
  savingThrows: (pcId: string) =>
    api.get<Record<string, number>>(`/play/${pcId}/saving-throws`, Q),
  spellSlots: (pcId: string) =>
    api.get<SpellSlotStateRead>(`/play/${pcId}/spell-slots`, Q),
  spells: (pcId: string) => api.get<CharacterSpell[]>(`/play/${pcId}/spells`, Q),
  features: (pcId: string) => api.get<CharacterFeature[]>(`/play/${pcId}/features`, Q),
  // Plan 128 — the class's features by level (group C2's endpoint; 404 until it ships).
  classFeatures: (pcId: string) => api.get<ClassFeature[]>(`/play/${pcId}/class-features`, Q),
  inventory: (pcId: string) => api.get<CharacterItem[]>(`/play/${pcId}/inventory`, Q),
  turnState: (pcId: string) => api.get<TurnState>(`/play/${pcId}/turn-state`, Q),
  combatState: (pcId: string) => api.get<CombatState>(`/play/${pcId}/combat-state`, Q),
  npcs: (pcId: string) => api.get<VisibleNpc[]>(`/play/${pcId}/npcs`, Q),

  applyDamage: (pcId: string, amount: number) =>
    playWrite(pcId, (o) => api.post<PlayerCharacter>(`/play/${pcId}/damage`, { amount }, o)),
  applyHealing: (pcId: string, amount: number) =>
    playWrite(pcId, (o) => api.post<PlayerCharacter>(`/play/${pcId}/heal`, { amount }, o)),
  resolveDeathSave: (pcId: string, d20: number) =>
    playWrite(pcId, (o) => api.post<PlayerCharacter>(`/play/${pcId}/death-save`, { d20 }, o)),
  spendHitDice: (pcId: string, count: number) =>
    playWrite(pcId, (o) => api.post<PlayerCharacter>(`/play/${pcId}/spend-hit-dice`, { count }, o)),
  expendSpellSlot: (pcId: string, level: number) =>
    playWrite(pcId, (o) => api.post<SpellSlotStateRead>(`/play/${pcId}/spell-slots/${level}/expend`, undefined, o)),
  restoreSpellSlot: (pcId: string, level: number) =>
    playWrite(pcId, (o) => api.post<SpellSlotStateRead>(`/play/${pcId}/spell-slots/${level}/restore`, undefined, o)),
  /** Spend uses; `amount` spends several pool points at once (Lay on Hands). */
  spendFeature: (pcId: string, characterFeatureId: string, amount = 1) =>
    playWrite(pcId, (o) =>
      api.post<CharacterFeature>(`/play/${pcId}/features/${characterFeatureId}/spend?amount=${amount}`, undefined, o),
    ),
  patchState: (pcId: string, patch: PlayerStatePatch) =>
    playWrite(pcId, (o) => api.patch<PlayerCharacter>(`/play/${pcId}/state`, patch, o)),
  // Plan 128 — save "What should we call you?"; the caller shows any error itself.
  setPlayerName: (pcId: string, name: string) =>
    api.patch<PlayerCharacter>(`/play/${pcId}/state`, { player_name: name }, Q),
  // Plan 128 — players send feedback too (no account; filed under the character).
  sendFeedback: (pcId: string, body: { kind: "loved" | "confusing" | "broken" | "idea"; text: string; page: string; viewport: string }) =>
    api.post<{ id: string }>(`/play/${pcId}/feedback`, body, Q),

  // Plan 48 — paper-doll gear and appearance
  gear: (pcId: string) => api.get<GearRow[]>(`/play/${pcId}/gear`, Q),
  setAppearance: (pcId: string, appearance: string) =>
    playWrite(pcId, (o) => api.patch<PlayerCharacter>(`/play/${pcId}/appearance`, { appearance }, o)),
  setEquipped: (pcId: string, characterItemId: string, equipped: boolean) =>
    playWrite(pcId, (o) => api.post<GearRow>(`/play/${pcId}/gear/${characterItemId}/equip`, { equipped }, o)),
  campaignName: (pcId: string) => api.get<{ name: string }>(`/play/${pcId}/campaign`, Q),
  // SEC-002 — the link's current key and the character's identity (not a key).
  link: (key: string) => api.get<PlayLink>(`/play/${key}/link`, Q),
  // Plan 83 — where the table is tonight, for the phone's Table link.
  liveSession: (pcId: string) =>
    api.get<{ session_id: string | null; title: string | null }>(`/play/${pcId}/live-session`, Q),
  // Plan 122 — labeled rolls with advantage, or a real die typed in.
  roll: (pcId: string, req: RollRequest) => api.post<RollResult>(`/play/${pcId}/roll`, req, Q),
  turnKit: (pcId: string) => api.get<TurnKit>(`/play/${pcId}/turn-kit`, Q),
  castSpell: (pcId: string, characterSpellId: string, body: { slot_level?: number; ritual?: boolean }) =>
    api.post<{ spell: string; slot_level: number | null; concentration: boolean }>(
      `/play/${pcId}/spells/${characterSpellId}/cast`,
      body,
      Q,
    ),
  prepareSpell: (pcId: string, characterSpellId: string, prepared: boolean) =>
    api.post<{ id: string; prepared: boolean; count: number; cap: number }>(
      `/play/${pcId}/spells/${characterSpellId}/prepare`,
      { prepared },
      Q,
    ),
  saveNotes: (pcId: string, text: string) =>
    playWrite(pcId, (o) => api.put<{ player_notes: string }>(`/play/${pcId}/notes`, { text }, o)),
  throwDice: (pcId: string, die: string, modifier = 0, label?: string) =>
    playWrite(pcId, (o) =>
      api.post<{ die: string; rolls: number[]; modifier: number; total: number; session_id: string }>(
        `/play/${pcId}/roll`,
        { die, modifier, label },
        o,
      ),
    ),
  // Plan 50 — buy a shop item with coin from this PC's purse
  buy: (pcId: string, shopItemId: string) =>
    playWrite(pcId, (o) => api.post<PurchaseReceipt>(`/play/${pcId}/buy`, { shop_item_id: shopItemId }, o)),
  // Plan 51 — sell to vendors + pool coin with the party
  sell: (pcId: string, characterItemId: string) =>
    playWrite(pcId, (o) => api.post<SellReceipt>(`/play/${pcId}/sell`, { character_item_id: characterItemId }, o)),
  party: (pcId: string) => api.get<PartyMate[]>(`/play/${pcId}/party`, Q),
  // Plan 52 — use a consumable on yourself or a party member
  useItem: (pcId: string, characterItemId: string, targetPcId?: string) =>
    playWrite(pcId, (o) =>
      api.post<UseItemReceipt>(
        `/play/${pcId}/use-item`,
        { character_item_id: characterItemId, target_pc_id: targetPcId ?? null },
        o,
      ),
    ),
  // Plan 115 — the level-up guide (404 until the DM grants a level).
  levelUpPlan: (pcId: string) => api.get<LevelUpPlan>(`/play/${pcId}/level-up`, Q),
  applyLevelUp: (pcId: string, choices: LevelUpChoices) =>
    playWrite(pcId, (o) => api.post<LevelUpResult>(`/play/${pcId}/level-up`, choices, o)),
  give: (pcId: string, toPcId: string, amountGp: number) =>
    playWrite(pcId, (o) => api.post<TransferReceipt>(`/play/${pcId}/give`, { to_pc_id: toPcId, amount_gp: amountGp }, o)),
};

/** Receipt from a vendor sale (Plan 51). */
export interface SellReceipt {
  item_name: string;
  amount_gp: number;
  quantity_left: number;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

/** Receipt from using a consumable (Plan 52). */
export interface UseItemReceipt {
  item_name: string;
  target_name: string;
  effect: string;
  roll: string;
  amount: number;
  target_hp_current: number;
  target_hp_max: number;
  target_temp_hp: number;
  target_exhaustion: number;
  quantity_left: number;
}

/** A campaign-mate for the pool-coin dropdown (Plan 51). */
export interface PartyMate {
  id: string;
  character_name: string;
}

/** Receipt from a coin transfer (Plan 51). */
export interface TransferReceipt {
  to_name: string;
  amount_gp: number;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

/** Receipt from a coin purchase — the new purse + what was bought (Plan 50). */
export interface PurchaseReceipt {
  item_name: string;
  price_gp: number;
  stock: number | null;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
}

/** One Forge equipment row — inventory joined with catalog item details. */
export interface GearRow {
  character_item_id: string;
  item_id: string;
  name: string;
  item_type: string;
  rarity: string;
  description: string | null;
  image_url: string | null;
  is_magic: boolean;
  attunement_required: boolean;
  /** Catalog list price in gold. */
  value_gp: number;
  /** Weapon stats — null for non-weapons. */
  weapon_category: string | null;
  damage_die: string | null;
  damage_type: string | null;
  weapon_properties: string[] | null;
  versatile_damage: string | null;
  weapon_range: string | null;
  mastery: string | null;
  quantity: number;
  equipped: boolean;
  attuned: boolean;
  /** Row notes (player-visible). */
  notes: string | null;
  /** Paper-doll slot, or null for carried, non-equippable items. */
  slot: string | null;
  /** What a vendor pays per unit, or null if unsellable (Plan 51). */
  sell_gp: number | null;
}

// ── Plan 115 — level-up guide ────────────────────────────────────────────────

export interface LevelUpSpell {
  name: string;
  level: number;
  school: string;
  classes: string[];
}

export interface LevelUpFeat {
  name: string;
  category: "general" | "fighting_style" | "origin";
  blurb: string;
  ok: boolean;
  reason: string | null;
  popular: boolean;
  srd: boolean;
  asi_options: string[] | null;
  save_prof: boolean;
  fixed_spells: string[];
  spell_picks: { count: number; level: number; schools?: string[]; list_from_choice?: boolean }[];
  skill_pick: { count: number; from: string[] | null; upgrade: boolean } | null;
  expertise_pick: number;
  choice: { label: string; options: string[] } | null;
  hp_per_level: number;
  ac_bonus_in_armor: number;
}

export interface LevelUpPlan {
  pc_id: string;
  character_name: string;
  character_class: string;
  subclass: string | null;
  from_level: number;
  to_level: number;
  pending_level: number;
  hit_die: number;
  con_mod: number;
  hp_max: number;
  hp_average_gain: number;
  hp_bonus_per_level: number;
  new_features: { name: string; note: string | null }[];
  scaling: string[];
  slots_before: Record<string, number>;
  slots_after: Record<string, number>;
  needs_subclass: boolean;
  subclass_options: string[];
  asi_level: boolean;
  feats: LevelUpFeat[];
  scores: Record<string, number>;
  skills: Record<string, number>;
  saves: string[];
  all_skills: string[];
  spellcasting: {
    new_cantrips: number;
    new_spells: number;
    max_spell_level: number;
    prepared_caster: boolean;
    cantrip_swap: boolean;
    spell_swap: boolean;
    known: LevelUpSpell[];
    options: LevelUpSpell[];
    note: string | null;
  } | null;
  feat_spells: LevelUpSpell[];
  ac: number;
  ac_abilities: string[];
}

export interface LevelUpChoices {
  hp_method: "average" | "roll";
  hp_roll?: number | null;
  subclass?: string | null;
  feat?: {
    name: string;
    from_book?: boolean;
    asi: Record<string, number>;
    choice?: string | null;
    spells: string[];
    skills: string[];
    expertise: string[];
  } | null;
  cantrips: string[];
  spells: string[];
  cantrip_swap?: { forget: string; learn: string } | null;
  spell_swap?: { forget: string; learn: string } | null;
  armor?: "none" | "light" | "medium" | "heavy" | null;
}

export interface LevelUpResult {
  character_name: string;
  level: number;
  hp_max: number;
  hp_gain: number;
  ac: number;
  summary: string[];
  features_granted: string[];
  warnings: string[];
  more_levels: boolean;
}
