/**
 * The player's phone (Plan 122): a companion that grows with them.
 *
 * Tabs — Now · Character · Spells (casters) · Bag · Journal — over one set of
 * live queries. The help level (Teach me / Remind me / Just the numbers) is
 * per character on this device. Live events refetch and, when they carry one,
 * show a notice that says who did what. At 0 HP the dying screen takes over.
 *
 * Plan 128: a polite live region always says whose turn it is ("Your turn",
 * "Wolf is up", "The fight is over"); the header shows the whole name; and a
 * link the DM replaced shows "This link was replaced" with the way back to the
 * party's page, because the phone remembers which party each link belongs to.
 */
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Backpack, NotebookPen, Sparkles, UserRound, X, Zap } from "lucide-react";

import { isLinkGone, playApi, type CombatState, type OrderRow, type PlaySpell, type TurnState } from "../../api/play";
import { LinkReplaced } from "../../components/PlayLinkGate";
import { useEventStream, type StreamEvent } from "../../hooks/useEventStream";
import { usePlayerPrefs } from "../../stores/usePlayerPrefs";
import { Ctx, usePlayer, type FeedRoll, type PlayerData, type Tab } from "./playerContext";
import { portraitSrc } from "../../lib/portrait";
import { RollProvider } from "./RollSheet";
import { HpBar, Monogram } from "./ui";
import { realPlayerName, srOnly } from "./rules";
import { rememberCampaign, replacedLinkCampaign } from "./linkMemory";
import NowTab from "./NowTab";
import CharacterTab from "./CharacterTab";
import SpellsTab from "./SpellsTab";
import BagTab from "./BagTab";
import JournalTab from "./JournalTab";
import FirstOpen from "./FirstOpen";
import DyingScreen from "./DyingScreen";

