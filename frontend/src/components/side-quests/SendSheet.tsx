import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Send } from "lucide-react";

import { charactersApi } from "../../api/characters";
import { crierApi } from "../../api/crier";
import { sideQuestsApi, type SideQuest, type SideQuestSendResult } from "../../api/sideQuests";
import { useIsCompact } from "../../hooks/useIsCompact";
import { QUEST_LIMITS } from "../../lib/sideQuests";
import { plural } from "../../lib/plural";
import FormFrame from "../homebrew/FormFrame";
import { ERR, HINT } from "../homebrew/options";

const CHECK_ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.6rem",
  minHeight: 44,
  margin: 0,
  fontSize: "1rem",
  cursor: "pointer",
};

const DEFAULT_PING = "You have a new side quest. Check your phone.";

/** Who gets the quest, and an optional Discord post through the Town Crier. */
export default function SendSheet({
  quest,
  onClose,
  onSent,
}: {
  quest: SideQuest;
  onClose: () => void;
  /** It went out. The sheet stays open only if Discord failed, to say so. */
  onSent: (result: SideQuestSendResult) => void;
}) {
  const campaignId = quest.campaign_id;
  const phone = useIsCompact(640);
  // The dice tray floats over the corner of a phone's sheet. Keep the buttons clear of it.
  const clearOfTray = phone ? 60 : 0;
  const { data: pcs = [], isLoading } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId),
  });
  const { data: allChannels = [] } = useQuery({
    queryKey: ["crier-channels", campaignId],
    queryFn: () => crierApi.listChannels(campaignId),
  });
  const { data: npcs = [] } = useQuery({
    queryKey: ["crier-npcs", campaignId],
    queryFn: () => crierApi.listNpcs(campaignId),
  });
  const channels = allChannels.filter((c) => c.configured);

  const [picked, setPicked] = useState<string[]>([]);
  const [ping, setPing] = useState(false);
  const [pickedChannel, setPickedChannel] = useState("");
  const [pickedNpc, setPickedNpc] = useState("");
  const [content, setContent] = useState(DEFAULT_PING);
  const [pingError, setPingError] = useState<string | null>(null);

  // No pick (or a removed one) means the first one. Derived, not set from an effect.
  const channelId = channels.some((c) => c.id === pickedChannel) ? pickedChannel : (channels[0]?.id ?? "");
  const npcId = npcs.some((n) => n.id === pickedNpc) ? pickedNpc : (npcs[0]?.id ?? "");
  const canPing = channels.length > 0 && npcs.length > 0;
  const pingOn = ping && canPing;

  const already = new Set(quest.runs.map((r) => r.character_id));
  const fresh = pcs.filter((pc) => !already.has(pc.id));
  const everyone = fresh.length > 0 && fresh.every((pc) => picked.includes(pc.id));

  const send = useMutation({
    mutationFn: () =>
      sideQuestsApi.send(
        quest.id,
        picked,
        pingOn ? { channel_id: channelId, npc_id: npcId, content: content.trim() } : undefined,
      ),
    onSuccess: (result) => {
      onSent(result);
      if (result.ping_error) setPingError(result.ping_error);
      else onClose();
    },
  });

  function toggle(id: string) {
    setPicked((now) => (now.includes(id) ? now.filter((other) => other !== id) : [...now, id]));
  }

  if (pingError) {
    return (
      <FormFrame
        title="The quest went out"
        onClose={onClose}
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: clearOfTray }}>
            <button type="button" className="btn btn-primary" style={{ minHeight: 44 }} onClick={onClose}>
              Done
            </button>
          </div>
        }
      >
        <p style={{ marginTop: 0 }}>It&rsquo;s on their phones, but the Discord post failed.</p>
        <p role="alert" style={{ ...ERR, fontSize: "0.9375rem", overflowWrap: "anywhere" }}>
          {pingError}
        </p>
      </FormFrame>
    );
  }

  const canSend = picked.length > 0 && !send.isPending && (!pingOn || !!content.trim());

  return (
    <FormFrame
      title="Send this quest"
      onClose={onClose}
      footer={
        <>
          {send.error && (
            <p role="alert" style={{ ...ERR, margin: "0 0 0.5rem", fontSize: "0.875rem" }}>
              {send.error.message}
            </p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end", paddingRight: clearOfTray }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ minHeight: 44 }}
              disabled={send.isPending}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 44 }}
              disabled={!canSend}
              onClick={() => send.mutate()}
            >
              <Send size={16} aria-hidden />
              {send.isPending
                ? "Sending…"
                : picked.length
                  ? `Send to ${plural(picked.length, "character")}`
                  : "Send"}
            </button>
          </div>
        </>
      }
    >
      <p style={{ ...HINT, margin: "0 0 0.75rem", fontSize: "0.9375rem" }}>
        Each character plays it alone, on their own phone. After this you can still fix words and pictures, but not
        links, checks or rewards.
      </p>

      {isLoading && <p className="text-muted">Loading characters…</p>}
      {!isLoading && !pcs.length && <p>This campaign has no characters yet, so there&rsquo;s nobody to send it to.</p>}

      {fresh.length > 1 && (
        <label style={{ ...CHECK_ROW, fontWeight: 600, borderBottom: "1px solid var(--border)" }}>
          <input
            type="checkbox"
            checked={everyone}
            onChange={() => setPicked(everyone ? [] : fresh.map((pc) => pc.id))}
          />
          Everyone
        </label>
      )}

      {pcs.map((pc) => {
        const has = already.has(pc.id);
        return (
          <label key={pc.id} style={{ ...CHECK_ROW, cursor: has ? "default" : "pointer" }}>
            <input
              type="checkbox"
              checked={has || picked.includes(pc.id)}
              disabled={has}
              onChange={() => toggle(pc.id)}
            />
            <span className="story" style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere", fontSize: "1.0625rem" }}>
              {pc.character_name}
            </span>
            {has && <span className="pill">Already sent</span>}
          </label>
        );
      })}

      {canPing && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid var(--border)", paddingTop: "0.5rem" }}>
          <label style={CHECK_ROW}>
            <input type="checkbox" checked={ping} onChange={(e) => setPing(e.target.checked)} />
            Also post on Discord
          </label>
          {ping && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", marginTop: "0.4rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
                <label style={{ margin: 0 }}>
                  Channel
                  <select
                    style={{ marginTop: "0.3rem" }}
                    value={channelId}
                    onChange={(e) => setPickedChannel(e.target.value)}
                  >
                    {channels.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label style={{ margin: 0 }}>
                  Speaking as
                  <select style={{ marginTop: "0.3rem" }} value={npcId} onChange={(e) => setPickedNpc(e.target.value)}>
                    {npcs.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label style={{ margin: 0 }}>
                What it says
                <textarea
                  rows={2}
                  maxLength={QUEST_LIMITS.ping}
                  style={{ marginTop: "0.3rem", width: "100%" }}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </label>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--amber-text)" }}>
                This posts in a shared channel, so don&rsquo;t name a private quest.
              </p>
            </div>
          )}
        </div>
      )}
    </FormFrame>
  );
}
