import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Lock, Target, Undo2, VenetianMask } from "lucide-react";
import { type Npc, type NpcStatus, npcsApi } from "../../api/npcs";
import { zoomable } from "../../lib/lightbox";
import { portraitSrc } from "../../lib/portrait";
import ObsidianLink from "../dm/ObsidianLink";
import Monogram from "../character-sheet/Monogram";

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
 *
 * Plan 121 (Lamplit): no status stripe — a status other than Alive shows as
 * a pill; names and table lines are set in the story face.
 */
interface Props {
  npc: Npc;
  onOpenPrep: () => void;
  compact?: boolean;
}

/** Only a status worth noticing gets a pill; Alive is the quiet default. */
const STATUS_PILL: Partial<Record<NpcStatus, string>> = {
  Dead: "pill pill-danger",
  Imprisoned: "pill pill-amber",
  Missing: "pill",
  Unknown: "pill",
};

export default function NpcTableFace({ npc, onOpenPrep, compact = false }: Props) {
  // Plan 91 — the face the table sees: the true form once revealed, else the disguise.
  const face = npc.true_form_revealed && npc.true_form_url ? npc.true_form_url : npc.portrait_url;
  const qc = useQueryClient();
  const reveal = useMutation({
    mutationFn: (v: boolean) => npcsApi.update(npc.id, { true_form_revealed: v }),
    onSuccess: () => void qc.invalidateQueries(),
  });
  const statusPill = STATUS_PILL[npc.status];
  const hasAnyTableContent =
    npc.quick_who ||
    npc.want_now ||
    (npc.knows && npc.knows.length > 0) ||
    npc.voice ||
    npc.secret_short ||
    (npc.relationship_pings && npc.relationship_pings.length > 0);
  const size = compact ? 40 : 52;

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
      className="card-clickable"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: compact ? "0.65rem 0.75rem" : "0.9rem 1rem",
        display: "flex",
        flexDirection: "column",
        gap: compact ? "0.45rem" : "0.6rem",
        cursor: "pointer",
        fontFamily: "var(--font-ui)",
        // Glance read needs space to breathe — line-height up.
        lineHeight: 1.4,
        transition: "border-color 0.15s",
        minWidth: 0,
      }}
    >
      {/* Identity row — portrait + name + who-they-are */}
      <div style={{ display: "flex", gap: "0.7rem", alignItems: "center" }}>
        {face ? (
          <img
            src={portraitSrc(face)} {...zoomable(portraitSrc(face), npc.name)}
            alt={npc.name}
            style={{
              width: size,
              height: size,
              borderRadius: 6,
              objectFit: "cover",
              border: "1px solid var(--border2)",
              flexShrink: 0,
            }}
          />
        ) : (
          <Monogram name={npc.name} size={size} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="story"
            style={{
              fontSize: compact ? "1.1rem" : "1.25rem",
              fontWeight: 700,
              color: "var(--text)",
              lineHeight: 1.15,
              wordBreak: "break-word",
            }}
          >
            {npc.name}
          </div>
          {(npc.quick_who || npc.role) && (
            <div
              className="story"
              style={{
                fontSize: compact ? "0.95rem" : "1rem",
                color: "var(--text2)",
                marginTop: "0.15rem",
                fontStyle: "italic",
              }}
            >
              {npc.quick_who || npc.role}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.3rem", alignSelf: "flex-start" }}>
          {statusPill && <span className={statusPill}>{npc.status}</span>}
          {!npc.is_revealed && (
            <span
              className="pill"
              style={{ flexShrink: 0 }}
              title="Players haven't met them yet — flip the switch in the prep face when they do"
            >
              Hidden
            </span>
          )}
        </div>
        <ObsidianLink dmNote={npc.dm_note} compact />
      </div>

      {npc.true_form_url && (
        <div>
          <button
            type="button"
            className={npc.true_form_revealed ? "btn btn-ghost" : "btn btn-secondary"}
            style={{ fontSize: "0.8125rem", padding: "0.2rem 0.6rem", minHeight: 0 }}
            disabled={reveal.isPending}
            onClick={() => reveal.mutate(!npc.true_form_revealed)}
            title={
              npc.true_form_revealed
                ? "Back to the disguise"
                : "Swap the portrait to the true form — players' phones and the table see it at once"
            }
          >
            {npc.true_form_revealed ? (
              <>
                <Undo2 size={14} /> Disguise
              </>
            ) : (
              <>
                <VenetianMask size={14} /> Reveal true form
              </>
            )}
          </button>
        </div>
      )}

      {/* Empty-state nudge so the DM knows to author Table-face content. */}
      {!hasAnyTableContent && (
        <div
          style={{
            fontSize: "0.875rem",
            color: "var(--muted)",
            padding: "0.5rem 0 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          {npc.motivation || npc.personality || npc.secret ? (
            // Plan 83 — the record is the source of truth: prep fields stand in
            // until the table face is written.
            <span className="story" style={{ fontSize: "1rem", color: "var(--text2)" }}>
              {npc.motivation && (
                <span>
                  <Target size={13} style={{ verticalAlign: "-1px", marginRight: 4, color: "var(--muted)" }} />
                  {npc.motivation}{" "}
                </span>
              )}
              {npc.personality && <span style={{ color: "var(--text)" }}>{npc.personality} </span>}
              {npc.secret && (
                <span>
                  <Lock size={13} style={{ verticalAlign: "-1px", marginRight: 4, color: "var(--danger-text)" }} />
                  {npc.secret}
                </span>
              )}
            </span>
          ) : (
            <>Nothing for the table yet — open it to add what they want, know, sound like and hide.</>
          )}
        </div>
      )}

      {npc.want_now && <Block label="Wants" body={npc.want_now} compact={compact} />}
      {npc.knows && npc.knows.length > 0 && (
        <Block
          label="Knows"
          body={
            <ul style={{ margin: 0, paddingLeft: "1.1rem" }}>
              {npc.knows.slice(0, 5).map((k, i) => (
                <li key={i} style={{ marginBottom: "0.15rem" }}>
                  {k}
                </li>
              ))}
            </ul>
          }
          compact={compact}
        />
      )}
      {npc.voice && (
        <Block
          label="Voice"
          body={<span style={{ fontStyle: "italic" }}>{npc.voice}</span>}
          compact={compact}
        />
      )}
      {npc.secret_short && (
        <Block label="Secret" body={npc.secret_short} accent="var(--danger-text)" compact={compact} />
      )}
      {npc.relationship_pings && npc.relationship_pings.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.1rem" }}>
          {npc.relationship_pings.map((p, i) => (
            <span key={i} className="pill" style={{ whiteSpace: "normal" }}>
              {p}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

/** Single labeled block — a small muted label, the line itself in the story face. */
function Block({
  label,
  body,
  accent = "var(--muted)",
  compact,
}: {
  label: string;
  body: React.ReactNode;
  accent?: string;
  compact: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: "0.75rem",
          fontWeight: 600,
          color: accent,
          marginBottom: "0.1rem",
        }}
      >
        {label}
      </div>
      <div
        className="story"
        style={{
          fontSize: compact ? "1rem" : "1.075rem",
          color: "var(--text)",
          lineHeight: 1.45,
        }}
      >
        {body}
      </div>
    </div>
  );
}
