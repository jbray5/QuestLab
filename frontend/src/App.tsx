import { lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import PaywallModal from "./components/PaywallModal";
import Lightbox from "./components/Lightbox";

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
const CharacterView = lazy(() => import("./pages/CharacterView"));
const TryLanding = lazy(() => import("./pages/TryLanding"));
const PuzzleView = lazy(() => import("./pages/PuzzleView"));
const PuzzleWorkbench = lazy(() => import("./pages/PuzzleWorkbench"));
const TownCrier = lazy(() => import("./pages/TownCrier"));
const NotebookPage = lazy(() => import("./pages/NotebookPage"));
const TempleCompanion = lazy(() => import("./pages/TempleCompanion"));
const JoinView = lazy(() => import("./pages/JoinView"));
const GuidePage = lazy(() => import("./pages/GuidePage"));
const CharacterCreator = lazy(() => import("./pages/CharacterCreator"));
const TermsPage = lazy(() => import("./pages/TermsPage"));
const RestwaterCompanion = lazy(() => import("./pages/RestwaterCompanion"));

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
    <>
    <PaywallModal />
    <Lightbox />
    <Routes>
      {/* Plan 25 — Player view: standalone route with no DM chrome */}
      <Route path="/join/:campaignId" element={lazyRoute(<JoinView />)} />
      <Route path="/join/:campaignId/new" element={lazyRoute(<CharacterCreator />)} />
      <Route path="/play/:pcId" element={lazyRoute(<PlayerView />)} />
      {/* Plan 48 — Character Forge: the player's full-body character screen */}
      <Route path="/play/:pcId/character" element={lazyRoute(<CharacterView />)} />

      {/* Plan 42 — Table View: full-screen projected battle map, no DM chrome */}
      <Route path="/table/:sessionId" element={lazyRoute(<TableView />)} />
      {/* Players' 3D table (Plan 45) — read-only capability URL, no auth */}
      <Route path="/table/:sessionId/3d" element={lazyRoute(<Table3DView />)} />
      {/* DM 3D tabletop (Plan 44) — full-screen, DM-driven */}
      <Route path="/sessions/:sessionId/board" element={lazyRoute(<BoardView />)} />

      {/* Plan 55 — puzzle display: capability URL, projector-safe */}
      <Route path="/puzzle/:puzzleId" element={lazyRoute(<PuzzleView />)} />

      {/* Plan 47 — player marketplace: capability URLs, no auth, no DM chrome */}
      <Route path="/market/:campaignId" element={lazyRoute(<MarketView />)} />
      <Route path="/shop/:shopId" element={lazyRoute(<StorefrontView />)} />

      {/* Plan 35 — Landing / sign-in: standalone, no DM chrome */}
      <Route path="/welcome" element={<Welcome />} />
      {/* Plan 54 — public marketing/demo landing (the Reddit link) */}
      <Route path="/try" element={lazyRoute(<TryLanding />)} />
      {/* Plan 73 — public guide + terms */}
      <Route path="/guide" element={lazyRoute(<GuidePage />)} />
      <Route path="/terms" element={lazyRoute(<TermsPage />)} />

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
          path="campaigns/:campaignId/puzzles"
          element={lazyRoute(<PuzzleWorkbench />)}
        />
        <Route
          path="campaigns/:campaignId/crier"
          element={lazyRoute(<TownCrier />)}
        />
        <Route
          path="campaigns/:campaignId/notebook"
          element={lazyRoute(<NotebookPage />)}
        />
        <Route
          path="campaigns/:campaignId/temple"
          element={lazyRoute(<TempleCompanion />)}
        />
        <Route
          path="campaigns/:campaignId/restwater"
          element={lazyRoute(<RestwaterCompanion />)}
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
    </>
  );
}
