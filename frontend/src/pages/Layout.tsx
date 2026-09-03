import { useEffect, useState } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { useCampaignStore } from "../stores/useCampaignStore";
import { useTourStore } from "../stores/useTourStore";
import { useIsCompact } from "../hooks/useIsCompact";
import DiceTray from "../components/dice-tray/DiceTray";
import TourGuide from "../components/tour/TourGuide";

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
      background: "rgba(20,16,30,0.95)",
      border: "1px solid var(--gold)",
      color: "var(--text)",
      borderRadius: 999,
      padding: "0.35rem 1rem",
      fontSize: "0.78rem",
      whiteSpace: "nowrap",
      boxShadow: "0 4px 18px rgba(0,0,0,0.5)",
    }}
  >
    🧪 Shared demo world — resets nightly ·{" "}
    <a href="/try#waitlist" style={{ color: "var(--gold)" }}>
      join the beta waitlist
    </a>
  </div>
) : null;

const NAV_ITEMS: Array<{
  to: string;
  label: string;
  end?: boolean;
  tourId?: string;
}> = [
  { to: "/", label: "⚔ Dashboard", end: true },
  { to: "/campaigns", label: "📜 Campaigns", tourId: "nav-campaigns" },
];

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
        style={{ color: "var(--muted)", fontSize: "0.78rem", letterSpacing: "0.06em" }}
      >
        {open ? "▾" : "▸"} {title}
      </button>
      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", paddingLeft: "0.55rem" }}>
          {children}
        </div>
      )}
    </>
  );
}

