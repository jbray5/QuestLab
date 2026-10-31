import { useMemo, useState } from "react";
import { Plus, Sparkles, UserRound } from "lucide-react";
import { AI_ON } from "../lib/flags";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type Npc,
  type NpcStatus,
  npcsApi,
} from "../api/npcs";
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
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", gap: "1rem", marginBottom: "1.25rem" }}
      >
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>NPCs</h1>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            The people your party meets more than once. Click a card to edit it.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>
          <Plus size={16} /> New NPC
        </button>
      </div>

      {AI_ON && (
        <div
          style={{
            display: "flex",
            gap: "0.6rem",
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: "1.25rem",
          }}
        >
          <input
            type="text"
            value={generateRole}
            onChange={(e) => setGenerateRole(e.target.value)}
            placeholder="e.g. corrupt guard captain"
            aria-label="Role for a generated NPC"
            style={{ flex: 1, minWidth: 180, maxWidth: 420, padding: "0.4rem 0.6rem" }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && generateRole.trim() && !generate.isPending) {
                generate.mutate();
              }
            }}
          />
          <button
            className="btn btn-secondary"
            onClick={() => generate.mutate()}
            disabled={!generateRole.trim() || generate.isPending}
            title="Ask Claude to invent an NPC matching this role"
          >
            {generate.isPending ? (
              "Conjuring…"
            ) : (
              <>
                <Sparkles size={16} /> Generate
              </>
            )}
          </button>
        </div>
      )}

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
          <span style={{ fontSize: "0.8125rem", color: "var(--muted)", alignSelf: "center" }}>
            Show:
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
        <div className="empty-state">
          <div className="empty-icon">
            <UserRound size={28} />
          </div>
          <p style={{ maxWidth: 460, margin: "0 auto" }}>
            Keep the innkeeper, the rival and the patron here, with what each one wants, knows
            and hides — ready to glance at mid-scene. Add the first with New NPC.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
            gap: "1rem",
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
      aria-pressed={active}
      style={{
        fontSize: "0.8125rem",
        padding: "0.2rem 0.7rem",
        background: active ? "var(--accent-active)" : "transparent",
        color: active ? "var(--accent-active-text)" : "var(--text2)",
        border: `1px solid ${active ? "var(--accent-line)" : "var(--border2)"}`,
        borderRadius: 999,
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
