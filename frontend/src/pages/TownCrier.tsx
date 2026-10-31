import { useMemo, useState, type CSSProperties } from "react";
import { Plus, Send, Settings2, X } from "lucide-react";
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
import { useIsCompact } from "../hooks/useIsCompact";

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
 * Lamplit + phones: Plan 123.
 */

/** A small sentence-case section label (Lamplit: no letter-spaced capitals). */
const SECTION_LABEL: CSSProperties = {
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "var(--text2)",
  marginBottom: "0.5rem",
};

/** Discord's own surface colours, so the preview reads as the real thing
 * (the one place this page leaves the Lamplit palette on purpose). */
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
          <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem 0.5rem", flexWrap: "wrap" }}>
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
        fontSize: "0.75rem",
        color: over ? "var(--danger-text)" : "var(--muted)",
      }}
      className="num"
    >
      {used}/{max}
    </span>
  );
}

/** An icon-only remove button; the caller asks before anything goes. */
function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-ghost"
      aria-label={label}
      title={label}
      style={{ padding: 0, minWidth: "2.375rem", flexShrink: 0 }}
      onClick={onClick}
    >
      <X size={16} />
    </button>
  );
}

function AvatarInput({ n, onChanged, style }: { n: CrierNpc; onChanged: () => void; style: CSSProperties }) {
  return (
    <input
      type="url"
      style={style}
      aria-label={`Avatar URL for ${n.name}`}
      placeholder="avatar URL (absolute)"
      defaultValue={n.avatar_url ?? ""}
      onBlur={async (e) => {
        if (e.target.value !== (n.avatar_url ?? "")) {
          await crierApi.updateNpc(n.id, { avatar_url: e.target.value.trim() || null });
          onChanged();
        }
      }}
    />
  );
}

function RosterEditor({
  campaignId,
  npcs,
  phone,
  onChanged,
}: {
  campaignId: string;
  npcs: CrierNpc[];
  phone: boolean;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");

  return (
    <div>
      <div style={SECTION_LABEL}>Voices (who can speak)</div>

      {npcs.map((n) => (
        <div
          key={n.id}
          style={{
            display: "flex",
            flexWrap: phone ? "wrap" : "nowrap",
            gap: "0.5rem",
            alignItems: "center",
            marginBottom: phone ? "0.9rem" : "0.4rem",
          }}
        >
          <input
            type="text"
            className="story"
            aria-label="Name"
            style={{ flex: 1, minWidth: 0 }}
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
            aria-label={`Accent colour for ${n.name}`}
            value={colorToCss(n.embed_color)}
            style={{ width: 44, height: 40, padding: 0, border: "none", background: "none", flexShrink: 0 }}
            onChange={async (e) => {
              await crierApi.updateNpc(n.id, { embed_color: cssToColor(e.target.value) });
              onChanged();
            }}
          />
          {!phone && <AvatarInput n={n} onChanged={onChanged} style={{ flex: 1.4, minWidth: 0 }} />}
          <RemoveButton
            label={`Remove ${n.name}`}
            onClick={async () => {
              if (confirm(`Remove "${n.name}" from the voices?`)) {
                await crierApi.removeNpc(n.id);
                onChanged();
              }
            }}
          />
          {/* On a phone the long URL gets its own full-width row. */}
          {phone && <AvatarInput n={n} onChanged={onChanged} style={{ flexBasis: "100%" }} />}
        </div>
      ))}

      <form
        style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          await crierApi.createNpc(campaignId, { name: name.trim() });
          setName("");
          onChanged();
        }}
      >
        <input
          type="text"
          style={{ flex: 1, minWidth: 0 }}
          aria-label="New voice name"
          placeholder="Add a voice (an NPC name)…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit" disabled={!name.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>

      <p className="text-muted" style={{ fontSize: "0.8125rem", marginTop: "0.5rem" }}>
        Avatar URLs must be publicly reachable — Discord fetches the image itself.
        Leave blank and the post uses the webhook&rsquo;s default face.
      </p>
    </div>
  );
}

