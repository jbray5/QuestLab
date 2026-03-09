import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/useAuthStore";
import { useCampaignStore } from "../stores/useCampaignStore";

const NAV_ITEMS = [
  { to: "/", label: "⚔ Dashboard", end: true },
  { to: "/campaigns", label: "📜 Campaigns" },
  { to: "/monsters", label: "🐉 Monsters" },
  { to: "/admin", label: "🛡 Admin" },
];

export default function Layout() {
  const { dmEmail, setDmEmail } = useAuthStore();
  const { activeCampaign, activeAdventure } = useCampaignStore();
  const navigate = useNavigate();

  function handleEmailSave(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside
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

        {/* DM Email config at bottom */}
        <div style={{ marginTop: "auto", paddingTop: "1rem" }}>
          <label style={{ fontSize: "0.6rem" }}>DM EMAIL</label>
          <input
            type="email"
            value={dmEmail}
            onChange={(e) => setDmEmail(e.target.value)}
            onKeyDown={handleEmailSave}
            placeholder="you@example.com"
            style={{ fontSize: "0.75rem", padding: "0.3rem 0.5rem" }}
          />
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, padding: "2rem", overflowY: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
