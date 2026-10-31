import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bug, Check, Copy, Heart, HelpCircle, Lightbulb, Mail, UserPlus } from "lucide-react";

import { betaApi, type FeedbackRow, type InviteRow, type WaitlistEntry } from "../../api/beta";
import { formatDay } from "../../lib/dates";

const KIND: Record<string, { label: string; icon: React.ReactNode; pill: string }> = {
  loved: { label: "Loved it", icon: <Heart size={14} aria-hidden />, pill: "pill-teal" },
  confusing: { label: "Confusing", icon: <HelpCircle size={14} aria-hidden />, pill: "pill-amber" },
  broken: { label: "Broken", icon: <Bug size={14} aria-hidden />, pill: "pill-danger" },
  idea: { label: "Idea", icon: <Lightbulb size={14} aria-hidden />, pill: "" },
};

/** The link a friend opens: the sign-up page with their code filled in. */
function inviteLink(code: string): string {
  return `${window.location.origin}/welcome?invite=${encodeURIComponent(code)}`;
}

/** A ready-to-send email with the invite link; Justin edits it in his own mail app. */
function inviteMailto(email: string, code: string): string {
  const subject = "Your QuestLab beta invite";
  const body = [
    "Hi! A place opened in the QuestLab beta. Make your account here:",
    inviteLink(code),
    'The sample night is the quickest way in. Tell me how it goes with "Send feedback" in the menu.',
  ].join("\n\n");
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function when(iso: string): string {
  return formatDay(iso.slice(0, 10));
}

/**
 * BetaPanel (Plan 125) — the friends beta, from the admin page.
 *
 * Make an invite for each friend (who it's for, how many accounts it may
 * start), copy its link, revoke it; see who joined and how much they've
 * played; read the feedback they send and mark it seen. People who asked
 * on the landing page wait in the waitlist with a one-tap invite email.
 */
export default function BetaPanel() {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [uses, setUses] = useState(3);
  const [copied, setCopied] = useState<string | null>(null);

  const overview = useQuery({ queryKey: ["admin-beta"], queryFn: betaApi.overview });
  const invites = useQuery({ queryKey: ["admin-invites"], queryFn: betaApi.invites });
  const feedback = useQuery({ queryKey: ["admin-feedback"], queryFn: betaApi.feedback });
  const waitlist = useQuery({ queryKey: ["admin-waitlist"], queryFn: betaApi.waitlist });

  const create = useMutation({
    mutationFn: () => betaApi.createInvite(label.trim(), uses),
    onSuccess: (inv) => {
      setLabel("");
      void qc.invalidateQueries({ queryKey: ["admin-invites"] });
      void copy(inv.code);
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => betaApi.revokeInvite(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-invites"] }),
  });
  // One single-use invite per waitlist email, labelled with the email so the
  // list knows who's already been asked; then the mail app opens with the link.
  const inviteWaiting = useMutation({
    mutationFn: (email: string) => betaApi.createInvite(email, 1),
    onSuccess: (inv) => {
      void qc.invalidateQueries({ queryKey: ["admin-invites"] });
      window.location.href = inviteMailto(inv.label, inv.code);
    },
  });
  const seen = useMutation({
    mutationFn: (id: string) => betaApi.markSeen(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
  });

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(code));
      setCopied(code);
      window.setTimeout(() => setCopied((c) => (c === code ? null : c)), 1600);
    } catch {
      setCopied(null);
    }
  }

  const unseen = (feedback.data ?? []).filter((f) => !f.seen).length;
  const invitedBy = new Map((invites.data ?? []).filter((i) => !i.revoked).map((i) => [i.label.toLowerCase(), i]));
  const waiting = waitlist.data?.entries ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Plan 128: a screen reader hears that the link is on the clipboard. */}
      <p className="ql-sr-only" role="status">
        {copied ? "Invite link copied." : ""}
      </p>
      <p className="text-muted" style={{ margin: 0 }}>
        {overview.data?.invites_required
          ? "Sign-up is invite-only: a new DM needs one of these codes. Players never do."
          : "Sign-up is open to anyone (BETA_INVITES=off). Invites still record who came from whom."}
      </p>

      {/* Make an invite */}
      <section className="card" aria-label="Make an invite">
        <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>Invite a friend</h2>
        <form
          className="flex"
          style={{ gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (label.trim()) create.mutate();
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: "2 1 220px" }}>
            <span className="text-sm text-muted">Who it's for</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Sam (Thursday group)" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "0.25rem", flex: "0 1 120px" }}>
            <span className="text-sm text-muted">Accounts it can start</span>
            <input
              type="number"
              min={1}
              max={100}
              value={uses}
              onChange={(e) => setUses(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              className="num"
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={!label.trim() || create.isPending} style={{ minHeight: 44 }}>
            <UserPlus size={16} aria-hidden /> Make invite and copy link
          </button>
        </form>
        <p className="text-sm text-muted" style={{ margin: "0.6rem 0 0" }}>
          The link opens the sign-up page with their code filled in. Three uses lets a friend bring a co-DM.
        </p>
      </section>

      {/* Invites */}
      <section aria-label="Invites">
        <h2 style={{ fontSize: "1.1rem" }}>Invites</h2>
        {(invites.data ?? []).length === 0 ? (
          <p className="text-muted">No invites yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(invites.data ?? []).map((inv: InviteRow) => {
              const spent = inv.uses >= inv.max_uses;
              return (
                <div key={inv.id} className="card" style={{ padding: "0.75rem 1rem", opacity: inv.revoked ? 0.6 : 1 }}>
                  <div className="flex items-center" style={{ gap: "0.5rem 1rem", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                      <div className="story" style={{ fontWeight: 700, fontSize: "1.05rem" }}>{inv.label || "Invite"}</div>
                      <div className="text-sm text-muted">
                        <span className="num">{inv.code}</span> · used <span className="num">{inv.uses}</span> of{" "}
                        <span className="num">{inv.max_uses}</span> · made {when(inv.created_at)}
                        {inv.revoked ? " · revoked" : spent ? " · used up" : ""}
                      </div>
                    </div>
                    {!inv.revoked && (
                      <div className="flex" style={{ gap: "0.4rem" }}>
                        <button type="button" className="btn btn-secondary" onClick={() => void copy(inv.code)} style={{ minHeight: 44 }}>
                          {copied === inv.code ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
                          {copied === inv.code ? "Copied" : "Copy link"}
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ minHeight: 44, color: "var(--danger-text)" }}
                          onClick={() => {
                            if (window.confirm(`Revoke the invite for ${inv.label || inv.code}? Accounts it already started stay.`)) {
                              revoke.mutate(inv.id);
                            }
                          }}
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                  {inv.joined.length > 0 && (
                    <div className="text-sm" style={{ marginTop: "0.4rem", color: "var(--text2)" }}>
                      Joined: {inv.joined.map((j) => j.display_name || j.email).join(", ")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Waitlist (Plan 128) */}
      <section aria-label="Waitlist">
        <h2 style={{ fontSize: "1.1rem" }}>
          Waitlist <span className="text-muted num" style={{ fontSize: "0.9rem", fontWeight: 400 }}>{waiting.length}</span>
        </h2>
        {waiting.length === 0 ? (
          <p className="text-muted">Nobody yet. People who tap "Ask for an invite" on the landing page appear here.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {waiting.map((w: WaitlistEntry) => {
              const inv = invitedBy.get(w.email.toLowerCase());
              const joined = (inv?.uses ?? 0) > 0;
              return (
                <div key={w.email} className="card flex items-center" style={{ padding: "0.6rem 1rem", gap: "0.5rem 1rem", flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                    <div style={{ overflowWrap: "anywhere" }}>{w.email}</div>
                    <div className="text-sm text-muted">
                      asked {when(w.created_at)}
                      {joined ? " · joined" : inv ? " · invited" : ""}
                    </div>
                  </div>
                  {inv ? (
                    !joined && (
                      <a className="btn btn-secondary" href={inviteMailto(w.email, inv.code)} style={{ minHeight: 44 }}>
                        <Mail size={15} aria-hidden /> Email the invite again
                      </a>
                    )
                  ) : (
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ minHeight: 44 }}
                      disabled={inviteWaiting.isPending}
                      onClick={() => inviteWaiting.mutate(w.email)}
                    >
                      <Mail size={15} aria-hidden /> Invite by email
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* DMs */}
      <section aria-label="DMs in the beta">
        <h2 style={{ fontSize: "1.1rem" }}>DMs</h2>
        <div className="ql-table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ color: "var(--muted)", textAlign: "left" }}>
                <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>DM</th>
                <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Invite</th>
                <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Joined</th>
                <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500 }}>Last seen</th>
                <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, textAlign: "right" }}>Campaigns</th>
                <th style={{ padding: "0.4rem 0.5rem", fontWeight: 500, textAlign: "right" }}>Sessions</th>
              </tr>
            </thead>
            <tbody>
              {(overview.data?.dms ?? []).map((d) => (
                <tr key={d.email} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.45rem 0.5rem" }}>
                    <div>{d.display_name || "—"}</div>
                    <div className="text-muted" style={{ fontSize: "0.8125rem", overflowWrap: "anywhere" }}>{d.email}</div>
                  </td>
                  <td className="num" style={{ padding: "0.45rem 0.5rem" }}>{d.invite_code ?? "—"}</td>
                  <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>{when(d.created_at)}</td>
                  <td style={{ padding: "0.45rem 0.5rem", whiteSpace: "nowrap" }}>{when(d.last_seen_at)}</td>
                  <td className="num" style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{d.campaigns}</td>
                  <td className="num" style={{ padding: "0.45rem 0.5rem", textAlign: "right" }}>{d.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Feedback */}
      <section aria-label="Feedback">
        <h2 style={{ fontSize: "1.1rem" }}>
          Feedback {unseen > 0 && <span className="pill pill-live" style={{ fontSize: "0.75rem", marginLeft: "0.4rem" }}>{unseen} new</span>}
        </h2>
        {(feedback.data ?? []).length === 0 ? (
          <p className="text-muted">Nothing yet. Friends send feedback from "Send feedback" in the menu.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {(feedback.data ?? []).map((f: FeedbackRow) => {
              const k = KIND[f.kind] ?? KIND.idea;
              return (
                <div key={f.id} className="card" style={{ padding: "0.75rem 1rem", borderColor: f.seen ? undefined : "var(--accent-line)" }}>
                  <div className="flex items-center" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                    <span className={`pill ${k.pill}`} style={{ fontSize: "0.75rem", display: "inline-flex", gap: "0.3rem", alignItems: "center" }}>
                      {k.icon} {k.label}
                    </span>
                    <span style={{ fontWeight: 600 }}>{f.display_name || f.email}</span>
                    <span className="text-sm text-muted">· {when(f.created_at)}</span>
                    {!f.seen && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ marginLeft: "auto", minHeight: 44, fontSize: "0.8125rem" }}
                        onClick={() => seen.mutate(f.id)}
                      >
                        <Check size={14} aria-hidden /> Mark seen
                      </button>
                    )}
                  </div>
                  <p style={{ margin: "0.5rem 0 0.35rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{f.text}</p>
                  <div className="text-sm text-muted" style={{ overflowWrap: "anywhere" }}>
                    {f.page || "—"} · screen {f.viewport || "—"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
