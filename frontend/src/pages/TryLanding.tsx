import { useState, type CSSProperties, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDown, Lock, Play } from "lucide-react";

import { api } from "../api/client";
import BrandMark from "../components/BrandMark";
import { NIGHT_SCENE } from "../components/landing/nightScene.generated";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * TryLanding — the public page at /try (Plan 54; rebuilt in Lamplit, Plan 121).
 *
 * A night scene drawn entirely by code (tools/landing/gen_night_scene.py) moves in
 * layers as you scroll; the page pitches the DM screen, the initiative tracker,
 * prep and players' phones. No generative-AI art, and never the private 3D table
 * or VTT gameplay. Offers the sandbox demo when this deployment runs in demo mode,
 * and captures beta-waitlist emails. Standalone: no app chrome, no auth.
 */

const DEMO = !!import.meta.env.VITE_DEMO_MODE;

const CSS = `
.tl-root{background:var(--bg);color:var(--text);font-family:var(--font-ui);font-size:17px;line-height:1.55}
.tl-wrap{width:100%;max-width:1200px;margin:0 auto;box-sizing:border-box;padding:0 24px}
.tl-hero{position:relative;min-height:780px;overflow:clip;display:flex;flex-direction:column;
  background:linear-gradient(180deg,#090E0C 0%,#0F1916 46%,#1B2B25 70%,var(--bg) 100%)}
.tl-layer{position:absolute;inset:0}
.tl-h2{margin:0;font-family:var(--font-story);font-weight:700;font-size:clamp(34px,4vw,48px);line-height:1.08;text-wrap:balance}
.tl-p{margin:0;color:var(--text2);text-wrap:pretty}
.tl-panel{border:1px solid var(--border);border-radius:14px;background:var(--surface);box-shadow:0 30px 80px rgba(0,0,0,.45)}
.tl-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(440px,100%),1fr));gap:48px 64px;align-items:center}
@keyframes tl-twinkle{0%,100%{opacity:.9}50%{opacity:.2}}
@keyframes tl-smoke{0%{transform:translate(0,0) scale(.5);opacity:0}15%{opacity:.16}100%{transform:translate(34px,-96px) scale(2.4);opacity:0}}
@keyframes tl-mist{from{transform:translateX(-70px)}to{transform:translateX(70px)}}
@keyframes tl-shimmer{0%,100%{opacity:.6}50%{opacity:.15}}
@keyframes tl-flicker{0%,100%{opacity:1}30%{opacity:.82}34%{opacity:.95}62%{opacity:.76}70%{opacity:.92}}
@keyframes tl-fly{0%{transform:translate(0,0);opacity:0}20%{opacity:1}50%{transform:translate(26px,-44px)}80%{opacity:.85}100%{transform:translate(-12px,-96px);opacity:0}}
@keyframes tl-plx-sky{to{transform:translateY(420px)}}
@keyframes tl-plx-far{to{transform:translateY(300px)}}
@keyframes tl-plx-mid{to{transform:translateY(190px)}}
@keyframes tl-plx-near{to{transform:translateY(70px)}}
@keyframes tl-plx-copy{to{transform:translateY(150px);opacity:0}}
@keyframes tl-rise{from{opacity:0;transform:translateY(48px)}to{opacity:1;transform:none}}
.tl-root .ql-tw{animation:tl-twinkle 4s ease-in-out infinite}
.tl-root .ql-smoke{transform-box:fill-box;transform-origin:center;animation:tl-smoke 9.6s linear infinite}
.tl-root .ql-shim{animation:tl-shimmer 3.2s ease-in-out infinite}
.tl-root .ql-flick{animation:tl-flicker 2.8s ease-in-out infinite}
.tl-mist{animation:tl-mist 28s ease-in-out infinite alternate}
.tl-fly{position:absolute;width:4px;height:4px;border-radius:50%;background:#F4C27F;box-shadow:0 0 10px 3px rgba(244,194,127,.5);animation:tl-fly 9s ease-in-out infinite}
@supports (animation-timeline: scroll()){
  .tl-plx-sky,.tl-plx-far,.tl-plx-mid,.tl-plx-near,.tl-plx-copy{animation-duration:1ms;animation-timing-function:linear;animation-fill-mode:both;animation-timeline:scroll(root);animation-range:0px 760px}
  .tl-plx-sky{animation-name:tl-plx-sky}.tl-plx-far{animation-name:tl-plx-far}.tl-plx-mid{animation-name:tl-plx-mid}.tl-plx-near{animation-name:tl-plx-near}.tl-plx-copy{animation-name:tl-plx-copy}
  .tl-rise{animation-name:tl-rise;animation-duration:1ms;animation-timing-function:ease-out;animation-fill-mode:both;animation-timeline:view();animation-range:entry 0% entry 80%}
}
@media (prefers-reduced-motion: reduce){
  .tl-root *{animation:none!important}
}
`;

