import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

import { sideQuestsApi, type QuestLogEntry, type QuestRunDetail, type SideQuest } from "../../api/sideQuests";
import { RUN_STATUS, currentTry, firstWords, formatGp, logLines, logRewards, stepName } from "../../lib/sideQuests";
import { ERR, HINT } from "../homebrew/options";

const STORY_BOX = {
  marginTop: "0.3rem",
  padding: "0.75rem 0.9rem",
  background: "var(--story-bg)",
  border: "1px solid var(--story-line)",
  borderRadius: 8,
  color: "var(--story-text)",
  fontSize: "1.125rem",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  userSelect: "text",
  WebkitUserSelect: "text",
} as const;

/** "25 gp", without the + a log line uses for money coming in. */
function plainGp(gp: number): string {
  return `${gp.toLocaleString()} gp`;
}

/** Plan 143 — where the DM let them play again. Everything above it is the earlier try. */
function AgainDivider({ entry }: { entry: QuestLogEntry }) {
  const took = [
    ...(entry.taken_gp ? [entry.taken_gp > 0 ? plainGp(entry.taken_gp) : `gave back ${plainGp(-entry.taken_gp)}`] : []),
    ...(entry.taken_items ?? []),
  ];
  return (
    <li style={{ borderTop: "1px solid var(--border)", paddingTop: "0.6rem", marginTop: "0.25rem" }}>
      <div style={{ fontWeight: 600 }}>You let them play again · {when(entry.at)}</div>
      <div className="text-muted" style={{ fontSize: "0.875rem", overflowWrap: "anywhere" }}>
        Everything above is their earlier try.
        {took.length > 0 && ` Took back: ${took.join(", ")}.`}
        {(entry.kept_items ?? []).length > 0 &&
          ` Not on the sheet any more, so it stayed gone: ${(entry.kept_items ?? []).join(", ")}.`}
      </div>
      {entry.recap && (
        <div style={{ marginTop: "0.5rem" }}>
          <span>Had told the party:</span>
          <div className="story" style={STORY_BOX}>
            {entry.recap}
          </div>
        </div>
      )}
    </li>
  );
}

