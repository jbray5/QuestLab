import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { api, apiBase } from "../api/client";
import D20Mark from "../components/D20Mark";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * Welcome / landing page (Plan 00035; redesigned in Plan 78).
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

const BLOB = "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/";
const REEL = {
  mp4: BLOB + "e1b8dab4-e40f-410c-86bc-3a48f2d00ab3-khtQVaoR7hj6gT0YhYlsl3zmdc3PQC.mp4",
  webm: BLOB + "327cfc70-4c27-4148-baca-06eecf834062-d1hBrqdMEHXHXCcAVosEH9EdFE5IY1.webm",
  poster: BLOB + "c95663fb-e304-4468-895c-e47d1b2b80bc-5eyLEhjvvmkObmgjVjGEqm9IbWTAHV.webp",
};
const STILL = {
  board: BLOB + "ef84a836-06a9-4dfc-add1-f990310fe6dd-VWRtaAvoDneMrO8aPYpigxojnVH3Av.webp",
  phone: BLOB + "4571fdd8-f3e4-45bd-83a1-9e47028c7a7b-30RrlUxGWrG6i0Z4KQAzGCSbhyOA1t.webp",
  cockpit: BLOB + "b07c2faf-bc55-4b0a-98a9-d10c53e71953-sYAR0zY18gAIbmdMguDEPPloOBIvXO.webp",
};

