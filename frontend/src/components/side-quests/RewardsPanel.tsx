import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import type { QuestStep } from "../../api/sideQuests";
import { itemsApi, type MagicItem } from "../../api/items";
import { QUEST_LIMITS, questItemKey } from "../../lib/sideQuests";
import { HINT } from "../homebrew/options";
import { IntInput } from "./fields";

/** A reward item by name. The step only stores its id. */
function ItemRow({ id, locked, onRemove }: { id: string; locked: boolean; onRemove: () => void }) {
  const { data, isError } = useQuery({
    queryKey: questItemKey(id),
    queryFn: () => itemsApi.get(id),
    staleTime: Infinity,
    retry: false,
  });
  const name = isError ? "An item that no longer exists" : (data?.name ?? "Loading…");
  return (
    <li style={{ display: "flex", alignItems: "center", gap: "0.5rem", minHeight: 36 }}>
      <span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontSize: "0.9375rem" }}>{name}</span>
      {!locked && (
        <button
          type="button"
          className="btn btn-ghost ql-s6-sq"
          aria-label={`Remove ${name}`}
          title="Remove"
          style={{ padding: "0.25rem 0.5rem", minHeight: 0, flexShrink: 0 }}
          onClick={onRemove}
        >
          <X size={16} aria-hidden />
        </button>
      )}
    </li>
  );
}

/** "Rewards when reached": gold, where negative is a cost, and up to five items from the catalog. */
export default function RewardsPanel({
  step,
  locked,
  onChange,
}: {
  step: QuestStep;
  locked: boolean;
  onChange: (patch: Partial<QuestStep>) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const q = search.trim();
  const { data: hits = [], isFetching } = useQuery({
    queryKey: ["item-search", search],
    queryFn: () => itemsApi.list({ q: q || undefined, kind: "all" }),
    enabled: !locked && q.length >= 2,
  });
  const full = step.item_ids.length >= QUEST_LIMITS.items;
  const shown = q.length >= 2 ? hits.filter((h) => !step.item_ids.includes(h.id)).slice(0, 8) : [];

  function add(item: MagicItem) {
    qc.setQueryData(questItemKey(item.id), item);
    onChange({ item_ids: [...step.item_ids, item.id] });
    setSearch("");
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "0.75rem",
        background: "var(--surface2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
      }}
    >
      <IntInput
        label="Gold"
        value={step.gp || null}
        min={QUEST_LIMITS.gpMin}
        max={QUEST_LIMITS.gpMax}
        placeholder="0"
        disabled={locked}
        hint="Negative is a cost. If they can't afford it, it takes what they have."
        onChange={(gp) => onChange({ gp: gp ?? 0 })}
      />

      <div>
        <div style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text2)", marginBottom: "0.3rem" }}>
          Items
        </div>
        {step.item_ids.length > 0 ? (
          <ul style={{ listStyle: "none", margin: "0 0 0.5rem", padding: 0 }}>
            {step.item_ids.map((id) => (
              <ItemRow
                key={id}
                id={id}
                locked={locked}
                onRemove={() => onChange({ item_ids: step.item_ids.filter((other) => other !== id) })}
              />
            ))}
          </ul>
        ) : (
          locked && <p style={{ ...HINT, marginTop: 0 }}>None.</p>
        )}
        {!locked &&
          (full ? (
            <p style={{ ...HINT, marginTop: 0 }}>Five items is the most one step can give.</p>
          ) : (
            <>
              <input
                type="search"
                aria-label="Search the item catalog"
                placeholder="Search the catalog for an item"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%" }}
              />
              {q.length >= 2 && (
                <ul style={{ listStyle: "none", margin: "0.35rem 0 0", padding: 0 }}>
                  {shown.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: "100%", justifyContent: "flex-start", textAlign: "left", whiteSpace: "normal" }}
                        onClick={() => add(item)}
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                  {!shown.length && (
                    <li style={{ ...HINT, marginTop: 0 }}>{isFetching ? "Searching…" : "Nothing by that name."}</li>
                  )}
                </ul>
              )}
            </>
          ))}
      </div>
    </div>
  );
}
