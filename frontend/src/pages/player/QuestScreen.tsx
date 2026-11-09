/**
 * Side quests on the phone (Plan 136): the card on the Now screen, the Journal's list, and the
 * full-screen quest a player finishes alone between sessions.
 *
 * Everything comes from `playQuestsApi`, which only ever sends the current step: no DC, no links, no
 * later steps. A check rolls on the server inside `advance`, never through `playApi.roll`, which
 * would put a private quest on the TV and on the party's phones. The words are the DM's and render
 * as plain text.
 *
 * Plan 138: at the end of a quest a player can tell the party what happened, in their own words.
 * That's the only thing about a quest that ever reaches another phone.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Backpack, ChevronDown, ChevronLeft, ChevronRight, Coins, Dices, Scroll, Vibrate } from "lucide-react";

import {
  playQuestsApi,
  type QuestCard,
  type QuestHistoryItem,
  type QuestMove,
  type QuestOutcome,
  type QuestRunView,
} from "../../api/sideQuests";
import { usePlayerPrefs } from "../../stores/usePlayerPrefs";
import { formatDay } from "../../lib/dates";
import { zoomable } from "../../lib/lightbox";
import {
  askForMotion,
  buzz,
  keepSentReply,
  loadQuestDraft,
  motionStart,
  prefersReducedMotion,
  questImageSrc,
  saveQuestDraft,
  sentReply,
  useQuestNav,
  useShake,
  type MotionState,
} from "../../lib/sideQuestPhone";
import { usePlayer } from "./playerContext";
import { skillSpec } from "./rolls";
import { fmt } from "./rules";
import { Heading, Panel } from "./ui";

const HOLD_MS = 800;
const SCROLL_CANCEL_MS = 300;
const MAX_REPLY = 2000;
const MAX_RECAP = 1500;
const RECAP_DRAFT = "recap";
const NO_CONNECTION = "No connection. Check your Wi-Fi and try again.";

const CSS = `
.qsq-card-new { animation: qsqArrive 0.5s cubic-bezier(0.16,1,0.3,1) both, qsqBreathe 3.2s ease-in-out 0.5s infinite; border-radius: 14px; }
@keyframes qsqArrive { from { transform: translateY(-10px) scale(0.98); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes qsqBreathe { 0%,100% { box-shadow: 0 0 0 0 rgba(227,134,58,0); } 50% { box-shadow: 0 0 18px 0 rgba(227,134,58,0.22); } }

.qsq-hold {
  position: relative; overflow: hidden; width: 100%; min-height: 44px;
  display: flex; align-items: center; justify-content: center; gap: 10px;
  border-radius: 12px; border: 1px solid var(--accent-edge); background: var(--surface2);
  color: var(--accent-text); font: 600 16px var(--font-ui); cursor: pointer; padding: 6px 14px;
  user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; touch-action: manipulation;
}
.qsq-hold:disabled { opacity: 0.7; cursor: default; }
.qsq-hold-fill { position: absolute; inset: 0; background: var(--accent); opacity: 0.3; transform: scaleX(0); transform-origin: left; }
.qsq-hold[data-holding] .qsq-hold-fill { animation: qsqFill ${HOLD_MS}ms linear forwards; }
.qsq-hold-note { grid-column: 1 / -1; display: flex; align-items: center; flex-wrap: wrap; gap: 0 10px; }
.qsq-hold-note:empty { position: absolute; width: 1px; height: 1px; overflow: hidden; }
.qsq-ring { position: relative; flex-shrink: 0; transform: rotate(-90deg); }
.qsq-ring-arc { stroke-dasharray: 50.3; stroke-dashoffset: 50.3; }
.qsq-hold[data-holding] .qsq-ring-arc { animation: qsqRing ${HOLD_MS}ms linear forwards; }
@keyframes qsqFill { to { transform: scaleX(1); } }
@keyframes qsqRing { to { stroke-dashoffset: 0; } }

.qsq-glow { position: fixed; inset: 0; pointer-events: none; z-index: 1;
  background: radial-gradient(circle at 50% 30%, rgba(240,160,98,0.38), transparent 62%);
  animation: qsqGlow 0.9s ease-out forwards; }
@keyframes qsqGlow { from { opacity: 1; } to { opacity: 0; } }

.qsq-step { animation: qsqRise 0.32s ease both; outline: none; }
@keyframes qsqRise { from { transform: translateY(8px); opacity: 0; } to { transform: none; opacity: 1; } }

.qsq-shake { display: flex; align-items: center; justify-content: center; gap: 10px; padding: 16px; border-radius: 12px;
  border: 1px dashed var(--accent-edge); color: var(--accent-text); font-weight: 600; font-size: 16px; text-align: center; }
.qsq-wiggle { animation: qsqWiggle 1.3s ease-in-out infinite; flex-shrink: 0; }
@keyframes qsqWiggle { 0%,55%,100% { transform: rotate(0); } 65% { transform: rotate(-14deg); } 75% { transform: rotate(14deg); } 85% { transform: rotate(-9deg); } }

.qsq-moment { flex: 1; min-height: 62dvh; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 14px; text-align: center; outline: none; padding: 16px 0; }
.qsq-die { position: relative; width: 132px; height: 132px; display: flex; align-items: center; justify-content: center;
  animation: qsqTumble 0.9s cubic-bezier(0.2,0.7,0.2,1) both; }
.qsq-die svg { position: absolute; inset: 0; }
.qsq-die-window { position: relative; height: 56px; overflow: hidden; font-family: var(--font-story); font-weight: 700; font-size: 46px; line-height: 56px; color: var(--text); }
.qsq-die-strip { display: flex; flex-direction: column; animation: qsqStrip 0.85s cubic-bezier(0.15,0.75,0.25,1) both; }
@keyframes qsqTumble { 0% { transform: rotate(-200deg) scale(0.55); opacity: 0; } 60% { opacity: 1; } 85% { transform: rotate(10deg) scale(1.08); } 100% { transform: none; } }
@keyframes qsqStrip { from { transform: translateY(0); } to { transform: translateY(var(--qsq-end)); } }
.qsq-show-1, .qsq-show-2, .qsq-show-3 { animation-name: qsqRise; animation-duration: 0.3s; animation-timing-function: ease; animation-fill-mode: both; }
.qsq-show-1 { animation-delay: 0.85s; }
.qsq-show-2 { animation-delay: 1.2s; animation-name: qsqVerdict; animation-duration: 0.38s; }
.qsq-show-3 { animation-delay: 1.65s; }
.qsq-moment[data-real] .qsq-die { animation: none; }
.qsq-moment[data-real] .qsq-show-1 { animation-delay: 0.1s; }
.qsq-moment[data-real] .qsq-show-2 { animation-delay: 0.35s; }
.qsq-moment[data-real] .qsq-show-3 { animation-delay: 0.75s; }
@keyframes qsqVerdict { from { transform: scale(0.7); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } to { transform: none; opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  .qsq-card-new, .qsq-step, .qsq-wiggle, .qsq-die, .qsq-show-1, .qsq-show-2, .qsq-show-3 { animation: none; }
  .qsq-die-strip { animation: none; transform: translateY(var(--qsq-end)); }
  .qsq-glow { display: none; }
}
`;

const smallText: CSSProperties = { fontSize: 14, color: "var(--text2)", lineHeight: 1.45 };
const recapWords: CSSProperties = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 16, lineHeight: 1.5, color: "var(--text)" };
const dmWords: CSSProperties = { margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 19, lineHeight: 1.6, color: "var(--story-text)" };
const clamp = (lines: number): CSSProperties => ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" });

const questKey = (pcId: string, runId: string) => ["play-quest", pcId, runId];

/** Show what a move returned, and re-read the list and, if it paid anything, the sheet and bag. */
function useAfterMove() {
  const { pcId, refresh } = usePlayer();
  const qc = useQueryClient();
  return (view: QuestRunView) => {
    qc.setQueryData(questKey(pcId, view.run_id), view);
    void qc.invalidateQueries({ queryKey: ["play-quests", pcId] });
    if (view.outcome?.gp || view.outcome?.items.length) {
      refresh();
      void qc.invalidateQueries({ queryKey: ["play-inventory", pcId] });
    }
  };
}

