import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play } from "lucide-react";

import { sideQuestsApi, type SideQuest } from "../../api/sideQuests";
import { ERR, HINT } from "../homebrew/options";

export interface PracticePc {
  id: string;
  name: string;
  playToken: string | null;
}

/**
 * Plan 142 — play the quest yourself on a character's phone. The party can't see the picks,
 * nothing is paid or taken, and it can start over. Sending the quest to that character later
 * replaces the practice run with a real one.
 */
export default function PracticePanel({
  quest,
  roster,
  ready,
  loading = false,
}: {
  quest: SideQuest;
  roster: PracticePc[];
  /** Saved, with nothing left to fix. */
  ready: boolean;
  /** The campaign's characters are still loading. */
  loading?: boolean;
}) {
  const qc = useQueryClient();
  const real = new Set(quest.runs.filter((r) => !r.practice).map((r) => r.character_id));
  const practising = quest.runs.filter((r) => r.practice);
  const choices = roster.filter((pc) => !real.has(pc.id) && pc.playToken);
  const [pick, setPick] = useState("");
  const chosen = choices.find((pc) => pc.id === pick) ?? choices[0];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["side-quest", quest.id] });
    void qc.invalidateQueries({ queryKey: ["side-quests", quest.campaign_id] });
    void qc.invalidateQueries({ queryKey: ["side-quest-runs", quest.id] });
  };

  // The window opens on the click itself, so a popup blocker lets it through.
  const play = useMutation({
    mutationFn: async ({ pc, win }: { pc: PracticePc; win: Window | null }) => {
      try {
        const run = await sideQuestsApi.practice(quest.id, pc.id);
        const url = `/play/${pc.playToken}?quest=${run.run_id}&peek=1`;
        if (win) win.location.href = url;
        else window.open(url, "_blank");
        return run;
      } catch (e) {
        win?.close();
        throw e;
      }
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (runId: string) => sideQuestsApi.removePractice(quest.id, runId),
    onSuccess: refresh,
  });
  const go = (pc: PracticePc | undefined) => {
    if (!pc) return;
    play.mutate({ pc, win: window.open("about:blank", "_blank") });
  };

  return (
    <section className="card" aria-label="Play it yourself">
      <h3 style={{ margin: "0 0 0.25rem", fontSize: "1.0625rem" }}>Play it yourself</h3>
      <p style={{ ...HINT, marginTop: 0 }}>
        Play it on a character&rsquo;s phone as practice. The party can&rsquo;t see your picks, nothing is paid or
        taken from the sheet, and you can start over from the phone. On a check, type your own die roll to pick
        the branch.
      </p>
      {practising.map((run) => {
        const pc = roster.find((p) => p.id === run.character_id);
        return (
          <div key={run.run_id} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <span style={{ flex: "1 1 160px" }}>Practising as {run.character_name}</span>
            <button type="button" className="btn btn-secondary" disabled={!ready || play.isPending} onClick={() => go(pc)}>
              <Play size={16} aria-hidden /> Start over and open
            </button>
            <button type="button" className="btn btn-ghost" disabled={remove.isPending} onClick={() => remove.mutate(run.run_id)}>
              Remove
            </button>
          </div>
        );
      })}
      {!ready && <p style={{ ...HINT, margin: 0 }}>Save it with nothing left to fix, then you can play it.</p>}
      {ready && !loading && choices.length === 0 && (
        <p style={{ ...HINT, margin: 0 }}>Everyone in this campaign has it for real, so there&rsquo;s nobody to practise as.</p>
      )}
      {ready && choices.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: "0.5rem" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label htmlFor={`practice-${quest.id}`}>Play as</label>
            <select id={`practice-${quest.id}`} value={chosen?.id ?? ""} onChange={(e) => setPick(e.target.value)}>
              {choices.map((pc) => (
                <option key={pc.id} value={pc.id}>
                  {pc.name}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn btn-primary" disabled={play.isPending} onClick={() => go(chosen)}>
            <Play size={16} aria-hidden /> Play
          </button>
        </div>
      )}
      {(play.error || remove.error) && <p style={ERR}>{(play.error ?? remove.error)?.message}</p>}
    </section>
  );
}
