import { Navigate, Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { adventuresApi } from "../api/adventures";

const LABEL = { encounters: "Encounters", maps: "Map Builder" } as const;

/**
 * CampaignEncounters (Plan 83) — encounters and maps belong to arcs, but people
 * type /campaigns/<id>/encounters, and (review 10/30) the sidebar always shows
 * both, so they land here before any arc exists. One arc: go straight there.
 * Several: pick. None: say how to get one.
 */
export default function CampaignEncounters({ section = "encounters" }: { section?: "encounters" | "maps" }) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: arcs, isLoading } = useQuery({
    queryKey: ["adventures", campaignId],
    queryFn: () => adventuresApi.list(campaignId as string),
    enabled: !!campaignId,
  });
  if (isLoading || !arcs) return <p className="note">Finding the arcs…</p>;
  if (arcs.length === 1) return <Navigate to={`/adventures/${arcs[0].id}/${section}`} replace />;
  return (
    <div>
      <h1>{LABEL[section]}</h1>
      {arcs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">{section === "maps" ? "🗾" : "💀"}</div>
          <p>
            {LABEL[section]} live inside an arc, and this campaign doesn&rsquo;t have one yet.{" "}
            <Link to={`/campaigns/${campaignId}/sessions`}>Run a quick session</Link> and one is made for
            you — rename it any time.
          </p>
        </div>
      ) : (
        <>
          <p className="note">{LABEL[section]} live inside an arc. Which one?</p>
          <ul>
            {arcs.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.4rem" }}>
                <Link to={`/adventures/${a.id}/${section}`}>{a.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
