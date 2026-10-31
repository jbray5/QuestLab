import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Link2Off } from "lucide-react";

import { apiBase } from "../api/client";
import BrandMark from "./BrandMark";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Probe = { kind: "ok"; playKey: string } | { kind: "replaced"; campaignId: string } | { kind: "unknown" };

/** Ask the API what an old UUID link is now: its token, or replaced (410). */
async function probe(key: string): Promise<Probe> {
  const res = await fetch(`${apiBase()}/play/${key}/link`);
  if (res.ok) {
    const body = (await res.json()) as { play_key: string };
    return { kind: "ok", playKey: body.play_key };
  }
  if (res.status === 410) {
    const body = await res.json().catch(() => ({}));
    const campaignId = body?.detail?.campaign_id;
    if (typeof campaignId === "string") return { kind: "replaced", campaignId };
  }
  return { kind: "unknown" };
}

/** Swap a remembered join pick that still holds the old UUID for the new key. */
function rememberNewKey(oldKey: string, newKey: string) {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("qj-pick-") && localStorage.getItem(k) === oldKey) {
        localStorage.setItem(k, newKey);
      }
    }
  } catch {
    /* storage blocked: the new address still works */
  }
}

/**
 * PlayLinkGate (SEC-002) — wraps every `/play/:pcId/…` page.
 *
 * Player links used to be `/play/{character UUID}`; they are now
 * `/play/{play_token}`. A phone that opens an old UUID link during the grace
 * period is moved to the token address (same page, same query) and its
 * remembered join pick is updated, so it keeps working afterwards. An old
 * link that no longer opens shows a way back in through the party's join
 * page instead of a dead end. Token links pass straight through.
 */
export default function PlayLinkGate({ children }: { children: ReactNode }) {
  const { pcId = "" } = useParams<{ pcId: string }>();
  const legacy = UUID.test(pcId);
  const location = useLocation();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: ["play-link-probe", pcId],
    queryFn: () => probe(pcId),
    enabled: legacy,
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!legacy || data?.kind !== "ok" || data.playKey === pcId) return;
    rememberNewKey(pcId, data.playKey);
    const rest = location.pathname.slice(`/play/${pcId}`.length);
    navigate(`/play/${data.playKey}${rest}${location.search}`, { replace: true });
  }, [legacy, data, pcId, location.pathname, location.search, navigate]);

  if (!legacy) return <>{children}</>;
  if (data?.kind === "replaced") return <LinkReplaced campaignId={data.campaignId} />;
  if (data?.kind === "unknown") return <>{children}</>;
  if (data?.kind === "ok" && data.playKey === pcId) return <>{children}</>;
  return null; // probing, or about to move to the new address
}

function LinkReplaced({ campaignId }: { campaignId: string }) {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg)",
      }}
    >
      <div style={{ maxWidth: 380, display: "flex", flexDirection: "column", gap: 14, textAlign: "center", alignItems: "center" }}>
        <BrandMark size={28} />
        <Link2Off size={28} aria-hidden style={{ color: "var(--muted)" }} />
        <h1 className="story" style={{ fontSize: "1.5rem", margin: 0 }}>
          This link was replaced
        </h1>
        <p style={{ color: "var(--text2)", margin: 0, lineHeight: 1.55 }}>
          Your DM gave this character a new link. Open your party's page and tap your character again, or ask your DM
          for the new link.
        </p>
        <Link
          to={`/join/${campaignId}`}
          className="btn btn-primary"
          style={{ minHeight: 48, justifyContent: "center", textDecoration: "none", width: "100%" }}
        >
          Open my party's page
        </Link>
      </div>
    </div>
  );
}
