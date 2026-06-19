import { type Npc, NPC_STATUS_COLORS } from "../../api/npcs";
import { portraitSrc } from "../../lib/portrait";

/**
 * NPC Table-face — the at-the-table glance read (Plan 40).
 *
 * Five blocks the DM can scan in ~2 seconds without scrolling:
 *   • Name + one-line "who they are"
 *   • WANT — what they want right now
 *   • KNOWS — 2-3 bullets max
 *   • VOICE — one verbal/physical tic the DM can perform instantly
 *   • SECRET — one-line table-version
 * Optional sixth: relationship pings (PC/NPC connection flags).
 *
 * The rich prep-face content (appearance, personality, motivation, the
 * long secret, notes, dialog_hooks) is **not** rendered here — that's
 * the Prep face inside NpcModal, one tap away.
 *
 * Variants:
 *   • compact=false (default) — full card, used on the NPCs page and
 *     in the SessionHud "Cast tonight" column.
 *   • compact=true — denser sizing for tight rows.
 *
 * onOpenPrep — clicking the card surfaces the rich Prep face. Required
 * because the Table face is read-only by design.
 */
interface Props {
  npc: Npc;
  onOpenPrep: () => void;
  compact?: boolean;
}

export default function NpcTableFace({ npc, onOpenPrep, compact = false }: Props) {
  const statusColor = NPC_STATUS_COLORS[npc.status];
  const hasAnyTableContent =
    npc.quick_who ||
    npc.want_now ||
    (npc.knows && npc.knows.length > 0) ||
    npc.voice ||
    npc.secret_short ||
    (npc.relationship_pings && npc.relationship_pings.length > 0);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpenPrep}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenPrep();
        }
      }}
      title="Tap to open the prep face"
      style={{
        background: "var(--surface, #1f1f1f)",
        border: "1px solid var(--border)",
        borderLeft: `4px solid ${statusColor}`,
        borderRadius: 8,
        padding: compact ? "0.65rem 0.75rem" : "0.85rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: compact ? "0.4rem" : "0.55rem",
        cursor: "pointer",
        fontFamily: "Georgia, 'Times New Roman', serif",
        // Glance read needs space to breathe — line-height up.
        lineHeight: 1.4,
      }}
    >
      {/* Identity row — portrait + name + who-they-are */}
      <div style={{ display: "flex", gap: "0.7rem", alignItems: "center" }}>
        {npc.portrait_url ? (
          <img
            src={portraitSrc(npc.portrait_url)}
            alt={npc.name}
            style={{
              width: compact ? 40 : 52,
              height: compact ? 40 : 52,
              borderRadius: 6,
              objectFit: "cover",
              border: `1px solid ${statusColor}`,
              flexShrink: 0,
            }}
          />
        ) : (
          <div
            style={{
              width: compact ? 40 : 52,
              height: compact ? 40 : 52,
              borderRadius: 6,
              background: "var(--surface2)",
              border: "1px dashed var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: compact ? "1rem" : "1.4rem",
              flexShrink: 0,
            }}
          >
            👤
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: compact ? "1.05rem" : "1.2rem",
              fontWeight: 700,
              color: "var(--gold)",
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {npc.name}
          </div>
          {npc.quick_who && (
            <div
              style={{
                fontSize: compact ? "0.85rem" : "0.92rem",
                color: "var(--text)",
                marginTop: "0.15rem",
                fontStyle: "italic",
                opacity: 0.92,
              }}
            >
              {npc.quick_who}
            </div>
          )}
        </div>
      </div>

      {/* Empty-state nudge so the DM knows to author Table-face content. */}
      {!hasAnyTableContent && (
        <div
          style={{
            fontSize: "0.82rem",
            color: "var(--muted)",
            fontStyle: "italic",
            padding: "0.4rem 0",
            borderTop: "1px dashed var(--border)",
          }}
        >
          No table-face filled yet — tap to add WANT / KNOWS / VOICE / SECRET.
        </div>
      )}

      {npc.want_now && <Block label="WANT" body={npc.want_now} accent="var(--gold)" compact={compact} />}
      {npc.knows && npc.knows.length > 0 && (
        <Block
          label="KNOWS"
          body={
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {npc.knows.slice(0, 5).map((k, i) => (
                <li key={i} style={{ marginBottom: "0.15rem" }}>
                  {k}
                </li>
              ))}
            </ul>
          }
          accent="var(--gold)"
          compact={compact}
        />
      )}
      {npc.voice && (
        <Block
          label="VOICE"
          body={<span style={{ fontStyle: "italic" }}>{npc.voice}</span>}
          accent="var(--gold)"
          compact={compact}
        />
      )}
      {npc.secret_short && (
        <Block
          label="SECRET"
          body={npc.secret_short}
          accent="var(--crimson2, #8b1a1a)"
          compact={compact}
        />
      )}
      {npc.relationship_pings && npc.relationship_pings.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.1rem" }}>
          {npc.relationship_pings.map((p, i) => (
            <span
              key={i}
              style={{
                fontSize: "0.7rem",
                padding: "0.15rem 0.45rem",
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 999,
                color: "var(--text)",
              }}
            >
              {p}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/** Single labeled block — label is small caps gold, body is large readable text. */
function Block({
  label,
  body,
  accent,
  compact,
}: {
  label: string;
  body: React.ReactNode;
  accent: string;
  compact: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.66rem",
          letterSpacing: "0.1em",
          fontWeight: 700,
          color: accent,
          marginBottom: "0.15rem",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: compact ? "0.92rem" : "1.02rem",
          color: "var(--text)",
        }}
      >
        {body}
      </div>
    </div>
  );
}
