import { useState } from "react";

import type { TableToken } from "../../api/types";

/**
 * What is true of a creature right now, beyond its hit points (Plan 114).
 *
 * A session hands out states the rules have no column for: Mira is Large for
 * the evening, Edrik is Tiny and riding somebody, Nya's wisdom is 24 and her
 * intelligence is 4. The combatant row cannot hold them — it only exists while
 * a fight is running — so they live on the token, which survives the whole
 * session and every map change.
 *
 * Two levers per token: how big it stands, and a short list of labels. Both
 * are player-visible by design; a size and a condition are public at any
 * table, and the label is typed by the DM so they choose what the room reads.
 */
interface Props {
  tokens: TableToken[];
  /** Write the whole token list back — the table PATCH replaces it wholesale. */
  onWrite: (tokens: TableToken[]) => void;
}

/** The sizes a creature comes in, and how many squares each stands on. */
const SIZES: [string, number][] = [
  ["Tiny", 0.5],
  ["Small", 0.75],
  ["Med", 1],
  ["Large", 2],
  ["Huge", 3],
];

export default function TokenStates({ tokens, onWrite }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const subjects = tokens.filter((t) => t.kind !== "light" && t.crowd == null);
  if (subjects.length === 0) return null;

  function write(id: string, change: Partial<TableToken>) {
    onWrite(tokens.map((t) => (t.id === id ? { ...t, ...change } : t)));
  }

  /** Commit the typed labels: comma-separated, trimmed, empties dropped. */
  function commitEffects(tok: TableToken) {
    const text = draft[tok.id];
    if (text === undefined) return;
    const list = text
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 6);
    setDraft((d) => {
      const next = { ...d };
      delete next[tok.id];
      return next;
    });
    write(tok.id, { effects: list.length ? list : null });
  }

  const btn: React.CSSProperties = { fontSize: "0.62rem", padding: "0.08rem 0.3rem" };

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "5px 8px" }}>
      <button
        className="btn btn-ghost"
        style={{ ...btn, fontSize: "0.7rem" }}
        onClick={() => setOpen((o) => !o)}
        title="Size and free-text states — both show to the players"
      >
        {open ? "▾" : "▸"} States
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 5 }}>
          {subjects.map((tok) => (
            <div key={tok.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.65rem" }}>
              <span style={{ minWidth: 92, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {tok.label}
              </span>
              <span style={{ display: "flex", gap: 2 }}>
                {SIZES.map(([name, n]) => (
                  <button
                    key={name}
                    className={Math.abs((tok.size || 1) - n) < 0.01 ? "btn" : "btn btn-ghost"}
                    style={btn}
                    title={`Stands ${name}`}
                    onClick={() => write(tok.id, { size: n })}
                  >
                    {name}
                  </button>
                ))}
              </span>
              <input
                value={draft[tok.id] ?? (tok.effects ?? []).join(", ")}
                placeholder="states, comma separated"
                onChange={(e) => setDraft((d) => ({ ...d, [tok.id]: e.target.value }))}
                onBlur={() => commitEffects(tok)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                style={{
                  flex: 1,
                  minWidth: 90,
                  fontSize: "0.65rem",
                  padding: "1px 5px",
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 5,
                  color: "var(--text)",
                }}
              />
            </div>
          ))}
          <small style={{ color: "var(--muted)", fontSize: "0.6rem" }}>
            Players see both. Keep labels short: “Large”, “WIS 24”, “hears music”.
          </small>
        </div>
      )}
    </div>
  );
}
