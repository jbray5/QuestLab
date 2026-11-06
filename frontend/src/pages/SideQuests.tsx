import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import { sideQuestsApi, type SideQuest } from "../api/sideQuests";
import { ERR } from "../components/homebrew/options";
import RowMenu from "../components/RowMenu";
import QuestEditor from "../components/side-quests/QuestEditor";
import { clearBackup, RUN_STATUS, UNTITLED } from "../lib/sideQuests";
import { plural } from "../lib/plural";

/**
 * The Quest creator (Plan 136), campaigns/:campaignId/side-quests. Players call what it makes a
 * side quest.
 *
 * A DM writes a short quest in steps and sends it to characters; each player plays it alone on
 * their phone, whenever they like, while the DM is away. `?quest=<id>` opens one (`?quest=new`
 * starts one), so a reload or the back button keeps its place.
 */

/** One row of the list: what it is, and where each character has got to. */
function QuestRow({
  quest,
  onOpen,
  onDelete,
}: {
  quest: SideQuest;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const sent = quest.status === "sent";
  const finished = quest.runs.filter((r) => r.status === "done").length;
  const left = quest.problems.length + (quest.title === UNTITLED ? 1 : 0);
  return (
    <div className="card" style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", padding: "0.75rem 0.9rem" }}>
      <button
        type="button"
        onClick={onOpen}
        style={{
          flex: 1,
          minWidth: 0,
          display: "block",
          background: "none",
          border: "none",
          padding: 0,
          color: "inherit",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.25rem 0.6rem" }}>
          <span className="story" style={{ fontWeight: 700, fontSize: "1.1875rem", overflowWrap: "anywhere", minWidth: 0 }}>
            {quest.title}
          </span>
          <span className={sent ? "pill pill-teal" : "pill"}>{sent ? "Sent" : "Draft"}</span>
        </span>
        {!sent && (
          <span style={{ display: "block", marginTop: "0.25rem", fontSize: "0.875rem", color: "var(--muted)" }}>
            {plural(quest.steps.length, "step")}
            {" · "}
            {left ? `${plural(left, "thing")} left to fix` : "Ready to send"}
          </span>
        )}
        {sent && (
          <>
            <span style={{ display: "block", marginTop: "0.25rem", fontSize: "0.875rem", color: "var(--muted)" }}>
              {finished} of {plural(quest.runs.length, "character")} finished
            </span>
            <span
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.3rem 0.75rem",
                marginTop: "0.4rem",
                fontSize: "0.9375rem",
              }}
            >
              {quest.runs.map((run) => (
                <span key={run.run_id} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", minWidth: 0 }}>
                  <span className="story" style={{ overflowWrap: "anywhere" }}>
                    {run.character_name}
                  </span>
                  <span className={RUN_STATUS[run.status].pill}>{RUN_STATUS[run.status].word}</span>
                </span>
              ))}
            </span>
          </>
        )}
      </button>
      <RowMenu
        label={`More for ${quest.title}`}
        items={[
          {
            label: "Delete this quest",
            danger: true,
            confirm: sent
              ? `Delete "${quest.title}"? It leaves players' phones, and what they chose and wrote goes with it. Gold and items already paid stay on their sheets.`
              : `Delete the draft "${quest.title}"? This can't be undone.`,
            onSelect: onDelete,
          },
        ]}
      />
      <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)", flexShrink: 0, marginTop: "0.6rem" }} />
    </div>
  );
}

function QuestList({ campaignId, onOpen }: { campaignId: string; onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { data: quests = [], isLoading, error } = useQuery({
    queryKey: ["side-quests", campaignId],
    queryFn: () => sideQuestsApi.list(campaignId),
    enabled: !!campaignId,
  });
  const remove = useMutation({
    mutationFn: (quest: SideQuest) => sideQuestsApi.remove(quest.id),
    onSuccess: (_, quest) => {
      clearBackup(campaignId, quest.id);
      qc.invalidateQueries({ queryKey: ["side-quests", campaignId] });
    },
  });

  const newQuest = (
    <button type="button" className="btn btn-primary" onClick={() => onOpen("new")}>
      <Plus size={16} aria-hidden /> New quest
    </button>
  );

  return (
    <div className="fade-in ql-s6" style={{ maxWidth: 780, margin: "0 auto" }}>
      <div
        className="flex"
        style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem 1rem", marginBottom: "1rem" }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h1 style={{ marginBottom: "0.2rem" }}>Quest creator</h1>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            Write side quests your players finish on their phones.
          </p>
        </div>
        {quests.length > 0 && <div className="ql-actions">{newQuest}</div>}
      </div>

      {error && <p style={ERR}>{error.message}</p>}
      {remove.error && (
        <p role="alert" style={{ ...ERR, marginBottom: "0.75rem" }}>
          {remove.error.message}
        </p>
      )}
      {isLoading && <p className="text-muted">Loading…</p>}

      {!isLoading && !error && !quests.length && (
        <div className="card">
          <p style={{ marginTop: 0 }}>
            A side quest is a short set of steps you write: story text, choices, skill checks and written replies. You
            send it to one character or the whole party, and each player plays it alone on their phone whenever they
            like. Gold and items land on their sheets by themselves, and you can read what they chose, rolled and wrote.
          </p>
          {newQuest}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {quests.map((quest) => (
          <QuestRow key={quest.id} quest={quest} onOpen={() => onOpen(quest.id)} onDelete={() => remove.mutate(quest)} />
        ))}
      </div>
    </div>
  );
}

/** Loads one quest, then hands it to the form. A new one has nothing to load. */
function QuestScreen({
  campaignId,
  questId,
  onClose,
  onCreated,
}: {
  campaignId: string;
  questId: string | null;
  onClose: () => void;
  onCreated: (quest: SideQuest) => void;
}) {
  const { data: quest, error } = useQuery({
    queryKey: ["side-quest", questId],
    queryFn: () => sideQuestsApi.get(questId as string),
    enabled: !!questId,
  });
  if (questId && !quest) {
    return (
      <div className="fade-in ql-s6">
        <button type="button" className="btn btn-ghost" style={{ paddingLeft: "0.25rem" }} onClick={onClose}>
          <ChevronLeft size={18} aria-hidden /> Quest creator
        </button>
        {error ? <p style={ERR}>{error.message}</p> : <p className="text-muted">Loading…</p>}
      </div>
    );
  }
  return <QuestEditor campaignId={campaignId} quest={quest ?? null} onClose={onClose} onCreated={onCreated} />;
}

export default function SideQuests() {
  const { campaignId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const open = params.get("quest");
  // A quest made in this visit keeps its open form when its id lands in the URL. The form holds
  // which links are "Next in the list", which the server doesn't store.
  const [createdId, setCreatedId] = useState<string | null>(null);

  if (open) {
    return (
      <QuestScreen
        key={open === "new" || open === createdId ? "new" : open}
        campaignId={campaignId}
        questId={open === "new" ? null : open}
        onClose={() => {
          setCreatedId(null);
          setParams({});
        }}
        onCreated={(quest) => {
          setCreatedId(quest.id);
          setParams({ quest: quest.id }, { replace: true });
        }}
      />
    );
  }
  return <QuestList campaignId={campaignId} onOpen={(id) => setParams({ quest: id })} />;
}