function useOpenQuest(onOpened?: () => void) {
  const { pcId } = usePlayer();
  const after = useAfterMove();
  return useMutation({
    mutationFn: (runId: string) => playQuestsApi.open(pcId, runId),
    onSuccess: (view) => {
      after(view);
      onOpened?.();
    },
  });
}

function useQuestCards() {
  const { pcId } = usePlayer();
  return useQuery({ queryKey: ["play-quests", pcId], queryFn: () => playQuestsApi.list(pcId) });
}

function useRecaps() {
  const { pcId } = usePlayer();
  return useQuery({ queryKey: ["play-recaps", pcId], queryFn: () => playQuestsApi.recaps(pcId) });
}

/** A failed request's words for the player. */
function failureText(e: unknown): string {
  return e instanceof TypeError ? NO_CONNECTION : (e as Error).message;
}

// ── Press and hold ───────────────────────────────────────────────────────────

/**
 * Breaking the seal: press and hold for 0.8 s. Enter or Space opens it straight away, reduced motion
 * makes it a plain tap, and a press that lets go early offers a way that doesn't need holding.
 */
function HoldToOpen({ what, busy, onOpen, size = "wide" }: { what: string; busy: boolean; onOpen: () => void; size?: "narrow" | "wide" }) {
  const [calm] = useState(prefersReducedMotion);
  const [holding, setHolding] = useState(false);
  const [tooShort, setTooShort] = useState(false);
  const timer = useRef<number | null>(null);
  // A pointer began this press, so the click that follows it isn't a keyboard's.
  const pressed = useRef(false);
  const startedAt = useRef(0);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const stop = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  return (
    <>
      <button
        type="button"
        className="qsq-hold"
        data-holding={holding ? "" : undefined}
        disabled={busy}
        aria-label={`${calm ? "Open" : "Hold to open"} ${what}`}
        style={size === "wide" ? { minHeight: 56 } : { minHeight: 48, width: 136, padding: "4px 8px", gap: 8, fontSize: 14 }}
        onKeyDown={() => {
          pressed.current = false;
        }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (calm || busy || e.button !== 0) return;
          pressed.current = true;
          startedAt.current = Date.now();
          setHolding(true);
          setTooShort(false);
          buzz(12);
          timer.current = window.setTimeout(() => {
            timer.current = null;
            setHolding(false);
            buzz([30, 40, 70]);
            onOpen();
          }, HOLD_MS);
        }}
        onPointerUp={() => {
          if (timer.current === null) return;
          stop();
          setTooShort(true);
        }}
        onPointerLeave={() => {
          if (timer.current === null) return;
          stop();
          pressed.current = false;
        }}
        onPointerCancel={() => {
          // A scroll cancels at once. Later than that, the device took the long press for itself.
          if (timer.current !== null && Date.now() - startedAt.current > SCROLL_CANCEL_MS) setTooShort(true);
          stop();
          pressed.current = false;
        }}
        onClick={() => {
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          if (!busy) onOpen();
        }}
      >
        <span aria-hidden className="qsq-hold-fill" />
        {!calm && (
          <svg aria-hidden className="qsq-ring" width="22" height="22" viewBox="0 0 22 22">
            <circle cx="11" cy="11" r="8" fill="none" stroke="var(--accent-line)" strokeWidth="2.5" />
            <circle className="qsq-ring-arc" cx="11" cy="11" r="8" fill="none" stroke="var(--accent-hover)" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        )}
        <span style={{ position: "relative", whiteSpace: "nowrap" }}>{busy ? "Opening…" : holding ? "Holding…" : calm ? "Open" : "Hold to open"}</span>
      </button>
      <div role="status" className="qsq-hold-note">
        {tooShort && !busy && (
          <>
            <span style={smallText}>Keep holding until the ring closes.</span>
            <button type="button" onClick={onOpen} style={{ minHeight: 44, padding: 0, background: "transparent", border: "none", color: "var(--accent-text)", font: "500 14px var(--font-ui)", cursor: "pointer" }}>
              Open without holding
            </button>
          </>
        )}
      </div>
    </>
  );
}

