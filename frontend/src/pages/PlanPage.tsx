import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Heart, Link2, RefreshCw, X } from "lucide-react";

import {
  formatBytes,
  formatPlanDay,
  patreonResultFromHash,
  planApi,
  PLAN_QUERY_KEY,
  type PlanStatus,
} from "../api/plan";
import { useIsCompact } from "../hooks/useIsCompact";

/** One usage line: the numbers, and a bar when the limit is enforced. */
function Meter({
  label,
  used,
  limit,
  format,
  showBar,
  note,
}: {
  label: string;
  used: number;
  limit: number | null;
  format: (n: number) => string;
  showBar: boolean;
  note?: string;
}) {
  const full = limit !== null && used >= limit;
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const text = limit !== null && showBar ? `${format(used)} of ${format(limit)}` : format(used);
  return (
    <div>
      <div className="flex" style={{ justifyContent: "space-between", alignItems: "baseline", gap: "0.75rem" }}>
        <span>{label}</span>
        <span className="num">{text}</span>
      </div>
      {showBar && limit !== null && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={text}
          style={{ height: 8, borderRadius: 999, background: "var(--surface3)", overflow: "hidden", marginTop: "0.4rem" }}
        >
          <div style={{ width: `${pct}%`, height: "100%", background: full ? "var(--amber)" : "var(--teal)" }} />
        </div>
      )}
      {note && (
        <p className="text-sm text-muted" style={{ margin: "0.35rem 0 0" }}>
          {note}
        </p>
      )}
    </div>
  );
}

/** Why this DM's plan is what it is, in a sentence. */
function planReason(s: PlanStatus): string {
  if (s.why === "admin") return "You run this QuestLab, so nothing is capped.";
  if (s.why === "comped") return "You have Patron as a thank-you from QuestLab.";
  if (s.why === "patreon") {
    const until = formatPlanDay(s.patreon_counts_until);
    return until
      ? `Thank you for supporting QuestLab on Patreon. Your membership counts until ${until}.`
      : "Thank you for supporting QuestLab on Patreon.";
  }
  return `Every table feature, ${s.free_campaigns} campaigns and ${formatBytes(s.free_upload_bytes)} of uploads.`;
}

/** What the Patreon link says right now. */
function patreonLine(s: PlanStatus): string {
  if (!s.patreon_linked) {
    return s.pricing_on
      ? "Already a Patron? Link your Patreon account so it counts here."
      : "Already support QuestLab on Patreon? Link it so it counts when the beta ends.";
  }
  if (s.patreon_counts) {
    return `Your Patreon is linked. Signing in with Patreon, or checking again, keeps it counting past ${formatPlanDay(s.patreon_counts_until)}.`;
  }
  const day = formatPlanDay(s.patron_checked_at);
  return day
    ? `Your Patreon is linked. When it was last checked, on ${day}, it had no Patron membership.`
    : "Your Patreon is linked. Check it again to see your membership.";
}

