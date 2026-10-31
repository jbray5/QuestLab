/**
 * "What should we call you?" (Plan 128). A character the DM made, or one
 * claimed from the join page, can arrive with no player name ("Not assigned
 * yet"). The phone asks once, saves the answer on the character so the DM's
 * party card shows who picked it up, and never greets anyone as "Not assigned yet".
 *
 * `NameField` is the question itself (used by the first-open screen);
 * the default export is the one-time card on the Now screen for phones that
 * were already set up before the question existed.
 */
import { useState } from "react";

import { playApi } from "../../api/play";
import { friendlyApiError } from "../../api/errors";
import { markNameAsked, nameAsked } from "./linkMemory";
import { usePlayer } from "./playerContext";
import { realPlayerName } from "./rules";
import { Panel } from "./ui";

export function NameField({ value, onChange, characterName }: { value: string; onChange: (v: string) => void; characterName: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label htmlFor="ql-player-name" style={{ margin: 0, fontWeight: 600, fontSize: 17, color: "var(--text)" }}>
        What should we call you?
      </label>
      <span id="ql-player-name-hint" style={{ fontSize: 14, color: "var(--text2)" }}>
        Your first name or initials is plenty. Your DM sees it next to <span className="story">{characterName}</span>.
      </span>
      <input
        id="ql-player-name"
        aria-describedby="ql-player-name-hint"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={100}
        autoComplete="given-name"
        placeholder="Your name"
        style={{ minHeight: 48, fontSize: 17 }}
      />
    </div>
  );
}

export default function NamePrompt() {
  const { pc, pcId, refresh } = usePlayer();
  const [hidden, setHidden] = useState(() => nameAsked(pcId));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (hidden || realPlayerName(pc.player_name)) return null;

  const done = () => {
    markNameAsked(pcId);
    setHidden(true);
  };
  async function save() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    setErr(null);
    try {
      await playApi.setPlayerName(pcId, n);
      done();
      refresh();
    } catch (e) {
      setErr(friendlyApiError((e as Error).message, "That didn't save. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel tone="inset" style={{ gap: 10 }}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        <NameField value={name} onChange={setName} characterName={pc.character_name} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={!name.trim() || busy} style={{ minHeight: 44, flex: "1 1 120px" }}>
            {busy ? "Saving…" : "Save"}
          </button>
          <button type="button" className="btn btn-ghost" onClick={done} style={{ minHeight: 44 }}>
            Not now
          </button>
        </div>
        {err && (
          <span role="alert" style={{ fontSize: 14, color: "var(--danger-text)" }}>
            {err}
          </span>
        )}
      </form>
    </Panel>
  );
}
