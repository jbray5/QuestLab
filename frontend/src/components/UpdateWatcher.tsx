import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw } from "lucide-react";

import { checkForUpdate } from "../lib/freshness";

const EVERY_MS = 10 * 60_000;

/**
 * UpdateWatcher (Plan 128) — an old tab finds out QuestLab was updated.
 *
 * Checks when the tab comes back into view (and every ten minutes while it's
 * open). Once a new version is live, the next move to another page loads it
 * fresh, and a small "Reload" pill offers it to anyone who stays put (a
 * player's sheet, the HUD). Nothing reloads by itself mid-screen, so a
 * half-typed note is never lost.
 */
export default function UpdateWatcher() {
  const [ready, setReady] = useState(false);
  const location = useLocation();
  const where = location.pathname + location.search;
  const firstWhere = useRef(where);

  useEffect(() => {
    if (ready) return;
    let alive = true;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      void checkForUpdate().then((yes) => {
        if (alive && yes) setReady(true);
      });
    };
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, EVERY_MS);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [ready]);

  // A navigation after the update is known becomes a real page load of the new
  // address, so the new version arrives with no extra tap.
  useEffect(() => {
    if (!ready) {
      firstWhere.current = where;
      return;
    }
    if (where !== firstWhere.current) window.location.reload();
  }, [ready, where]);

  if (!ready) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: "calc(8px + env(safe-area-inset-top, 0px))",
        left: "50%",
        translate: "-50% 0",
        zIndex: 9600,
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        padding: "0.35rem 0.4rem 0.35rem 0.9rem",
        borderRadius: 999,
        border: "1px solid var(--accent-line)",
        background: "var(--surface2)",
        boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
        fontSize: "0.875rem",
        color: "var(--text)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      QuestLab was updated.
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => window.location.reload()}
        style={{ minHeight: 36, padding: "0.25rem 0.8rem", borderRadius: 999 }}
      >
        <RefreshCw size={14} aria-hidden /> Reload
      </button>
    </div>
  );
}
