/**
 * Dying (Plan 122): at 0 hit points the phone takes over and teaches death
 * saves. The roll shows on the TV, or a real die can be typed in.
 */
import { Dices } from "lucide-react";

import { playApi } from "../../api/play";
import { portraitSrc } from "../../lib/portrait";
import { usePlayer } from "./playerContext";
import { useRoll } from "./rollContext";
import { Monogram, Panel, Pips } from "./ui";

export default function DyingScreen() {
  const { pc, pcId, refresh, help } = usePlayer();
  const roll = useRoll();
  const save = () =>
    roll({
      title: "Death save",
      kind: "death",
      die: "d20",
      modifier: 0,
      why: "No bonus: just the die. 10 or higher is a success.",
      onResult: async (r) => {
        const d = r.kept[0] ?? r.total;
        await playApi.resolveDeathSave(pcId, d);
        refresh();
        if (d === 20) return "A natural 20! You're back up with 1 hit point.";
        if (d === 1) return "A natural 1 counts as two failures.";
        return d >= 10 ? "A success." : "A failure.";
      },
    });
  return (
    <main style={{ flex: 1, padding: "30px 22px calc(22px + env(safe-area-inset-bottom, 0px))", display: "flex", flexDirection: "column", gap: 18, background: "#161210", minHeight: "100dvh" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Monogram name={pc.character_name} url={pc.portrait_url ? portraitSrc(pc.portrait_url, pc.updated_at) : null} size={36} />
        <span className="story" style={{ fontWeight: 700, fontSize: 18 }}>{pc.character_name.split(" ")[0]}</span>
        <span className="num" style={{ marginLeft: "auto", fontWeight: 600, color: "var(--danger-text)" }}>0 / {pc.hp_max}</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 className="story" style={{ margin: 0, fontSize: 38, lineHeight: 1.05, color: "var(--danger-text)" }}>You're dying</h1>
        <p style={{ margin: 0, fontSize: 16, color: "var(--text2)" }}>You're at 0 hit points. On each of your turns, roll a death save.</p>
      </div>
      <Panel style={{ gap: 14, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Successes</span>
          <Pips filled={pc.death_save_successes} total={3} color="var(--teal)" size={30} label="Death save successes" />
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 600 }}>Failures</span>
          <Pips filled={pc.death_save_failures} total={3} color="var(--danger)" size={30} label="Death save failures" />
        </div>
      </Panel>
      {help !== "numbers" && (
        <Panel style={{ background: "transparent", gap: 6 }}>
          <span style={{ fontSize: 14, color: "var(--text2)" }}><b style={{ color: "var(--text)" }}>10 or higher</b> is a success; <b style={{ color: "var(--text)" }}>under 10</b> is a failure.</span>
          <span style={{ fontSize: 14, color: "var(--text2)" }}>Three successes and you stabilize. Three failures and you die.</span>
          <span style={{ fontSize: 14, color: "var(--text2)" }}>A <b style={{ color: "var(--text)" }}>20</b> brings you back with 1 hit point. A <b style={{ color: "var(--text)" }}>1</b> counts as two failures.</span>
        </Panel>
      )}
      <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>Any healing brings you back. A friend can also steady you with a Medicine check.</p>
      <button type="button" className="btn btn-primary" onClick={save} style={{ marginTop: "auto", minHeight: 56, fontSize: 17, borderRadius: 12 }}>
        <Dices size={20} /> Roll a death save
      </button>
    </main>
  );
}