// Fireflies: fixed positions so the page is the same on every load.
const FLIES: Array<[number, number, number, number]> = [
  [62, 58, 2.1, 9.4], [71, 76, 5.3, 11.2], [84, 63, 0.4, 8.1], [93, 81, 7.7, 12.6], [56, 88, 3.9, 10.3], [77, 55, 6.2, 7.6],
  [88, 72, 1.2, 9.9], [66, 69, 8.4, 12.1], [97, 60, 4.6, 8.8], [52, 74, 2.8, 11.7], [80, 86, 0.9, 10.8], [12, 84, 5.8, 9.2],
  [24, 90, 3.1, 12.9], [38, 86, 6.9, 8.4],
];

const svg = (html: string, className: string, extra?: CSSProperties) => (
  <div aria-hidden className={`tl-layer ${className}`} style={extra} dangerouslySetInnerHTML={{ __html: html }} />
);

export default function TryLanding() {
  const navigate = useNavigate();
  const { setDmEmail } = useAuthStore();
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      const r = await api.post<{ email: string; already_registered: boolean }>("/waitlist", {
        email: email.trim(),
        source: DEMO ? "demo-landing" : "landing",
      });
      setMsg(r.already_registered ? "You're already on the list. We'll be in touch." : "You're on the list. We'll email you when the beta opens.");
      setEmail("");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function enterDemo() {
    setDmEmail("demo@questlab.app");
    navigate("/", { replace: true });
  }

  const primary: CSSProperties = { minHeight: 52, padding: "0 24px", borderRadius: 10, fontSize: 17 };
  return (
    <div className="tl-root">
      <style>{CSS}</style>

      <section aria-label="QuestLab" className="tl-hero">
        {svg(NIGHT_SCENE.sky, "tl-plx-sky")}
        {svg(NIGHT_SCENE.far, "tl-plx-far")}
        {svg(NIGHT_SCENE.mid, "tl-plx-mid")}
        <div aria-hidden className="tl-layer tl-plx-mid">
          {svg(NIGHT_SCENE.mist, "tl-mist")}
        </div>
        {svg(NIGHT_SCENE.near, "tl-plx-near")}
        {svg(NIGHT_SCENE.ground, "")}
        <div aria-hidden className="tl-layer" style={{ pointerEvents: "none" }}>
          {FLIES.map(([left, top, delay, dur], i) => (
            <span key={i} className="tl-fly" style={{ left: `${left}%`, top: `${top}%`, animationDelay: `-${delay}s`, animationDuration: `${dur}s` }} />
          ))}
        </div>

        <nav aria-label="Site" className="tl-wrap" style={{ position: "relative", zIndex: 2, padding: "22px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px 24px" }}>
          <Link to="/try" style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text)", textDecoration: "none" }}>
            <BrandMark size={24} />
            <span className="story" style={{ fontWeight: 700, fontSize: 23 }}>QuestLab</span>
          </Link>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 6px" }}>
            <a href="#how" style={navLink}>How it works</a>
            <a href="#players" style={navLink}>For players</a>
            <Link to="/welcome" style={navLink}>Sign in</Link>
            <a href="#join" className="btn btn-ghost" style={{ minHeight: 42, borderColor: "var(--accent-line)", color: "var(--accent-active-text)", fontWeight: 600 }}>Join the beta</a>
          </div>
        </nav>

        <div className="tl-wrap tl-plx-copy" style={{ position: "relative", zIndex: 2, flex: 1, padding: "96px 24px 200px", display: "flex", flexDirection: "column", gap: 22 }}>
          <p style={{ margin: 0, display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 500, color: "var(--text2)" }}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M5 0l5 5-5 5-5-5z" fill="var(--accent)" /></svg>
            For D&amp;D tables that meet in the same room
          </p>
          <h1 className="story" style={{ margin: 0, fontWeight: 700, fontSize: "clamp(46px, 7vw, 88px)", lineHeight: 1, letterSpacing: "-0.01em", display: "flex", flexDirection: "column" }}>
            <span>Run the table.</span>
            <span style={{ color: "var(--accent-text)" }}>Tell the story.</span>
          </h1>
          <p style={{ margin: 0, maxWidth: 560, fontSize: 19, color: "#D6D0C1", textWrap: "pretty" } as CSSProperties}>
            QuestLab is your DM screen and initiative tracker, with every player&rsquo;s sheet on their own phone, all kept in step for D&amp;D 5e (2024 rules). Real dice, a real table, nothing to install.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            {DEMO ? (
              <button type="button" className="btn btn-primary" onClick={enterDemo} style={primary}>
                <Play size={18} /> Enter the demo world
              </button>
            ) : (
              <a href="#join" className="btn btn-primary" style={primary}>Join the beta</a>
            )}
            <a href="#how" className="btn btn-secondary" style={{ ...primary, background: "rgba(17,21,19,0.5)" }}>
              See how it works <ArrowDown size={16} />
            </a>
          </div>
          {DEMO && <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>A shared sandbox campaign. Poke at everything; it resets every night.</p>}
        </div>
      </section>

      <div id="how" className="tl-wrap" style={{ padding: "40px 24px 0", display: "flex", flexDirection: "column", gap: 120 }}>
        <section aria-labelledby="tl-dm" className="tl-two tl-rise">
          <Copy eyebrow="The DM screen" id="tl-dm" title="A DM screen that keeps up.">
            The whole party on one screen: hit points, who&rsquo;s hurt and who&rsquo;s concentrating. NPC cards and round beats sit a tap away, and what you keep hidden stays hidden, so you spend the night looking at your players instead of your notes.
          </Copy>
          <div className="tl-panel" style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(210px, 100%), 1fr))", gap: 12 }}>
              <PartyCard name="Sable Quickstep" sub="Rogue 3 · Riley" hp={[19, 24]} live />
              <PartyCard name="Bram Oakhelm" sub="Fighter 3 · Morgan" hp={[11, 31]} />
              <PartyCard name="Tamsin Vale" sub="Cleric 3 · Sam" hp={[24, 24]} note="Concentrating" />
              <PartyCard name="Wren Ashby" sub="Wizard 3 · Alex" hp={[5, 17]} />
            </div>
            <div style={{ borderRadius: 10, background: "var(--story-bg)", border: "1px solid var(--story-line)", padding: "13px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                <span className="story" style={{ fontSize: 18, fontWeight: 700 }}>The Pale Steward</span>
                <span className="pill" style={{ fontSize: 12 }}><Lock size={12} /> Hidden from players</span>
              </div>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>NPC · keeps the cellar below the Kettle</span>
              <span className="story" style={{ fontStyle: "italic", fontWeight: 500, fontSize: 17, color: "var(--story-text)" }}>&ldquo;You&rsquo;re late. The kettle doesn&rsquo;t like to wait.&rdquo;</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="tl-tracker" className="tl-rise" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          <Copy eyebrow="The tracker" id="tl-tracker" title="Initiative that keeps itself in order." wide>
            Heroes and monsters in one list, sorted the moment the rolls are in. Hit points sit beside every name, a late roll or a changed number re-sorts on the spot, and one button moves the turn along.
          </Copy>
          <div className="tl-panel" style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 600 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>Round <span className="num">2</span></span>
                  <span style={{ fontSize: 14, color: "var(--muted)" }}>Bandits in the taproom</span>
                </div>
                <span className="btn btn-primary" style={{ minHeight: 42, cursor: "default" }}>End turn</span>
              </div>
              <div style={{ ...trackerGrid, padding: "9px 20px", fontSize: 12, fontWeight: 500, color: "var(--muted)", borderBottom: "1px solid var(--border)" }}>
                <span>Initiative</span><span>Name</span><span>Side</span><span>Hit points</span><span />
              </div>
              <TrackerRow init={19} name="Sable Quickstep" side="Party" hp="19 / 24" now />
              <TrackerRow init={15} name="Bandit ×4" side="Foes" hp="4 × 11" />
              <TrackerRow init={14} name="Bram Oakhelm" side="Party" hp="11 / 31" />
              <TrackerRow init={12} name="Wren Ashby" side="Party" hp="5 / 17" hurt />
              <TrackerRow init={9} name="Thug" side="Foes" hp="32 / 32" />
              <TrackerRow init={7} name="Tamsin Vale" side="Party" hp="24 / 24" last />
            </div>
          </div>
        </section>

        <section aria-labelledby="tl-prep" className="tl-two tl-rise">
          <Copy eyebrow="Before the session" id="tl-prep" title="Prep that's ready when you are.">
            Arcs and sessions in order, encounters with an honest difficulty, and read-aloud text set large enough to read by lamplight.
          </Copy>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="tl-panel" style={{ overflow: "clip" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", padding: "12px 16px", background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <span className="story" style={{ fontSize: 20, fontWeight: 700 }}>The Kettle Job</span>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Tier 1 · levels 1–4</span>
              </div>
              <SessionRow n="I" title="The Gilded Kettle" pill={<span className="pill pill-teal">Complete</span>} />
              <SessionRow n="II" title="Below the Kettle" pill={<span className="pill pill-live">Up next</span>} live />
            </div>
            <div className="read-aloud" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-ui)", fontStyle: "normal", fontSize: 12, fontWeight: 500, color: "var(--muted)" }}>Session II opens · read aloud</span>
              The kettle on the hearth has not gone cold in forty years. Tonight, with the taproom empty, you can hear what keeps it warm: something under the floorboards, breathing slowly.
            </div>
          </div>
        </section>

        <section id="players" aria-labelledby="tl-players" className="tl-rise" style={{ display: "flex", flexWrap: "wrap-reverse", alignItems: "center", justifyContent: "center", gap: "48px 64px" }}>
          <PhoneMock />
          <div style={{ flex: "1 1 440px", maxWidth: 520 }}>
            <Copy eyebrow="On every phone" id="tl-players" title="Every player holds their own sheet.">
              Hit points, spells, attacks and dice on their own phone, with as much help as they want: plain words for new players, just the numbers for veterans. When they level up, a guide walks them through it by the book. Nothing to install: they open a link and they&rsquo;re at the table.
            </Copy>
          </div>
        </section>

        <section aria-labelledby="tl-promise" className="tl-rise" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18, textAlign: "center", padding: "8px 0" }}>
          <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 12, width: "min(420px, 100%)" }}>
            <div style={{ flex: 1, height: 1, background: "var(--border2)" }} />
            <svg width="12" height="12" viewBox="0 0 10 10"><path d="M5 0l5 5-5 5-5-5z" fill="var(--accent-edge)" /></svg>
            <div style={{ flex: 1, height: 1, background: "var(--border2)" }} />
          </div>
          <h2 id="tl-promise" className="story" style={{ margin: 0, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(30px, 3.6vw, 42px)", lineHeight: 1.15 }}>No AI art. No AI-written story.</h2>
          <p className="tl-p" style={{ maxWidth: 560 }}>QuestLab keeps the numbers. Every word spoken at your table is yours.</p>
        </section>

        <section id="join" aria-labelledby="tl-join" className="tl-rise" style={{ border: "1px solid var(--accent-line)", borderRadius: 18, background: "var(--accent-soft)", padding: "clamp(28px, 5vw, 56px)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(380px, 100%), 1fr))", gap: "28px 48px", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 id="tl-join" className="tl-h2">Bring it to your table.</h2>
            <p className="tl-p">The beta is coming. Leave an email and you&rsquo;ll be first in.</p>
          </div>
          <form onSubmit={joinWaitlist} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label htmlFor="tl-email" style={{ margin: 0 }}>Email</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              <input id="tl-email" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: "1 1 220px", minWidth: 0, minHeight: 52, fontSize: 17 }} />
              <button type="submit" className="btn btn-primary" disabled={busy} style={primary}>{busy ? "Joining…" : "Join the beta"}</button>
            </div>
            {msg && <p role="status" style={{ margin: 0, fontSize: 15, color: "var(--text)" }}>{msg}</p>}
          </form>
        </section>
      </div>

      <footer style={{ marginTop: 120, borderTop: "1px solid var(--border)" }}>
        <div className="tl-wrap" style={{ padding: "32px 24px 48px", display: "flex", flexWrap: "wrap", gap: "20px 48px", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BrandMark size={20} />
            <span className="story" style={{ fontWeight: 700, fontSize: 19 }}>QuestLab</span>
          </div>
          <p style={{ margin: 0, flex: "1 1 420px", maxWidth: 720, fontSize: 13, lineHeight: 1.6, color: "var(--muted)" }}>
            QuestLab is an independent tool compatible with the 5th-edition rules. Not affiliated with or endorsed by Wizards of the Coast. Includes content from the Systems Reference Document 5.2 by Wizards of the Coast LLC, used under the Creative Commons Attribution 4.0 International License.
          </p>
          <Link to="/terms" style={{ fontSize: 14, color: "var(--text2)" }}>Terms</Link>
        </div>
      </footer>
    </div>
  );
}

const navLink: CSSProperties = { padding: "10px 12px", color: "var(--text2)", textDecoration: "none", fontSize: 15, fontWeight: 500 };
const trackerGrid: CSSProperties = { display: "grid", gridTemplateColumns: "72px minmax(0, 1fr) 100px 120px 120px", alignItems: "center", gap: 12 };

function Copy({ eyebrow, id, title, children, wide }: { eyebrow: string; id: string; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: wide ? 640 : 520 }}>
      <span className="eyebrow" style={{ fontSize: 15 }}>{eyebrow}</span>
      <h2 id={id} className="tl-h2">{title}</h2>
      <p className="tl-p">{children}</p>
    </div>
  );
}

