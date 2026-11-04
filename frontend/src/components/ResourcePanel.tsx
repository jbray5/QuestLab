import { useState } from "react";
import { Minus, Pencil, Plus, X } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { DieSize } from "../api/homebrew";
import {
  MAX_RESOURCE_USES,
  resourcesApi,
  type CharacterResource,
  type CharacterResourceInput,
  type ResourceRecovery,
} from "../api/resources";
import { useIsCompact } from "../hooks/useIsCompact";
import { PANEL_ROW_STYLE, REMOVE_BTN, SMALL_BTN, pipStyle } from "./character-sheet/panelStyles";

/**
 * Counters on the DM's sheet (Plan 135), inside the Features panel.
 *
 * "Superiority Dice · 4 of 5 · d10": tap a filled dot to spend one, a hollow dot (or the +)
 * to give one back. Counters from the character's homebrew subclass grow with its level and
 * are changed in the subclass; hand-made ones (a book subclass's dice, an NPC's pool) are
 * added, edited and removed here. Rests refill them.
 */

const DICE: DieSize[] = ["d4", "d6", "d8", "d10", "d12"];
const MAX_CUSTOM = 12;
/** Above this many uses a counter reads better as a number than as a row of dots. */
const POOL_AT = 10;

const RECOVERY_LABEL: Record<ResourceRecovery, string> = {
  short: "short rest",
  long: "long rest",
  none: "by hand",
};
const RECOVERY_HELP: Record<ResourceRecovery, string> = {
  short: "All uses come back after a short or long rest",
  long: "Uses come back after a long rest",
  none: "Never refills on a rest: give uses back by hand",
};
const RECOVERY_PICKS: [ResourceRecovery, string][] = [
  ["short", "Short or long rest"],
  ["long", "Long rest"],
  ["none", "Never (by hand)"],
];

interface Draft {
  name: string;
  uses: string;
  die: DieSize | "";
  recovery: ResourceRecovery;
  notes: string;
}

const BLANK: Draft = { name: "", uses: "3", die: "", recovery: "long", notes: "" };