// ── The Now screen's cards ───────────────────────────────────────────────────

/** A card for each quest still to play. Compact when there are several, or during a fight. */
export function QuestCards() {
  const { help, combat } = usePlayer();
  const { data: cards = [] } = useQuestCards();
  const live = cards.filter((c) => c.status !== "done");
  const compact = live.length > 1 || !!combat?.in_combat;
  return (
    <>
      {!combat?.in_combat && <RecapCard />}
      {live.length > 0 && (
        <div role="group" aria-label="Side quests" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <style>{CSS}</style>
          {live.map((c) => (c.status === "new" ? <NewCard key={c.run_id} card={c} compact={compact} /> : <ActiveCard key={c.run_id} card={c} compact={compact} />))}
          {help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>A side quest is a short quest your DM wrote for you. Play it on your own, whenever you like.</span>}
        </div>
      )}
    </>
  );
}

/** The next thing someone told the party, oldest first, until this phone has shown them all. */
function RecapCard() {
  const { pcId, help } = usePlayer();
  const { data: recaps = [] } = useRecaps();
  const [prefs, setPrefs] = usePlayerPrefs(pcId);
  const seen = prefs.recapsSeen ? Date.parse(prefs.recapsSeen) : 0;
  const fresh = recaps
    .filter((r) => !r.mine && Date.parse(r.at) > seen)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const next = fresh[0];
  if (!next) return null;
  const more = fresh.length - 1;
  return (
    <Panel tone="story" style={{ gap: 8 }}>
      <span className="story" style={{ fontWeight: 700, fontSize: 18, overflowWrap: "anywhere" }}>{next.character_name} told the party what happened</span>
      <span style={recapWords}>{next.text}</span>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <button type="button" className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => setPrefs({ recapsSeen: next.at })}>
          {more > 0 ? `Next (${more} more)` : "Got it"}
        </button>
        {help === "teach" && <span style={smallText}>It stays in your Journal.</span>}
      </div>
    </Panel>
  );
}

function NewCard({ card, compact }: { card: QuestCard; compact: boolean }) {
  const nav = useQuestNav();
  const open = useOpenQuest(() => nav.open(card.run_id));
  const failed = open.isError && <span role="alert" style={{ gridColumn: "1 / -1", fontSize: 14, color: "var(--danger-text)" }}>{failureText(open.error)}</span>;
  const title = { fontWeight: 700, lineHeight: 1.2, overflowWrap: "anywhere" } as const;
  if (compact) {
    return (
      <div className="qsq-card-new">
        <Panel tone="lit" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "6px 10px", padding: "10px 12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
            <span className="story" style={{ ...title, fontSize: 18, ...clamp(2) }}>{card.title}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span className="pill pill-live" style={{ flexShrink: 0 }}>New</span>
              {card.teaser && <span style={{ ...smallText, fontSize: 13, minWidth: 0, overflowWrap: "anywhere", ...clamp(1) }}>{card.teaser}</span>}
            </span>
          </div>
          <HoldToOpen what={card.title} busy={open.isPending} onOpen={() => open.mutate(card.run_id)} size="narrow" />
          {failed}
        </Panel>
      </div>
    );
  }
  return (
    <div className="qsq-card-new">
      <Panel tone="lit" style={{ gap: 10, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <Scroll size={24} color="var(--accent-text)" aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
            <span className="story" style={{ ...title, fontSize: 21 }}>{card.title}</span>
            {card.teaser && <span style={{ ...smallText, overflowWrap: "anywhere" }}>{card.teaser}</span>}
          </div>
          <span className="pill pill-live" style={{ flexShrink: 0 }}>New</span>
        </div>
        <HoldToOpen what={card.title} busy={open.isPending} onOpen={() => open.mutate(card.run_id)} />
        {failed}
      </Panel>
    </div>
  );
}

function ActiveCard({ card, compact }: { card: QuestCard; compact: boolean }) {
  const nav = useQuestNav();
  return (
    <button
      type="button"
      onClick={() => nav.open(card.run_id)}
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 56, padding: compact ? "8px 12px" : "12px 14px", borderRadius: 14, background: "var(--story-bg)", border: "1px solid var(--story-line)", color: "var(--text)", textAlign: "left", cursor: "pointer", font: "inherit" }}
    >
      <Scroll size={20} color="var(--accent-text)" aria-hidden style={{ flexShrink: 0 }} />
      <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <span className="story" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2, overflowWrap: "anywhere", ...(compact ? clamp(2) : {}) }}>{card.title}</span>
        {card.teaser && <span style={{ ...smallText, overflowWrap: "anywhere", ...clamp(compact ? 1 : 2) }}>{card.teaser}</span>}
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0, color: "var(--accent-text)", fontWeight: 600, fontSize: 14 }}>
        Keep going <ChevronRight size={16} aria-hidden />
      </span>
    </button>
  );
}

// ── The Journal's list ───────────────────────────────────────────────────────

