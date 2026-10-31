/**
 * First open (Plan 122): confirm who you are, and choose how much help you want.
 * "Not you?" goes back to the campaign's character list.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { playApi } from "../../api/play";
import BrandMark from "../../components/BrandMark";
import { portraitSrc } from "../../lib/portrait";
import type { HelpLevel } from "../../stores/usePlayerPrefs";
import { usePlayer } from "./playerContext";
import { Monogram, Panel } from "./ui";

const OPTIONS: Array<[HelpLevel, string, string]> = [
  ["teach", "Teach me", "New to D&D, or new-ish. Plain words, and ideas for what to do on your turn."],
  ["remind", "Remind me", "I know the basics. Short labels, and tips when I tap."],
  ["numbers", "Just the numbers", "I've played plenty. Keep it dense and quick."],
];

export default function FirstOpen({ onDone }: { onDone: (help: HelpLevel) => void }) {
  const { pc, pcId } = usePlayer();
  const [help, setHelp] = useState<HelpLevel>("teach");
  const { data: campaign } = useQuery({ queryKey: ["play-campaign", pcId], queryFn: () => playApi.campaignName(pcId), staleTime: 300_000 });
  const first = pc.character_name.split(" ")[0];
  return (
    <main style={{ minHeight: "100dvh", maxWidth: 520, margin: "0 auto", padding: "26px 22px calc(22px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 18, background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--muted)" }}>
        <BrandMark size={18} />
        <span className="story" style={{ fontWeight: 700, fontSize: 17, color: "var(--text)" }}>QuestLab</span>
        {campaign?.name && <span>· {campaign.name}</span>}
      </div>
      <h1 className="story" style={{ margin: 0, fontSize: 31, lineHeight: 1.1 }}>
        Welcome to the table{pc.player_name ? `, ${pc.player_name}` : ""}.
      </h1>
      <Panel style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Monogram name={pc.character_name} url={pc.portrait_url ? portraitSrc(pc.portrait_url, pc.updated_at) : null} size={50} />
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
          <span className="story" style={{ fontWeight: 700, fontSize: 21 }}>{pc.character_name}</span>
          <span style={{ fontSize: 14, color: "var(--muted)" }}>{[`${pc.character_class} ${pc.level}`, pc.subclass, pc.race].filter(Boolean).join(" · ")}</span>
        </div>
        <Link to={`/join/${pc.campaign_id}?switch=1`} style={{ fontSize: 14, fontWeight: 500, padding: "10px 4px" }}>Not you?</Link>
      </Panel>
      <h2 style={{ margin: "4px 0 0", fontSize: 17 }}>How much help would you like?</h2>
      <div role="radiogroup" aria-label="Help level" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {OPTIONS.map(([k, title, desc]) => {
          const on = help === k;
          return (
            <label key={k} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px", borderRadius: 14, border: `1px solid ${on ? "var(--accent-edge)" : "var(--border2)"}`, background: on ? "var(--accent-soft)" : "transparent", cursor: "pointer", margin: 0 }}>
              <input type="radio" name="help" checked={on} onChange={() => setHelp(k)} style={{ marginTop: 3, width: 18, height: 18 }} />
              <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{ fontWeight: 600, fontSize: 16, color: "var(--text)" }}>{title}</span>
                <span style={{ fontSize: 14, color: "var(--text2)" }}>{desc}</span>
              </span>
            </label>
          );
        })}
      </div>
      <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>Change it any time. As you play, QuestLab will offer to step the help down.</p>
      <button type="button" className="btn btn-primary" onClick={() => onDone(help)} style={{ marginTop: "auto", minHeight: 54, fontSize: 17, borderRadius: 12 }}>
        Take me to {first}
      </button>
    </main>
  );
}
