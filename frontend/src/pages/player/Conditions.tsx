/**
 * What's affecting you right now (Plan 128): the DM's conditions and any
 * exhaustion, each with one plain sentence. Sits near the top of the Now
 * screen (just under "Your turn" in a fight) and on the Character tab, so a
 * Frightened player sees it before they act, not three screens down.
 *
 * Plan 131 — in a 2014 campaign the sentences follow the 2014 rules, and
 * exhaustion lists what each level does instead of a number off your rolls.
 */
import { AlertTriangle } from "lucide-react";

import { exhaustion2014Effects } from "../../lib/conditions";
import { rulesetOf } from "../../lib/ruleset";
import { usePlayer } from "./playerContext";
import { conditionText } from "./rules";
import { Panel } from "./ui";

/** Exhaustion in a sentence: the 2014 effects that add up, or the 2024 −2 per level. */
function exhaustionSentence(level: number, old: boolean): string {
  if (!old) return `Every d20 roll you make is ${level * 2} lower. A long rest removes a level.`;
  if (level >= 6) return "Exhaustion 6 means death. Tell the DM.";
  const effects = exhaustion2014Effects(level);
  const line = effects.join(", ").replace(/, ([^,]*)$/, " and $1");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}. A long rest, with food and drink, removes a level.`;
}

export default function Conditions() {
  const { combat, help, pc } = usePlayer();
  const old = rulesetOf(pc.ruleset) === "2014";
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
            ? exhaustionSentence(pc.exhaustion ?? 0, old)
            : (conditionText(c, old ? "2014" : "2024") ?? "Ask the DM what this does.");
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