/** Every quest and where it stands. Tapping a finished one reads it again. Hidden when there are none. */
export function QuestList() {
  const { help } = usePlayer();
  const nav = useQuestNav();
  const { data: cards = [] } = useQuestCards();
  if (cards.length === 0) return null;
  return (
    <Panel style={{ gap: 2 }}>
      <Heading>Side quests</Heading>
      {help === "teach" && <span style={{ ...smallText, paddingBottom: 4 }}>Quests your DM wrote for you. Tap one to play it, or to read it again once it's finished.</span>}
      {cards.map((c, i) => (
        <button
          key={c.run_id}
          type="button"
          onClick={() => nav.open(c.run_id)}
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", minHeight: 52, padding: "8px 0", background: "transparent", border: "none", borderBottom: i === cards.length - 1 ? "none" : "1px solid var(--border)", color: "var(--text)", textAlign: "left", cursor: "pointer", font: "inherit" }}
        >
          <span style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
            <span className="story" style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.25, overflowWrap: "anywhere" }}>{c.title}</span>
            {c.status === "done" && c.finished_at && help !== "numbers" && <span style={{ fontSize: 13, color: "var(--muted)" }}>{formatDay(c.finished_at)}</span>}
          </span>
          {c.status === "new" ? <span className="pill pill-live">New</span> : c.status === "active" ? <span className="pill">Keep going</span> : <span className="pill pill-teal">Finished</span>}
          <ChevronRight size={16} color="var(--muted)" aria-hidden style={{ flexShrink: 0 }} />
        </button>
      ))}
    </Panel>
  );
}

/** Everything the party has told each other, newest first. */
export function PartyRecaps() {
  const { help } = usePlayer();
  const { data: recaps = [] } = useRecaps();
  if (recaps.length === 0) return null;
  return (
    <Panel style={{ gap: 2 }}>
      <Heading>What the party says happened</Heading>
      {help === "teach" && <span style={{ ...smallText, paddingBottom: 4 }}>What each player chose to tell everyone about their side quests.</span>}
      {recaps.map((r, i) => (
        <div key={`${r.at}-${r.character_name}`} style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 0", borderBottom: i === recaps.length - 1 ? "none" : "1px solid var(--border)" }}>
          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "0 8px" }}>
            <span className="story" style={{ fontWeight: 700, fontSize: 16, overflowWrap: "anywhere" }}>{r.character_name}</span>
            {r.mine && <span className="pill">You</span>}
            <span style={{ fontSize: 13, color: "var(--muted)" }}>{formatDay(r.at)}</span>
          </span>
          <span style={recapWords}>{r.text}</span>
        </div>
      ))}
    </Panel>
  );
}

// ── The quest screen ─────────────────────────────────────────────────────────

/** The full-screen quest, opened through `?quest=<run_id>`. The player can leave at any step. */
export default function QuestScreen({ runId }: { runId: string }) {
  const { pcId, turn, combat } = usePlayer();
  const qc = useQueryClient();
  const nav = useQuestNav();
  const after = useAfterMove();
  const [moving, setMoving] = useState(false);
  const inFlight = useRef(false);
  const [moment, setMoment] = useState<QuestOutcome | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [goneAfterMove, setGoneAfterMove] = useState(false);
  const [motion, setMotion] = useState<MotionState>(motionStart);
  const [played, setPlayed] = useState(false);
  const [soFar, setSoFar] = useState<boolean | null>(null);

  // Paused during a move: an event from that same move can refetch the next step before the move
  // answers, and the next step's words must not show before the roll's result.
  const { data: view, error, refetch, isFetching } = useQuery({
    queryKey: questKey(pcId, runId),
    queryFn: () => playQuestsApi.get(pcId, runId),
    retry: false,
    staleTime: 0,
    enabled: !moving,
  });
  // A failed read only says why in words, so the list is what tells "deleted" from a bad connection.
  const { data: cards, isFetching: checking } = useQuery({
    queryKey: ["play-quests", pcId],
    queryFn: () => playQuestsApi.list(pcId),
    enabled: !!error,
    retry: false,
    staleTime: 0,
  });
  const gone = goneAfterMove || (!!error && !checking && !!cards && !cards.some((c) => c.run_id === runId));

  const move = async (m: QuestMove) => {
    if (inFlight.current || !view) return;
    inFlight.current = true;
    setMoving(true);
    setErr(null);
    void qc.cancelQueries({ queryKey: questKey(pcId, runId) });
    try {
      const next = await playQuestsApi.advance(pcId, runId, m);
      setPlayed(true);
      if (view.step.kind === "reply") saveQuestDraft(runId, view.step.id, "");
      after(next);
      if (view.step.kind === "check" && next.step.id !== view.step.id && next.outcome?.die != null) setMoment(next.outcome);
    } catch (e) {
      try {
        const now = await qc.fetchQuery({ queryKey: ["play-quests", pcId], queryFn: () => playQuestsApi.list(pcId), staleTime: 0, retry: false });
        if (now.some((c) => c.run_id === runId)) setErr(failureText(e));
        else setGoneAfterMove(true);
      } catch {
        setErr(NO_CONNECTION);
      }
    } finally {
      inFlight.current = false;
      setMoving(false);
    }
  };

  let body: ReactNode;
  if (gone) {
    body = (
      <Panel style={{ gap: 12, marginTop: 8 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>Your DM deleted this side quest.</span>
        <span style={smallText}>Anything it already gave you stays on your sheet.</span>
        <button type="button" className="btn btn-primary" onClick={nav.close} style={{ minHeight: 52 }}>Back to the game</button>
      </Panel>
    );
  } else if (!view) {
    body = error ? (
      <Panel style={{ gap: 12, marginTop: 8 }}>
        <span role="alert" style={{ fontSize: 16 }}>{failureText(error)}</span>
        <button type="button" className="btn btn-primary" disabled={isFetching} onClick={() => void refetch()} style={{ minHeight: 52 }}>Try again</button>
        <button type="button" className="btn btn-ghost" onClick={nav.close} style={{ minHeight: 44 }}>Back to the game</button>
      </Panel>
    ) : (
      <span style={{ color: "var(--text2)", padding: "24px 0", textAlign: "center" }}>Opening your quest…</span>
    );
  } else if (view.status === "new") {
    body = <Unopened view={view} />;
  } else if (moment) {
    body = <RollMoment outcome={moment} onDone={() => setMoment(null)} />;
  } else {
    const rereading = view.status === "done" && !played;
    body = (
      <>
        <SoFar runId={view.run_id} items={view.history} open={soFar ?? rereading} onToggle={() => setSoFar(!(soFar ?? rereading))} />
        <StepBody key={view.step.id} view={view} busy={moving} err={err} onMove={(m) => void move(m)} motion={motion} setMotion={setMotion} rereading={rereading} onClose={nav.close} />
      </>
    );
  }

  const yourTurn = !!(combat?.in_combat && turn?.active);
  return (
    <>
      <style>{CSS}</style>
      <div aria-hidden className="qsq-glow" />
      <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 4, padding: "8px 16px 8px 6px", background: "var(--bg)", borderBottom: "1px solid var(--border)" }}>
        <button type="button" aria-label="Back to the game" onClick={nav.close} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 44, height: 44, flexShrink: 0, background: "transparent", border: "none", color: "var(--text2)", cursor: "pointer" }}>
          <ChevronLeft size={24} />
        </button>
        <h1 className="story" style={{ margin: 0, fontWeight: 700, fontSize: 19, lineHeight: 1.2, minWidth: 0, overflowWrap: "anywhere", ...clamp(2) }}>{view?.title ?? "Side quest"}</h1>
      </header>
      <main style={{ flex: 1, padding: "12px 16px calc(32px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 12 }}>
        {yourTurn && (
          <Panel tone="lit" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "8px 12px" }}>
            <span style={{ flex: 1, fontWeight: 600 }}>It's your turn in the fight.</span>
            <button type="button" className="btn btn-secondary" onClick={nav.close} style={{ minHeight: 44 }}>Go to it</button>
          </Panel>
        )}
        {body}
      </main>
    </>
  );
}

