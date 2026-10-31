/**
 * What's affecting you right now (Plan 128): the DM's conditions and any
 * exhaustion, each with one plain sentence. Sits near the top of the Now
 * screen (just under "Your turn" in a fight) and on the Character tab, so a
 * Frightened player sees it before they act, not three screens down.
 */
import { AlertTriangle } from "lucide-react";

import { usePlayer } from "./playerContext";
import { CONDITION_TEXT } from "./rules";
import { Panel } from "./ui";

export default function Conditions() {
  const { combat, help, pc } = usePlayer();
  // UX-001 — lasting conditions show between fights too (the server sends them).
  const list = [...(combat?.conditions ?? []), ...(pc.exhaustion ? ["exhaustion"] : [])];
  if (list.length === 0) return null;
  return (
    <Panel style={{ padding: "10px 12px", gap: 8, borderColor: "var(--amber)", background: "var(--amber-soft)" }}>
      <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 15, fontWeight: 600, color: "var(--amber-text)" }}>
        <AlertTriangle size={16} aria-hidden />
        {help === "teach" ? (list.length === 1 ? "Something is affecting you" : "Things affecting you") : "Conditions"}
      </h2>
      {list.map((c) => {
        const name = c === "exhaustion" ? `Exhaustion ${pc.exhaustion}` : c.charAt(0).toUpperCase() + c.slice(1);
        const text =
          c === "exhaustion"
            ? `Every d20 roll you make is ${(pc.exhaustion ?? 0) * 2} lower. A long rest removes a level.`
            : (CONDITION_TEXT[c.toLowerCase()] ?? "Ask the DM what this does.");
        return (
          <div key={c} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{name}</span>
            {help !== "numbers" && <span style={{ fontSize: 14, color: "var(--text2)" }}>{text}</span>}
          </div>
        );
      })}
      {help === "teach" && <span style={{ fontSize: 13, color: "var(--muted)" }}>The DM adds and removes these.</span>}
    </Panel>
  );
}
