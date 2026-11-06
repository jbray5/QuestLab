/**
 * The small, non-visual helpers behind the phone's side quests (Plan 136): the URL param that opens
 * one, shake detection, a short buzz, the reply draft and the picture's address.
 */
import { useEffect, useRef } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { apiBase } from "../api/client";

// ── Opening and closing the quest screen ─────────────────────────────────────

/**
 * Open and close the quest screen through `?quest=<run_id>`, so Back closes it and a refresh returns
 * to it. Closing goes back in history when the app opened the screen; a link opened straight to a
 * quest has nothing to go back to, so it only drops the param.
 */
export function useQuestNav(): { open: (runId: string) => void; close: () => void } {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  return {
    open: (runId) => {
      const next = new URLSearchParams(params);
      next.set("quest", runId);
      setParams(next, { state: { questFromApp: true } });
      window.scrollTo({ top: 0 });
    },
    close: () => {
      if ((location.state as { questFromApp?: boolean } | null)?.questFromApp) {
        navigate(-1);
        return;
      }
      const next = new URLSearchParams(params);
      next.delete("quest");
      setParams(next, { replace: true });
    },
  };
}

// ── The body: motion and vibration ───────────────────────────────────────────

const SHAKE_THRESHOLD = 17; // m/s² beyond a gravity-ish baseline, as in PlayerDice
const SHAKE_DEBOUNCE_MS = 1600;

/**
 * Calls `onShake` when the phone is shaken while `armed`, at most once per debounce window.
 *
 * Copied from `components/dice-tray/PlayerDice.tsx`, which doesn't export its own, with one change:
 * a new `onShake` doesn't re-subscribe the listener.
 */
export function useShake(armed: boolean, onShake: () => void): void {
  const last = useRef(0);
  const latest = useRef(onShake);
  useEffect(() => {
    latest.current = onShake;
  }, [onShake]);
  useEffect(() => {
    if (!armed || typeof window === "undefined") return;
    const handler = (e: DeviceMotionEvent) => {
      const a = e.acceleration;
      if (!a) return;
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      const now = Date.now();
      if (mag > SHAKE_THRESHOLD && now - last.current > SHAKE_DEBOUNCE_MS) {
        last.current = now;
        latest.current();
      }
    };
    window.addEventListener("devicemotion", handler);
    return () => window.removeEventListener("devicemotion", handler);
  }, [armed]);
}

/**
 * Whether shaking can roll on this device. `none`: no sensor or no touch screen (a desktop), so the
 * phone doesn't ask anyone to shake it. `ask`: iOS, which needs a permission from inside a tap.
 * `on`: ready. `refused`: the player said no.
 */
export type MotionState = "none" | "ask" | "on" | "refused";

type MotionEventClass = { requestPermission?: () => Promise<"granted" | "denied"> };

/** Where shake-to-roll starts on this device, before anything has been asked. */
export function motionStart(): MotionState {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) return "none";
  if (!window.matchMedia?.("(pointer: coarse)").matches) return "none";
  const cls = DeviceMotionEvent as unknown as MotionEventClass;
  return typeof cls.requestPermission === "function" ? "ask" : "on";
}

/** Ask for motion access. Call it straight from a tap: iOS refuses anything else. */
export async function askForMotion(): Promise<MotionState> {
  try {
    const cls = DeviceMotionEvent as unknown as MotionEventClass;
    if (typeof cls.requestPermission !== "function") return "on";
    return (await cls.requestPermission()) === "granted" ? "on" : "refused";
  } catch {
    return "refused";
  }
}

/** A short vibration, where the device has one. */
export function buzz(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* no vibration on this device */
  }
}

/** Whether this viewer asked for less motion. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// ── The reply draft: per viewer, and storage can be blocked ──────────────────

const draftKey = (runId: string, stepId: string) => `ql-quest-draft:${runId}:${stepId}`;

/** What the player had typed for this step, or an empty string. */
export function loadQuestDraft(runId: string, stepId: string): string {
  try {
    return localStorage.getItem(draftKey(runId, stepId)) ?? "";
  } catch {
    return "";
  }
}

/** Keep what the player has typed so far. An empty box removes the draft. */
export function saveQuestDraft(runId: string, stepId: string, text: string): void {
  try {
    if (text) localStorage.setItem(draftKey(runId, stepId), text);
    else localStorage.removeItem(draftKey(runId, stepId));
  } catch {
    /* storage blocked: the words live only as long as the screen does */
  }
}

// ── What this phone sent (Plan 139) ──────────────────────────────────────────

const sentKey = (runId: string, stepId: string) => `ql-quest-sent:${runId}:${stepId}`;

/** Keep an answer on the phone that wrote it. The server never sends a reply's words back. */
export function keepSentReply(runId: string, stepId: string, text: string): void {
  try {
    localStorage.setItem(sentKey(runId, stepId), text.trim());
  } catch {
    /* storage blocked: the player sees "You answered" instead of their words */
  }
}

/** What this phone sent for this step, or null on any other device. */
export function sentReply(runId: string, stepId: string): string | null {
  try {
    return localStorage.getItem(sentKey(runId, stepId));
  } catch {
    return null;
  }
}

// ── Pictures ─────────────────────────────────────────────────────────────────

/** Where a step's picture lives: an upload is on the API's origin, not the frontend's. */
export function questImageSrc(url: string): string {
  return url.startsWith("/uploads/") ? `${apiBase().replace(/\/api$/, "")}${url}` : url;
}
