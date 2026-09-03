import { useEffect, useState } from "react";

import { apiBase } from "../api/client";

/**
 * PaywallModal (Plan 73) — one modal for every AI button.
 *
 * The API answers gated AI calls with 402 (Patreon required) or 429 (daily
 * allowance spent) carrying a structured detail; the client turns that into
 * a `ql:paywall` window event and this modal explains what to do next.
 */
interface PaywallDetail {
  code?: string;
  patreon_url?: string | null;
}

const CSS = `
.ql-paywall { position: fixed; inset: 0; z-index: 400; display: flex; align-items: center; justify-content: center; background: rgba(6,5,10,0.78); backdrop-filter: blur(4px); }
.ql-paywall-card { width: min(460px, 92vw); background: var(--surface, #16121f); border: 1px solid var(--gold, #d6af36); border-radius: 14px; padding: 1.4rem 1.5rem; color: var(--text, #e6ddc8); box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
.ql-paywall h3 { font-family: Cinzel, Georgia, serif; color: var(--gold, #d6af36); margin: 0 0 0.5rem; letter-spacing: 0.04em; }
.ql-paywall p { margin: 0.4rem 0; line-height: 1.5; }
.ql-paywall .row { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
`;

export default function PaywallModal() {
  const [detail, setDetail] = useState<PaywallDetail | null>(null);

  useEffect(() => {
    const on = (e: Event) => setDetail((e as CustomEvent<PaywallDetail>).detail ?? {});
    window.addEventListener("ql:paywall", on);
    return () => window.removeEventListener("ql:paywall", on);
  }, []);

  if (!detail) return null;
  const quota = detail.code === "daily_limit";
  const signedIn = !!localStorage.getItem("ql_token");
  return (
    <div className="ql-paywall" onClick={() => setDetail(null)}>
      <style>{CSS}</style>
      <div className="ql-paywall-card" onClick={(e) => e.stopPropagation()}>
        <h3>{quota ? "Today's AI allowance is spent" : "✨ AI features are for patrons"}</h3>
        {quota ? (
          <p>
            Each account gets a daily allowance of AI generations so the lights stay on. It resets at
            midnight UTC — everything you already generated is saved.
          </p>
        ) : (
          <>
            <p>
              Sheets, the live table, dice, the projector, and your players' phones are free. AI
              generation — portraits, standees, maps, runbooks, session packs — runs on paid models,
              so it's included with a QuestLab Patreon membership.
            </p>
            <p style={{ color: "var(--muted, #9a9078)", fontSize: "0.85rem" }}>
              Already a patron? Link your Patreon to this account and the buttons unlock instantly.
            </p>
          </>
        )}
        <div className="row">
          {!quota && detail.patreon_url && (
            <a className="btn btn-primary" href={detail.patreon_url} target="_blank" rel="noreferrer">
              Support on Patreon
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
