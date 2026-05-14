import { Routes, Route } from "react-router-dom";
import ErrorBoundary from "./components/ErrorBoundary";
import Layout from "./pages/Layout";
import Dashboard from "./pages/Dashboard";
import Campaigns from "./pages/Campaigns";
import Adventures from "./pages/Adventures";
import Characters from "./pages/Characters";
import Encounters from "./pages/Encounters";
import MapBuilder from "./pages/MapBuilder";
import Sessions from "./pages/Sessions";
import SessionRunner from "./pages/SessionRunner";
import SessionHud from "./pages/SessionHud";
import Admin from "./pages/Admin";
import MagicItems from "./pages/MagicItems";
import Monsters from "./pages/Monsters";
import Spells from "./pages/Spells";
import Weapons from "./pages/Weapons";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="campaigns/:campaignId/adventures" element={<Adventures />} />
        <Route path="campaigns/:campaignId/characters" element={<Characters />} />
        <Route path="adventures/:adventureId/encounters" element={<Encounters />} />
        <Route path="adventures/:adventureId/maps" element={<MapBuilder />} />
        <Route path="adventures/:adventureId/sessions" element={<Sessions />} />
        <Route
          path="sessions/:sessionId/run"
          element={
            <ErrorBoundary label="Session Runner">
              <SessionRunner />
            </ErrorBoundary>
          }
        />
        <Route
          path="sessions/:sessionId/hud"
          element={
            <ErrorBoundary label="Session HUD">
              <SessionHud />
            </ErrorBoundary>
          }
        />
        <Route path="monsters" element={<Monsters />} />
        <Route path="magic-items" element={<MagicItems />} />
        <Route path="spells" element={<Spells />} />
        <Route path="weapons" element={<Weapons />} />
        <Route path="admin" element={<Admin />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
