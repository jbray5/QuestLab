import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BadgeCheck, BookOpen, CalendarDays, ChevronDown, ChevronRight, Compass, Feather, FlaskConical, Gem, LayoutDashboard, LogOut,
  Map as MapIcon, Megaphone, Menu, NotebookPen, PencilRuler, Puzzle, ScrollText, Shield, Skull, Sparkles, Store,
  Heart, MessageSquarePlus, Sword, Swords, UserRound, Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore, type DmProfile } from "../stores/useAuthStore";
import { api } from "../api/client";
import { useCampaignStore } from "../stores/useCampaignStore";
import { campaignsApi } from "../api/campaigns";
import { adventuresApi } from "../api/adventures";
import { planApi, PLAN_QUERY_KEY } from "../api/plan";
import { useHudPrefs } from "../stores/useHudPrefs";
import { useTourStore } from "../stores/useTourStore";
import { useIsCompact } from "../hooks/useIsCompact";
import { isDialogOpen } from "../hooks/useDialogFocus";
import DiceTray from "../components/dice-tray/DiceTray";
import TourGuide from "../components/tour/TourGuide";
import BrandMark from "../components/BrandMark";
import FeedbackSheet from "../components/FeedbackSheet";

// Plan 54 — public demo deployments show a persistent banner so nobody
// mistakes the shared sandbox for a private campaign.
const DEMO_BANNER = import.meta.env.VITE_DEMO_MODE ? (
  <div
    style={{
      position: "fixed",
      bottom: 10,
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 300,
      background: "rgba(17,21,19,0.96)",
      border: "1px solid var(--accent-line)",
      color: "var(--text)",
      borderRadius: 999,
      padding: "0.35rem 1rem",
      fontSize: "0.78rem",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 18px rgba(0,0,0,0.5)",
    }}
  >
    <FlaskConical size={14} style={{ verticalAlign: "-2px", marginRight: 6 }} />
    Shared demo world — resets nightly ·{" "}
    <a href="/try#waitlist">
      join the beta waitlist
    </a>
  </div>
) : null;

const NAV_ITEMS: Array<{
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  tourId?: string;
}> = [
  { to: "/", label: "Dashboard", icon: <LayoutDashboard size={16} />, end: true },
  { to: "/campaigns", label: "Campaigns", icon: <ScrollText size={16} />, end: true, tourId: "nav-campaigns" },
];

/** A sidebar link that shows when you're on its page (Plan 121). */
function NavItem({ to, icon, children, onClick, tourId, end }: {
  to: string;
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  tourId?: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      data-tour-id={tourId}
      onClick={onClick}
      className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
    >
      {icon}
      {children}
    </NavLink>
  );
}

/** Collapsible sidebar group (Plan 68) — collapse state persists per id. */
function NavGroup({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`ql-nav-group-${id}`) === "1";
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(`ql-nav-group-${id}`, v ? "0" : "1");
      } catch {
        /* collapse state just doesn't persist */
      }
      return !v;
    });
  };
  return (
    <>
      <button
        className="nav-item"
        onClick={toggle}
        aria-expanded={open}
        style={{ color: "var(--muted)", fontSize: "0.8125rem", marginTop: "0.35rem" }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} {title}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
          {children}
        </div>
      )}
    </>
  );
}

/**
 * "Skip to content" (Plan 128): the first thing Tab reaches on every DM page,
 * hidden until it has focus. Jumps past the menu to the page itself.
 */
function SkipLink() {
  return (
    <a
      href="#ql-main"
      className="ql-skip-link"
      onClick={(e) => {
        // Focus <main> without touching the URL (the router owns it).
        e.preventDefault();
        document.getElementById("ql-main")?.focus();
      }}
    >
      Skip to content
    </a>
  );
}

