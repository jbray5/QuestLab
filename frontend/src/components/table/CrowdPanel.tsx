import { useState } from "react";

import { tableApi } from "../../api/table";
import type { TableToken } from "../../api/types";

/**
 * The festival crowd, as the DM drives it (Plan 114, Session 8).
 *
 * A crowd knot is one token standing for a small group of bystanders. When the
 * herd goes through them people are knocked down, and a bystander left on the
 * ground for a full round dies. The players can see every one of these numbers
 * on their own screen — that is the whole mechanic of the scene, so the DM
 * needs them movable in one click while a six-round timer runs.
 *
 * Nothing is computed here. Every button is a call to the table service, which
 * owns the arithmetic; this panel only shows what came back.
 */
interface Props {
  sessionId: string;
  tokens: TableToken[];
  lost: number;
  /** Re-read the table after the server has moved the numbers. */
  onChanged: () => void;
}

export default function CrowdPanel({ sessionId, tokens, lost, onChanged }: Props) {
  const [busy, setBusy] = useState(false);
  const knots = tokens.filter((t) => t.crowd != null);
  if (knots.length === 0) return null;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await tableApi.crowd(sessionId, body);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  const standing = knots.reduce((n, k) => n + (k.crowd ?? 0), 0);
  const down = knots.reduce((n, k) => n + (k.hurt ?? 0) + (k.dying ?? 0), 0);
  const btn: React.CSSProperties = { fontSize: "0.62rem", padding: "0.1rem 0.34rem" };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "6px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem" }}>
        <b style={{ color: "var(--gold)" }}>Crowd</b>
        <span style={{ color: "var(--muted)" }}>
          {standing} standing · {down} down
        </span>
        <span style={{ marginLeft: "auto", color: "#ff6b57", fontWeight: 700 }}>Lost {lost}</span>
        <button
          className="btn"
          style={btn}
          disabled={busy}
          title="Anyone who went down last round and was not reached dies now"
          onClick={() => void act({ op: "resolve" })}
        >
          End round ⏭
        </button>
      </div>
      {knots.map((k) => (
        <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: "0.66rem" }}>
          <span style={{ minWidth: 74, color: "var(--muted)" }}>{k.label || k.id}</span>
          <b style={{ minWidth: 18, textAlign: "right" }}>{k.crowd ?? 0}</b>
          {!!k.hurt && <span style={{ color: "#e8a33d" }} title="down this round">◒{k.hurt}</span>}
          {!!k.dying && <span style={{ color: "#ff6b57" }} title="dies at the end of this round">◕{k.dying}</span>}
          {!!k.dead && <span style={{ color: "#6a6a78" }} title="lost">✝{k.dead}</span>}
          <span style={{ marginLeft: "auto", display: "flex", gap: 3 }}>
            <button
              className="btn btn-ghost"
              style={btn}
              disabled={busy || !k.crowd}
              title="One bystander goes under the hooves"
              onClick={() => void act({ op: "trample", token_id: k.id, n: 1 })}
            >
              Trample
            </button>
            <button
              className="btn btn-ghost"
              style={btn}
              disabled={busy || !k.crowd}
              title="The stag: two at once"
              onClick={() => void act({ op: "trample", token_id: k.id, n: 2 })}
            >
              ×2
            </button>
            <button
              className="btn btn-ghost"
              style={{ ...btn, color: "#7fd98a" }}
              disabled={busy || !(k.hurt || k.dying)}
              title="Someone reaches them and pulls them clear"
              onClick={() => void act({ op: "save", token_id: k.id })}
            >
              Save
            </button>
          </span>
        </div>
      ))}
    </div>
  );
}