/** A quest reached by link or from the Journal before it's been opened: the same seal as the card. */
function Unopened({ view }: { view: QuestRunView }) {
  const { help } = usePlayer();
  const open = useOpenQuest();
  const { data: cards = [] } = useQuestCards();
  const teaser = cards.find((c) => c.run_id === view.run_id)?.teaser;
  return (
    <Panel tone="lit" style={{ gap: 12, marginTop: 8, padding: 16 }}>
      <Scroll size={28} color="var(--accent-text)" aria-hidden />
      {teaser && <span style={{ fontSize: 16, lineHeight: 1.45, overflowWrap: "anywhere" }}>{teaser}</span>}
      {help === "teach" && <span style={smallText}>A side quest is a short quest your DM wrote for you. Play it on your own, whenever you like.</span>}
      <HoldToOpen what={view.title} busy={open.isPending} onOpen={() => open.mutate(view.run_id)} />
      {open.isError && <span role="alert" style={{ fontSize: 14, color: "var(--danger-text)" }}>{failureText(open.error)}</span>}
    </Panel>
  );
}

interface StepProps {
  view: QuestRunView;
  busy: boolean;
  err: string | null;
  onMove: (m: QuestMove) => void;
  motion: MotionState;
  setMotion: (m: MotionState) => void;
  rereading: boolean;
  onClose: () => void;
}

/** One step. Re-keyed per step, so it starts fresh, takes focus, and the page returns to the top. */
function StepBody(props: StepProps) {
  const { view, err } = props;
  const { help } = usePlayer();
  const { step, outcome } = view;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);
  const isEnd = step.kind === "end";
  return (
    <div ref={ref} tabIndex={-1} className="qsq-step" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {help === "teach" && view.history.length === 0 && !isEnd && <span style={smallText}>You can leave any time. You'll come back to this same step.</span>}
      {outcome?.die != null && <RollLine outcome={outcome} />}
      {!isEnd && outcome && <Paid outcome={outcome} />}
      <Picture url={step.image_url} caption={view.title} />
      {step.text && (
        <Panel tone="story" style={{ padding: 16 }}>
          <p className="story" style={dmWords}>{step.text}</p>
        </Panel>
      )}
      {step.kind === "read" && <ContinueStep {...props} />}
      {step.kind === "choice" && <ChoiceStep {...props} />}
      {step.kind === "check" && <CheckStep {...props} />}
      {step.kind === "reply" && <ReplyStep {...props} />}
      {isEnd && <EndStep {...props} />}
      {err && <span role="alert" style={{ fontSize: 15, color: "var(--danger-text)" }}>{err}</span>}
    </div>
  );
}

function ContinueStep({ view, busy, onMove }: StepProps) {
  return (
    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onMove({ step_id: view.step.id })} style={{ minHeight: 54, fontSize: 17, borderRadius: 12 }}>
      Continue
    </button>
  );
}

