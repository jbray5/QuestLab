import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type Npc,
  type NpcStatus,
  npcsApi,
} from "../api/npcs";
import Flourish from "../components/Flourish";
import NpcModal from "../components/npc/NpcModal";
import NpcTableFace from "../components/npc/NpcTableFace";

const STATUSES: NpcStatus[] = ["Alive", "Dead", "Missing", "Imprisoned", "Unknown"];

export default function Npcs() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Npc | "new" | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [generateRole, setGenerateRole] = useState("");

  const { data: npcs = [], isLoading } = useQuery({
    queryKey: ["npcs", campaignId],
    queryFn: () => npcsApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const tags = useMemo(() => {
    const all = new Set<string>();
    npcs.forEach((n) => (n.tags ?? []).forEach((t) => all.add(t)));
    return Array.from(all).sort();
  }, [npcs]);

  const filtered = tagFilter
    ? npcs.filter((n) => (n.tags ?? []).includes(tagFilter))
    : npcs;

  const generate = useMutation({
    mutationFn: () => npcsApi.generate(campaignId!, generateRole.trim()),
    onSuccess: (npc) => {
      qc.invalidateQueries({ queryKey: ["npcs", campaignId] });
      setGenerateRole("");
      setEditing(npc); // open the modal for review/edit
    },
  });

  if (!campaignId) return <p className="text-muted">No campaign selected.</p>;

  return (
    <div className="fade-in">
      <h1 style={{ textAlign: "center", marginBottom: 0 }}>👤 NPCs</h1>
      <Flourish />
      <p
        className="text-muted"
        style={{ textAlign: "center", fontStyle: "italic", marginBottom: "1.5rem" }}
      >
        Story characters who recur across the campaign. Click any card to edit.
      </p>

      {/* Action bar */}
      <div
        style={{
          display: "flex",
          gap: "0.6rem",
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
          padding: "0.7rem 0.9rem",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 8,
        }}
      >
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          + New NPC
        </button>

        <span style={{ width: 1, height: 24, background: "var(--border)" }} />

        <input
          type="text"
          value={generateRole}
          onChange={(e) => setGenerateRole(e.target.value)}
          placeholder="e.g. corrupt guard captain"
          style={{ flex: 1, minWidth: 180, padding: "0.4rem 0.6rem" }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && generateRole.trim() && !generate.isPending) {
              generate.mutate();
            }
          }}
        />
        <button
          className="btn btn-ghost"
          onClick={() => generate.mutate()}
          disabled={!generateRole.trim() || generate.isPending}
          title="Ask Claude to invent an NPC matching this role"
        >
          {generate.isPending ? "Conjuring…" : "✨ Generate"}
        </button>
      </div>

      {/* Tag filter */}
      {tags.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            flexWrap: "wrap",
            marginBottom: "1rem",
          }}
        >
          <span style={{ fontSize: "0.7rem", color: "var(--muted)", alignSelf: "center" }}>
            FILTER:
          </span>
          <TagChip
            label="All"
            active={tagFilter === null}
            onClick={() => setTagFilter(null)}
          />
          {tags.map((t) => (
            <TagChip
              key={t}
              label={t}
              active={tagFilter === t}
              onClick={() => setTagFilter(t)}
            />
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <p className="text-muted">Loading NPCs…</p>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "3rem 1rem",
            textAlign: "center",
            color: "var(--muted)",
            background: "var(--surface)",
            border: "1px dashed var(--border)",
            borderRadius: 8,
            fontStyle: "italic",
          }}
        >
          No NPCs yet. Click <strong>+ New NPC</strong> or type a role and
          hit <strong>✨ Generate</strong> to begin.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "0.85rem",
          }}
        >
          {filtered.map((npc) => (
            <NpcTableFace
              key={npc.id}
              npc={npc}
              onOpenPrep={() => setEditing(npc)}
            />
          ))}
        </div>
      )}

      {editing && (
        <NpcModal
          campaignId={campaignId}
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["npcs", campaignId] });
            setEditing(null);
          }}
          onDeleted={() => {
            qc.invalidateQueries({ queryKey: ["npcs", campaignId] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TagChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: "0.72rem",
        padding: "0.25rem 0.6rem",
        background: active ? "var(--gold)" : "var(--surface2)",
        color: active ? "var(--bg, #1a1a1a)" : "var(--text)",
        border: `1px solid ${active ? "var(--gold)" : "var(--border)"}`,
        borderRadius: 12,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}
// Re-export STATUSES so the modal stays in lockstep on enum values.
export { STATUSES };