/** Plan 143 — "Let them play again", with a confirm that says what happens to what they got. */
function PlayAgain({ run, quest }: { run: QuestRunDetail; quest: SideQuest }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [takeBack, setTakeBack] = useState(true);
  const now = currentTry(run.log);
  const gp = now.reduce((sum, e) => sum + (e.gp ?? 0), 0);
  const items = now.flatMap((e) => e.items ?? []);
  const paid = [...(gp ? [gp > 0 ? plainGp(gp) : formatGp(gp)] : []), ...items];
  const again = useMutation({
    mutationFn: () => sideQuestsApi.playAgain(quest.id, run.run_id, takeBack && paid.length > 0),
    onSuccess: () => {
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["side-quest-runs", quest.id] });
      void qc.invalidateQueries({ queryKey: ["side-quest", quest.id] });
      void qc.invalidateQueries({ queryKey: ["side-quests", quest.campaign_id] });
    },
  });
  if (!open) {
    return (
      <button type="button" className="btn btn-ghost" style={{ alignSelf: "flex-start", marginTop: "0.5rem" }} onClick={() => setOpen(true)}>
        <RotateCcw size={16} aria-hidden /> Let them play again
      </button>
    );
  }
  return (
    <div
      style={{
        marginTop: "0.75rem",
        padding: "0.75rem",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
      }}
    >
      <p style={{ margin: 0 }}>
        {run.character_name} starts {quest.title} again from the beginning. What they did and wrote stays here for you.
        The party stops seeing their earlier picks.
      </p>
      {paid.length > 0 && (
        <label style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", margin: 0 }}>
          <input type="checkbox" checked={takeBack} onChange={(e) => setTakeBack(e.target.checked)} style={{ marginTop: 4 }} />
          <span>
            Take back what this try gave: {paid.join(", ")}
            <span style={{ ...HINT, display: "block", margin: 0 }}>
              Gold won&rsquo;t go below an empty purse, and an item they no longer have stays gone.
            </span>
          </span>
        </label>
      )}
      <p style={{ ...HINT, margin: 0 }}>Damage they took stays taken.</p>
      {again.error && <p style={ERR}>{again.error.message}</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        <button type="button" className="btn btn-primary" disabled={again.isPending} onClick={() => again.mutate()}>
          {again.isPending ? "Resetting…" : "Play again"}
        </button>
        <button type="button" className="btn btn-secondary" disabled={again.isPending} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function when(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** One thing a player did or got. What they wrote is the part the DM most wants, so it's biggest. */
function Entry({ entry, quest }: { entry: QuestLogEntry; quest: SideQuest }) {
  const index = quest.steps.findIndex((s) => s.id === entry.step_id);
  if (entry.kind === "again") return <AgainDivider entry={entry} />;
  return (
    <>
      {logLines(entry).map((line) => (
        <li key={line} style={{ overflowWrap: "anywhere" }}>
          {line}
        </li>
      ))}
      {entry.reply && (
        <li>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0 0.5rem", alignItems: "baseline" }}>
            <span>Wrote:</span>
            {index >= 0 && (
              <span style={{ fontSize: "0.8125rem", color: "var(--muted)", overflowWrap: "anywhere" }}>
                on {stepName(index)}: {firstWords(quest.steps[index])}
              </span>
            )}
          </div>
          <div
            className="story"
            style={{
              marginTop: "0.3rem",
              padding: "0.75rem 0.9rem",
              background: "var(--story-bg)",
              border: "1px solid var(--story-line)",
              borderRadius: 8,
              color: "var(--story-text)",
              fontSize: "1.125rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          >
            {entry.reply}
          </div>
        </li>
      )}
      {logRewards(entry).map((line) => (
        <li
          key={line}
          className={line.startsWith("Got:") ? undefined : "num"}
          style={{ color: line.startsWith("−") ? "var(--amber-text)" : "var(--teal-text)", overflowWrap: "anywhere" }}
        >
          {line}
        </li>
      ))}
    </>
  );
}

function RunCard({ run, quest }: { run: QuestRunDetail; quest: SideQuest }) {
  const status = RUN_STATUS[run.status];
  const at = quest.steps.findIndex((s) => s.id === run.step_id);
  const entries = run.log.filter((e) => e.kind === "again" || logLines(e).length || e.reply || logRewards(e).length);
  return (
    <section className="card" aria-label={run.character_name}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.6rem" }}>
        <h3 className="story" style={{ margin: 0, fontSize: "1.25rem", overflowWrap: "anywhere", minWidth: 0 }}>
          {run.character_name}
        </h3>
        <span className={status.pill}>{status.word}</span>
        {run.practice && <span className="pill">Practice</span>}
        <span className="text-muted" style={{ fontSize: "0.8125rem" }}>
          {run.status === "done" ? when(run.finished_at) : when(run.opened_at)}
        </span>
      </div>

      {entries.length > 0 && (
        <ol
          style={{
            listStyle: "none",
            margin: "0.75rem 0 0",
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
          }}
        >
          {entries.map((entry, i) => (
            <Entry key={i} entry={entry} quest={quest} />
          ))}
        </ol>
      )}

      {run.recap && (
        <div style={{ marginTop: "0.75rem" }}>
          <span>Told the party:</span>
          <div
            className="story"
            style={{
              marginTop: "0.3rem",
              padding: "0.75rem 0.9rem",
              background: "var(--story-bg)",
              border: "1px solid var(--story-line)",
              borderRadius: 8,
              color: "var(--story-text)",
              fontSize: "1.125rem",
              lineHeight: 1.5,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
              userSelect: "text",
              WebkitUserSelect: "text",
            }}
          >
            {run.recap}
          </div>
        </div>
      )}

      {run.status === "new" && (
        <p className="text-muted" style={{ margin: "0.5rem 0 0", fontSize: "0.875rem" }}>
          They haven&rsquo;t opened it yet.
        </p>
      )}
      {run.status === "active" && at >= 0 && (
        <p className="text-muted" style={{ margin: "0.5rem 0 0", fontSize: "0.875rem", overflowWrap: "anywhere" }}>
          Now on {stepName(at)}: {firstWords(quest.steps[at])}
        </p>
      )}
      {!run.practice && run.status !== "new" && <PlayAgain key={run.log.length} run={run} quest={quest} />}
    </section>
  );
}

/** What each character did: choices, rolls, and what they wrote. */
export default function QuestResults({ quest }: { quest: SideQuest }) {
  const { data: runs, isLoading, error } = useQuery({
    queryKey: ["side-quest-runs", quest.id],
    queryFn: () => sideQuestsApi.runs(quest.id),
    staleTime: 5_000,
    refetchInterval: 30_000,
  });

  if (isLoading) return <p className="text-muted">Loading…</p>;
  if (error) return <p style={ERR}>{error.message}</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {(runs ?? []).map((run) => (
        <RunCard key={run.run_id} run={run} quest={quest} />
      ))}
    </div>
  );
}
