import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LayoutDashboard, ListOrdered, Smartphone, Swords } from "lucide-react";

import { api, apiBase } from "../api/client";
import BrandMark from "../components/BrandMark";
import D20Mark from "../components/D20Mark";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * Welcome / sign-in page (Plan 00035; redesigned in Plan 78; Lamplit in Plan 121).
 *
 * Standalone — no Layout chrome. One screen makes the case and takes the
 * sign-up: the pitch on the left, the account card on the right, then four
 * pillars and the three-step night. If a DM is already signed in, redirects
 * straight to the dashboard (or the ``next`` query param).
 */

interface Profile {
  email: string;
  display_name: string;
  avatar_url: string | null;
  discord_linked: boolean;
  patreon_linked: boolean;
  patron_active: boolean;
  is_admin: boolean;
  ai_allowed: boolean;
  ai_reason: string | null;
  ai_remaining_today: number | null;
  tier?: string;
  ai_daily_limit?: number | null;
}

interface Providers {
  providers: string[];
  mode: string;
  password_signup?: boolean;
}


const CSS = `
.ql-welcome { min-height: 100vh; padding: 0 1.25rem 3rem; color: var(--text); background: var(--bg); font-size: 16px; }
.ql-w-top { max-width: 1080px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 1.1rem 0; flex-wrap: wrap; }
.ql-w-brand { display: flex; align-items: center; gap: 0.55rem; color: var(--text); text-decoration: none; }
.ql-w-brand span { font-family: var(--font-story); font-weight: 700; font-size: 1.35rem; }
.ql-w-top nav { display: flex; gap: 0.25rem; font-size: 0.9375rem; flex-wrap: wrap; }
.ql-w-top nav a { color: var(--text2); text-decoration: none; padding: 0.55rem 0.7rem; border-radius: 8px; }
.ql-w-top nav a:hover { color: var(--text); background: var(--surface2); }
.ql-w-hero { max-width: 1080px; margin: 1.5rem auto 0; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 420px); gap: 3rem; align-items: start; }
.ql-w-die { margin: 0 0 1rem -4px; }
.ql-w-eyebrow { font-size: 0.875rem; font-weight: 600; color: var(--accent-text); margin: 0 0 0.6rem; }
.ql-w-hero h1 { font-family: var(--font-story); font-weight: 700; font-size: clamp(2rem, 4vw, 3rem); line-height: 1.08; color: var(--text); margin: 0 0 1rem; text-wrap: balance; }
.ql-w-lede { font-size: 1.125rem; line-height: 1.55; margin: 0 0 1.25rem; max-width: 34em; color: var(--text2); }
.ql-w-proof { list-style: none; padding: 0; margin: 0 0 1.25rem; display: flex; flex-direction: column; gap: 0.7rem; }
.ql-w-proof li { padding-left: 1.4rem; position: relative; line-height: 1.5; color: var(--text2); }
.ql-w-proof li::before { content: ""; position: absolute; left: 0.15rem; top: 0.55rem; width: 7px; height: 7px; transform: rotate(45deg); background: var(--accent-edge); }
.ql-w-proof b { color: var(--text); font-weight: 600; }
.ql-w-price { font-size: 0.9375rem; color: var(--muted); margin: 0; }
.ql-w-card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.5rem 1.5rem 1.4rem; }
.ql-w-card h2 { font-size: 1.25rem; margin: 0 0 0.4rem; }
.ql-w-sub { font-size: 0.9375rem; color: var(--text2); line-height: 1.5; margin: 0 0 1rem; }
.ql-w-form { display: flex; flex-direction: column; gap: 0.45rem; }
.ql-w-form label { margin: 0.3rem 0 0; }
.ql-w-form input { min-height: 44px; }
.ql-w-cta { margin-top: 0.6rem; width: 100%; min-height: 48px; font-size: 1rem; }
.ql-w-seg { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border); border-radius: 10px; padding: 4px; margin-bottom: 0.9rem; background: var(--bg); gap: 4px; }
.ql-w-seg button { border: 0; background: transparent; color: var(--text2); min-height: 40px; border-radius: 8px; font-size: 0.9375rem; font-weight: 500; cursor: pointer; }
.ql-w-seg button.on { background: var(--accent-active); color: var(--accent-active-text); }
.ql-w-or { text-align: center; color: var(--muted); font-size: 0.8125rem; margin: 0.85rem 0; }
.ql-w-provider { width: 100%; margin-bottom: 0.55rem; min-height: 46px; }
.ql-w-err { color: var(--danger-text); font-size: 0.9375rem; margin: 0.3rem 0 0; }
.ql-w-note { color: var(--muted); font-size: 0.875rem; margin: 0.9rem 0 0; line-height: 1.5; }
.ql-w-card details { margin-top: 0.9rem; color: var(--text2); font-size: 0.9375rem; }
.ql-w-card summary { cursor: pointer; min-height: 32px; }
.ql-w-pillars { max-width: 1080px; margin: 4rem auto 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.ql-w-pillar { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1.1rem 1.1rem 1.2rem; display: flex; flex-direction: column; gap: 0.45rem; }
.ql-w-pillar .ic { color: var(--accent-text); }
.ql-w-pillar h3 { font-size: 1.0625rem; margin: 0; }
.ql-w-pillar p { margin: 0; font-size: 0.9375rem; line-height: 1.5; color: var(--text2); }
.ql-w-steps { max-width: 1080px; margin: 3rem auto 0; }
.ql-w-steps h2 { font-size: 1.25rem; margin: 0 0 1rem; }
.ql-w-steps ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.ql-w-steps li { display: flex; gap: 0.8rem; align-items: flex-start; background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 1rem; line-height: 1.5; color: var(--text2); }
.ql-w-steps .k { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--border2); color: var(--text); display: flex; align-items: center; justify-content: center; font-family: var(--font-story); font-weight: 700; }
.ql-w-steps b { color: var(--text); font-weight: 600; }
.ql-w-foot { max-width: 1080px; margin: 3rem auto 0; display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; font-size: 0.8125rem; color: var(--muted); }
.ql-w-foot a { color: inherit; }
@media (max-width: 900px) {
  .ql-w-hero { grid-template-columns: 1fr; gap: 2rem; }
  .ql-w-pillars { grid-template-columns: 1fr 1fr; }
  .ql-w-steps ol { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .ql-welcome { padding: 0 1rem 2.5rem; }
  .ql-w-pillars { grid-template-columns: 1fr; margin-top: 2.5rem; }
  .ql-w-die svg { width: 88px; height: 88px; }
}
`;