export default function ResourcePanel({
  characterId,
  characterName,
  readOnly = false,
}: {
  characterId: string;
  characterName: string;
  readOnly?: boolean;
}) {
  const qc = useQueryClient();
  const phone = useIsCompact(640);
  // Under "features", so a rest or a features refresh re-reads the counters too.
  const key = ["features", characterId, "counters"];
  const { data: counters = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => resourcesApi.list(characterId),
  });
  // null: no form open; "new": the add form; an id: that counter's edit form.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const spend = useMutation({
    mutationFn: ({ id, n }: { id: string; n: number }) => resourcesApi.spend(characterId, id, n),
    onSuccess: refresh,
  });
  const giveBack = useMutation({
    mutationFn: ({ id, n }: { id: string; n: number }) => resourcesApi.restore(characterId, id, n),
    onSuccess: refresh,
  });
  const save = useMutation({
    mutationFn: ({ id, body }: { id: string | null; body: CharacterResourceInput }) =>
      id ? resourcesApi.update(characterId, id, body) : resourcesApi.create(characterId, body),
    onSuccess: () => {
      closeForm();
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => resourcesApi.remove(characterId, id),
    onSuccess: refresh,
    onError: (e: Error) => setError(e.message),
  });

  const busy = readOnly || spend.isPending || giveBack.isPending;
  const customCount = counters.filter((c) => c.source === "custom").length;
  const problems = checkDraft(draft, counters, editing);
  const shown = tried ? problems : {};

  function openForm(target: CharacterResource | null) {
    setEditing(target ? target.id : "new");
    setDraft(
      target
        ? {
            name: target.name,
            uses: String(target.max_uses),
            die: target.die ?? "",
            recovery: target.recovery,
            notes: target.notes ?? "",
          }
        : BLANK,
    );
    setTried(false);
    setError(null);
  }

  function closeForm() {
    setEditing(null);
    setTried(false);
    setError(null);
  }

  function submit() {
    setTried(true);
    if (Object.keys(problems).length > 0) return;
    save.mutate({
      id: editing === "new" ? null : editing,
      body: {
        name: draft.name.trim(),
        max_uses: Number(draft.uses),
        die: draft.die || null,
        recovery: draft.recovery,
        notes: draft.notes.trim() || null,
      },
    });
  }

  if (readOnly && counters.length === 0) return null;

  const tap = phone ? 44 : undefined;
  const smallBtn = { ...SMALL_BTN, minHeight: tap, minWidth: tap };

  function renderUses(c: CharacterResource) {
    const left = Math.max(0, c.max_uses - c.uses_spent);
    if (c.max_uses > POOL_AT) {
      return (
        <div style={{ display: "flex", gap: "0.3rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={smallBtn}
            disabled={busy || left <= 0}
            onClick={() => spend.mutate({ id: c.id, n: 1 })}
            title="Spend one"
            aria-label={`Spend one ${c.name}`}
          >
            <Minus size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={smallBtn}
            disabled={busy || c.uses_spent <= 0}
            onClick={() => giveBack.mutate({ id: c.id, n: 1 })}
            title="Give one back"
            aria-label={`Give one ${c.name} back`}
          >
            <Plus size={14} />
          </button>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", gap: phone ? "0.1rem" : "0.25rem", alignItems: "center", flexWrap: "wrap" }}>
        {Array.from({ length: c.max_uses }).map((_, i) => {
          const on = i < left;
          return (
            <button
              key={i}
              type="button"
              onClick={() => (on ? spend : giveBack).mutate({ id: c.id, n: 1 })}
              disabled={busy}
              title={on ? "Tap to spend" : "Tap to give back"}
              aria-label={on ? `Spend one ${c.name}` : `Give one ${c.name} back`}
              className="ql-s6-pip"
              // A 44 px target on a phone around a small dot.
              style={
                phone
                  ? { width: 32, height: 44, padding: 0, border: "none", background: "transparent", cursor: "pointer", display: "grid", placeItems: "center" }
                  : pipStyle(on, 13)
              }
            >
              {phone && <span aria-hidden style={pipStyle(on, 16)} />}
            </button>
          );
        })}
      </div>
    );
  }

  function renderRow(c: CharacterResource) {
    if (editing === c.id) return <div key={c.id}>{renderForm()}</div>;
    const left = Math.max(0, c.max_uses - c.uses_spent);
    return (
      <div key={c.id} style={{ ...PANEL_ROW_STYLE, flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 10rem", minWidth: 0, display: "flex", flexDirection: "column", gap: "0.1rem" }}>
          <span title={c.notes ?? undefined}>
            <span style={{ fontWeight: 500 }}>{c.name}</span>
            <span style={{ color: "var(--text2)" }}>
              {" · "}
              <span className="num">{left}</span> of <span className="num">{c.max_uses}</span>
              {c.die && (
                <>
                  {" · "}
                  <span className="num">{c.die}</span>
                </>
              )}
            </span>
          </span>
          {c.source === "subclass" && (
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
              From the subclass: it grows with level. Change it in Races, subclasses &amp; feats.
            </span>
          )}
          {c.source === "custom" && c.notes && (
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", overflowWrap: "anywhere" }}>{c.notes}</span>
          )}
        </span>

        {/* Uses, recovery and the edit buttons travel together, so a narrow screen wraps them as one. */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginLeft: "auto", flexWrap: "wrap" }}>
          {renderUses(c)}
          <span
            style={{ fontSize: "0.75rem", color: "var(--muted)", minWidth: 52, textAlign: "right" }}
            title={RECOVERY_HELP[c.recovery]}
          >
            {RECOVERY_LABEL[c.recovery]}
          </span>
          {!readOnly && c.source === "custom" && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ ...REMOVE_BTN, minHeight: tap, minWidth: tap }}
                onClick={() => openForm(c)}
                title="Edit this counter"
                aria-label={`Edit ${c.name}`}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ ...REMOVE_BTN, minHeight: tap, minWidth: tap }}
                onClick={() => {
                  if (window.confirm(`Remove the ${c.name} counter from ${characterName}?`)) remove.mutate(c.id);
                }}
                title="Remove this counter"
                aria-label={`Remove ${c.name}`}
              >
                <X size={15} />
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  function renderForm() {
    const isNew = editing === "new";
    const field = { minHeight: tap, fontSize: "0.875rem" };
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{
          border: "1px solid var(--border2)",
          borderRadius: 8,
          padding: "0.6rem",
          background: "var(--surface2)",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: phone ? "1fr" : "minmax(0, 2fr) minmax(0, 1fr)", gap: "0.5rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.8125rem", color: "var(--text2)", margin: 0 }}>
            Name
            <input
              value={draft.name}
              maxLength={80}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="e.g. Superiority Dice"
              aria-invalid={!!shown.name}
              style={field}
              autoFocus={!phone}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.8125rem", color: "var(--text2)", margin: 0 }}>
            How many
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_RESOURCE_USES}
              value={draft.uses}
              onChange={(e) => setDraft({ ...draft, uses: e.target.value })}
              aria-invalid={!!shown.uses}
              className="num"
              style={field}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.8125rem", color: "var(--text2)", margin: 0 }}>
            Die
            <select value={draft.die} onChange={(e) => setDraft({ ...draft, die: e.target.value as DieSize | "" })} style={field}>
              <option value="">No die</option>
              {DICE.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.8125rem", color: "var(--text2)", margin: 0 }}>
            Refills on
            <select
              value={draft.recovery}
              onChange={(e) => setDraft({ ...draft, recovery: e.target.value as ResourceRecovery })}
              style={field}
            >
              {RECOVERY_PICKS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: "0.2rem", fontSize: "0.8125rem", color: "var(--text2)", margin: 0 }}>
          <span>
            Notes <span style={{ color: "var(--muted)" }}>(optional)</span>
          </span>
          <input
            value={draft.notes}
            maxLength={300}
            onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            placeholder="What a use does, in your words"
            style={field}
          />
        </label>
        {[shown.name, shown.uses, error].filter(Boolean).map((msg) => (
          <p key={msg} style={{ margin: 0, fontSize: "0.8125rem", color: "var(--danger-text)" }}>
            {msg}
          </p>
        ))}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" style={{ ...SMALL_BTN, minHeight: tap ?? 32 }} disabled={save.isPending}>
            {isNew ? "Add counter" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" style={{ ...SMALL_BTN, minHeight: tap ?? 32 }} onClick={closeForm}>
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p style={{ margin: "0 0 0.35rem", fontSize: "0.8125rem", color: "var(--text2)", fontWeight: 600 }}>Counters</p>
      {isLoading && <p className="text-muted text-sm" style={{ margin: 0 }}>Loading…</p>}
      {!isLoading && counters.length === 0 && editing !== "new" && (
        <p className="text-muted text-sm" style={{ margin: "0 0 0.4rem" }}>
          Track anything with uses that the list above doesn't: a subclass's dice, a pool, charges.
        </p>
      )}
      {counters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>{counters.map(renderRow)}</div>
      )}
      {!readOnly && editing === "new" && <div style={{ marginTop: "0.4rem" }}>{renderForm()}</div>}
      {!readOnly && editing === null && error && (
        <p style={{ margin: "0.35rem 0 0", fontSize: "0.8125rem", color: "var(--danger-text)" }}>{error}</p>
      )}
      {!readOnly && editing === null && customCount < MAX_CUSTOM && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ ...SMALL_BTN, minHeight: tap, marginTop: "0.4rem" }}
          onClick={() => openForm(null)}
        >
          <Plus size={14} /> Add a counter
        </button>
      )}
    </div>
  );
}

/** The form's problems, as the server would say them (domain/character.py). */
function checkDraft(d: Draft, counters: CharacterResource[], editing: string | null): Record<string, string> {
  const p: Record<string, string> = {};
  const name = d.name.trim();
  if (!name) p.name = "Give the counter a name.";
  else if (name.length > 80) p.name = "The name is too long (80 characters at most).";
  else if (counters.some((c) => c.id !== editing && c.name.toLowerCase() === name.toLowerCase())) {
    p.name = `There's already a counter called ${name} on this sheet.`;
  }
  const n = Number(d.uses);
  if (!Number.isInteger(n) || n < 1 || n > MAX_RESOURCE_USES) p.uses = `How many: a whole number from 1 to ${MAX_RESOURCE_USES}.`;
  return p;
}
