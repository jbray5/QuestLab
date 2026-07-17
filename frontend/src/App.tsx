import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";

// Eager — small, always-needed pages.
import Layout from "./pages/Layout";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import Welcome from "./pages/Welcome";

// Lazy — heavy / single-use pages. Code-split so a player on /play/{id}
// doesn't pay for the HUD bundle, and so the Dashboard doesn't pay for
// SessionHud / MapBuilder until needed (Plan 00029).
const Campaigns     = lazy(() => import("./pages/Campaigns"));
const Adventures    = lazy(() => import("./pages/Adventures"));
const Characters    = lazy(() => import("./pages/Characters"));
const Encounters    = lazy(() => import("./pages/Encounters"));
const MapBuilder    = lazy(() => import("./pages/MapBuilder"));
const Sessions      = lazy(() => import("./pages/Sessions"));
const SessionRunner = lazy(() => import("./pages/SessionRunner"));
const SessionHud    = lazy(() => import("./pages/SessionHud"));
const Admin         = lazy(() => import("./pages/Admin"));
const MagicItems    = lazy(() => import("./pages/MagicItems"));
const Monsters      = lazy(() => import("./pages/Monsters"));
const Npcs          = lazy(() => import("./pages/Npcs"));
const PlayerView    = lazy(() => import("./pages/PlayerView"));
const Spells        = lazy(() => import("./pages/Spells"));
const Weapons       = lazy(() => import("./pages/Weapons"));
const BattleMaps    = lazy(() => import("./pages/BattleMaps"));
const TableView     = lazy(() => import("./pages/TableView"));
const BoardView     = lazy(() => import("./pages/BoardView"));
const Table3DView   = lazy(() => import("./pages/Table3DView"));
const Shops         = lazy(() => import("./pages/Shops"));
const MarketView    = lazy(() => import("./pages/MarketView"));
const StorefrontView = lazy(() => import("./pages/StorefrontView"));

function PageLoader() {
  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "3rem 1rem",
        color: "var(--muted)",
        fontStyle: "italic",
        gap: "0.5rem",
      }}
    >
      <img
        src="/d20.svg"
        alt=""
        aria-hidden
        style={{
          width: 28,
          height: 28,
          animation: "ql-fade-in 800ms ease-in-out infinite alternate",
        }}
      />
      Conjuring…
    </div>
  );
}

function lazyRoute(node: React.ReactNode): React.ReactNode {
  return <Suspense fallback={<PageLoader />}>{node}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      {/* Plan 25 — Player view: standalone route with no DM chrome */}
      <Route path="/play/:pcId" element={lazyRoute(<PlayerView />)} />

      {/* Plan 42 — Table View: full-screen projected battle map, no DM chrome */}
      <Route path="/table/:sessionId" element={lazyRoute(<TableView />)} />
      {/* Players' 3D table (Plan 45) — read-only capability URL, no auth */}
      <Route path="/table/:sessionId/3d" element={lazyRoute(<Table3DView />)} />
      {/* DM 3D tabletop (Plan 44) — full-screen, DM-driven */}
      <Route path="/sessions/:sessionId/board" element={lazyRoute(<BoardView />)} />

      {/* Plan 47 — player marketplace: capability URLs, no auth, no DM chrome */}
      <Route path="/market/:campaignId" element={lazyRoute(<MarketView />)} />
      <Route path="/shop/:shopId" element={lazyRoute(<StorefrontView />)} />

      {/* Plan 35 — Landing / sign-in: standalone, no DM chrome */}
      <Route path="/welcome" element={<Welcome />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={lazyRoute(<Campaigns />)} />
        <Route
          path="campaigns/:campaignId/adventures"
          element={lazyRoute(<Adventures />)}
        />
        <Route
          path="campaigns/:campaignId/characters"
          element={lazyRoute(<Characters />)}
        />
        <Route
          path="campaigns/:campaignId/npcs"
          element={lazyRoute(<Npcs />)}
        />
        <Route
          path="adventures/:adventureId/encounters"
          element={lazyRoute(<Encounters />)}
        />
        <Route
          path="adventures/:adventureId/maps"
          element={lazyRoute(<MapBuilder />)}
        />
        <Route
          path="campaigns/:campaignId/battle-maps"
          element={lazyRoute(<BattleMaps />)}
        />
        <Route
          path="campaigns/:campaignId/shops"
          element={lazyRoute(<Shops />)}
        />
        <Route
          path="adventures/:adventureId/sessions"
          element={lazyRoute(<Sessions />)}
        />
        <Route
          path="sessions/:sessionId/run"
          element={
            <ErrorBoundary label="Session Runner">
              {lazyRoute(<SessionRunner />)}
            </ErrorBoundary>
          }
        />
        <Route
          path="sessions/:sessionId/hud"
          element={
            <ErrorBoundary label="Session HUD">
              {lazyRoute(<SessionHud />)}
            </ErrorBoundary>
          }
        />
        <Route path="monsters" element={lazyRoute(<Monsters />)} />
        <Route path="magic-items" element={lazyRoute(<MagicItems />)} />
        <Route path="spells" element={lazyRoute(<Spells />)} />
        <Route path="weapons" element={lazyRoute(<Weapons />)} />
        <Route path="admin" element={lazyRoute(<Admin />)} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