export default function Layout() {
  const { dmEmail, signOut } = useAuthStore();
  const { activeCampaign, activeAdventure } = useCampaignStore();
  const startTour = useTourStore((s) => s.start);
  const navigate = useNavigate();
  const location = useLocation();
  const compact = useIsCompact(900);
  const [navOpen, setNavOpen] = useState(false);

  // Plan 35 — auth guard. Any DM page without a signed-in identity
  // bounces to /welcome with the originally-requested URL preserved.
  useEffect(() => {
    if (!dmEmail) {
      const next = encodeURIComponent(location.pathname + location.search);
      navigate(`/welcome?next=${next}`, { replace: true });
    }
  }, [dmEmail, navigate, location.pathname, location.search]);

  function handleSignOut() {
    signOut();
    navigate("/welcome", { replace: true });
  }

  // While redirecting, render nothing — avoids a flash of empty layout.
  if (!dmEmail) return null;

  const closeNav = () => setNavOpen(false);
  const go = (path: string) => {
    navigate(path);
    closeNav();
  };

  const navVisual: React.CSSProperties = {
    background: "var(--surface)",
    display: "flex",
    flexDirection: "column",
    padding: "1rem 0.75rem",
    gap: "0.25rem",
  };

  // Shared nav body — rendered inside the desktop sidebar or the mobile drawer.
  const navContent = (
    <>
      <div style={{ marginBottom: "1.5rem", textAlign: "center" }}>
        <h2 style={{ fontSize: "1rem", margin: 0, lineHeight: 1.2 }}>⚔ QuestLab</h2>
        <p style={{ fontSize: "0.65rem", color: "var(--muted)", margin: "0.2rem 0 0" }}>
          AI Campaign Planner
        </p>
      </div>

      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          data-tour-id={item.tourId}
          onClick={closeNav}
          className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}

      {activeCampaign && (
        <>
          <hr className="divider" style={{ margin: "0.75rem 0" }} />
          <p style={{ fontSize: "0.65rem", color: "var(--muted)", margin: "0 0 0.25rem 0.5rem" }}>
            {activeCampaign.name.toUpperCase().slice(0, 24)}
          </p>
          {/* The nightly loop stays one click away; everything else folds. */}
          <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/adventures`)}>
            🗺 Adventures
          </button>
          {activeAdventure && (
            <>
              <button className="nav-item" onClick={() => go(`/adventures/${activeAdventure.id}/sessions`)}>
                📅 Sessions
              </button>
              <button className="nav-item" onClick={() => go(`/adventures/${activeAdventure.id}/encounters`)}>
                💀 Encounters
              </button>
            </>
          )}
          <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/characters`)}>
            🧙 Characters
          </button>
          <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/battle-maps`)}>
            🗺️ Battle Maps
          </button>

          <NavGroup id="world" title="World & Tools">
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/npcs`)}>
              👤 NPCs
            </button>
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/shops`)}>
              🏪 Shops
            </button>
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/puzzles`)}>
              🧩 Puzzles
            </button>
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/crier`)}>
              📣 Town Crier
            </button>
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/notebook`)}>
              📓 Notebook
            </button>
            {activeAdventure && (
              <button className="nav-item" onClick={() => go(`/adventures/${activeAdventure.id}/maps`)}>
                🗾 Map Builder
              </button>
            )}
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/temple`)}>
              🔱 Temple Companion
            </button>
            <button className="nav-item" onClick={() => go(`/campaigns/${activeCampaign.id}/restwater`)}>
              ♨ Restwater Companion
            </button>
          </NavGroup>
        </>
      )}

      <NavGroup id="compendium" title="Compendium">
        <button className="nav-item" onClick={() => go("/monsters")}>
          🐉 Monsters
        </button>
        <button className="nav-item" onClick={() => go("/spells")}>
          📖 Spells
        </button>
        <button className="nav-item" onClick={() => go("/weapons")}>
          🗡 Weapons
        </button>
        <button className="nav-item" onClick={() => go("/magic-items")}>
          ⚗️ Magic Items
        </button>
      </NavGroup>

      {/* DM identity at the bottom — email + sign out. */}
      <div style={{ marginTop: "auto", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
        <p
          style={{
            fontSize: "0.6rem",
            color: "var(--muted)",
            margin: "0 0 0.2rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Signed in as
        </p>
        <p
          style={{
            fontSize: "0.78rem",
            color: "var(--text)",
            margin: "0 0 0.5rem",
            wordBreak: "break-all",
            fontFamily: "monospace",
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
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.5rem", textAlign: "center" }}
          >
            📖 Guide
          </a>
          <button
            onClick={() => go("/admin")}
            className="btn btn-ghost"
            title="Admin"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
          >
            🛡 Admin
          </button>
          <button
            onClick={() => {
              startTour();
              closeNav();
            }}
            className="btn btn-ghost"
            title="Replay the new-DM tour"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
          >
            🧭 Tour
          </button>
          <button
            onClick={handleSignOut}
            className="btn btn-ghost"
            style={{ fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
          >
            ↩ Sign out
          </button>
        </div>
      </div>
    </>
  );

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        {DEMO_BANNER}
        <div className="ql-topbar">
          <button
            className="ql-hamburger"
            onClick={() => setNavOpen(true)}
            aria-label="Open navigation menu"
          >
            ☰
          </button>
          <strong
            style={{ fontFamily: "Cinzel Decorative, serif", color: "var(--gold)", fontSize: "0.95rem" }}
          >
            ⚔ QuestLab
          </strong>
          {activeCampaign && (
            <span
              style={{
                marginLeft: "auto",
                color: "var(--muted)",
                fontSize: "0.72rem",
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
        <aside
          data-tour-id="sidebar"
          className={`ql-drawer${navOpen ? " open" : ""}`}
          style={{ ...navVisual, borderRight: "1px solid var(--border)" }}
        >
          {navContent}
        </aside>

        <main style={{ flex: 1, padding: "0.9rem", overflowY: "auto", minWidth: 0 }}>
          <Outlet />
        </main>

        <DiceTray />
        <TourGuide />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {DEMO_BANNER}
      <aside
        data-tour-id="sidebar"
        style={{ ...navVisual, width: 220, borderRight: "1px solid var(--border)", flexShrink: 0 }}
      >
        {navContent}
      </aside>

      <main style={{ flex: 1, padding: "2rem", overflowY: "auto", minWidth: 0 }}>
        <Outlet />
      </main>

      <DiceTray />
      <TourGuide />
    </div>
  );
}
