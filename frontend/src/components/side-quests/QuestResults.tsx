import { useQuery } from "@tanstack/react-query";

import { sideQuestsApi, type QuestLogEntry, type QuestRunDetail, type SideQuest } from "../../api/sideQuests";
import { RUN_STATUS, firstWords, logLines, logRewards, stepName } from "../../lib/sideQuests";
import { ERR } from "../homebrew/options";

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
  const entries = run.log.filter((e) => logLines(e).length || e.reply || logRewards(e).length);
  return (
    <section className="card" aria-label={run.character_name}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.35rem 0.6rem" }}>
        <h3 className="story" style={{ margin: 0, fontSize: "1.25rem", overflowWrap: "anywhere", minWidth: 0 }}>
          {run.character_name}
        </h3>
        <span className={status.pill}>{status.word}</span>
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
