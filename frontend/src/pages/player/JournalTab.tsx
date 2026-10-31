/**
 * Journal (Plan 122): your private notes, the people you've met, how to play,
 * and the settings — including the nudge to step the help down as you grow.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Lock, Sprout } from "lucide-react";

import { playApi } from "../../api/play";
import { portraitSrc } from "../../lib/portrait";
import { zoomable } from "../../lib/lightbox";
import { usePlayerPrefs } from "../../stores/usePlayerPrefs";
import { usePlayer } from "./playerContext";
import { HelpSwitch, Label, Monogram, Panel } from "./ui";

export default function JournalTab() {
  return (
    <>
      <Nudge />
      <Tonight />
      <Notes />
      <People />
      <HowToPlay />
      <Settings />
    </>
  );
}

function Nudge() {
  const { pc, pcId, help, setHelp } = usePlayer();
  const [prefs, setPrefs] = usePlayerPrefs(pcId);
  const next = help === "teach" && pc.level >= 3 ? "remind" : help === "remind" && pc.level >= 8 ? "numbers" : null;
  if (!next || prefs.nudged === help) return null;
  return (
    <Panel tone="tip" style={{ gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Sprout size={18} color="var(--teal-text)" />
        <span style={{ fontWeight: 600 }}>Level {pc.level} already</span>
      </div>
      <span style={{ fontSize: 14, color: "var(--text2)" }}>
        {next === "remind" ? "You've got the basics. Want shorter labels and fewer hints on your turn?" : "You know this sheet well. Want it dense and quick, just the numbers?"}
      </span>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={() => setHelp(next)} style={{ minHeight: 40 }}>
          Switch to {next === "remind" ? "Remind me" : "Just the numbers"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setPrefs({ nudged: help })} style={{ minHeight: 40, border: "none", color: "var(--accent-text)" }}>
          Not yet
        </button>
      </div>
    </Panel>
  );
}

function Tonight() {
  const { pcId } = usePlayer();
  const { data: live } = useQuery({ queryKey: ["live-session", pcId], queryFn: () => playApi.liveSession(pcId), staleTime: 60_000 });
  const { data: campaign } = useQuery({ queryKey: ["play-campaign", pcId], queryFn: () => playApi.campaignName(pcId), staleTime: 300_000 });
  if (!live?.title && !campaign?.name) return null;
  return (
    <Panel tone="story" style={{ gap: 2 }}>
      {campaign?.name && <Label>{campaign.name}</Label>}
      {live?.title && <span className="story" style={{ fontWeight: 700, fontSize: 19 }}>{live.title}</span>}
    </Panel>
  );
}

function Notes() {
  const { pc, pcId } = usePlayer();
  const [text, setText] = useState(pc.player_notes ?? "");
  const [state, setState] = useState<"" | "saving" | "saved" | "error">("");
  const timer = useRef<number | null>(null);
  const save = async (value: string) => {
    setState("saving");
    try {
      await playApi.saveNotes(pcId, value);
      setState("saved");
    } catch {
      setState("error");
    }
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label htmlFor="ql-notes" style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>My notes</label>
        <span style={{ fontSize: 12, color: state === "error" ? "var(--danger-text)" : "var(--muted)", display: "flex", alignItems: "center", gap: 4 }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : state === "error" ? "Not saved. Try again." : (
            <>
              <Lock size={12} /> Your DM's screens don't show these
            </>
          )}
        </span>
      </div>
      <textarea
        id="ql-notes"
        rows={5}
        value={text}
        maxLength={4000}
        placeholder="Names, clues, promises, the thing you meant to ask the DM…"
        onChange={(e) => {
          const value = e.target.value;
          setText(value);
          setState("");
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => void save(value), 1200);
        }}
        onBlur={() => {
          if (timer.current) window.clearTimeout(timer.current);
          if (text !== (pc.player_notes ?? "") && state !== "saved") void save(text);
        }}
        style={{ resize: "vertical", borderRadius: 12, fontSize: 15, lineHeight: 1.45, minHeight: 120 }}
      />
    </div>
  );
}

function People() {
  const { pcId, help } = usePlayer();
  const { data: npcs = [], isLoading } = useQuery({ queryKey: ["play-npcs", pcId], queryFn: () => playApi.npcs(pcId) });
  return (
    <Panel style={{ gap: 4 }}>
      <Label>People you've met</Label>
      {isLoading ? (
        <span style={{ fontSize: 14, color: "var(--muted)" }}>Remembering faces…</span>
      ) : npcs.length === 0 ? (
        <span style={{ fontSize: 14, color: "var(--muted)" }}>No one yet. Faces appear here as the DM introduces them.</span>
      ) : (
        npcs.map((n, i) => (
          <div key={n.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: i === npcs.length - 1 ? "none" : "1px solid var(--border)" }}>
            {n.portrait_url ? (
              <img src={portraitSrc(n.portrait_url)} {...zoomable(portraitSrc(n.portrait_url), n.name)} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <Monogram name={n.name} size={40} />
            )}
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span className="story" style={{ fontWeight: 700, fontSize: 16 }}>
                {n.name}
                {n.status && n.status !== "Alive" && <span className="pill" style={{ marginLeft: 8, fontFamily: "var(--font-ui)", fontWeight: 500 }}>{n.status}</span>}
              </span>
              <span style={{ fontSize: 13, color: "var(--text2)" }}>{[n.role, n.race, n.location].filter(Boolean).join(" · ")}</span>
              {n.appearance && help !== "numbers" && <span style={{ fontSize: 13, color: "var(--muted)" }}>{n.appearance}</span>}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

function HowToPlay() {
  const { help, pc } = usePlayer();
  const [open, setOpen] = useState(help === "teach");
  const [rules, setRules] = useState(false);
  return (
    <Panel style={{ gap: 8 }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 40, background: "transparent", border: "none", padding: 0, color: "var(--text)", font: "600 16px var(--font-ui)", cursor: "pointer" }}>
        How a turn works {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {open && (
        <ol style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.5, color: "var(--text2)" }}>
          <li><b style={{ color: "var(--text)" }}>Look around.</b> Where are the enemies, your friends, the exits? Who's hurt? There's no rush.</li>
          <li><b style={{ color: "var(--text)" }}>Move</b> up to {pc.speed} ft. You can split it around your action. Leaving an enemy's reach lets them take a swing at you, unless you Disengage.</li>
          <li><b style={{ color: "var(--text)" }}>Take one action:</b> attack, cast a spell, Dash, Dodge, Disengage, Help, Hide, or use something.</li>
          <li><b style={{ color: "var(--text)" }}>A bonus action</b> only if something on your sheet gives you one. The Now screen shows yours.</li>
          <li><b style={{ color: "var(--text)" }}>One small thing for free:</b> open a door, draw a weapon, say a few words.</li>
          <li><b style={{ color: "var(--text)" }}>Say you're done.</b> The DM moves on to the next turn.</li>
        </ol>
      )}
      <button type="button" onClick={() => setRules((o) => !o)} aria-expanded={rules} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: 40, background: "transparent", border: "none", padding: 0, color: "var(--text)", font: "600 16px var(--font-ui)", cursor: "pointer" }}>
        Rules people ask about {rules ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {rules && (
        <dl style={{ margin: 0, display: "flex", flexDirection: "column", gap: 8, fontSize: 14, lineHeight: 1.5 }}>
          {[
            ["Advantage and disadvantage", "Roll two d20s and keep the higher (advantage) or the lower (disadvantage). Having both cancels out."],
            ["Critical hit", "A natural 20 on an attack hits and doubles your damage dice (not the bonus). A natural 1 misses."],
            ["Saving throw", "The DM names an ability and a number. Roll a d20 plus that save; meet the number and you resist."],
            ["Reactions", "One per round, on someone else's turn, like an opportunity attack or a Shield spell."],
            ["Cover", "Half cover adds 2 to your Armor Class, three-quarters adds 5; total cover can't be targeted."],
            ["Concentration", "Some spells need it. Taking damage means a Constitution save to keep it; a new one ends the old."],
          ].map(([t, d]) => (
            <div key={t}>
              <dt style={{ fontWeight: 600 }}>{t}</dt>
              <dd style={{ margin: 0, color: "var(--text2)" }}>{d}</dd>
            </div>
          ))}
        </dl>
      )}
      <span style={{ fontSize: 13, color: "var(--muted)" }}>Not sure? Ask the DM. Everyone's new at their first table.</span>
    </Panel>
  );
}

function Settings() {
  const { pc, pcId, help, setHelp } = usePlayer();
  const [prefs, setPrefs] = usePlayerPrefs(pcId);
  const canWake = typeof navigator !== "undefined" && "wakeLock" in navigator;
  return (
    <Panel style={{ gap: 10 }}>
      <span style={{ fontWeight: 600 }}>This phone</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Label>Help</Label>
        <HelpSwitch value={help} onChange={setHelp} />
      </div>
      {canWake && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, margin: 0, fontSize: 15, color: "var(--text)" }}>
          <input type="checkbox" checked={prefs.awake} onChange={(e) => setPrefs({ awake: e.target.checked })} style={{ width: 20, height: 20 }} />
          Keep the screen on during the session
        </label>
      )}
      <Link to={`/join/${pc.campaign_id}?switch=1`} style={{ fontSize: 14, minHeight: 32, display: "flex", alignItems: "center" }}>
        Not {pc.character_name.split(" ")[0]}? Pick your character
      </Link>
    </Panel>
  );
}