function PartyCard({ name, sub, hp, live, note }: { name: string; sub: string; hp: [number, number]; live?: boolean; note?: string }) {
  const [cur, max] = hp;
  const color = cur <= max / 4 ? "var(--danger)" : cur <= max / 2 ? "var(--amber)" : "var(--teal)";
  return (
    <div style={{ borderRadius: 10, background: live ? "var(--accent-soft)" : "var(--surface2)", border: `1px solid ${live ? "var(--accent-edge)" : "var(--border)"}`, padding: 13, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="story" style={{ fontSize: 18, fontWeight: 700 }}>{name}</span>
        {live ? <span style={{ fontSize: 13, fontWeight: 600, color: "var(--accent-text)", whiteSpace: "nowrap" }}>Their turn</span> : note ? <span style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "nowrap" }}>{note}</span> : null}
      </div>
      <span style={{ fontSize: 13, color: "var(--muted)" }}>{sub}</span>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 13 }}>
        <span style={{ color: "var(--muted)" }}>Hit points</span>
        <span className="num" style={{ fontSize: 14, fontWeight: 600, color: cur <= max / 4 ? "var(--danger-text)" : undefined }}>{cur} / {max}</span>
      </div>
      <div style={{ height: 6, borderRadius: 3, background: "var(--border)" }}>
        <div style={{ width: `${Math.round((cur / max) * 100)}%`, height: 6, borderRadius: 3, background: color }} />
      </div>
    </div>
  );
}

