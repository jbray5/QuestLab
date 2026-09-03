import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { apiBase } from "../api/client";
import { portraitSrc } from "../lib/portrait";

/**
 * JoinView (Plan 63) — /join/:campaignId. The QR landing page.
 *
 * A player scans the code on the projector, sees the party, taps their
 * character, and lands on their live sheet. No accounts — the campaign
 * UUID is the capability, shown only in the room. Remembers the pick so
 * the next scan goes straight to their sheet.
 */

interface RosterRow {
  id: string;
  character_name: string;
  player_name: string | null;
  portrait_url: string | null;
}

const CSS = `
.qj-root {
  min-height: 100vh; padding: 2.2rem 1.2rem 3rem;
  background: radial-gradient(ellipse at 50% -10%, #241a38 0%, #0d0a16 55%, #06050a 100%);
  color: #e6ddc8; font-family: Georgia, 'Palatino Linotype', serif;
}
.qj-title {
  font-family: Cinzel, Georgia, serif; text-align: center; color: #f0e6c8;
  font-size: clamp(1.4rem, 5vw, 2rem); letter-spacing: 0.08em; margin: 0 0 0.3rem;
}
.qj-sub { text-align: center; color: #b3a789; font-style: italic; margin: 0 0 1.6rem; }
.qj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; max-width: 700px; margin: 0 auto; }
.qj-card {
  border: 1px solid rgba(240,230,200,0.18); border-radius: 14px; overflow: hidden;
  background: rgba(20,16,30,0.75); cursor: pointer; text-align: center; padding: 0;
  transition: transform 0.12s, border-color 0.12s;
}
.qj-card:hover, .qj-card:focus-visible { transform: translateY(-3px); border-color: #d6af36; }
.qj-card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.qj-card .ph { width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center; font-size: 3rem; opacity: 0.35; }
.qj-name { font-family: Cinzel, Georgia, serif; color: #f0e6c8; font-size: 0.95rem; padding: 8px 6px 2px; }
.qj-player { color: #9a9078; font-size: 0.72rem; padding-bottom: 10px; }
.qj-msg { text-align: center; color: #6b6b7a; margin-top: 4rem; font-style: italic; }
`;

export default function JoinView() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!campaignId) return;
    // A remembered pick goes straight to the sheet — the repeat-scan path.
    try {
      const saved = localStorage.getItem(`qj-pick-${campaignId}`);
      if (saved) {
        navigate(`/play/${saved}`, { replace: true });
        return;
      }
    } catch {
      /* storage blocked — always show the picker */
    }
    fetch(`${apiBase()}/play/join/${campaignId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setRoster)
      .catch(() => setError(true));
  }, [campaignId, navigate]);

  function pick(row: RosterRow) {
    try {
      localStorage.setItem(`qj-pick-${campaignId}`, row.id);
    } catch {
      /* fine */
    }
    navigate(`/play/${row.id}`);
  }

  return (
    <div className="qj-root">
      <style>{CSS}</style>
      <h1 className="qj-title">Who are you?</h1>
      <p className="qj-sub">Tap your character to open your sheet — or make a new one.</p>
      {error && <p className="qj-msg">This join link isn&rsquo;t valid — ask your DM for a fresh code.</p>}
      {!error && roster === null && <p className="qj-msg">Gathering the party&hellip;</p>}
      {roster && (
        <div className="qj-grid">
          <button
            className="qj-card"
            style={{ borderStyle: "dashed", borderColor: "rgba(214,175,54,0.55)" }}
            onClick={() => navigate(`/join/${campaignId}/new`)}
            title="Build a new character right here — about five minutes"
          >
            <div className="ph" style={{ opacity: 0.9 }}>✨</div>
            <div className="qj-name">New character</div>
            <div className="qj-player">Create yours</div>
          </button>
          {roster.map((row) => (
            <button key={row.id} className="qj-card" onClick={() => pick(row)}>
              {row.portrait_url ? (
                <img src={portraitSrc(row.portrait_url, "")} alt="" loading="lazy" />
              ) : (
                <div className="ph">🧙</div>
              )}
              <div className="qj-name">{row.character_name}</div>
              <div className="qj-player">{row.player_name ?? ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