const CSS = `
.ql-welcome { min-height: 100vh; padding: 0 1.25rem 3rem; color: var(--text);
  background:
    radial-gradient(1100px 560px at 15% -8%, rgba(201,168,76,0.11), transparent 62%),
    radial-gradient(900px 520px at 100% 18%, rgba(139,26,26,0.18), transparent 60%),
    var(--bg); }
.ql-w-top { max-width: 1080px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 0; }
.ql-w-brand { font-family: "Cinzel Decorative", serif; color: var(--gold); letter-spacing: 0.08em; font-size: 1rem; }
.ql-w-top nav { display: flex; gap: 1.25rem; font-size: 0.85rem; }
.ql-w-top a { color: var(--muted); text-decoration: none; }
.ql-w-top a:hover { color: var(--gold); }
.ql-w-hero { max-width: 1080px; margin: 1.25rem auto 0; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 420px); gap: 3rem; align-items: center; }
.ql-w-die { margin: 0 0 0.75rem -6px; }
.ql-w-eyebrow { text-transform: uppercase; letter-spacing: 0.18em; font-size: 0.7rem; color: var(--gold); margin: 0 0 0.55rem; }
.ql-w-hero h1 { font-family: "Cinzel Decorative", serif; font-size: clamp(1.7rem, 3.3vw, 2.5rem); line-height: 1.15; color: var(--parch); margin: 0 0 0.9rem; text-wrap: balance; }
.ql-w-lede { font-size: 1.12rem; line-height: 1.55; margin: 0 0 1.1rem; max-width: 34em; opacity: 0.92; }
.ql-w-proof { list-style: none; padding: 0; margin: 0 0 1.1rem; display: flex; flex-direction: column; gap: 0.55rem; }
.ql-w-proof li { padding-left: 1.4rem; position: relative; line-height: 1.45; font-size: 0.98rem; }
.ql-w-proof li::before { content: "◆"; position: absolute; left: 0; top: 0.2rem; color: var(--gold); font-size: 0.65rem; }
.ql-w-proof b { color: var(--parch2); font-weight: 600; }
.ql-w-price { font-size: 0.86rem; color: var(--muted); margin: 0; }
.ql-w-card { background: linear-gradient(180deg, rgba(32,30,38,0.92), rgba(22,22,26,0.96)); border: 1px solid var(--gold); border-radius: 14px; padding: 1.5rem 1.6rem 1.4rem; box-shadow: 0 24px 60px rgba(0,0,0,0.5), 0 0 60px rgba(201,168,76,0.08); }
.ql-w-card h2 { font-family: "Cinzel Decorative", serif; color: var(--gold); font-size: 1.15rem; margin: 0 0 0.4rem; text-align: center; letter-spacing: 0.03em; }
.ql-w-sub { font-size: 0.84rem; color: var(--muted); text-align: center; line-height: 1.5; margin: 0 0 1rem; }
.ql-w-form { display: flex; flex-direction: column; gap: 0.5rem; }
.ql-w-form label { font-size: 0.64rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
.ql-w-form input { padding: 0.62rem 0.75rem; font-size: 1rem; background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; color: var(--text); font-family: inherit; }
.ql-w-form input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(201,168,76,0.18); }
.ql-w-cta { margin-top: 0.4rem; font-size: 0.98rem; padding: 0.68rem 1rem; width: 100%; }
.ql-w-seg { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid var(--border); border-radius: 999px; padding: 3px; margin-bottom: 0.9rem; background: var(--surface2); }
.ql-w-seg button { border: 0; background: transparent; color: var(--muted); padding: 0.42rem; border-radius: 999px; font-family: inherit; font-size: 0.92rem; cursor: pointer; }
.ql-w-seg button.on { background: var(--crimson); color: #fff; }
.ql-w-or { text-align: center; color: var(--muted); font-size: 0.7rem; letter-spacing: 0.18em; margin: 0.85rem 0; }
.ql-w-provider { display: block; text-align: center; width: 100%; margin-bottom: 0.55rem; }
.ql-w-err { color: var(--danger); font-size: 0.88rem; margin: 0.2rem 0 0; text-align: center; }
.ql-w-note { text-align: center; color: var(--muted); font-size: 0.8rem; margin: 0.75rem 0 0; line-height: 1.45; }
.ql-w-note a { color: var(--gold); }
.ql-w-card details { margin-top: 0.9rem; color: var(--muted); font-size: 0.82rem; }
.ql-w-card summary { cursor: pointer; }
.ql-w-reel { max-width: 1080px; margin: 3.25rem auto 0; }
.ql-w-tv { position: relative; border-radius: 14px; overflow: hidden; border: 1px solid rgba(201,168,76,0.45); background: #06060b; box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 6px rgba(22,22,26,0.9), 0 0 0 7px rgba(201,168,76,0.25); aspect-ratio: 16 / 9; }
.ql-w-tv video { width: 100%; height: 100%; display: block; object-fit: cover; }
.ql-w-reel figcaption { display: flex; flex-wrap: wrap; gap: 0.4rem 1.2rem; justify-content: center; margin-top: 0.9rem; font-size: 0.82rem; color: var(--muted); }
.ql-w-reel figcaption b { color: var(--parch2); font-weight: 600; }
.ql-w-pillar-img { display: block; width: 100%; aspect-ratio: 16 / 10; object-fit: cover; object-position: top; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 0.7rem; background: #0b0b10; }
.ql-w-pillar-img.phone { object-position: center top; aspect-ratio: 16 / 10; }
.ql-w-pillars { max-width: 1080px; margin: 3rem auto 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; }
.ql-w-pillar { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 1.1rem 1.1rem 1.2rem; transition: border-color 0.2s, transform 0.2s; }
.ql-w-pillar:hover { border-color: rgba(201,168,76,0.55); transform: translateY(-2px); }
.ql-w-pillar .ic { font-size: 1.5rem; margin-bottom: 0.45rem; line-height: 1; }
.ql-w-pillar h3 { font-family: "Cinzel Decorative", serif; font-size: 0.84rem; color: var(--gold); margin: 0 0 0.4rem; letter-spacing: 0.03em; line-height: 1.35; }
.ql-w-pillar p { margin: 0; font-size: 0.86rem; line-height: 1.45; opacity: 0.85; }
.ql-w-steps { max-width: 1080px; margin: 3rem auto 0; }
.ql-w-steps h2 { font-family: "Cinzel Decorative", serif; color: var(--parch); font-size: 1.15rem; margin: 0 0 1rem; text-align: center; letter-spacing: 0.03em; }
.ql-w-steps ol { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; }
.ql-w-steps li { display: flex; gap: 0.8rem; align-items: flex-start; background: rgba(22,22,26,0.65); border: 1px solid var(--border); border-radius: 12px; padding: 1rem; font-size: 0.9rem; line-height: 1.45; }
.ql-w-steps .k { flex-shrink: 0; width: 30px; height: 30px; border-radius: 50%; border: 1px solid var(--gold); color: var(--gold); display: flex; align-items: center; justify-content: center; font-family: "Cinzel Decorative", serif; font-size: 0.85rem; }
.ql-w-steps b { color: var(--parch2); }
.ql-w-foot { max-width: 1080px; margin: 3rem auto 0; display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: center; font-size: 0.72rem; color: var(--muted); }
.ql-w-foot a { color: inherit; }
@media (max-width: 900px) {
  .ql-w-hero { grid-template-columns: 1fr; gap: 1.8rem; }
  .ql-w-pillars { grid-template-columns: 1fr 1fr; }
  .ql-w-steps ol { grid-template-columns: 1fr; }
}
@media (max-width: 560px) {
  .ql-welcome { padding: 0 1rem 2.5rem; }
  .ql-w-proof { display: none; }
  .ql-w-lede { margin-bottom: 0.7rem; }
  .ql-w-pillars { grid-template-columns: 1fr; margin-top: 2.5rem; }
  .ql-w-hero h1 { font-size: 1.55rem; }
  .ql-w-die svg { width: 116px; height: 116px; }
  .ql-w-lede { font-size: 1.02rem; }
}
@media (prefers-reduced-motion: reduce) { .ql-w-pillar { transition: none; } }
`;