function ChoiceStep({ view, busy, onMove }: StepProps) {
  const { help } = usePlayer();
  return (
    <div role="group" aria-label="Your choice" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {help === "teach" && <span style={smallText}>Pick one. You can't change it afterwards.</span>}
      {view.step.party_sees_pick && <span style={smallText}>Your party will see which one you pick.</span>}
      {view.step.options.map((o) => (
        <button key={o.index} type="button" className="btn btn-secondary" disabled={busy} onClick={() => onMove({ step_id: view.step.id, option: o.index })} style={{ minHeight: 56, padding: "12px 16px", fontSize: 16, borderRadius: 12, whiteSpace: "normal", overflowWrap: "anywhere", textAlign: "left", justifyContent: "flex-start", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <span>{o.label}</span>
          {o.taken_by?.length > 0 && <span style={{ fontSize: 14, fontWeight: 400, color: "var(--accent-text)" }}>{takenLine(o.taken_by)}</span>}
        </button>
      ))}
    </div>
  );
}

/** Plan 140 — "Willa is on this", "Willa and Nya are on this", "Willa, Nya and Creed are on this". */
function takenLine(names: string[]): string {
  const list = names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${list} ${names.length === 1 ? "is" : "are"} on this`;
}

function CheckStep({ view, busy, onMove, motion, setMotion }: StepProps) {
  const { pc, help } = usePlayer();
  const { step } = view;
  const single = step.skills.length === 1;
  const [picked, setPicked] = useState<string | null>(single ? step.skills[0].name : null);
  const [real, setReal] = useState("");
  const skill = step.skills.find((s) => s.name === picked) ?? null;
  const die = Number(real);
  const realOk = real !== "" && Number.isInteger(die) && die >= 1 && die <= 20;
  const roll = (withReal?: number) => {
    if (skill) onMove({ step_id: step.id, skill: skill.name, real: withReal });
  };
  useShake(!!skill && motion === "on" && !busy, () => roll());
  const arm = () => {
    if (motion === "ask") void askForMotion().then(setMotion);
  };

  if (!skill) {
    return (
      <div role="group" aria-label="Pick a skill" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {help !== "numbers" && <span style={smallText}>{help === "teach" ? "Pick how you go about it. The number is your bonus, from your sheet." : "Pick a skill."}</span>}
        {step.skills.map((s) => (
          <button
            key={s.name}
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setPicked(s.name);
              arm();
            }}
            style={{ minHeight: 56, padding: "0 16px", fontSize: 16, borderRadius: 12, justifyContent: "space-between" }}
          >
            <span>{s.name}</span>
            <span className="num" style={{ fontWeight: 600 }}>{fmt(s.bonus)}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 17, fontWeight: 600 }}>
          {skill.name} <span className="num">{fmt(skill.bonus)}</span>
        </span>
        {help === "teach" && (
          <>
            <span style={smallText}>{skillSpec(pc, skill.name, skill.bonus).why} You roll a d20 and add it.</span>
            <span style={smallText}>Your DM decided how hard this is. Only the two of you see the roll.</span>
          </>
        )}
      </div>
      {motion === "on" && (
        <div className="qsq-shake">
          <Vibrate size={22} aria-hidden className="qsq-wiggle" />
          Shake your phone to roll
        </div>
      )}
      {motion === "ask" && (
        <button type="button" className="btn btn-secondary" onClick={arm} style={{ minHeight: 48 }}>
          <Vibrate size={18} aria-hidden /> Turn on shake to roll
        </button>
      )}
      {motion === "refused" && help === "teach" && <span style={smallText}>Motion access is off on this phone, so tap to roll.</span>}
      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => roll()} style={{ minHeight: 54, fontSize: 17, borderRadius: 12 }}>
        <Dices size={20} aria-hidden /> {busy ? "Rolling…" : motion === "on" ? "Or tap to roll" : "Tap to roll"}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label htmlFor="qsq-real" style={{ flex: "1 1 150px", fontSize: 14, color: "var(--text2)", margin: 0 }}>Rolled a real die?</label>
        <input
          id="qsq-real"
          inputMode="numeric"
          value={real}
          maxLength={2}
          onChange={(e) => setReal(e.target.value.replace(/\D/g, ""))}
          placeholder="1–20"
          className="num"
          aria-label="Your d20, 1 to 20"
          style={{ width: 72, minHeight: 44, textAlign: "center", fontWeight: 600 }}
        />
        <button type="button" className="btn btn-secondary" disabled={!realOk || busy} onClick={() => roll(die)} style={{ minHeight: 44 }}>
          Use mine
        </button>
      </div>
      {!single && (
        <button type="button" onClick={() => setPicked(null)} disabled={busy} style={{ alignSelf: "flex-start", minHeight: 44, padding: 0, background: "transparent", border: "none", color: "var(--accent-text)", font: "500 14px var(--font-ui)", cursor: "pointer" }}>
          Pick a different skill
        </button>
      )}
    </div>
  );
}

function ReplyStep({ view, busy, onMove }: StepProps) {
  const { help } = usePlayer();
  const { run_id: runId, step } = view;
  const [text, setText] = useState(() => loadQuestDraft(runId, step.id));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label htmlFor="qsq-reply" style={{ margin: 0, fontSize: 14, fontWeight: 500, color: "var(--text2)" }}>Your answer</label>
      {help === "teach" && <span id="qsq-reply-who" style={smallText}>This goes to your DM. Once it's sent, nobody else can read it, and you can still read it on this phone. It's kept here if you leave before sending it.</span>}
      <textarea
        id="qsq-reply"
        aria-describedby={help === "teach" ? "qsq-reply-who" : undefined}
        rows={6}
        value={text}
        maxLength={MAX_REPLY}
        onChange={(e) => {
          setText(e.target.value);
          saveQuestDraft(runId, step.id, e.target.value);
        }}
        style={{ resize: "vertical", borderRadius: 12, fontSize: 16, lineHeight: 1.5, minHeight: 140 }}
      />
      {text.length > MAX_REPLY - 200 && <span className="num" style={{ fontSize: 13, color: "var(--muted)", alignSelf: "flex-end" }}>{text.length} of {MAX_REPLY}</span>}
      <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => {
          keepSentReply(runId, step.id, text);
          onMove({ step_id: step.id, reply: text });
        }} style={{ minHeight: 54, fontSize: 17, borderRadius: 12 }}>
        {busy ? "Sending…" : "Send"}
      </button>
    </div>
  );
}

function EndStep({ view, rereading, onClose }: StepProps) {
  const { help } = usePlayer();
  const { outcome } = view;
  return (
    <>
      {outcome && <Paid outcome={outcome} big />}
      {help === "teach" && !rereading && <span style={smallText}>You finished this side quest. You can read it again from your Journal.</span>}
      <TellParty view={view} />
      <button type="button" className="btn btn-primary" onClick={onClose} style={{ minHeight: 54, fontSize: 17, borderRadius: 12 }}>
        Back to the game
      </button>
    </>
  );
}

/** A player's own account of the quest for the party. Nothing goes out unless they send it. */
function TellParty({ view }: { view: QuestRunView }) {
  const { pcId, help } = usePlayer();
  const qc = useQueryClient();
  const after = useAfterMove();
  const { run_id: runId, recap } = view;
  const [writing, setWriting] = useState(false);
  const [text, setText] = useState(() => recap ?? loadQuestDraft(runId, RECAP_DRAFT));
  const share = useMutation({
    mutationFn: (words: string) => playQuestsApi.shareRecap(pcId, runId, words),
    onSuccess: (next, words) => {
      saveQuestDraft(runId, RECAP_DRAFT, "");
      after(next);
      void qc.invalidateQueries({ queryKey: ["play-recaps", pcId] });
      setWriting(false);
      setText(words.trim());
    },
  });
  const problem = share.error ? <span role="alert" style={{ fontSize: 14, color: "var(--danger-text)" }}>{failureText(share.error)}</span> : null;

  if (recap && !writing) {
    return (
      <Panel style={{ gap: 8 }}>
        <Heading>You told the party</Heading>
        <span style={recapWords}>{recap}</span>
        {problem}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button type="button" className="btn btn-ghost" disabled={share.isPending} onClick={() => setWriting(true)} style={{ minHeight: 44 }}>Change it</button>
          <button type="button" className="btn btn-ghost" disabled={share.isPending} onClick={() => share.mutate("")} style={{ minHeight: 44 }}>Take it back</button>
        </div>
      </Panel>
    );
  }
  return (
    <Panel style={{ gap: 8 }}>
      <Heading>
        <label htmlFor="qsq-recap" style={{ margin: 0, font: "inherit", color: "inherit" }}>Tell the party what happened</label>
      </Heading>
      {help !== "numbers" && <span id="qsq-recap-who" style={smallText}>They only know what you tell them. Say as much or as little as you like. Your DM sees it too.</span>}
      <textarea
        id="qsq-recap"
        aria-describedby={help !== "numbers" ? "qsq-recap-who" : undefined}
        rows={4}
        value={text}
        maxLength={MAX_RECAP}
        onChange={(e) => {
          setText(e.target.value);
          saveQuestDraft(runId, RECAP_DRAFT, e.target.value);
        }}
        style={{ resize: "vertical", borderRadius: 12, fontSize: 16, lineHeight: 1.5, minHeight: 110 }}
      />
      {text.length > MAX_RECAP - 200 && <span className="num" style={{ fontSize: 13, color: "var(--muted)", alignSelf: "flex-end" }}>{text.length} of {MAX_RECAP}</span>}
      {problem}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button type="button" className="btn btn-secondary" disabled={share.isPending || !text.trim()} onClick={() => share.mutate(text)} style={{ minHeight: 48 }}>
          {share.isPending ? "Sharing…" : "Share with the party"}
        </button>
        {writing && (
          <button type="button" className="btn btn-ghost" onClick={() => { setText(recap ?? ""); setWriting(false); }} style={{ minHeight: 48 }}>Cancel</button>
        )}
      </div>
    </Panel>
  );
}

// ── Results, rewards and the way here ────────────────────────────────────────

/** The moment a check lands, before the next step's words. The animation holds the verdict back. */
function RollMoment({ outcome, onDone }: { outcome: QuestOutcome; onDone: () => void }) {
  const { die, bonus, total, passed, real, skill } = outcome;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
    const t = window.setTimeout(() => buzz(passed ? [40, 30, 90] : [140]), real ? 300 : 850);
    return () => window.clearTimeout(t);
  }, [passed, real]);
  const face = die ?? 0;
  // The numbers that spin past before the die lands. No randomness needed: nobody can read them.
  const strip = real ? [face] : [...Array.from({ length: 8 }, (_, i) => ((face * 7 + i * 13) % 20) + 1), face];
  const verdict = passed ? "It worked" : "It didn't";
  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="qsq-moment"
      data-real={real ? "" : undefined}
      role="group"
      aria-label={`${skill ?? "Check"}: you rolled ${die}, ${fmt(bonus ?? 0)}, ${total} in all. ${verdict}.`}
    >
      {skill && <span style={{ fontSize: 15, color: "var(--text2)" }}>{skill} check</span>}
      <div aria-hidden className="qsq-die">
        <svg viewBox="0 0 132 132" width="132" height="132">
          <polygon points="66,4 120,35 120,97 66,128 12,97 12,35" fill="var(--surface3)" stroke="var(--accent-edge)" strokeWidth="2.5" strokeLinejoin="round" />
          <polygon points="66,30 98,84 34,84" fill="var(--surface2)" stroke="var(--border2)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M66 4 66 30M12 35 66 30M120 35 66 30M12 35 34 84M120 35 98 84M12 97 34 84M120 97 98 84M66 128 34 84M66 128 98 84" stroke="var(--border2)" strokeWidth="1.5" fill="none" />
        </svg>
        <div className="qsq-die-window">
          <div className="qsq-die-strip" style={{ "--qsq-end": `-${(strip.length - 1) * 56}px` } as CSSProperties}>
            {strip.map((n, i) => (
              <span key={i}>{n}</span>
            ))}
          </div>
        </div>
      </div>
      <div aria-hidden className="qsq-show-1 num" style={{ fontSize: 26, fontWeight: 600 }}>
        {die} <span style={{ color: "var(--text2)" }}>{fmt(bonus ?? 0)}</span> = {total}
      </div>
      <div aria-hidden className="qsq-show-2 story" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.1, color: passed ? "var(--accent-text)" : "var(--danger-text)" }}>
        {verdict}
      </div>
      <button type="button" className="btn btn-primary qsq-show-3" onClick={onDone} style={{ minHeight: 54, minWidth: 200, marginTop: 10, fontSize: 17, borderRadius: 12 }}>
        Continue
      </button>
    </div>
  );
}

/** The last roll in a line, so a player who left and came back knows how it went. */
function RollLine({ outcome }: { outcome: QuestOutcome }) {
  const { help } = usePlayer();
  return (
    <span style={{ fontSize: 14, color: "var(--text2)" }}>
      {outcome.skill}{" "}
      <span className="num">{help === "numbers" ? outcome.total : `${outcome.die} ${fmt(outcome.bonus ?? 0)} = ${outcome.total}`}</span>
      {" · "}
      <b style={{ fontWeight: 600, color: outcome.passed ? "var(--accent-text)" : "var(--danger-text)" }}>{outcome.passed ? "It worked" : "It didn't"}</b>
    </span>
  );
}

function gpWords(gp: number): string {
  return `${Math.abs(gp).toLocaleString()} gp`;
}

function GoldLine({ gp, terse }: { gp: number; terse: boolean }) {
  if (terse) return <span className="num">{`${gp > 0 ? "+" : "−"}${gpWords(gp)}`}</span>;
  return (
    <span>
      {gp > 0 ? "You got " : "You paid "}
      <span className="num">{gpWords(gp)}</span>
    </span>
  );
}

/** What arriving at a step paid. A negative is plainly what they paid. Nothing paid shows nothing. */
function Paid({ outcome, big }: { outcome: QuestOutcome; big?: boolean }) {
  const { help } = usePlayer();
  const { gp, items } = outcome;
  if (!gp && items.length === 0) return null;
  const size = big ? 17 : 15;
  return (
    <Panel tone="tip" style={{ gap: 6, padding: big ? "14px" : "8px 12px" }}>
      {big && <Heading>{gp < 0 && items.length === 0 ? "What you paid" : "What you got"}</Heading>}
      {gp !== 0 && (
        <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: size, fontWeight: 600 }}>
          <Coins size={18} color="var(--amber)" aria-hidden style={{ flexShrink: 0 }} />
          <GoldLine gp={gp} terse={help === "numbers"} />
        </span>
      )}
      {items.map((name, i) => (
        <span key={`${name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: size, fontWeight: 600, overflowWrap: "anywhere" }}>
          <Backpack size={18} color="var(--teal-text)" aria-hidden style={{ flexShrink: 0 }} />
          <span>{help === "numbers" ? name : `You got ${name}`}</span>
        </span>
      ))}
      {help === "teach" && <span style={{ fontSize: 13, color: "var(--text2)" }}>Your sheet is already up to date.</span>}
    </Panel>
  );
}

