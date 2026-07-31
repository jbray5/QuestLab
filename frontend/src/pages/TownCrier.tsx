import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  MAX_CONTENT,
  MAX_EMBED,
  colorToCss,
  cssToColor,
  crierApi,
  type CrierChannel,
  type CrierNpc,
} from "../api/crier";

/**
 * TownCrier — the DM's between-sessions NPC poster (Plan 56),
 * campaigns/:campaignId/crier.
 *
 * Pick a channel, pick a voice, write, check the preview, send. Discord
 * applies the per-message username/avatar override, so one webhook per
 * channel speaks as every NPC on the roster.
 *
 * The webhook URL never arrives in this bundle — the server sends
 * `configured` + a masked tail, and the URL field below is write-only.
 */

/** Discord's own surface colours, so the preview reads as the real thing. */
const DISCORD = {
  bg: "#313338",
  text: "#dbdee1",
  name: "#f2f3f5",
  muted: "#949ba4",
  embedBg: "#2b2d31",
};

function initials(name: string): string {
  return name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();
}

/** Renders a message the way Discord will render it. */
function Preview({
  npc,
  content,
  embed,
}: {
  npc: CrierNpc | undefined;
  content: string;
  embed: string;
}) {
  const accent = npc ? colorToCss(npc.embed_color) : "#4f545c";
  const now = new Date().toLocaleString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background: DISCORD.bg,
        borderRadius: 8,
        padding: "1rem",
        fontFamily:
          "'gg sans', 'Noto Sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        color: DISCORD.text,
        fontSize: "0.95rem",
        lineHeight: 1.375,
      }}
    >
      <div style={{ display: "flex", gap: "1rem" }}>
        {npc?.avatar_url ? (
          <img
            src={npc.avatar_url}
            alt=""
            width={40}
            height={40}
            style={{ borderRadius: "50%", flexShrink: 0, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              flexShrink: 0,
              background: accent,
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
          >
            {npc ? initials(npc.name) : "?"}
          </div>
        )}

        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
            <span style={{ color: DISCORD.name, fontWeight: 500 }}>
              {npc?.name || "(pick an NPC)"}
            </span>
            {/* Webhook posts always carry this tag — players will see it. */}
            <span
              style={{
                background: "#5865f2",
                color: "#fff",
                fontSize: "0.625rem",
                fontWeight: 500,
                borderRadius: 3,
                padding: "0 0.275rem",
                lineHeight: "0.9375rem",
              }}
            >
              APP
            </span>
            <span style={{ color: DISCORD.muted, fontSize: "0.75rem" }}>{now}</span>
          </div>

          {content.trim() && (
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 2 }}>
              {content}
            </div>
          )}

          {embed.trim() && (
            <div
              style={{
                marginTop: 8,
                background: DISCORD.embedBg,
                borderRadius: 4,
                borderLeft: `4px solid ${accent}`,
                padding: "0.5rem 1rem 1rem 0.75rem",
                maxWidth: 520,
              }}
            >
              <div
                style={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: "0.875rem",
                  marginTop: 8,
                }}
              >
                {embed}
              </div>
            </div>
          )}

          {!content.trim() && !embed.trim() && (
            <div style={{ color: DISCORD.muted, fontStyle: "italic", marginTop: 2 }}>
              (nothing to post yet)
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CharCount({ used, max }: { used: number; max: number }) {
  const over = used > max;
  return (
    <span
      style={{
        fontSize: "0.72rem",
        color: over ? "var(--danger, #d9534f)" : "var(--muted)",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {used}/{max}
    </span>
  );
}

function RosterEditor({
  campaignId,
  npcs,
  onChanged,
}: {
  campaignId: string;
  npcs: CrierNpc[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <div>
      <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
        Roster
      </div>

      {npcs.map((n) => (
        <div key={n.id} className="flex" style={{ gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
          <input
            className="input"
            style={{ flex: 1 }}
            defaultValue={n.name}
            onBlur={async (e) => {
              if (e.target.value.trim() && e.target.value !== n.name) {
                await crierApi.updateNpc(n.id, { name: e.target.value.trim() });
                onChanged();
              }
            }}
          />
          <input
            type="color"
            title="Embed accent colour"
            value={colorToCss(n.embed_color)}
            style={{ width: 36, height: 32, padding: 0, border: "none", background: "none" }}
            onChange={async (e) => {
              await crierApi.updateNpc(n.id, { embed_color: cssToColor(e.target.value) });
              onChanged();
            }}
          />
          <input
            className="input"
            style={{ flex: 1.4 }}
            placeholder="avatar URL (absolute)"
            defaultValue={n.avatar_url ?? ""}
            onBlur={async (e) => {
              if (e.target.value !== (n.avatar_url ?? "")) {
                await crierApi.updateNpc(n.id, { avatar_url: e.target.value.trim() || null });
                onChanged();
              }
            }}
          />
          <button
            className="btn btn-ghost"
            title="Remove identity"
            onClick={async () => {
              if (confirm(`Remove "${n.name}" from the roster?`)) {
                await crierApi.removeNpc(n.id);
                onChanged();
              }
            }}
          >
            ✕
          </button>
        </div>
      ))}

      <form
        className="flex"
        style={{ gap: "0.5rem", marginTop: "0.6rem" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await crierApi.createNpc(campaignId, { name: name.trim() });
          setName("");
          onChanged();
        }}
      >
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="Add an NPC identity…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn" type="submit">
          Add
        </button>
      </form>

      <p className="text-muted" style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
        Avatar URLs must be publicly reachable — Discord fetches the image itself.
        Leave blank and the post uses the webhook's default face.
      </p>
    </div>
  );
}

function ChannelEditor({
  campaignId,
  channels,
  onChanged,
}: {
  campaignId: string;
  channels: CrierChannel[];
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
        Channels
      </div>

      {channels.map((c) => (
        <div key={c.id} className="flex" style={{ gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
          <input
            className="input"
            style={{ flex: 1 }}
            defaultValue={c.label}
            onBlur={async (e) => {
              if (e.target.value.trim() && e.target.value !== c.label) {
                await crierApi.updateChannel(c.id, { label: e.target.value.trim() });
                onChanged();
              }
            }}
          />
          <span className="text-muted" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>
            {c.configured ? `webhook ✓ ${c.url_hint}` : "not configured"}
          </span>
          <input
            className="input"
            style={{ flex: 1 }}
            type="password"
            placeholder="replace webhook URL…"
            onBlur={async (e) => {
              if (e.target.value.trim()) {
                await crierApi.updateChannel(c.id, { webhook_url: e.target.value.trim() });
                e.target.value = "";
                onChanged();
              }
            }}
          />
          <button
            className="btn btn-ghost"
            title="Remove channel"
            onClick={async () => {
              if (confirm(`Remove "${c.label}"? The sent-log keeps its history.`)) {
                await crierApi.removeChannel(c.id);
                onChanged();
              }
            }}
          >
            ✕
          </button>
        </div>
      ))}

      <form
        className="flex"
        style={{ gap: "0.5rem", marginTop: "0.6rem" }}
        onSubmit={async (e) => {
          e.preventDefault();
          setErr(null);
          if (!label.trim() || !url.trim()) return;
          try {
            await crierApi.createChannel(campaignId, {
              label: label.trim(),
              webhook_url: url.trim(),
            });
            setLabel("");
            setUrl("");
            onChanged();
          } catch (e2) {
            setErr(e2 instanceof Error ? e2.message : "Could not add the channel.");
          }
        }}
      >
        <input
          className="input"
          style={{ flex: 1 }}
          placeholder="#channel-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="input"
          style={{ flex: 2 }}
          type="password"
          placeholder="https://discord.com/api/webhooks/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn" type="submit">
          Add
        </button>
      </form>

      {err && (
        <p style={{ color: "var(--danger, #d9534f)", fontSize: "0.8rem", marginTop: "0.4rem" }}>
          {err}
        </p>
      )}
      <p className="text-muted" style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
        Create webhooks in Discord: channel → Edit Channel → Integrations → Webhooks →
        New Webhook → Copy URL. One per channel is enough for every NPC.
        The URL is stored server-side and never sent back to this page.
      </p>
    </div>
  );
}

export default function TownCrier() {
  const { campaignId = "" } = useParams();
  const qc = useQueryClient();

  const { data: channels = [] } = useQuery({
    queryKey: ["crier-channels", campaignId],
    queryFn: () => crierApi.listChannels(campaignId),
    enabled: !!campaignId,
  });
  const { data: npcs = [] } = useQuery({
    queryKey: ["crier-npcs", campaignId],
    queryFn: () => crierApi.listNpcs(campaignId),
    enabled: !!campaignId,
  });
  const { data: posts = [] } = useQuery({
    queryKey: ["crier-posts", campaignId],
    queryFn: () => crierApi.listPosts(campaignId),
    enabled: !!campaignId,
  });

  const [channelId, setChannelId] = useState("");
  const [npcId, setNpcId] = useState("");
  const [content, setContent] = useState("");
  const [embed, setEmbed] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // Default the pickers once the roster loads, so the common case is
  // "type and send" with no selecting.
  useEffect(() => {
    if (!channelId && channels.length) setChannelId(channels[0].id);
  }, [channels, channelId]);
  useEffect(() => {
    if (!npcId && npcs.length) setNpcId(npcs[0].id);
  }, [npcs, npcId]);

  const npc = useMemo(() => npcs.find((n) => n.id === npcId), [npcs, npcId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["crier-channels", campaignId] });
    qc.invalidateQueries({ queryKey: ["crier-npcs", campaignId] });
  };

  const send = useMutation({
    mutationFn: () =>
      crierApi.send(campaignId, {
        channel_id: channelId,
        npc_id: npcId,
        content: content.trim() || null,
        embed_description: embed.trim() || null,
      }),
    onSuccess: (p) => {
      setContent("");
      setEmbed("");
      setFlash(`Posted to ${p.channel_label} as ${p.npc_name}.`);
      qc.invalidateQueries({ queryKey: ["crier-posts", campaignId] });
    },
    onError: (e: unknown) => {
      setFlash(e instanceof Error ? `Not sent — ${e.message}` : "Not sent.");
      qc.invalidateQueries({ queryKey: ["crier-posts", campaignId] });
    },
  });

  const overLimit = content.length > MAX_CONTENT || embed.length > MAX_EMBED;
  const canSend =
    !!channelId && !!npcId && !!(content.trim() || embed.trim()) && !overLimit && !send.isPending;

  return (
    <div>
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>The Town Crier</h1>
        <button className="btn btn-ghost" onClick={() => setShowSettings((s) => !s)}>
          {showSettings ? "Done" : "Channels & roster"}
        </button>
      </div>
      <p className="text-muted" style={{ marginTop: "-0.5rem" }}>
        Post to Discord in an NPC's voice. One webhook per channel carries every identity.
      </p>

      {showSettings && (
        <div className="card" style={{ marginBottom: "1rem", display: "grid", gap: "1.5rem" }}>
          <ChannelEditor campaignId={campaignId} channels={channels} onChanged={refresh} />
          <RosterEditor campaignId={campaignId} npcs={npcs} onChanged={refresh} />
        </div>
      )}

      {!channels.length && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          No channels yet. Open <b>Channels &amp; roster</b> and paste a Discord webhook URL.
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        {/* Composer */}
        <div className="card">
          <div className="flex" style={{ gap: "0.5rem", marginBottom: "0.75rem" }}>
            <select
              className="input"
              style={{ flex: 1 }}
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="">Channel…</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              className="input"
              style={{ flex: 1 }}
              value={npcId}
              onChange={(e) => setNpcId(e.target.value)}
            >
              <option value="">Speaking as…</option>
              {npcs.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <label className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Message
            </label>
            <CharCount used={content.length} max={MAX_CONTENT} />
          </div>
          <textarea
            className="input"
            rows={4}
            style={{ width: "100%", marginBottom: "0.75rem" }}
            placeholder="Plain text — lands as a normal message."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
            <label className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Embed (the boxed, coloured one)
            </label>
            <CharCount used={embed.length} max={MAX_EMBED} />
          </div>
          <textarea
            className="input"
            rows={6}
            style={{ width: "100%" }}
            placeholder="In-character prose reads well here — it gets the NPC's accent colour."
            value={embed}
            onChange={(e) => setEmbed(e.target.value)}
          />

          <div className="flex" style={{ gap: "0.75rem", alignItems: "center", marginTop: "0.9rem" }}>
            <button className="btn" disabled={!canSend} onClick={() => send.mutate()}>
              {send.isPending ? "Sending…" : "Send to Discord"}
            </button>
            {flash && (
              <span
                style={{
                  fontSize: "0.85rem",
                  color: flash.startsWith("Not sent") ? "var(--danger, #d9534f)" : "var(--muted)",
                }}
              >
                {flash}
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: "0.72rem", marginTop: "0.5rem" }}>
            Sends immediately and cannot be unsent from here — delete in Discord if you misfire.
          </p>
        </div>

        {/* Preview */}
        <div>
          <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.4rem" }}>
            As Discord will render it
          </div>
          <Preview npc={npc} content={content} embed={embed} />
        </div>
      </div>

      {/* Sent log */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <div className="text-muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem" }}>
          Sent log
        </div>
        {!posts.length && <div className="text-muted">Nothing posted yet.</div>}
        {posts.map((p) => (
          <div
            key={p.id}
            style={{
              borderTop: "1px solid var(--border, #2a2a2a)",
              padding: "0.5rem 0",
              fontSize: "0.85rem",
            }}
          >
            <div className="flex" style={{ gap: "0.5rem", alignItems: "baseline" }}>
              <b>{p.npc_name}</b>
              <span className="text-muted">{p.channel_label}</span>
              <span className="text-muted" style={{ fontSize: "0.72rem" }}>
                {new Date(p.sent_at).toLocaleString()}
              </span>
              {p.status === "failed" && (
                <span style={{ color: "var(--danger, #d9534f)", fontSize: "0.72rem" }}>failed</span>
              )}
            </div>
            <div className="text-muted" style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>
              {(p.content || p.embed_description || "").slice(0, 240)}
            </div>
            {p.error && (
              <div style={{ color: "var(--danger, #d9534f)", fontSize: "0.75rem" }}>{p.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