export default function Welcome() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dmEmail, setDmEmail, setToken, setProfile } = useAuthStore();
  const next = params.get("next") || "/";
  const error = params.get("error");
  // Plan 73 — which sign-in methods this deployment offers.
  const [providers, setProviders] = useState<Providers | null>(null);
  // Plan 73b — email + password accounts (the always-available path).
  const [tab, setTab] = useState<"signup" | "signin">("signup");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Plan 79 — muted autoplay is allowed everywhere, but a few browsers still
  // wait for a nudge; kick the reel once it is on screen.
  const reelRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = reelRef.current;
    if (!v) return;
    const kick = () => void v.play().catch(() => undefined);
    const io = new IntersectionObserver((entries) => entries.forEach((e) => (e.isIntersecting ? kick() : v.pause())), { threshold: 0.25 });
    io.observe(v);
    kick();
    return () => io.disconnect();
  }, []);
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
      const res = await api.post<{ token: string; user: Profile }>(
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
        <span className="ql-w-brand">⚔ QuestLab</span>
        <nav>
          <Link to="/guide">Guide</Link>
          <Link to="/terms">Terms</Link>
          <a href="#account">Sign in</a>
        </nav>
      </header>

      <section className="ql-w-hero">
        <div className="ql-w-pitch">
          <div className="ql-w-die">
            <D20Mark size={160} />
          </div>
          <p className="ql-w-eyebrow">A table tool for D&amp;D 5e (2024)</p>
          <h1>Run the table you&rsquo;ve been picturing.</h1>
          <p className="ql-w-lede">
            A shared board on the TV. A living sheet on every phone. Dice you shake. Your prep on one
            screen. In person, online, or both.
          </p>
          <ul className="ql-w-proof">
            <li>
              <b>Minutes to the first roll.</b> Players scan the QR on the TV, build a character, and
              they&rsquo;re on the board.
            </li>
            <li>
              <b>Nothing to refresh.</b> Damage you apply lands on their phones in a second; conditions
              show up on the board.
            </li>
            <li>
              <b>One screen to run from.</b> Party HP, initiative, the live board, and tonight&rsquo;s
              notes in one cockpit.
            </li>
          </ul>
          <p className="ql-w-price">Free, forever, for the table. AI prep for patrons from $5 a month.</p>
        </div>

        <section id="account" className="ql-w-card" aria-label="Sign in or create an account">
          <h2>Enter the lab</h2>
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
                  {providers.password_signup && <div className="ql-w-or">OR</div>}
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
                    {formError && <p className="ql-w-err">{formError}</p>}
                    <button className="btn btn-primary ql-w-cta" type="submit" disabled={busy}>
                      {busy ? "One moment…" : tab === "signup" ? "Create my account →" : "Sign in →"}
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
                    <button className="btn btn-primary ql-w-cta" type="submit">Continue →</button>
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
                  Continue →
                </button>
              </form>
            </>
          )}
          <p className="ql-w-note">
            New here? Read <Link to="/guide">the 15-minute guide</Link>.
          </p>
        </section>
      </section>

      <figure className="ql-w-reel" aria-label="Twenty seconds at the table">
        <div className="ql-w-tv">
          <video ref={reelRef} autoPlay muted loop playsInline preload="auto" poster={REEL.poster}>
            <source src={REEL.webm} type="video/webm" />
            <source src={REEL.mp4} type="video/mp4" />
          </video>
        </div>
        <figcaption>
          <span><b>What the TV shows.</b> A map arrives with a title card, the party&rsquo;s tokens are on it, a player&rsquo;s d20 tumbles across the board and lands.</span>
          <span>Hand-inked maps, no AI art.</span>
        </figcaption>
      </figure>

      <section className="ql-w-pillars" aria-label="What QuestLab does">
        <Pillar
          image={STILL.board}
          alt="The 3D table view: an inked tavern map with lettered party and bandit tokens"
          icon="🗺"
          title="The board on the TV"
          text="Stage a map, reveal it with a cinematic, move tokens on a 3D table. HP, conditions and whose turn it is live right on it."
        />
        <Pillar
          image={STILL.phone}
          alt="A character sheet on a phone: HP, AC, saves, damage and heal buttons"
          icon="📱"
          title="A living sheet on every phone"
          text="Spells, slots, rests, inventory, death saves, all self-service. Shake to roll and the die lands on the shared board."
        />
        <Pillar
          image={STILL.cockpit}
          alt="The DM cockpit: party HP, initiative strip, the live board and notes on one screen"
          icon="🎬"
          title="A DM cockpit"
          text="Party HP, initiative and the live board over tonight's notes, on one screen. Press N for your notes anywhere."
        />
        <Pillar
          icon="✨"
          title="AI prep for patrons"
          text="NPCs with secrets, encounters, runbooks, full Session Packs, portraits and standees. From $5 a month; everything else is free."
        />
      </section>

      <section className="ql-w-steps" aria-label="How a night goes">
        <h2>A night, start to finish</h2>
        <ol>
          <li>
            <span className="k">1</span>
            <div>
              <b>Make a campaign.</b> Or take the sample one and be running in five minutes.
            </div>
          </li>
          <li>
            <span className="k">2</span>
            <div>
              <b>Put the QR on the TV.</b> Players scan it, build or claim a character, and their phone
              becomes their sheet.
            </div>
          </li>
          <li>
            <span className="k">3</span>
            <div>
              <b>Stage a map and roll initiative.</b> Move tokens, apply damage, drop conditions.
              Everyone&rsquo;s screen follows.
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

function Pillar({
  icon,
  title,
  text,
  image,
  alt,
}: {
  icon: string;
  title: string;
  text: string;
  image?: string;
  alt?: string;
}) {
  return (
    <div className="ql-w-pillar">
      {image ? (
        <img className="ql-w-pillar-img" src={image} alt={alt ?? ""} loading="lazy" />
      ) : (
        <div className="ic" aria-hidden>
          {icon}
        </div>
      )}
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
