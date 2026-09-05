import { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import DmDockBody from "../components/dm/DmDockBody";
import { useAuthStore } from "../stores/useAuthStore";

/**
 * NotesWindow — the DM notes dock as its own small browser window (Plan 75).
 *
 * Opened by the dock's "↗ Pop out". No sidebar, no chrome: just the notes,
 * script and people tabs filling a 460×720 popup the DM can park over the
 * Discord half of the screen while the HUD keeps the other half. DM-only —
 * bounces to /welcome without a signed-in DM.
 */
export default function NotesWindow() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dmEmail = useAuthStore((s) => s.dmEmail);

  useEffect(() => {
    if (!dmEmail) {
      navigate(`/welcome?next=${encodeURIComponent(location.pathname)}`, { replace: true });
    }
  }, [dmEmail, navigate, location.pathname]);

  useEffect(() => {
    document.title = "DM Notes — QuestLab";
  }, []);

  if (!dmEmail || !sessionId) return null;

  return (
    <div
      style={{
        height: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg, #0e0d14)",
        color: "var(--text)",
      }}
    >
      <DmDockBody
        key={sessionId}
        sessionId={sessionId}
        onSessionChange={(id) => navigate(`/sessions/${id}/notes`, { replace: true })}
      />
    </div>
  );
}
