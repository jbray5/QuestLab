import { useEffect, useState } from "react";

import { api, apiBase } from "../api/client";

/**
 * PaywallModal (Plan 73; tiers in Plan 77) — one modal for every AI button.
 *
 * The API answers gated AI calls with 402 (Patreon required, or a higher tier
 * required) or 429 (daily allowance spent) carrying a structured detail; the
 * client turns that into a `ql:paywall` window event and this modal explains
 * what to do next, with the live tier table from /auth/plans.
 */
interface PaywallDetail {
  code?: string;
  patreon_url?: string | null;
  tier?: string | null;
  required_tier?: string | null;
}

interface Plan {
  name: string;
  label: string;
  price_cents: number;
  daily: number;
  scope: string;
  blurb: string;
}

const CSS = `
.ql-paywall { position: fixed; inset: 0; z-index: 400; display: flex; align-items: center; justify-content: center; background: rgba(6,5,10,0.78); backdrop-filter: blur(4px); padding: 1rem; }
.ql-paywall-card { width: min(720px, 94vw); max-height: 92vh; overflow-y: auto; background: var(--surface, #16121f); border: 1px solid var(--gold, #d6af36); border-radius: 14px; padding: 1.4rem 1.5rem; color: var(--text, #e6ddc8); box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.ql-paywall h3 { font-family: Cinzel, Georgia, serif; color: var(--gold, #d6af36); margin: 0 0 0.5rem; letter-spacing: 0.04em; }
.ql-paywall p { margin: 0.4rem 0; line-height: 1.5; }
.ql-paywall .row { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
.ql-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.6rem; margin-top: 0.9rem; }
.ql-plan { border: 1px solid var(--border, #2c2638); border-radius: 10px; padding: 0.7rem 0.8rem; background: var(--surface2, #1d1827); display: flex; flex-direction: column; gap: 0.3rem; }
.ql-plan.need { border-color: var(--gold, #d6af36); box-shadow: 0 0 0 1px rgba(214,175,54,0.25) inset; }
.ql-plan.have { opacity: 0.75; }
.ql-plan b { font-family: Cinzel, Georgia, serif; color: var(--gold, #d6af36); font-size: 0.95rem; }
.ql-plan .price { font-size: 1.15rem; font-weight: 700; }
.ql-plan .price small { font-size: 0.7rem; color: var(--muted, #9a9078); font-weight: 400; }
.ql-plan .blurb { font-size: 0.78rem; color: var(--muted, #9a9078); line-height: 1.45; flex: 1; }
.ql-plan .daily { font-size: 0.72rem; color: var(--text, #e6ddc8); }
.ql-plan .tag { font-size: 0.62rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold, #d6af36); }
`;

function dollars(cents: number) {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export default function PaywallModal() {
  const [detail, setDetail] = useState<PaywallDetail | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);

  useEffect(() => {
    const on = (e: Event) => setDetail((e as CustomEvent<PaywallDetail>).detail ?? {});
    window.addEventListener("ql:paywall", on);
    return () => window.removeEventListener("ql:paywall", on);
  }, []);

  useEffect(() => {
    if (!detail || plans) return;
    api
      .get<{ plans: Plan[] }>("/auth/plans")
      .then((r) => setPlans(r.plans))
      .catch(() => setPlans([]));
  }, [detail, plans]);

  if (!detail) return null;
  const quota = detail.code === "daily_limit";
  const upgrade = detail.code === "tier_required";
  const signedIn = !!localStorage.getItem("ql_token");
  const need = detail.required_tier ?? null;
  const have = detail.tier ?? null;
  const needLabel = plans?.find((p) => p.name === need)?.label ?? need ?? "a higher";
  const haveLabel = plans?.find((p) => p.name === have)?.label ?? have ?? "";

  const title = quota
    ? "Today's AI allowance is spent"
    : upgrade
      ? `This one is a ${needLabel}-tier feature`
      : "✨ AI is for patrons";

  return (
    <div className="ql-paywall" onClick={() => setDetail(null)}>
      <style>{CSS}</style>
      <div className="ql-paywall-card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {quota && (
          <p>
            {haveLabel ? `${haveLabel} patrons get` : "Each account gets"} a daily allowance of AI
            generations so the lights stay on. It resets at midnight UTC — everything you already
            generated is saved. A higher tier has a bigger allowance.
          </p>
        )}
        {upgrade && (
          <p>
            You&rsquo;re on {haveLabel || "a text-only tier"}. Art, standees, backdrops, world maps
            and full Session Packs run on image models and long generations, so they live in the{" "}
            {needLabel} tier and up.
          </p>
        )}
        {!quota && !upgrade && (
          <p>
            Sheets, the live table, the board, dice, the projector and your players&rsquo; phones
            are free, forever. AI generation runs on paid models, so it&rsquo;s included with a
            QuestLab Patreon membership. Pick the tier that fits how you prep.
          </p>
        )}

        {plans && plans.length > 0 && (
          <div className="ql-plans">
            {plans.map((p) => {
              const isNeed = need === p.name;
              const isHave = have === p.name;
              return (
                <div key={p.name} className={`ql-plan${isNeed ? " need" : ""}${isHave ? " have" : ""}`}>
                  <span className="tag">{isHave ? "Your tier" : isNeed ? "Unlocks this" : " "}</span>
                  <b>{p.label}</b>
                  <span className="price">
                    {dollars(p.price_cents)} <small>/ month</small>
                  </span>
                  <span className="blurb">{p.blurb}</span>
                  <span className="daily">
                    {p.daily ? `${p.daily} generations a day` : "Unlimited"} ·{" "}
                    {p.scope === "all" ? "text + art + packs" : "text only"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {!quota && (
          <p style={{ color: "var(--muted, #9a9078)", fontSize: "0.82rem", marginTop: "0.8rem" }}>
            Already a patron? Link your Patreon to this account and the buttons unlock instantly.
            Everything you generate is yours to keep, even if you stop.
          </p>
        )}
        <div className="row">
          {detail.patreon_url && (
            <a className="btn btn-primary" href={detail.patreon_url} target="_blank" rel="noreferrer">
              {upgrade || (quota && have && have !== "free") ? "Change tier on Patreon" : "Support on Patreon"}
            </a>
          )}
          {!quota && signedIn && (
            <a className="btn" href={`${apiBase()}/auth/patreon/link`}>
              Link my Patreon
            </a>
          )}
          <button className="btn btn-ghost" onClick={() => setDetail(null)}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