function Picture({ url, caption, small }: { url: string | null; caption: string; small?: boolean }) {
  if (!url) return null;
  const src = questImageSrc(url);
  return (
    <img
      src={src}
      {...zoomable(src, caption)}
      alt="A picture from your DM. Tap to enlarge."
      loading="lazy"
      style={{ display: "block", width: small ? 96 : "100%", maxHeight: small ? 96 : "46dvh", objectFit: small ? "cover" : "contain", borderRadius: 12, background: "var(--surface2)", cursor: "zoom-in" }}
    />
  );
}

/** Earlier steps, with what the player chose, rolled and wrote. Starts open when rereading a finished quest. */
function SoFar({ runId, items, open, onToggle }: { runId: string; items: QuestHistoryItem[]; open: boolean; onToggle: () => void }) {
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ display: "flex", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 44, padding: 0, background: "transparent", border: "none", color: "var(--text2)", font: "500 14px var(--font-ui)", cursor: "pointer" }}>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />} So far
      </button>
      {open && (
        <Panel tone="inset" style={{ gap: 0, padding: "4px 12px" }}>
          {items.map((h, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 0", borderBottom: i === items.length - 1 ? "none" : "1px solid var(--border)" }}>
              <Picture url={h.image_url} caption="Earlier in this quest" small />
              {h.text && <p className="story" style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 16, lineHeight: 1.5, color: "var(--story-text)" }}>{h.text}</p>}
              <HistoryDid runId={runId} item={h} />
            </div>
          ))}
        </Panel>
      )}
    </div>
  );
}

function HistoryDid({ runId, item }: { runId: string; item: QuestHistoryItem }) {
  const style: CSSProperties = { fontSize: 14, color: "var(--text2)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" };
  if (item.option) return <span style={style}>You chose: <b style={{ fontWeight: 600, color: "var(--text)" }}>{item.option}</b></span>;
  if (item.skill) {
    return (
      <span style={style}>
        You rolled {item.skill}: <span className="num" style={{ fontWeight: 600, color: "var(--text)" }}>{item.total}</span>. {item.passed ? "It worked." : "It didn't."}
      </span>
    );
  }
  if (item.replied) {
    // Plan 139: only the phone that wrote it has the words.
    const mine = sentReply(runId, item.step_id);
    if (mine) return <span style={style}>You wrote: <span style={{ color: "var(--text)" }}>{mine}</span></span>;
    return <span style={style}>You answered. It went to your DM.</span>;
  }
  return null;
}