function TrackerRow({ init, name, side, hp, now, hurt, last }: { init: number; name: string; side: "Party" | "Foes"; hp: string; now?: boolean; hurt?: boolean; last?: boolean }) {
  return (
    <div style={{ ...trackerGrid, padding: "10px 20px", background: now ? "var(--accent-soft)" : undefined, borderBottom: last ? "none" : "1px solid var(--border)" }}>
      <span className="num" style={{ width: 48, height: 36, borderRadius: 7, border: `1px solid ${now ? "var(--accent-edge)" : "var(--border2)"}`, background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 16, color: now ? "var(--accent-text)" : "var(--text)" }}>{init}</span>
      <span className="story" style={{ fontSize: 18, fontWeight: now ? 700 : 500 }}>{name}</span>
      <span className={`pill ${side === "Party" ? "pill-teal" : "pill-danger"}`} style={{ justifySelf: "start" }}>{side}</span>
      <span className="num" style={{ fontSize: 15, fontWeight: 600, color: hurt ? "var(--danger-text)" : undefined }}>{hp}</span>
      {now ? <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-text)" }}>Their turn</span> : <span />}
    </div>
  );
}

function SessionRow({ n, title, pill, live }: { n: string; title: string; pill: ReactNode; live?: boolean }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto", alignItems: "center", gap: 12, padding: "11px 16px", background: live ? "var(--accent-soft)" : undefined, borderBottom: live ? "none" : "1px solid var(--border)" }}>
      <span className="story" style={{ fontSize: 19, fontWeight: live ? 700 : 400, color: live ? "var(--accent-text)" : "var(--muted)" }}>{n}</span>
      <span className="story" style={{ fontSize: 17, fontWeight: live ? 700 : 500 }}>{title}</span>
      {pill}
    </div>
  );
}