export default function Layout() {
  const { dmEmail, signOut, profile, setProfile } = useAuthStore();
  const isAdmin = !!profile?.is_admin;
  const { activeCampaign, activeAdventure, setActiveCampaign, setActiveAdventure } = useCampaignStore();
  const startTour = useTourStore((s) => s.start);
  const navigate = useNavigate();
  const location = useLocation();
  const compact = useIsCompact(900);
  const tableMode = useHudPrefs((s) => s.tableMode);
  const [navOpen, setNavOpen] = useState(false);
  // Plan 125 — the friends beta: two-tap feedback from any DM page.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  // Plan 130 — "Support QuestLab" shows in the menu only when PATREON_URL is set.
  const myPlan = useQuery({
    queryKey: PLAN_QUERY_KEY,
    queryFn: planApi.get,
    enabled: !!dmEmail,
    staleTime: 5 * 60_000,
  });
  const supportUrl = myPlan.data?.support_url ?? null;
  // The stored profile is a snapshot from sign-in; read it fresh once per
  // visit so a changed admin flag or display name shows without signing out.
  const freshProfile = useQuery({
    queryKey: ["auth-me", dmEmail],
    queryFn: () => api.get<DmProfile>("/auth/me"),
    enabled: !!dmEmail,
    staleTime: 10 * 60_000,
  });
  useEffect(() => {
    if (freshProfile.data) setProfile(freshProfile.data);
  }, [freshProfile.data, setProfile]);

  // Plan 128 — Escape closes the phone menu and hands focus back to its button
  // (unless a dialog is open on top; that dialog's Escape comes first).
  useEffect(() => {
    if (!navOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || isDialogOpen()) return;
      setNavOpen(false);
      hamburgerRef.current?.focus();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  // Plan 35 — auth guard. Any DM page without a signed-in identity
  // bounces to /welcome with the originally-requested URL preserved.
  useEffect(() => {
    if (!dmEmail) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/welcome?next=${next}`, { replace: true });
    }
  }, [dmEmail, navigate, location.pathname, location.search]);

  // Plan 120 — the API refused this browser's identity (expired session, or a
  // bare email on a deployment that now requires accounts): sign in again.
  useEffect(() => {
    const onSignedOut = () => {
      signOut();
      const next = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/welcome?next=${next}`, { replace: true });
    };
    window.addEventListener("ql:signed-out", onSignedOut);
    return () => window.removeEventListener("ql:signed-out", onSignedOut);
  }, [navigate, signOut]);

  // Plan 83 — a pasted campaign or arc URL selects it in the sidebar, so the
  // campaign pages are reachable by link (and bookmark), not only by clicking.
  useEffect(() => {
    if (!dmEmail) return;
    const c = location.pathname.match(/^\/campaigns\/([0-9a-f-]{36})/i);
    const a = location.pathname.match(/^\/adventures\/([0-9a-f-]{36})/i);
    if (c && activeCampaign?.id !== c[1]) {
      campaignsApi.get(c[1]).then(setActiveCampaign).catch(() => undefined);
    } else if (a && activeAdventure?.id !== a[1]) {
      adventuresApi
        .get(a[1])
        .then((adv) => {
          setActiveAdventure(adv);
          if (activeCampaign?.id !== adv.campaign_id) {
            campaignsApi.get(adv.campaign_id).then(setActiveCampaign).catch(() => undefined);
          }
        })
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, dmEmail]);

  function handleSignOut() {
    signOut();
    navigate("/welcome", { replace: true });
  }

  // While redirecting, render nothing — avoids a flash of empty layout.
  if (!dmEmail) return null;

  const closeNav = () => setNavOpen(false);
  const closeFeedback = () => {
    setFeedbackOpen(false);
    // The Send feedback button lives in the closed phone menu: return focus to
    // the menu button instead of dropping it on the page.
    if (compact) hamburgerRef.current?.focus();
  };

  const navVisual: React.CSSProperties = {
    background: "var(--surface)",
    display: "flex",
    flexDirection: "column",
    padding: "1.1rem 0.75rem",
    gap: "0.125rem",
  };

  // Shared nav body — rendered inside the desktop sidebar or the mobile drawer.
  const navContent = (
    <>
      <div style={{ padding: "0.15rem 0.5rem 1.25rem" }}>
        <Link to="/" onClick={closeNav} style={{ display: "flex", alignItems: "center", gap: "0.6rem", color: "var(--text)", textDecoration: "none" }}>
          <BrandMark size={22} />
          <span className="story" style={{ fontWeight: 700, fontSize: "1.3rem", lineHeight: 1 }}>QuestLab</span>
          <span className="pill" title="You're in the friends beta. Feedback welcome." style={{ fontSize: "0.6875rem", padding: "0 0.45rem", marginLeft: "0.1rem" }}>
            Beta
          </span>
        </Link>
        <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0.4rem 0 0" }}>
          For D&amp;D 5e (2024 rules)
        </p>
      </div>

      {NAV_ITEMS.map((item) => (
        <NavItem key={item.to} to={item.to} end={item.end} tourId={item.tourId} icon={item.icon} onClick={closeNav}>
          {item.label}
        </NavItem>
      ))}

      {activeCampaign && (
        <>
          <hr className="divider" style={{ margin: "0.75rem 0" }} />
          {/* Review 10/30 — a long name ends in "…" and shows in full on hover. */}
          <div style={{ padding: "0 0.65rem 0.4rem", minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "0.75rem", color: "var(--muted)" }}>Campaign</span>
            <span
              className="story"
              title={activeCampaign.name}
              style={{
                display: "block",
                fontSize: "1.05rem",
                fontWeight: 500,
                color: "var(--text)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {activeCampaign.name}
            </span>
          </div>
          {/* The nightly loop stays one click away; everything else folds. */}
          <NavItem to={`/campaigns/${activeCampaign.id}/sessions`} icon={<CalendarDays size={16} />} onClick={closeNav}>
            Sessions
          </NavItem>
          {/* Review 10/30 — always here; without an arc it explains how to get one. */}
          <NavItem
            to={
              activeAdventure
                ? `/adventures/${activeAdventure.id}/encounters`
                : `/campaigns/${activeCampaign.id}/encounters`
            }
            icon={<Swords size={16} />}
            onClick={closeNav}
          >
            Encounters
          </NavItem>
          <NavItem to={`/campaigns/${activeCampaign.id}/characters`} tourId="nav-characters" icon={<Users size={16} />} onClick={closeNav}>
            Characters
          </NavItem>
          <NavItem to={`/campaigns/${activeCampaign.id}/battle-maps`} icon={<MapIcon size={16} />} onClick={closeNav}>
            Battle maps
          </NavItem>

          <NavGroup id="world" title="World & tools">
            <NavItem to={`/campaigns/${activeCampaign.id}/npcs`} icon={<UserRound size={16} />} onClick={closeNav}>
              NPCs
            </NavItem>
            <NavItem to={`/campaigns/${activeCampaign.id}/shops`} icon={<Store size={16} />} onClick={closeNav}>
              Shops
            </NavItem>
            <NavItem to={`/campaigns/${activeCampaign.id}/puzzles`} icon={<Puzzle size={16} />} onClick={closeNav}>
              Puzzles
            </NavItem>
            <NavItem to={`/campaigns/${activeCampaign.id}/crier`} icon={<Megaphone size={16} />} onClick={closeNav}>
              Town crier
            </NavItem>
            <NavItem to={`/campaigns/${activeCampaign.id}/notebook`} icon={<NotebookPen size={16} />} onClick={closeNav}>
              Notebook
            </NavItem>
            <NavItem
              to={
                activeAdventure
                  ? `/adventures/${activeAdventure.id}/maps`
                  : `/campaigns/${activeCampaign.id}/maps`
              }
              icon={<PencilRuler size={16} />}
              onClick={closeNav}
            >
              Map builder
            </NavItem>
          </NavGroup>
        </>
      )}

      <NavGroup id="compendium" title="Compendium">
        <NavItem to="/monsters" icon={<Skull size={16} />} onClick={closeNav}>
          Monsters
        </NavItem>
        <NavItem to="/spells" icon={<Sparkles size={16} />} onClick={closeNav}>
          Spells
        </NavItem>
        {/* Plan 133 — the DM's own races and subclasses (Plan 135: and feats), for every campaign they run. */}
        <NavItem to="/homebrew" icon={<Feather size={16} />} onClick={closeNav}>
          Races, subclasses &amp; feats
        </NavItem>
        <NavItem to="/weapons" icon={<Sword size={16} />} onClick={closeNav}>
          Weapons
        </NavItem>
        <NavItem to="/magic-items" icon={<Gem size={16} />} onClick={closeNav}>
          Magic items
        </NavItem>
      </NavGroup>

      {/* DM identity at the bottom — email + sign out. */}
      <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        {/* Plan 130 — the DM's plan, usage and Patreon link. */}
        <div style={{ marginBottom: "0.6rem" }}>
          <NavItem to="/plan" icon={<BadgeCheck size={16} />} onClick={closeNav}>
            Your plan
          </NavItem>
        </div>
        <p style={{ fontSize: "0.75rem", color: "var(--muted)", margin: "0 0.25rem 0.1rem" }}>Signed in as</p>
        <p
          style={{
            fontSize: "0.8125rem",
            color: "var(--text2)",
            margin: "0 0.25rem 0.6rem",
            wordBreak: "break-all",
          }}
          title={dmEmail}
        >
          {dmEmail}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.35rem" }}>
          <a
            href="/guide"
            target="_blank"
            rel="noreferrer"
            className="btn btn-ghost"
            title="The 15-minute guide"
            style={{ fontSize: "0.8125rem", padding: "0.35rem 0.5rem" }}
          >
            <BookOpen size={14} /> Guide
          </a>
          {isAdmin && (
            <Link
              to="/admin"
              onClick={closeNav}
              className="btn btn-ghost"
              title="Admin"
              style={{ fontSize: "0.8125rem", padding: "0.35rem 0.5rem" }}
            >
              <Shield size={14} /> Admin
            </Link>
          )}
          <button
            onClick={() => {
              startTour();
              closeNav();
            }}
            className="btn btn-ghost"
            title="Replay the new-DM tour"
            style={{ fontSize: "0.8125rem", padding: "0.35rem 0.5rem" }}
          >
            <Compass size={14} /> Tour
          </button>
          <button
            onClick={handleSignOut}
            className="btn btn-ghost"
            style={{ fontSize: "0.8125rem", padding: "0.35rem 0.5rem" }}
          >
            <LogOut size={14} /> Sign out
          </button>
          <button
            onClick={() => {
              setFeedbackOpen(true);
              closeNav();
            }}
            className="btn btn-secondary"
            title="Tell Justin what worked, what confused you, or what broke"
            style={{ fontSize: "0.8125rem", padding: "0.35rem 0.5rem", gridColumn: "1 / -1" }}
          >
            <MessageSquarePlus size={14} /> Send feedback
          </button>
          {supportUrl && (
            <a
              href={supportUrl}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              title="QuestLab's Patreon page"
              style={{ fontSize: "0.8125rem", padding: "0.35rem 0.5rem", gridColumn: "1 / -1" }}
            >
              <Heart size={14} /> Support QuestLab
            </a>
          )}
        </div>
      </div>
    </>
  );

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <SkipLink />
        {DEMO_BANNER}
        <div className="ql-topbar">
          <button
            ref={hamburgerRef}
            className="ql-hamburger"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={navOpen}
            aria-controls="ql-nav-drawer"
          >
            <Menu size={20} />
          </button>
          <Link to="/" style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text)", textDecoration: "none" }}>
            <BrandMark size={20} />
            <strong className="story" style={{ fontSize: "1.15rem" }}>QuestLab</strong>
          </Link>
          {activeCampaign && (
            <span
              style={{
                marginLeft: "auto",
                color: "var(--text2)",
                fontFamily: "var(--font-story)",
                fontSize: "0.95rem",
                maxWidth: "45vw",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {activeCampaign.name}
            </span>
          )}
        </div>

        {navOpen && <div className="ql-drawer-backdrop" onClick={closeNav} />}
        {/* Plan 128 — closed, the drawer is off screen: `inert` takes its links
            out of the Tab order and away from screen readers. Tabbing out of
            the open drawer closes it. */}
        <nav
          id="ql-nav-drawer"
          aria-label="Main menu"
          data-tour-id="sidebar"
          className={`ql-drawer${navOpen ? " open" : ""}`}
          inert={!navOpen}
          aria-hidden={navOpen ? undefined : true}
          onBlur={(e) => {
            const to = e.relatedTarget as Node | null;
            if (navOpen && to && !e.currentTarget.contains(to) && to !== hamburgerRef.current) closeNav();
          }}
          style={{ ...navVisual, borderRight: "1px solid var(--border)" }}
        >
          {navContent}
        </nav>

        <main id="ql-main" tabIndex={-1} style={{ flex: 1, padding: "1rem", overflowY: "auto", minWidth: 0 }}>
          <Outlet />
        </main>

        <DiceTray />
        <TourGuide />
        {feedbackOpen && <FeedbackSheet onClose={closeFeedback} />}
      </div>
    );
  }

  // Review 10/30 — table mode: the HUD runs full width, no app sidebar.
  const hideNav = tableMode && /^\/sessions\/[^/]+\/hud/.test(location.pathname);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <SkipLink />
      {DEMO_BANNER}
      {!hideNav && (
        <nav
          aria-label="Main menu"
          data-tour-id="sidebar"
          style={{ ...navVisual, width: 224, borderRight: "1px solid var(--border)", flexShrink: 0, background: "#131816" }}
        >
          {navContent}
        </nav>
      )}

      <main
        id="ql-main"
        tabIndex={-1}
        style={{ flex: 1, padding: hideNav ? "0.5rem" : "2rem", overflowY: "auto", minWidth: 0 }}
      >
        <Outlet />
      </main>

      <DiceTray />
      <TourGuide />
      {feedbackOpen && <FeedbackSheet onClose={closeFeedback} />}
    </div>
  );
}