export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dmEmail, token, setDmEmail, setToken, setProfile, signOut } = useAuthStore();
  const next = params.get("next") || "/";
  const error = params.get("error");
  // Plan 73 — which sign-in methods this deployment offers.
  const [providers, setProviders] = useState<Providers | null>(null);
  // Plan 73b — email + password accounts (the always-available path).
  const [tab, setTab] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<Providers>("/auth/providers")
      .then(setProviders)
      .catch(() => setProviders({ providers: [], mode: "header" }));
  }, []);

  // Plan 73 — OAuth callback lands here with #token=… (never sent to servers).
  useEffect(() => {
    const m = window.location.hash.match(/token=([^&]+)/);
    if (!m) return;
    const token = decodeURIComponent(m[1]);
    setToken(token);
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    api
      .get<Profile>("/auth/me")
      .then((me) => {
        setProfile(me);
        setDmEmail(me.email);
        navigate(next, { replace: true });
      })
      .catch(() => undefined);
  }, [navigate, next, setDmEmail, setProfile, setToken]);

  // If they're already signed in, skip the landing.
  // Plan 120 — a bare email is not "signed in" once the deployment requires
  // accounts: drop it and show the sign-in card instead of bouncing.
  useEffect(() => {
    if (!dmEmail || providers === null) return;
    if (providers.mode === "oauth" && !token) {
      signOut();
      return;
    }
    navigate(next, { replace: true });
  }, [dmEmail, token, providers, navigate, next, signOut]);

  // Plan 54 — on demo deployments the marketing landing IS the front door;
  // identity is pinned server-side, so there's nothing to sign into.
  useEffect(() => {
    if (import.meta.env.VITE_DEMO_MODE && !dmEmail) navigate("/try", { replace: true });
  }, [dmEmail, navigate]);

  async function handleAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const claim = String(form.get("claim_code") ?? "").trim();
    setBusy(true);
    setFormError(null);
    try {
      const res = await api.post<{ token: string; user: Profile }>(
        tab === "signup" ? "/auth/signup" : "/auth/login",
        tab === "signup"
          ? { name, email, password, ...(claim ? { claim_code: claim } : {}) }
          : { email, password },
      );
      setToken(res.token);
      setProfile(res.user);
      setDmEmail(res.user.email);
      navigate(next, { replace: true });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  function handleEmailOnly(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (email) {
      setDmEmail(email);
      navigate(next, { replace: true });
    }
  }

  const hasAccounts = !!providers && (providers.password_signup || providers.providers.length > 0);

  return (
    <div className="ql-welcome">
      <style>{CSS}</style>

      <header className="ql-w-top">
        <Link to="/try" className="ql-w-brand">
          <BrandMark size={22} />
          <span>QuestLab</span>
        </Link>
        <nav>
          <Link to="/try">What it is</Link>
          <Link to="/guide">Guide</Link>
          <Link to="/terms">Terms</Link>
          <a href="#account">Sign in</a>
        </nav>
      </header>

      <section className="ql-w-hero">
        <div className="ql-w-pitch">
          <div className="ql-w-die">
            <D20Mark size={112} />
          </div>
          <p className="ql-w-eyebrow">For D&amp;D 5e (2024 rules)</p>
          <h1>Run the table you&rsquo;ve been picturing.</h1>
          <p className="ql-w-lede">
            Your DM screen and initiative tracker, with every player&rsquo;s sheet on their own phone. Real
            dice, a real table, nothing to install.
          </p>
          <ul className="ql-w-proof">
            <li>
              <b>Minutes to the first roll.</b> Players scan the code or open a link, build a character,
              and they&rsquo;re in.
            </li>
            <li>
              <b>Nothing to refresh.</b> Damage you call lands on their phones in a second, and every
              phone knows whose turn it is.
            </li>
            <li>
              <b>One screen to run from.</b> The party, initiative, NPC cards and tonight&rsquo;s notes,
              together.
            </li>
          </ul>
          <p className="ql-w-price">
            Free for your table. No generative AI anywhere: rules by the book, art you bring.
          </p>
        </div>

        <section id="account" className="ql-w-card" aria-label="Sign in or create an account">
          <h2>Sign in or create an account</h2>
          {error && <p className="ql-w-err">{error}</p>}
          {providers === null ? null : hasAccounts ? (
            <>
              <p className="ql-w-sub">
                Your campaigns live under your account and nobody else sees them. Players never need
                one; they get a link or a QR.
              </p>
              {providers.providers.length > 0 && (
                <div>
                  {providers.providers.includes("discord") && (
                    <a className="btn btn-primary ql-w-provider" href={`${apiBase()}/auth/discord/start`}>
                      Continue with Discord
                    </a>
                  )}
                  {providers.providers.includes("patreon") && (
                    <a className="btn btn-secondary ql-w-provider" href={`${apiBase()}/auth/patreon/start`}>
                      Continue with Patreon
                    </a>
                  )}
                  {providers.password_signup && <div className="ql-w-or">or</div>}
                </div>
              )}
              {providers.password_signup && (
                <>
                  <div className="ql-w-seg" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === "signup"} className={tab === "signup" ? "on" : ""} onClick={() => setTab("signup")}>
                      Create account
                    </button>
                    <button type="button" role="tab" aria-selected={tab === "signin"} className={tab === "signin" ? "on" : ""} onClick={() => setTab("signin")}>
                      Sign in
                    </button>
                  </div>
                  <form onSubmit={(e) => void handleAccount(e)} className="ql-w-form">
                    {tab === "signup" && (
                      <>
                        <label htmlFor="acct-name">Your name</label>
                        <input id="acct-name" name="name" type="text" required autoComplete="name" placeholder="What your players call you" />
                      </>
                    )}
                    <label htmlFor="acct-email">Email</label>
                    <input id="acct-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
                    <label htmlFor="acct-password">Password</label>
                    <input
                      id="acct-password"
                      name="password"
                      type="password"
                      required
                      minLength={8}
                      autoComplete={tab === "signup" ? "new-password" : "current-password"}
                      placeholder={tab === "signup" ? "At least 8 characters" : "Your password"}
                    />
                    {tab === "signup" && (
                      <details open={!!formError && /claim code/i.test(formError)}>
                        <summary>Already running campaigns here under this email?</summary>
                        <label htmlFor="acct-claim">Claim code</label>
                        <input
                          id="acct-claim"
                          name="claim_code"
                          type="password"
                          autoComplete="off"
                          placeholder="From the server's settings"
                        />
                      </details>
                    )}
                    {formError && <p className="ql-w-err">{formError}</p>}
                    <button className="btn btn-primary ql-w-cta" type="submit" disabled={busy}>
                      {busy ? "One moment…" : tab === "signup" ? "Create my account" : "Sign in"}
                    </button>
                  </form>
                  {tab === "signin" && (
                    <p className="ql-w-note">
                      Forgot your password? Sign in with Discord using the same email, or contact support.
                    </p>
                  )}
                </>
              )}
              {providers.mode !== "oauth" && (
                <details>
                  <summary>Personal mode (email only, no password)</summary>
                  <form onSubmit={handleEmailOnly} className="ql-w-form" style={{ marginTop: "0.5rem" }}>
                    <label htmlFor="dm-email">DM email</label>
                    <input id="dm-email" name="email" type="email" required placeholder="you@example.com" />
                    <button className="btn btn-primary ql-w-cta" type="submit">Continue</button>
                  </form>
                </details>
              )}
            </>
          ) : (
            <>
              <p className="ql-w-sub">
                Your email stays on this device and marks which campaigns are yours. No password, no
                verification; change it any time from the sidebar.
              </p>
              <form onSubmit={handleEmailOnly} className="ql-w-form">
                <label htmlFor="dm-email">DM email</label>
                <input id="dm-email" name="email" type="email" required autoFocus placeholder="you@example.com" />
                <button className="btn btn-primary ql-w-cta" type="submit">
                  Continue
                </button>
              </form>
            </>
          )}
          <p className="ql-w-note">
            New here? Read <Link to="/guide">the 15-minute guide</Link>.
          </p>
        </section>
      </section>

      <section className="ql-w-pillars" aria-label="What QuestLab does">
        <Pillar icon={<LayoutDashboard size={22} />} title="A DM screen that keeps up" text="The whole party on one screen: hit points, conditions, who's concentrating. NPC cards and round beats a tap away; what you hide stays hidden." />
        <Pillar icon={<ListOrdered size={22} />} title="Initiative that keeps itself" text="Heroes and monsters in one list, sorted as the rolls come in. One button moves the turn, and every phone follows." />
        <Pillar icon={<Smartphone size={22} />} title="A sheet on every phone" text="Tap a number to roll it. As much help as each player wants: plain words for new players, just the numbers for veterans." />
        <Pillar icon={<Swords size={22} />} title="A practice arena" text="Players spar with a catalog foe using their real sheet: every die shown, a coach's tip when it matters." />
      </section>

      <section className="ql-w-steps" aria-label="How a night goes">
        <h2>A night, start to finish</h2>
        <ol>
          <li>
            <span className="k">I</span>
            <div>
              <b>Make a campaign.</b> Or take the sample one and be running in five minutes.
            </div>
          </li>
          <li>
            <span className="k">II</span>
            <div>
              <b>Bring the players in.</b> They scan the code on the TV or open your link, build or claim a
              character, and their phone becomes their sheet.
            </div>
          </li>
          <li>
            <span className="k">III</span>
            <div>
              <b>Roll initiative and play.</b> Call damage, track turns and conditions. Everyone&rsquo;s phone
              follows.
            </div>
          </li>
        </ol>
      </section>

      <footer className="ql-w-foot">
        <span>QuestLab · 2026</span>
        <span>·</span>
        <span>SRD 5.2.1 content under CC-BY 4.0</span>
        <span>·</span>
        <span>Not affiliated with Wizards of the Coast</span>
        <span>·</span>
        <Link to="/guide">Guide</Link>
        <span>·</span>
        <Link to="/terms">Terms</Link>
      </footer>
    </div>
  );
}

function Pillar({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="ql-w-pillar">
      <span className="ic" aria-hidden>
        {icon}
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
