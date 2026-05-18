import { useEffect } from "react";
import { Outlet, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { useCampaignStore } from "../stores/useCampaignStore";
import { useTourStore } from "../stores/useTourStore";
import DiceTray from "../components/dice-tray/DiceTray";
import TourGuide from "../components/tour/TourGuide";

const NAV_ITEMS: Array<{
  to: string;
  label: string;
  end?: boolean;
  tourId?: string;
}> = [
  { to: "/", label: "⚔ Dashboard", end: true },
  { to: "/campaigns", label: "📜 Campaigns", tourId: "nav-campaigns" },
  { to: "/monsters", label: "🐉 Monsters" },
  { to: "/spells", label: "📖 Spells" },
  { to: "/weapons", label: "🗡 Weapons" },
  { to: "/magic-items", label: "⚗️ Magic Items" },
  { to: "/admin", label: "🛡 Admin" },
];

export default function Layout() {
  const { dmEmail, signOut } = useAuthStore();
  const { activeCampaign, activeAdventure } = useCampaignStore();
  const startTour = useTourStore((s) => s.start);
  const navigate = useNavigate();
  const location = useLocation();

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

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
        data-tour-id="sidebar"
        style={{
          width: 220,
          background: "var(--surface)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "1rem 0.75rem",
          gap: "0.25rem",
          flexShrink: 0,
        }}
      >
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
            className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}
          >
            {item.label}
          </NavLink>
        ))}

        {activeCampaign && (
          <>
            <hr className="divider" style={{ margin: "0.75rem 0" }} />
            <p style={{ fontSize: "0.65rem", color: "var(--muted)", margin: "0 0 0.25rem 0.5rem" }}>
              CAMPAIGN
            </p>
            <button
              className="nav-item"
              onClick={() => navigate(`/campaigns/${activeCampaign.id}/adventures`)}
            >
              🗺 Adventures
            </button>
            <button
              className="nav-item"
              onClick={() => navigate(`/campaigns/${activeCampaign.id}/characters`)}
            >
              🧙 Characters
            </button>
            <button
              className="nav-item"
              onClick={() => navigate(`/campaigns/${activeCampaign.id}/npcs`)}
            >
              👤 NPCs
            </button>
          </>
        )}

        {activeAdventure && (
          <>
            <p style={{ fontSize: "0.65rem", color: "var(--muted)", margin: "0.5rem 0 0.25rem 0.5rem" }}>
              ADVENTURE
            </p>
            <button
              className="nav-item"
              onClick={() => navigate(`/adventures/${activeAdventure.id}/sessions`)}
            >
              📅 Sessions
            </button>
            <button
              className="nav-item"
              onClick={() => navigate(`/adventures/${activeAdventure.id}/encounters`)}
            >
              💀 Encounters
            </button>
            <button
              className="nav-item"
              onClick={() => navigate(`/adventures/${activeAdventure.id}/maps`)}
            >
              🗾 Map Builder
            </button>
          </>
        )}

        {/* DM identity at the bottom — email + sign out. */}
        <div
          style={{
            marginTop: "auto",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border)",
          }}
        >
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
          <div style={{ display: "flex", gap: "0.35rem" }}>
            <button
              onClick={startTour}
              className="btn btn-ghost"
              title="Replay the new-DM tour"
              style={{ flex: 1, fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
            >
              🧭 Tour
            </button>
            <button
              onClick={handleSignOut}
              className="btn btn-ghost"
              style={{ flex: 1, fontSize: "0.78rem", padding: "0.35rem 0.5rem" }}
            >
              ↩ Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        <Outlet />
      </main>

      {/* Plan 30 — floating dice tray, available on every DM page. */}
      <DiceTray />

      {/* Plan 36 — guided tour overlay (renders nothing unless open). */}
      <TourGuide />
    </div>
  );
}
