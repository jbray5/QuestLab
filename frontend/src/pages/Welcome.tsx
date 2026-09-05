import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, apiBase } from "../api/client";

import Flourish from "../components/Flourish";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * Welcome / landing page (Plan 00035).
 *
 * Standalone — no Layout chrome, no sidebar. Pitches QuestLab and
 * collects the DM email that becomes the identity. If a DM is already
 * signed in, redirects straight to the dashboard (or the ``next`` query
 * param if present).
 */
export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dmEmail, setDmEmail, setToken, setProfile } = useAuthStore();
  const next = params.get("next") || "/";
  const error = params.get("error");
  // Plan 73 — which sign-in methods this deployment offers.
  const [providers, setProviders] = useState<{ providers: string[]; mode: string; password_signup?: boolean } | null>(null);
  // Plan 73b — email + password accounts (the always-available path).
  const [tab, setTab] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  useEffect(() => {
    api
      .get<{ providers: string[]; mode: string; password_signup?: boolean }>("/auth/providers")
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
      .get<{ email: string; display_name: string; avatar_url: string | null; discord_linked: boolean; patreon_linked: boolean; patron_active: boolean; is_admin: boolean; ai_allowed: boolean; ai_reason: string | null; ai_remaining_today: number | null }>("/auth/me")
      .then((me) => {
        setProfile(me);
        setDmEmail(me.email);
        navigate(next, { replace: true });
      })
      .catch(() => undefined);
  }, [navigate, next, setDmEmail, setProfile, setToken]);

  // If they're already signed in, skip the landing.
  useEffect(() => {
    if (dmEmail) navigate(next, { replace: true });
  }, [dmEmail, navigate, next]);

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
    setBusy(true);
    setFormError(null);
    try {
      const res = await api.post<{ token: string; user: { email: string; display_name: string; avatar_url: string | null; discord_linked: boolean; patreon_linked: boolean; patron_active: boolean; is_admin: boolean; ai_allowed: boolean; ai_reason: string | null; ai_remaining_today: number | null } }>(
        tab === "signup" ? "/auth/signup" : "/auth/login",
        tab === "signup" ? { name, email, password } : { email, password },
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

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    if (email) {
      setDmEmail(email);
      navigate(next, { replace: true });
    }
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle} className="ql-modal-in">
        {/* Hero */}
        <header style={heroStyle}>
          <img src="/d20.svg" alt="" aria-hidden style={d20Style} />
          <h1 style={titleStyle}>QuestLab</h1>
          <Flourish width={220} />
          <p style={taglineStyle}>
            An AI campaign studio for D&amp;D 5e (2024). Plan your worlds,
            run your sessions, and put a living sheet in every player&apos;s hand.
          </p>
        </header>

        {/* Feature grid */}
        <section style={featuresStyle}>
          <Feature
            icon="🧙"
            title="Full character sheets"
            desc="2024 rules — spells, weapons, attacks, features, rest, inspiration, death saves, exhaustion, hit dice. The real ones."
          />
          <Feature
            icon="📱"
            title="A live sheet per player"
            desc="Each player gets a URL on their phone. HP, slots, hit dice — all self-service. The DM doesn't bottleneck."
          />
          <Feature
            icon="⚡"
            title="Live sync"
            desc="DM applies damage on the HUD; the player's phone updates within a second. No refresh."
          />
          <Feature
            icon="✨"
            title="AI for patrons"
            desc="NPCs with secrets, encounters, runbooks and full Session Packs for prep; portraits, standees and maps for the table. Included with a Patreon membership from $5 a month. Everything else is free."
          />
          <Feature
            icon="🎲"
            title="Real-die first"
            desc="Players still roll real dice at the table. The app shows the total + crit / fumble effects with confetti and sound."
          />
          <Feature
            icon="📖"
            title="DM screen on tap"
            desc="11 tabs of 2024 rules — conditions, actions, cover, hazards. Searchable. Open mid-session."
          />
        </section>

        {/* Sign-in card */}
        <section style={signInCardStyle}>
          <h2 style={signInTitleStyle}>Enter the lab</h2>
          {error && (
            <p style={{ color: "var(--danger, #ef5350)", textAlign: "center", margin: "0 0 0.8rem" }}>{error}</p>
          )}
          {providers === null ? null : providers.password_signup || providers.providers.length > 0 ? (
            <>
              <p style={signInSubtitleStyle}>
                Your campaigns are tied to your account — nobody else can see them. Players never
                need an account; they get a link or a QR code.
              </p>
              {providers.providers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem", alignItems: "center", marginBottom: "0.9rem" }}>
                  {providers.providers.includes("discord") && (
                    <a className="btn btn-primary" style={ctaBtnStyle} href={`${apiBase()}/auth/discord/start`}>
                      Continue with Discord
                    </a>
                  )}
                  {providers.providers.includes("patreon") && (
                    <a className="btn" style={ctaBtnStyle} href={`${apiBase()}/auth/patreon/start`}>
                      Continue with Patreon
                    </a>
                  )}
                  {providers.password_signup && (
                    <div style={{ color: "var(--muted)", fontSize: "0.8rem", letterSpacing: "0.1em" }}>— OR —</div>
                  )}
                </div>
              )}
              {providers.password_signup && (
                <>
                  <div style={{ display: "flex", gap: "0.4rem", justifyContent: "center", marginBottom: "0.8rem" }}>
                    <button type="button" className={`btn ${tab === "signup" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("signup")}>
                      Create account
                    </button>
                    <button type="button" className={`btn ${tab === "signin" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("signin")}>
                      Sign in
                    </button>
                  </div>
                  <form onSubmit={(e) => void handleAccount(e)} style={formStyle}>
                    {tab === "signup" && (
                      <>
                        <label htmlFor="acct-name" style={labelStyle}>Your name</label>
                        <input id="acct-name" name="name" type="text" required autoComplete="name" placeholder="What your players call you" style={inputStyle} />
                      </>
                    )}
                    <label htmlFor="acct-email" style={labelStyle}>Email</label>
                    <input id="acct-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" style={inputStyle} />
                    <label htmlFor="acct-password" style={labelStyle}>Password</label>
                    <input id="acct-password" name="password" type="password" required minLength={8} autoComplete={tab === "signup" ? "new-password" : "current-password"} placeholder={tab === "signup" ? "At least 8 characters" : "Your password"} style={inputStyle} />
                    {formError && <p style={{ color: "var(--danger, #ef5350)", margin: "0.2rem 0 0", fontSize: "0.9rem" }}>{formError}</p>}
                    <button className="btn btn-primary" type="submit" style={ctaBtnStyle} disabled={busy}>
                      {busy ? "One moment…" : tab === "signup" ? "Create my account →" : "Sign in →"}
                    </button>
                  </form>
                  {tab === "signin" && (
                    <p style={{ textAlign: "center", color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.6rem" }}>
                      Forgot your password? Sign in with Discord using the same email, or contact support.
                    </p>
                  )}
                </>
              )}
              {providers.mode !== "oauth" && (
                <details style={{ marginTop: "1rem", color: "var(--muted)", fontSize: "0.85rem" }}>
                  <summary style={{ cursor: "pointer" }}>Personal mode (email only, no password)</summary>
                  <form onSubmit={handleSubmit} style={formStyle}>
                    <label htmlFor="dm-email" style={labelStyle}>DM email</label>
                    <input id="dm-email" name="email" type="email" required placeholder="you@example.com" style={inputStyle} />
                    <button className="btn btn-primary" type="submit" style={ctaBtnStyle}>Continue →</button>
                  </form>
                </details>
              )}
            </>
          ) : (
            <>
              <p style={signInSubtitleStyle}>
                Your email is stored on this device only. It identifies which
                campaigns belong to you. No password, no verification — change
                it any time from the sidebar.
              </p>
              <form onSubmit={handleSubmit} style={formStyle}>
                <label htmlFor="dm-email" style={labelStyle}>
                  DM email
                </label>
                <input
                  id="dm-email"
                  name="email"
                  type="email"
                  required
                  autoFocus
                  placeholder="you@example.com"
                  style={inputStyle}
                />
                <button className="btn btn-primary" type="submit" style={ctaBtnStyle}>
                  Continue →
                </button>
              </form>
            </>
          )}
          <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.85rem" }}>
            New here? Read <Link to="/guide" style={{ color: "var(--gold)" }}>the 15-minute guide</Link>.
          </p>
        </section>

        <footer style={footerStyle}>
          <span>QuestLab · 2026</span>
          <span>·</span>
          <span>SRD 5.2.1 content used under CC-BY 4.0</span>
          <span>·</span>
          <Link to="/guide" style={{ color: "inherit" }}>Guide</Link>
          <span>·</span>
          <Link to="/terms" style={{ color: "inherit" }}>Terms</Link>
        </footer>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div style={featureCardStyle}>
      <div style={{ fontSize: "1.6rem", marginBottom: "0.3rem" }}>{icon}</div>
      <h3
        style={{
          margin: 0,
          fontSize: "0.95rem",
          color: "var(--gold)",
          fontFamily: "Cinzel Decorative, serif",
          letterSpacing: "0.04em",
        }}
      >
        {title}
      </h3>
      <p
        style={{
          margin: "0.3rem 0 0",
          fontSize: "0.82rem",
          color: "var(--text)",
          opacity: 0.85,
          lineHeight: 1.45,
        }}
      >
        {desc}
      </p>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "3rem 1rem",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
};

const containerStyle: React.CSSProperties = {
  maxWidth: 880,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: "2rem",
};

const heroStyle: React.CSSProperties = {
  textAlign: "center",
};

const d20Style: React.CSSProperties = {
  width: 96,
  height: 96,
  marginBottom: "0.4rem",
  filter: "drop-shadow(0 0 24px rgba(201, 168, 76, 0.35))",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "2.4rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  letterSpacing: "0.06em",
};

const taglineStyle: React.CSSProperties = {
  margin: "0.5rem auto 0",
  maxWidth: 560,
  fontStyle: "italic",
  color: "var(--text)",
  opacity: 0.85,
  fontSize: "1.02rem",
  lineHeight: 1.5,
};

const featuresStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: "0.85rem",
};

const featureCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "0.85rem 1rem",
  transition: "transform 180ms ease, border-color 180ms ease",
};

const signInCardStyle: React.CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--gold)",
  borderRadius: 12,
  padding: "1.5rem 1.75rem",
  boxShadow: "0 8px 40px rgba(0,0,0,0.45), 0 0 60px rgba(201, 168, 76, 0.08)",
  maxWidth: 520,
  margin: "0 auto",
  width: "100%",
};

const signInTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "1.3rem",
  color: "var(--gold)",
  fontFamily: "Cinzel Decorative, serif",
  textAlign: "center",
};

const signInSubtitleStyle: React.CSSProperties = {
  margin: "0.5rem 0 1.1rem",
  fontSize: "0.85rem",
  color: "var(--muted)",
  textAlign: "center",
  lineHeight: 1.5,
};

const formStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.5rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.65rem",
  color: "var(--muted)",
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const inputStyle: React.CSSProperties = {
  padding: "0.55rem 0.75rem",
  fontSize: "1rem",
  background: "var(--surface2)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
};

const ctaBtnStyle: React.CSSProperties = {
  marginTop: "0.4rem",
  fontSize: "0.95rem",
  padding: "0.55rem 1rem",
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  justifyContent: "center",
  fontSize: "0.7rem",
  color: "var(--muted)",
  flexWrap: "wrap",
};