export default function PlayerApp({ pcId }: { pcId: string }) {
  const qc = useQueryClient();
  const [prefs, setPrefs] = usePlayerPrefs(pcId);
  const [params, setParams] = useSearchParams();

  const { data: pc, isLoading, error } = useQuery({
    queryKey: ["play-pc", pcId],
    queryFn: () => playApi.get(pcId),
    // A link that no longer opens a sheet won't start working on a retry.
    retry: (n, e) => !isLinkGone(e) && n < 1,
  });
  const enabled = !!pc;
  const { data: stats } = useQuery({ queryKey: ["play-spell-stats", pcId], queryFn: () => playApi.spellcastingStats(pcId), enabled });
  const { data: slots } = useQuery({ queryKey: ["play-slots", pcId], queryFn: () => playApi.spellSlots(pcId), enabled });
  const { data: spells = [] } = useQuery({
    queryKey: ["play-spells", pcId],
    queryFn: () => playApi.spells(pcId) as unknown as Promise<PlaySpell[]>,
    enabled,
  });
  const { data: features = [] } = useQuery({ queryKey: ["play-features", pcId], queryFn: () => playApi.features(pcId), enabled });
  const { data: skills = {} } = useQuery({ queryKey: ["play-skills", pcId], queryFn: () => playApi.skillBonuses(pcId), enabled });
  const { data: saves = {} } = useQuery({ queryKey: ["play-saves", pcId], queryFn: () => playApi.savingThrows(pcId), enabled });
  const { data: turn } = useQuery({ queryKey: ["play-turn-state", pcId], queryFn: () => playApi.turnState(pcId), enabled, refetchOnWindowFocus: true });
  const { data: combat } = useQuery({ queryKey: ["play-combat-state", pcId], queryFn: () => playApi.combatState(pcId), enabled, refetchOnWindowFocus: true });
  const { data: kit } = useQuery({ queryKey: ["play-turn-kit", pcId], queryFn: () => playApi.turnKit(pcId), enabled, staleTime: 60_000 });
  const { data: live } = useQuery({ queryKey: ["live-session", pcId], queryFn: () => playApi.liveSession(pcId), enabled, staleTime: 60_000 });

  const [feed, setFeed] = useState<FeedRoll[]>([]);
  const [notices, setNotices] = useState<Array<{ id: number; text: string }>>([]);
  const notify = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setNotices((n) => [...n.slice(-2), { id, text }]);
    window.setTimeout(() => setNotices((n) => n.filter((x) => x.id !== id)), 7000);
  }, []);

  const refresh = useCallback(() => {
    for (const k of ["play-pc", "play-slots", "play-features", "play-class-features", "play-spell-stats", "play-skills", "play-saves", "play-spells", "play-turn-kit"]) {
      void qc.invalidateQueries({ queryKey: [k, pcId] });
    }
  }, [qc, pcId]);

  const onEvent = useCallback(
    (evt: StreamEvent) => {
      const e = evt as StreamEvent & Record<string, unknown>;
      if (typeof e.notice === "string" && e.notice) notify(e.notice);
      if (evt.type === "pc.spells.updated") {
        void qc.invalidateQueries({ queryKey: ["play-slots", pcId] });
        void qc.invalidateQueries({ queryKey: ["play-spells", pcId] });
      } else if (evt.type === "pc.features.updated") {
        void qc.invalidateQueries({ queryKey: ["play-features", pcId] });
        void qc.invalidateQueries({ queryKey: ["play-class-features", pcId] });
      } else if (evt.type === "pc.inventory.updated") {
        void qc.invalidateQueries({ queryKey: ["play-inventory", pcId] });
        void qc.invalidateQueries({ queryKey: ["play-turn-kit", pcId] });
      } else if (evt.type === "pc.combat.updated") {
        void qc.invalidateQueries({ queryKey: ["play-combat-state", pcId] });
      } else if (evt.type === "dice.rolled") {
        const roll = e.roll as Omit<FeedRoll, "id"> | undefined;
        if (roll) setFeed((f) => [{ ...roll, id: Date.now() + Math.random() }, ...f].slice(0, 8));
      } else if (evt.type === "pc.turn.changed") {
        const active = !!e.active;
        qc.setQueryData<TurnState>(["play-turn-state", pcId], (prev) => ({
          active,
          session_id: (e.session_id as string) ?? prev?.session_id,
          round: (e.round as number) ?? prev?.round,
          active_combatant_name: (e.active_combatant_name as string) ?? (active ? prev?.active_combatant_name : undefined),
          order: prev?.order?.map((r: OrderRow) => ({ ...r, current: r.name === e.active_combatant_name })),
        }));
        // A fight starting, a turn passing or a fight ending all arrive as turn
        // changes: re-read whether a fight is on (Now screen) and the full order,
        // or the phone sits on "No fight right now" (persona run 3, Nina).
        void qc.invalidateQueries({ queryKey: ["play-combat-state", pcId] });
        void qc.invalidateQueries({ queryKey: ["play-turn-state", pcId] });
        if (active) {
          try {
            navigator.vibrate?.([60, 40, 60]);
          } catch {
            /* no vibration on this device */
          }
        }
      } else if (evt.type === "duel.called") {
        notify(`${(e.host_name as string) || "Someone"} called you out in the Arena.`);
      } else {
        refresh();
        void qc.invalidateQueries({ queryKey: ["play-turn-state", pcId] });
      }
    },
    [qc, pcId, refresh, notify],
  );
  useEventStream("pc", pcId, onEvent);

  // Remember which party this link opens, so a reset link can point back to it.
  const campaignId = pc?.campaign_id;
  useEffect(() => {
    if (campaignId) rememberCampaign(pcId, campaignId);
  }, [pcId, campaignId]);

  // A write found the link gone: re-read the sheet, which then shows "replaced".
  useEffect(() => {
    const onGone = (e: Event) => {
      if ((e as CustomEvent<{ key?: string }>).detail?.key === pcId) void qc.invalidateQueries({ queryKey: ["play-pc", pcId] });
    };
    window.addEventListener("ql:play-link-gone", onGone);
    return () => window.removeEventListener("ql:play-link-gone", onGone);
  }, [qc, pcId]);

  // HP changes flash the screen: noticed during render, cleared by a timer.
  const [flash, setFlash] = useState<{ hp: number | null; kind: "" | "damage" | "heal" }>({ hp: null, kind: "" });
  if (pc && flash.hp !== pc.hp_current) {
    setFlash({ hp: pc.hp_current, kind: flash.hp === null ? "" : pc.hp_current < flash.hp ? "damage" : "heal" });
  }
  useEffect(() => {
    if (!flash.kind) return;
    const t = window.setTimeout(() => setFlash((f) => ({ ...f, kind: "" })), 900);
    return () => window.clearTimeout(t);
  }, [flash.kind, flash.hp]);

  // Keep the screen awake while the phone is open, if the player asked.
  useEffect(() => {
    if (!prefs.awake || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    const take = () =>
      (navigator as Navigator & { wakeLock: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock
        .request("screen")
        .then((l) => (lock = l))
        .catch(() => undefined);
    void take();
    const onVis = () => document.visibilityState === "visible" && void take();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [prefs.awake]);

  // The DM reset this link (or it never existed): the way back is the party's page.
  const replacedFor = replacedLinkCampaign(error, pcId);
  if (replacedFor) return <LinkReplaced campaignId={replacedFor} />;
  if (isLoading) return <Centered>Opening your character…</Centered>;
  if (!pc) {
    return (
      <Centered>
        {isLinkGone(error)
          ? "This link doesn't open a character any more. Ask your DM for your new link."
          : "We couldn't open this character. Check your connection, or ask your DM for a fresh link."}
      </Centered>
    );
  }

  const isCaster = spells.length > 0 || Object.values(slots?.levels ?? {}).some((l) => l.max > 0);
  const raw = (params.get("tab") as Tab) || "now";
  const tab: Tab = raw === "spells" && !isCaster ? "now" : raw;
  const go = (t: Tab) => {
    setParams(t === "now" ? {} : { tab: t }, { replace: false });
    window.scrollTo({ top: 0 });
  };

  const data: PlayerData = {
    pcId, pc, help: prefs.help, setHelp: (h) => setPrefs({ help: h }), stats, slots, spells, features, skills, saves,
    turn, combat, kit, feed, liveSessionId: live?.session_id ?? null, isCaster, go, refresh, notify,
  };

  if (!prefs.onboarded) {
    return (
      <Ctx.Provider value={data}>
        <FirstOpen onDone={(help) => setPrefs({ help, onboarded: true })} />
      </Ctx.Provider>
    );
  }

  const dying = pc.hp_current === 0 && pc.death_save_successes < 3 && pc.death_save_failures < 3;
  const tabs: Array<[Tab, string, ReactNode]> = [
    ["now", "Now", <Zap size={22} key="n" />],
    ["character", "Character", <UserRound size={22} key="c" />],
    ...(isCaster ? ([["spells", "Spells", <Sparkles size={22} key="s" />]] as Array<[Tab, string, ReactNode]>) : []),
    ["bag", "Bag", <Backpack size={22} key="b" />],
    ["journal", "Journal", <NotebookPen size={22} key="j" />],
  ];

  return (
    <Ctx.Provider value={data}>
      <RollProvider pcId={pcId} help={prefs.help}>
        <div style={{ minHeight: "100dvh", background: "var(--bg)", color: "var(--text)" }}>
          <TurnAnnouncer turn={turn} combat={combat} />
          {flash.kind &&<div aria-hidden className={flash.kind === "damage" ? "ql-sheet-flash-damage" : "ql-sheet-flash-heal"} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 400 }} />}
          <div style={{ maxWidth: 560, margin: "0 auto", minHeight: "100dvh", display: "flex", flexDirection: "column" }}>
            {dying ? (
              <DyingScreen />
            ) : (
              <>
                {tab !== "character" && <TopBar />}
                <Notices notices={notices} onDismiss={(id) => setNotices((n) => n.filter((x) => x.id !== id))} />
                <main style={{ flex: 1, padding: "0 16px calc(96px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 10 }}>
                  {tab === "now" && <NowTab />}
                  {tab === "character" && <CharacterTab />}
                  {tab === "spells" && <SpellsTab />}
                  {tab === "bag" && <BagTab />}
                  {tab === "journal" && <JournalTab />}
                </main>
                <nav aria-label="Player screens" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 100, background: "#131816", borderTop: "1px solid var(--border)" }}>
                  <div style={{ maxWidth: 560, margin: "0 auto", display: "grid", gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`, padding: "4px 6px calc(10px + env(safe-area-inset-bottom, 0px))" }}>
                    {tabs.map(([key, label, icon]) => {
                      const on = key === tab;
                      return (
                        <button key={key} type="button" aria-current={on ? "page" : undefined} onClick={() => go(key)} style={{ minHeight: 54, border: "none", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, color: on ? "var(--accent-text)" : "var(--muted)", font: `${on ? 600 : 500} 12px var(--font-ui)`, cursor: "pointer" }}>
                          {icon}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </nav>
              </>
            )}
          </div>
        </div>
      </RollProvider>
    </Ctx.Provider>
  );
}

function TopBar() {
  const { pc, go } = usePlayer();
  const sub = [`${pc.character_class} ${pc.level}`, realPlayerName(pc.player_name)].filter(Boolean).join(" · ");
  return (
    <header style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px 10px" }}>
      <Monogram name={pc.character_name} cls={pc.character_class} url={pc.portrait_url ? portraitSrc(pc.portrait_url, pc.updated_at) : null} size={38} />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        {/* The whole name, "Ser Corwin Vale", never just "Ser": two lines at most (run 3). */}
        <h1
          className="story"
          title={pc.character_name}
          style={{ margin: 0, fontWeight: 700, fontSize: 19, lineHeight: 1.15, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
        >
          {pc.character_name}
        </h1>
        <span style={{ fontSize: 13, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</span>
      </div>
      <button type="button" onClick={() => go("character")} aria-label={`Hit points ${pc.hp_current} of ${pc.hp_max}. Open your character.`} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, background: "transparent", border: "none", padding: "4px 0 4px 8px", cursor: "pointer", color: "inherit" }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>Hit points{pc.temp_hp > 0 ? ` +${pc.temp_hp} temp` : ""}</span>
        <span className="num" style={{ fontWeight: 600, fontSize: 16, color: pc.hp_current <= pc.hp_max / 4 ? "var(--danger-text)" : "var(--text)" }}>
          {pc.hp_current} / {pc.hp_max}
        </span>
        <HpBar cur={pc.hp_current} max={pc.hp_max} height={5} width={80} />
      </button>
    </header>
  );
}

function Notices({ notices, onDismiss }: { notices: Array<{ id: number; text: string }>; onDismiss: (id: number) => void }) {
  // Always mounted, so a screen reader hears the first notice too (Sam, run 3).
  return (
    <div role="status" aria-live="polite" style={{ padding: notices.length ? "0 16px 10px" : 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {notices.map((n) => (
        <div key={n.id} className="ql-modal-in" style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px 6px 12px", borderRadius: 12, background: "var(--teal-soft)", border: "1px solid #2B4A44", fontSize: 14 }}>
          <span style={{ flex: 1 }}>{n.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(n.id)} style={{ width: 40, height: 40, border: "none", background: "transparent", color: "var(--text2)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * Says the turn out loud for a screen reader (Sam, run 3): "Your turn, round 2.",
 * "Wolf is up.", "The fight is over." One polite region, always mounted, that
 * only changes when the turn does; nothing is said when the phone first opens
 * between fights.
 */
function TurnAnnouncer({ turn, combat }: { turn: TurnState | undefined; combat: CombatState | undefined }) {
  const [said, setSaid] = useState({ key: "", text: "" });
  let key: string | null = null;
  let text = "";
  if (combat && !combat.in_combat) {
    key = "calm";
    text = said.key && said.key !== "calm" ? "The fight is over." : "";
  } else if (combat?.in_combat && turn?.active) {
    key = `you-${turn.round ?? ""}`;
    text = turn.round != null ? `Your turn, round ${turn.round}.` : "Your turn.";
  } else if (combat?.in_combat && turn?.active_combatant_name) {
    key = `up-${turn.active_combatant_name}-${turn.round ?? ""}`;
    text = `${turn.active_combatant_name} is up.`;
  }
  // Noticed during render (like the HP flash): no effect, no extra pass.
  if (key !== null && key !== said.key) setSaid({ key, text });
  return (
    <div role="status" aria-live="polite" aria-atomic="true" style={srOnly}>
      {said.text}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center", color: "var(--text2)", background: "var(--bg)" }}>
      <p style={{ margin: 0, maxWidth: 380, lineHeight: 1.55 }}>{children}</p>
    </div>
  );
}