function PhoneMock() {
  return (
    <div aria-label="A player's phone" style={{ flex: "0 1 300px", maxWidth: "100%", boxSizing: "border-box", border: "1px solid var(--border)", borderRadius: 36, background: "var(--surface)", padding: "24px 20px 20px", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 30px 80px rgba(0,0,0,.45)" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span className="story" style={{ fontSize: 26, fontWeight: 700 }}>Sable Quickstep</span>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>Rogue 3 · Thief · Riley</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderRadius: 12, background: "var(--accent-soft)", border: "1px solid var(--accent-edge)", padding: "9px 14px" }}>
        <span className="story" style={{ fontSize: 19, fontWeight: 700, color: "var(--accent-text)" }}>Your turn</span>
        <span style={{ fontSize: 13, color: "var(--text2)" }}>Round <span className="num">2</span></span>
      </div>
      <div style={{ borderRadius: 12, background: "var(--surface2)", border: "1px solid var(--border)", padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Hit points</span>
          <span className="num"><span style={{ fontSize: 34, fontWeight: 600 }}>19</span><span style={{ color: "var(--muted)", fontSize: 16 }}> / 24</span></span>
        </div>
        <div style={{ height: 8, borderRadius: 4, background: "var(--border)" }}><div style={{ width: "79%", height: 8, borderRadius: 4, background: "var(--teal)" }} /></div>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {[["Shortbow", "+6 to hit · 1d6+4"], ["Sneak Attack", "+2d6 once a turn"]].map(([n, v], i) => (
          <div key={n} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0", borderBottom: i === 0 ? "1px solid var(--border)" : "none" }}>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{n}</span>
            <span className="num" style={{ fontSize: 14, color: "var(--text2)" }}>{v}</span>
          </div>
        ))}
      </div>
      <div style={{ borderRadius: 12, background: "#15211E", border: "1px solid #2B4A44", padding: "10px 12px", fontSize: 14, color: "var(--text2)" }}>
        <b style={{ color: "var(--teal-text)", fontWeight: 600 }}>Tip:</b> Hidden from your target? Ask the DM for advantage.
      </div>
      <span className="btn btn-primary" style={{ minHeight: 52, borderRadius: 12, fontSize: 17, cursor: "default" }}>Roll the attack</span>
    </div>
  );
}
