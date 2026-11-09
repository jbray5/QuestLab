/**
 * What this device remembers about a player link (Plan 128): which party it
 * belongs to, and whether the phone already asked the player's name.
 *
 * When the DM resets a link, the old key stops opening anything (404). A phone
 * that remembers the key's party can then say "This link was replaced" and
 * point at the party's page, instead of a dead end. Older phones that came in
 * through a join link already remember their pick (`qj-pick-<campaign>`), so
 * that is read too. Storage can be blocked: every access is wrapped.
 */
import { isLinkGone } from "../../api/play";

const key = (playKey: string) => `ql-play-campaign:${playKey}`;

/** Remember that this link opens a character in this campaign. */
export function rememberCampaign(playKey: string, campaignId: string): void {
  try {
    if (localStorage.getItem(key(playKey)) !== campaignId) localStorage.setItem(key(playKey), campaignId);
  } catch {
    /* storage blocked: a replaced link falls back to "ask your DM" */
  }
}

/** The campaign this device last saw this link in, or null. */
export function rememberedCampaign(playKey: string): string | null {
  try {
    const direct = localStorage.getItem(key(playKey));
    if (direct) return direct;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("qj-pick-") && localStorage.getItem(k) === playKey) return k.slice("qj-pick-".length);
    }
  } catch {
    /* storage blocked */
  }
  return null;
}

/**
 * Plan 141 — the one player link this device has opened in this campaign, or null when it has
 * opened none or several (a shared tablet). Lets the party's link send a phone that came in by
 * its own link straight back to its character, like a remembered join pick does.
 */
export function onlyLinkFor(campaignId: string): string | null {
  try {
    const found: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("ql-play-campaign:") && localStorage.getItem(k) === campaignId) {
        found.push(k.slice("ql-play-campaign:".length));
      }
    }
    return found.length === 1 ? found[0] : null;
  } catch {
    return null;
  }
}

/** When a request failed because the link no longer opens a sheet: the party to send the player to. */
export function replacedLinkCampaign(error: unknown, playKey: string): string | null {
  if (!isLinkGone(error)) return null;
  return error.campaignId ?? rememberedCampaign(playKey);
}

const askedKey = (playKey: string) => `ql-name-asked:${playKey}`;

/** Whether this device already asked "What should we call you?" for this link (it asks once). */
export function nameAsked(playKey: string): boolean {
  try {
    return localStorage.getItem(askedKey(playKey)) === "1";
  } catch {
    return false;
  }
}

/** Remember that the name question was asked (answered or skipped). */
export function markNameAsked(playKey: string): void {
  try {
    localStorage.setItem(askedKey(playKey), "1");
  } catch {
    /* storage blocked: the question may come back once */
  }
}
