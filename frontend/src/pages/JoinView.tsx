import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { UserPlus } from "lucide-react";

import { apiBase } from "../api/client";
import { portraitSrc } from "../lib/portrait";
import { realPlayerName } from "./player/rules";
import { Monogram } from "./player/ui";

/**
 * JoinView (Plan 63) — /join/:campaignId. The QR landing page.
 *
 * A player scans the code on the projector, sees the party, taps their
 * character, and lands on their live sheet. No accounts — the campaign
 * UUID is the capability, shown only in the room. Remembers the pick so
 * the next scan goes straight to their sheet. `?switch=1` (the phone's
 * "Not you? Pick your character") shows the party instead.
 * Plan 139: a character a player already has comes without its link, so this
 * page can't open someone else's phone. It shows as taken and opens only from
 * its own link. "Not you?" keeps the remembered pick until they pick another:
 * the list may not open that character again, so it offers the way back.
 * A link that carries the join code (`?code=OTTER`; a DM can add it by hand,
 * the app's own join links leave it out) fills the code in and tries it, so
 * nobody retypes it (Plan 128).
 */

interface RosterRow {
  /** SEC-002 — the character's link key (opens /play/{key}); not its id. Plan 139: null once a player has it. */
  key: string | null;
  claimed: boolean;
  character_name: string;
  player_name: string | null;
  portrait_url: string | null;
  character_class?: string | null;
}

const CSS = `
.qj-root {
  min-height: 100dvh; padding: 28px 16px 48px;
  background: var(--bg); color: var(--text); font-family: var(--font-ui);
}
.qj-inner { max-width: 640px; margin: 0 auto; }
.qj-title { font-size: 1.6rem; margin: 0 0 4px; }
.qj-sub { color: var(--text2); margin: 0 0 20px; font-size: 0.9375rem; }
.qj-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.qj-card {
  display: flex; flex-direction: column; align-items: stretch; text-align: left;
  border: 1px solid var(--border); border-radius: 14px; overflow: hidden;
  background: var(--surface); color: var(--text); cursor: pointer; padding: 0; font: inherit;
  transition: border-color 0.15s;
}
.qj-card:hover { border-color: var(--border2); }
.qj-card img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; border-bottom: 1px solid var(--border); }
.qj-card.taken { cursor: default; opacity: 0.72; }
.qj-card.taken:hover { border-color: var(--border); }
.qj-card .ph {
  width: 100%; aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
  background: var(--surface2); border-bottom: 1px solid var(--border);
}
.qj-card.new {
  grid-column: 1 / -1; flex-direction: row; align-items: center; gap: 12px; padding: 12px 14px; min-height: 64px;
  border-style: dashed; border-color: var(--border2); background: transparent;
}
.qj-card.new .ph {
  width: 44px; height: 44px; flex: none; aspect-ratio: auto; border-radius: 10px; border: 1px solid var(--border);
  background: var(--surface); color: var(--accent-text);
}
.qj-card.new .qj-text { padding: 0; min-height: 0; }
.qj-text { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 2px; min-height: 64px; }
.qj-name { font-family: var(--font-story); font-weight: 700; font-size: 1.05rem; line-height: 1.2; }
.qj-player { color: var(--muted); font-size: 0.8125rem; }
.qj-msg { color: var(--text2); margin-top: 32px; text-align: center; }
.qj-code {
  display: flex; flex-direction: column; gap: 10px; max-width: 360px; margin: 8px auto 0;
  background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 16px;
}
.qj-code input {
  font-family: var(--font-mono); font-size: 1.4rem; letter-spacing: 0.15em; text-align: center;
  text-transform: uppercase; min-height: 52px;
}
`;

