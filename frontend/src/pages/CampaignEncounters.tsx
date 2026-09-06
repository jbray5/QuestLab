import { Navigate, Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { adventuresApi } from "../api/adventures";

/**
 * CampaignEncounters (Plan 83) — encounters belong to arcs, but people type
 * /campaigns/<id>/encounters. One arc: go straight there. Several: pick.
 */
export default function CampaignEncounters() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const { data: arcs, isLoading } = useQuery({
    queryKey: ["adventures", campaignId],
    queryFn: () => adventuresApi.list(campaignId as string),
    enabled: !!campaignId,
  });
  if (isLoading || !arcs) return <p className="note">Finding the arcs…</p>;
  if (arcs.length === 1) return <Navigate to={`/adventures/${arcs[0].id}/encounters`} replace />;
  return (
    <div>
      <h1>Encounters</h1>
      {arcs.length === 0 ? (
        <p className="note">
          Encounters live inside an arc. <Link to={`/campaigns/${campaignId}/sessions`}>Make an arc</Link> first.
        </p>
      ) : (
        <>
          <p className="note">Encounters live inside an arc. Which one?</p>
          <ul>
            {arcs.map((a) => (
              <li key={a.id} style={{ marginBottom: "0.4rem" }}>
                <Link to={`/adventures/${a.id}/encounters`}>{a.title}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
