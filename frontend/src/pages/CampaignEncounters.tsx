import { Navigate, Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Map as MapIcon, Swords } from "lucide-react";

import { adventuresApi } from "../api/adventures";

const LABEL = { encounters: "Encounters", maps: "Map builder" } as const;

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
  if (isLoading || !arcs) return <p className="note text-muted">Finding the arcs…</p>;
  if (arcs.length === 1) return <Navigate to={`/adventures/${arcs[0].id}/${section}`} replace />;
  const Icon = section === "maps" ? MapIcon : Swords;
  return (
    <div>
      <h1>{LABEL[section]}</h1>
      {arcs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Icon size={28} />
          </div>
          <p style={{ maxWidth: 480, margin: "0 auto" }}>
            {LABEL[section]} live inside an arc, and this campaign doesn&rsquo;t have one yet.{" "}
            <Link to={`/campaigns/${campaignId}/sessions`}>Run a quick session</Link> and one is made for
            you — rename it any time.
          </p>
        </div>
      ) : (
        <>
          <p className="note text-muted">{LABEL[section]} live inside an arc. Which one?</p>
          <div className="ql-table" style={{ maxWidth: 560 }}>
            {arcs.map((a) => (
              <Link
                key={a.id}
                to={`/adventures/${a.id}/${section}`}
                className="ql-table-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.65rem 0.9rem",
                  color: "var(--text)",
                  textDecoration: "none",
                }}
              >
                <span className="story" style={{ flex: 1, fontWeight: 700, fontSize: "1.1rem" }}>
                  {a.title}
                </span>
                <ChevronRight size={16} style={{ color: "var(--muted)" }} />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