export default function JoinView() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const switching = params.get("switch") === "1";
  // Plan 128 — the join link's own code, ready in the box (and tried at once).
  const linkCode = (params.get("code") ?? "").trim().toUpperCase().slice(0, 12);
  const [roster, setRoster] = useState<RosterRow[] | null>(null);
  const [error, setError] = useState(false);
  // Plan 83 — some tables ask for a short code before showing the party.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState(linkCode);
  const [codeWrong, setCodeWrong] = useState(false);
  // Plan 139 — this phone's own character, when "Not you?" brought them here.
  const [mine, setMine] = useState<string | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    // A remembered pick goes straight to the sheet — the repeat-scan path.
    // "Not you?" on the phone arrives with ?switch=1: show the party, with a way back.
    try {
      const saved = localStorage.getItem(`qj-pick-${campaignId}`);
      if (saved && !switching) {
        navigate(`/play/${saved}`, { replace: true });
        return;
      }
      if (saved) checkMine(saved);
    } catch {
      /* storage blocked — always show the picker */
    }
    load(linkCode || readCode(campaignId));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, navigate, switching, linkCode]);

  /** The way back, unless that link was replaced: then the pick is no use to anyone. */
  function checkMine(saved: string) {
    fetch(`${apiBase()}/play/${saved}/link`)
      .then((r) => {
        if (r.ok) {
          setMine(saved);
        } else if (r.status === 404 || r.status === 410) {
          localStorage.removeItem(`qj-pick-${campaignId}`);
        }
      })
      .catch(() => undefined);
  }

  function readCode(cid: string): string {
    try {
      return sessionStorage.getItem(`qj-code-${cid}`) ?? "";
    } catch {
      return "";
    }
  }
  function load(withCode: string) {
    if (!campaignId) return;
    const q = withCode ? `?code=${encodeURIComponent(withCode)}` : "";
    fetch(`${apiBase()}/play/join/${campaignId}${q}`)
      .then((r) => {
        if (r.ok) return r.json();
        if (r.status === 403) {
          setNeedCode(true);
          setCodeWrong(!!withCode);
          return null;
        }
        return Promise.reject(new Error(String(r.status)));
      })
      .then((rows: RosterRow[] | null) => {
        if (!rows) return;
        setNeedCode(false);
        try {
          sessionStorage.setItem(`qj-code-${campaignId}`, withCode);
        } catch {
          /* fine */
        }
        setRoster(rows);
      })
      .catch(() => setError(true));
  }

  function pick(key: string) {
    try {
      localStorage.setItem(`qj-pick-${campaignId}`, key);
    } catch {
      /* fine */
    }
    navigate(`/play/${key}`);
  }

  return (
    <div className="qj-root">
      <style>{CSS}</style>
      <div className="qj-inner">
        <h1 className="qj-title">Who are you?</h1>
        <p className="qj-sub">
          Tap your character to open your sheet on this phone, or make a new one.
        </p>
        {mine && (
          <Link to={`/play/${mine}`} className="btn btn-secondary" style={{ minHeight: 48, justifyContent: "center", textDecoration: "none", marginBottom: 16 }}>
            Back to my character
          </Link>
        )}
        {roster?.some((row) => !row.key) && (
          <p className="qj-sub">
            A character that&rsquo;s already on a phone opens from its own link. If one of them is yours and you&rsquo;ve
            lost your link, ask your DM.
          </p>
        )}
        {error && (
          <div className="qj-msg">
            <p>This join link isn&rsquo;t working. Ask your DM to show the join code again.</p>
            <Link to="/">QuestLab home</Link>
          </div>
        )}
        {!error && needCode && (
          <form
            className="qj-code"
            onSubmit={(e) => {
              e.preventDefault();
              load(code.trim());
            }}
          >
            <label htmlFor="qj-code-input" style={{ margin: 0, fontSize: "0.9375rem", color: "var(--text)" }}>
              This table asks for a join code. Your DM has it.
            </label>
            <input
              id="qj-code-input"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              maxLength={12}
              placeholder="Code"
              autoComplete="off"
              autoCapitalize="characters"
            />
            <button type="submit" className="btn btn-primary" style={{ minHeight: 48 }} disabled={!code.trim()}>
              Join the table
            </button>
            {codeWrong && (
              <p role="alert" style={{ margin: 0, color: "var(--danger-text)", fontSize: "0.875rem" }}>
                That code didn&rsquo;t match. Check it with your DM and try again.
              </p>
            )}
          </form>
        )}
        {!error && !needCode && roster === null && <p className="qj-msg">Finding the party…</p>}
        {roster && (
          <div className="qj-grid">
            {roster.map((row, i) => {
              const face = (
                <>
                  {row.portrait_url ? (
                    <img src={portraitSrc(row.portrait_url, "")} alt="" loading="lazy" />
                  ) : (
                    <div className="ph">
                      <Monogram name={row.character_name} size={72} cls={row.character_class} />
                    </div>
                  )}
                  <span className="qj-text">
                    <span className="qj-name">{row.character_name}</span>
                    {realPlayerName(row.player_name) && <span className="qj-player">{realPlayerName(row.player_name)}</span>}
                    {!row.key && <span className="qj-player">Already on a phone</span>}
                  </span>
                </>
              );
              const key = row.key;
              return key ? (
                <button key={key} type="button" className="qj-card" onClick={() => pick(key)}>
                  {face}
                </button>
              ) : (
                <div key={`${row.character_name}-${i}`} className="qj-card taken">
                  {face}
                </div>
              );
            })}
            <button
              type="button"
              className="qj-card new"
              onClick={() => navigate(`/join/${campaignId}/new`)}
            >
              <div className="ph">
                <UserPlus size={22} />
              </div>
              <span className="qj-text">
                <span style={{ fontWeight: 600 }}>New character</span>
                <span className="qj-player">Build one here, about five minutes</span>
              </span>
            </button>
          </div>
        )}
        {roster && roster.length === 0 && (
          <p className="qj-sub" style={{ marginTop: 14 }}>
            Nobody has joined this table yet. Make the first character.
          </p>
        )}
      </div>
    </div>
  );
}
