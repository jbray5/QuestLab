import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Check, Download, LayoutDashboard, Skull, UserPlus } from "lucide-react";
import { adminApi } from "../api/admin";
import BetaPanel from "../components/admin/BetaPanel";
import { useAuthStore } from "../stores/useAuthStore";
import { plural } from "../lib/plural";
import { useIsCompact } from "../hooks/useIsCompact";

const TABS = [
  // Plan 125 — the friends beta: invites, who joined, feedback.
  { id: "beta", label: "Beta", icon: <UserPlus size={16} aria-hidden /> },
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={16} aria-hidden /> },
  { id: "monsters", label: "Monsters", icon: <Skull size={16} aria-hidden /> },
  { id: "export", label: "Export", icon: <Download size={16} aria-hidden /> },
] as const;

const TH: React.CSSProperties = { padding: "0.5rem 0.6rem", fontWeight: 500 };
const TD: React.CSSProperties = { padding: "0.45rem 0.6rem", textAlign: "center" };

export default function Admin() {
  const phone = useIsCompact(640);
  const { dmEmail } = useAuthStore();
  const [tab, setTab] = useState<"beta" | "overview" | "monsters" | "export">("beta");
  const [reseedConfirm, setReseedConfirm] = useState(false);

  const { data: monsters = [], isLoading: monstersLoading, refetch: refetchMonsters } = useQuery({
    queryKey: ["admin-monsters"],
    queryFn: adminApi.listMonsters,
    enabled: tab === "monsters",
  });

  const seed = useMutation({
    mutationFn: adminApi.seedMonsters,
    onSuccess: () => refetchMonsters(),
  });

  const reseed = useMutation({
    mutationFn: adminApi.reseedMonsters,
    onSuccess: () => { refetchMonsters(); setReseedConfirm(false); },
  });

  const exportCampaigns = useMutation({ mutationFn: adminApi.exportCampaigns });

  return (
    <div className="fade-in">
      <h1>Admin panel</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem", overflowWrap: "anywhere" }}>
        Signed in as <span className="num">{dmEmail || "—"}</span>
      </p>

      {/* Tab bar */}
      <div
        className="flex gap-2"
        role="tablist"
        aria-label="Admin sections"
        style={{ marginBottom: "1.5rem", flexWrap: phone ? "nowrap" : undefined }}
      >
        {TABS.map((t) => {
          const on = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              className="btn btn-ghost"
              onClick={() => setTab(t.id)}
              style={{
                // A phone fits the four tabs on one row, equal widths.
                ...(phone ? { flex: "1 1 0", minWidth: 0, paddingInline: "0.5rem" } : null),
                ...(on
                  ? { background: "var(--accent-active)", color: "var(--accent-active-text)", borderColor: "var(--accent-line)" }
                  : null),
              }}
            >
              {t.icon} {t.label}
            </button>
          );
        })}
      </div>

      {tab === "beta" && <BetaPanel />}

      {/* Overview */}
      {tab === "overview" && (
        <div>
          <div className="grid-3">
            <div className="card">
              <h4>Monster catalog</h4>
              <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                SRD stat blocks available for encounter building.
              </p>
            </div>
            <div className="card">
              <h4>Campaign export</h4>
              <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                Export all campaigns as JSON for backup.
              </p>
            </div>
            <div className="card">
              <h4>System</h4>
              <p style={{ fontSize: "0.875rem", color: "var(--muted)" }}>
                FastAPI backend · DuckDB
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Monsters */}
      {tab === "monsters" && (
        <div>
          <div className="flex gap-2" style={{ marginBottom: "1rem", alignItems: "center" }}>
            <button
              className="btn btn-secondary"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
            >
              {seed.isPending ? "Seeding…" : "Seed monsters"}
            </button>

            {!reseedConfirm ? (
              <button
                className="btn btn-danger"
                onClick={() => setReseedConfirm(true)}
              >
                Force reseed
              </button>
            ) : (
              <>
                <span className="text-sm" style={{ color: "var(--amber-text)", alignSelf: "center", flexBasis: phone ? "100%" : undefined }}>
                  This deletes all monsters and seeds them again.
                </span>
                <button
                  className="btn btn-danger"
                  onClick={() => reseed.mutate()}
                  disabled={reseed.isPending}
                >
                  {reseed.isPending ? "Reseeding…" : "Confirm reseed"}
                </button>
                <button className="btn btn-ghost" onClick={() => setReseedConfirm(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>

          {seed.isSuccess && (
            <p style={{ color: "var(--teal-text)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
              <Check size={16} aria-hidden /> Inserted <span className="num">{(seed.data as { inserted: number }).inserted}</span> monsters.
            </p>
          )}
          {reseed.isSuccess && (
            <p style={{ color: "var(--teal-text)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap" }}>
              <Check size={16} aria-hidden /> Deleted{" "}
              <span className="num">{(reseed.data as { deleted: number; inserted: number }).deleted}</span>, inserted{" "}
              <span className="num">{(reseed.data as { deleted: number; inserted: number }).inserted}</span> monsters.
            </p>
          )}

          {monstersLoading && <p className="text-muted">Loading monsters…</p>}

          {monsters.length > 0 && (
            <div>
              {phone ? (
                // Phone: one stacked row per monster instead of a six-column table.
                <div className="ql-table">
                  {monsters.map((m) => (
                    <div key={m.id} className="ql-table-row" style={{ padding: "0.55rem 0.8rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.5rem" }}>
                        <span className="story" style={{ fontWeight: 700, minWidth: 0 }}>{m.name}</span>
                        <span className="pill" style={{ flexShrink: 0 }}>
                          CR <span className="num">{m.challenge_rating}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem 0.9rem", fontSize: "0.8125rem", color: "var(--muted)", marginTop: "0.15rem" }}>
                        <span>{m.creature_type}</span>
                        <span>HP <span className="num" style={{ color: "var(--text2)" }}>{m.hp_average}</span></span>
                        <span>AC <span className="num" style={{ color: "var(--text2)" }}>{m.ac}</span></span>
                        <span>XP <span className="num" style={{ color: "var(--text2)" }}>{m.xp}</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                        <th style={{ ...TH, textAlign: "left" }}>Name</th>
                        <th style={TH} title="Challenge rating">CR</th>
                        <th style={TH}>Type</th>
                        <th style={TH} title="Hit points">HP</th>
                        <th style={TH} title="Armor class">AC</th>
                        <th style={TH} title="Experience points">XP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monsters.map((m) => (
                        <tr key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td className="story" style={{ ...TD, textAlign: "left", color: "var(--text)", fontWeight: 700 }}>{m.name}</td>
                          <td style={TD} className="num">{m.challenge_rating}</td>
                          <td style={{ ...TD, color: "var(--muted)" }}>{m.creature_type}</td>
                          <td style={TD} className="num">{m.hp_average}</td>
                          <td style={TD} className="num">{m.ac}</td>
                          <td style={TD} className="num">{m.xp}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-sm text-muted" style={{ marginTop: "0.5rem" }}>
                {plural(monsters.length, "monster")} loaded.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Export */}
      {tab === "export" && (
        <div>
          <div className="card" style={{ maxWidth: 400 }}>
            <h3>Export campaigns</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9375rem", marginBottom: "1rem" }}>
              Downloads all your campaigns as a JSON file.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => exportCampaigns.mutate()}
              disabled={exportCampaigns.isPending}
              style={phone ? { whiteSpace: "normal", textAlign: "left" } : undefined}
            >
              {exportCampaigns.isPending ? (
                "Exporting…"
              ) : (
                <>
                  <Download size={16} aria-hidden /> Download campaigns_export.json
                </>
              )}
            </button>
            {exportCampaigns.isError && (
              <p style={{ color: "var(--danger-text)", marginTop: "0.5rem", fontSize: "0.875rem" }}>
                {(exportCampaigns.error as Error).message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