function PlanList({ title, price, items }: { title: string; price?: string; items: string[] }) {
  return (
    <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "0.9rem 1rem" }}>
      <h3 style={{ margin: 0, fontSize: "1.05rem" }}>{title}</h3>
      {price && (
        <p className="text-sm" style={{ margin: "0.2rem 0 0", color: "var(--text2)" }}>
          {price}
        </p>
      )}
      <ul style={{ listStyle: "none", padding: 0, margin: "0.6rem 0 0", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {items.map((item) => (
          <li key={item} style={{ display: "flex", gap: "0.45rem", alignItems: "flex-start" }}>
            <Check size={16} aria-hidden style={{ color: "var(--teal-text)", flexShrink: 0, marginTop: 3 }} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Your plan (Plan 130). During the beta: free with no limits, what the plans
 * will be, and a quiet way to support QuestLab. With pricing on: the plan,
 * usage meters, Become a Patron and the Patreon link. Players never pay.
 */
export default function PlanPage() {
  const qc = useQueryClient();
  const compact = useIsCompact(640);
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const patreonError = params.get("patreon_error");

  const plan = useQuery({ queryKey: PLAN_QUERY_KEY, queryFn: planApi.get });

  // Back from Patreon: the callback put a signed result in the fragment. Attach
  // it with this DM's own session, then drop it from the address bar.
  const confirm = useMutation({
    mutationFn: planApi.confirmPatreonLink,
    onSuccess: (res) => qc.setQueryData(PLAN_QUERY_KEY, res.status),
  });
  const { mutate: confirmLink } = confirm;
  const handled = useRef("");
  const linkResult = patreonResultFromHash(location.hash);
  const { pathname, search } = location;
  useEffect(() => {
    if (!linkResult || handled.current === linkResult) return;
    handled.current = linkResult;
    confirmLink(linkResult);
    navigate({ pathname, search }, { replace: true });
  }, [linkResult, confirmLink, navigate, pathname, search]);

  const startLink = useMutation({
    mutationFn: planApi.startPatreonLink,
    onSuccess: ({ url }) => window.location.assign(url),
  });

  const button: React.CSSProperties = {
    minHeight: 44,
    ...(compact ? { width: "100%", justifyContent: "center" } : {}),
  };

  const s = plan.data;
  const showPatreon = !!s && s.patreon_available && s.why !== "admin" && s.why !== "comped";
  const supportLabel = s?.pricing_on && s.plan === "free" ? "Become a Patron" : "Support QuestLab";
  const showSupport = !!s?.support_url && !(s.pricing_on && s.plan === "patron");

  return (
    <div className="fade-in ql-page" style={{ "--page-max": "760px" } as React.CSSProperties}>
      <h1 style={{ margin: 0 }}>Your plan</h1>
      <p className="text-muted" style={{ margin: "0.3rem 0 1.25rem" }}>
        Players never pay. Their link, phone, join page and market are free for good.
      </p>

      {/* What just happened with Patreon. */}
      <div role="status" aria-live="polite">
        {confirm.isPending && (
          <p className="card" style={{ marginBottom: "1rem" }}>
            Checking your Patreon…
          </p>
        )}
        {confirm.data && (
          <p className="card" style={{ marginBottom: "1rem", borderColor: "var(--teal)" }}>
            {confirm.data.message}
          </p>
        )}
      </div>
      {(confirm.error || startLink.error || patreonError) && (
        <div
          role="alert"
          className="card flex"
          style={{ marginBottom: "1rem", borderColor: "var(--danger-line)", gap: "0.5rem", alignItems: "flex-start" }}
        >
          <p style={{ margin: 0, flex: 1, color: "var(--danger-text)" }}>
            {(confirm.error as Error | null)?.message ?? (startLink.error as Error | null)?.message ?? patreonError}
          </p>
          {patreonError && (
            <button
              type="button"
              className="btn btn-ghost"
              aria-label="Dismiss"
              style={{ minHeight: 44, minWidth: 44, padding: 0, justifyContent: "center" }}
              onClick={() => setParams({}, { replace: true })}
            >
              <X size={16} aria-hidden />
            </button>
          )}
        </div>
      )}

      {plan.isLoading && <p className="text-muted">Loading your plan…</p>}
      {plan.isError && (
        <div className="card">
          <p style={{ marginTop: 0 }}>Your plan didn&rsquo;t load.</p>
          <button type="button" className="btn btn-secondary" style={button} onClick={() => void plan.refetch()}>
            <RefreshCw size={16} aria-hidden /> Try again
          </button>
        </div>
      )}

      {s && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <section className="card" aria-labelledby="ql-plan-now">
            <p className="eyebrow" style={{ margin: 0 }}>
              {s.pricing_on ? "Current plan" : "During the beta"}
            </p>
            <h2 id="ql-plan-now" style={{ margin: "0.2rem 0 0.35rem", fontSize: "1.3rem" }}>
              {s.pricing_on ? (s.plan === "patron" ? "Patron" : "Free") : "Free during the beta, with no limits"}
            </h2>
            <p style={{ margin: 0, color: "var(--text2)" }}>
              {s.pricing_on
                ? planReason(s)
                : "Every table feature, as many campaigns as you like, and room for your uploads. Thank you for trying QuestLab early."}
            </p>
            {!s.pricing_on && s.plan === "patron" && (
              <p style={{ margin: "0.5rem 0 0" }}>
                <span className="pill pill-teal">Patron</span> {planReason(s)}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem", marginTop: "1.1rem" }}>
              <Meter
                label="Campaigns"
                used={s.campaigns_used}
                limit={s.campaigns_limit}
                format={(n) => String(n)}
                showBar={s.pricing_on}
                note={
                  !s.pricing_on && s.campaigns_limit !== null
                    ? `After the beta, the free plan has ${s.campaigns_limit}. Nothing you've made goes away.`
                    : s.campaigns_limit === null
                      ? "No limit."
                      : undefined
                }
              />
              <Meter
                label="Uploads"
                used={s.upload_bytes_used}
                limit={s.upload_bytes_limit}
                format={formatBytes}
                showBar={s.pricing_on}
                note={
                  !s.pricing_on && s.upload_bytes_limit !== null
                    ? `Pictures, maps and figures. After the beta, your plan has ${formatBytes(s.upload_bytes_limit)}. Files uploaded before this page existed aren't counted.`
                    : "Pictures, maps and figures. Files uploaded before this page existed aren't counted."
                }
              />
            </div>
            {s.pricing_on && s.plan === "free" && (
              <p className="text-sm text-muted" style={{ margin: "0.9rem 0 0" }}>
                Going past a limit never deletes or hides anything. You just can&rsquo;t add more until there&rsquo;s room.
              </p>
            )}

            {(showSupport || showPatreon) && (
              <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.1rem", paddingTop: "1rem" }}>
                {showPatreon && <p style={{ margin: "0 0 0.75rem", color: "var(--text2)" }}>{patreonLine(s)}</p>}
                <div className="flex" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
                  {showSupport && (
                    <a className="btn btn-primary" href={s.support_url ?? undefined} target="_blank" rel="noreferrer" style={button}>
                      <Heart size={16} aria-hidden /> {supportLabel}
                    </a>
                  )}
                  {showPatreon && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={button}
                      disabled={startLink.isPending || confirm.isPending}
                      onClick={() => startLink.mutate()}
                    >
                      {s.patreon_linked ? <RefreshCw size={16} aria-hidden /> : <Link2 size={16} aria-hidden />}
                      {startLink.isPending
                        ? "Opening Patreon…"
                        : s.patreon_linked
                          ? "Check my Patreon again"
                          : "Link your Patreon"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="ql-plan-options">
            <h2 id="ql-plan-options" style={{ margin: "0 0 0.75rem", fontSize: "1.1rem" }}>
              {s.pricing_on ? "Plans" : "After the beta"}
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: "0.75rem" }}>
              <PlanList
                title="Free"
                items={[
                  "Every table feature: the HUD, tracker, prep, players' phones, compendium and notebook",
                  `${s.free_campaigns} campaigns`,
                  `${formatBytes(s.free_upload_bytes)} of uploads`,
                ]}
              />
              <PlanList
                title="Patron"
                price={`${s.price_monthly} or ${s.price_yearly} on Patreon`}
                items={[
                  "Everything in Free",
                  "Unlimited campaigns",
                  `${formatBytes(s.patron_upload_bytes)} of uploads`,
                  "Early access to new features",
                  "A thank-you in the credits",
                ]}
              />
            </div>
            <p className="text-sm text-muted" style={{ margin: "0.75rem 0 0" }}>
              Players never pay. The limits are on campaigns and storage, never on table features.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