function ChannelEditor({
  campaignId,
  channels,
  phone,
  onChanged,
}: {
  campaignId: string;
  channels: CrierChannel[];
  phone: boolean;
  onChanged: () => void;
}) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <div style={SECTION_LABEL}>Channels</div>

      {channels.map((c) => {
        const hint = (
          <span
            className="text-muted"
            style={{ fontSize: "0.8125rem", whiteSpace: "nowrap", ...(phone ? { flexBasis: "100%" } : {}) }}
          >
            {c.configured ? `Webhook set (${c.url_hint})` : "No webhook yet"}
          </span>
        );
        const webhook = (
          <input
            type="password"
            style={{ flex: 1, minWidth: 0, ...(phone ? { flexBasis: "100%" } : {}) }}
            aria-label={`Replace the webhook URL for ${c.label}`}
            placeholder="replace webhook URL…"
            onBlur={async (e) => {
              if (e.target.value.trim()) {
                await crierApi.updateChannel(c.id, { webhook_url: e.target.value.trim() });
                e.target.value = "";
                onChanged();
              }
            }}
          />
        );
        const remove = (
          <RemoveButton
            label={`Remove ${c.label}`}
            onClick={async () => {
              if (confirm(`Remove "${c.label}"? The sent log keeps its history.`)) {
                await crierApi.removeChannel(c.id);
                onChanged();
              }
            }}
          />
        );
        return (
          <div
            key={c.id}
            style={{
              display: "flex",
              flexWrap: phone ? "wrap" : "nowrap",
              gap: phone ? "0.4rem 0.5rem" : "0.5rem",
              alignItems: "center",
              marginBottom: phone ? "0.9rem" : "0.4rem",
            }}
          >
            <input
              type="text"
              aria-label="Channel name"
              style={{ flex: 1, minWidth: 0 }}
              defaultValue={c.label}
              onBlur={async (e) => {
                if (e.target.value.trim() && e.target.value !== c.label) {
                  await crierApi.updateChannel(c.id, { label: e.target.value.trim() });
                  onChanged();
                }
              }}
            />
            {phone ? (
              <>
                {remove}
                {hint}
                {webhook}
              </>
            ) : (
              <>
                {hint}
                {webhook}
                {remove}
              </>
            )}
          </div>
        );
      })}

      <form
        style={{
          display: "flex",
          flexWrap: phone ? "wrap" : "nowrap",
          gap: "0.5rem",
          marginTop: "0.6rem",
        }}
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
          type="text"
          style={{ flex: 1, minWidth: 0, ...(phone ? { flexBasis: "100%" } : {}) }}
          aria-label="New channel name"
          placeholder="#channel-name"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          type="password"
          style={{ flex: 2, minWidth: 0 }}
          aria-label="Discord webhook URL"
          placeholder="https://discord.com/api/webhooks/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn btn-secondary" type="submit" disabled={!label.trim() || !url.trim()}>
          <Plus size={16} /> Add
        </button>
      </form>

      {err && (
        <p style={{ color: "var(--danger-text)", fontSize: "0.875rem", marginTop: "0.4rem" }}>
          {err}
        </p>
      )}
      <p className="text-muted" style={{ fontSize: "0.8125rem", marginTop: "0.5rem" }}>
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
  const phone = useIsCompact(640);

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

  // No pick yet (or a removed one) means "the first one", so the common case
  // is "type and send" with no selecting. Derived, not set from an effect.
  const [pickedChannel, setChannelId] = useState("");
  const [pickedNpc, setNpcId] = useState("");
  const channelId = channels.some((c) => c.id === pickedChannel) ? pickedChannel : (channels[0]?.id ?? "");
  const npcId = npcs.some((n) => n.id === pickedNpc) ? pickedNpc : (npcs[0]?.id ?? "");
  const [content, setContent] = useState("");
  const [embed, setEmbed] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

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
    <div className="fade-in">
      <div
        className="flex"
        style={{ justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem 1rem", marginBottom: "1rem" }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <h1 style={{ marginBottom: "0.2rem" }}>Town crier</h1>
          <p className="text-sm text-muted" style={{ margin: 0 }}>
            Post to Discord in an NPC&rsquo;s voice. One webhook per channel carries every voice.
          </p>
        </div>
        <div className="ql-actions">
          <button
            type="button"
            className="btn btn-secondary"
            aria-expanded={showSettings}
            onClick={() => setShowSettings((s) => !s)}
          >
            <Settings2 size={16} /> {showSettings ? "Done" : "Channels & voices"}
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="card" style={{ marginBottom: "1rem", display: "grid", gap: "1.5rem" }}>
          <ChannelEditor campaignId={campaignId} channels={channels} phone={phone} onChanged={refresh} />
          <RosterEditor campaignId={campaignId} npcs={npcs} phone={phone} onChanged={refresh} />
        </div>
      )}

      {!channels.length && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          No channels yet. Open <b>Channels &amp; voices</b> and paste a Discord webhook URL.
        </div>
      )}

      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: phone ? "minmax(0, 1fr)" : "minmax(0,1fr) minmax(0,1fr)",
        }}
      >
        {/* Composer */}
        <div className="card">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: "0.5rem",
              marginBottom: "0.9rem",
            }}
          >
            <label style={{ margin: 0 }}>
              Channel
              <select
                style={{ marginTop: "0.3rem" }}
                value={channelId}
                onChange={(e) => setChannelId(e.target.value)}
              >
                {!channels.length && <option value="">No channels yet</option>}
                {channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ margin: 0 }}>
              Speaking as
              <select
                style={{ marginTop: "0.3rem" }}
                value={npcId}
                onChange={(e) => setNpcId(e.target.value)}
              >
                {!npcs.length && <option value="">No voices yet</option>}
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
            <label htmlFor="crier-message">Message</label>
            <CharCount used={content.length} max={MAX_CONTENT} />
          </div>
          <textarea
            id="crier-message"
            rows={phone ? 5 : 4}
            style={{ width: "100%", marginBottom: "0.75rem" }}
            placeholder="Plain text — lands as a normal message."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
            <label htmlFor="crier-embed">Embed (the boxed, coloured one)</label>
            <CharCount used={embed.length} max={MAX_EMBED} />
          </div>
          <textarea
            id="crier-embed"
            className="story"
            rows={6}
            style={{ width: "100%", fontSize: "1.05rem" }}
            placeholder="In-character prose reads well here — it gets the NPC's accent colour."
            value={embed}
            onChange={(e) => setEmbed(e.target.value)}
          />

          <div className="flex" style={{ gap: "0.5rem 0.75rem", alignItems: "center", marginTop: "0.9rem" }}>
            <button className="btn btn-primary" disabled={!canSend} onClick={() => send.mutate()}>
              <Send size={16} /> {send.isPending ? "Sending…" : "Send to Discord"}
            </button>
            {flash && (
              <span
                role="status"
                style={{
                  fontSize: "0.875rem",
                  color: flash.startsWith("Not sent") ? "var(--danger-text)" : "var(--teal-text)",
                }}
              >
                {flash}
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: "0.8125rem", marginTop: "0.5rem", marginBottom: 0 }}>
            Sends immediately and cannot be unsent from here — delete in Discord if you misfire.
          </p>
        </div>

        {/* Preview */}
        <div>
          <div style={SECTION_LABEL}>As Discord will show it</div>
          <Preview npc={npc} content={content} embed={embed} />
        </div>
      </div>

      {/* Sent log */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <div style={SECTION_LABEL}>Sent log</div>
        {!posts.length && <div className="text-muted">Nothing posted yet.</div>}
        {posts.map((p) => (
          <div
            key={p.id}
            style={{
              borderTop: "1px solid var(--border)",
              padding: "0.6rem 0",
              fontSize: "0.9rem",
            }}
          >
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.15rem 0.5rem", alignItems: "baseline" }}>
              <span className="story" style={{ fontWeight: 700, color: "var(--text)", fontSize: "1rem" }}>
                {p.npc_name}
              </span>
              <span className="text-muted">{p.channel_label}</span>
              <span className="text-muted num" style={{ fontSize: "0.75rem" }}>
                {new Date(p.sent_at).toLocaleString()}
              </span>
              {p.status === "failed" && <span className="pill pill-danger">Failed</span>}
            </div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 2, color: "var(--text2)", overflowWrap: "anywhere" }}>
              {(p.content || p.embed_description || "").slice(0, 240)}
            </div>
            {p.error && (
              <div style={{ color: "var(--danger-text)", fontSize: "0.8125rem" }}>{p.error}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
