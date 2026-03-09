import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { adminApi } from "../api/admin";
import { useAuthStore } from "../stores/useAuthStore";

export default function Admin() {
  const { dmEmail } = useAuthStore();
  const [tab, setTab] = useState<"overview" | "monsters" | "export">("overview");
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

  const TABS = [
    { id: "overview", label: "📊 Overview" },
    { id: "monsters", label: "💀 Monsters" },
    { id: "export", label: "📤 Export" },
  ] as const;

  return (
    <div className="fade-in">
      <h1>Admin Panel</h1>
      <p className="text-muted" style={{ marginBottom: "1.5rem" }}>
        Signed in as <span className="text-mono">{dmEmail || "—"}</span>
      </p>

      {/* Tab bar */}
      <div className="flex gap-2" style={{ marginBottom: "1.5rem" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`btn ${tab === t.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && (
        <div>
          <div className="grid-3">
            <div className="card">
              <h4>Monster Catalog</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                SRD stat blocks available for encounter building.
              </p>
            </div>
            <div className="card">
              <h4>Campaign Export</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                Export all campaigns as JSON for backup.
              </p>
            </div>
            <div className="card">
              <h4>System</h4>
              <p style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                FastAPI backend · DuckDB · Claude AI
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Monsters */}
      {tab === "monsters" && (
        <div>
          <div className="flex gap-2" style={{ marginBottom: "1rem" }}>
            <button
              className="btn btn-secondary"
              onClick={() => seed.mutate()}
              disabled={seed.isPending}
            >
              {seed.isPending ? "Seeding…" : "Seed Monsters"}
            </button>

            {!reseedConfirm ? (
              <button
                className="btn btn-danger"
                onClick={() => setReseedConfirm(true)}
              >
                Force Reseed
              </button>
            ) : (
              <>
                <span className="text-sm" style={{ color: "var(--yellow)", alignSelf: "center" }}>
                  This deletes all monsters and re-seeds!
                </span>
                <button
                  className="btn btn-danger"
                  onClick={() => reseed.mutate()}
                  disabled={reseed.isPending}
                >
                  {reseed.isPending ? "Reseeding…" : "Confirm Reseed"}
                </button>
                <button className="btn btn-ghost" onClick={() => setReseedConfirm(false)}>
                  Cancel
                </button>
              </>
            )}
          </div>

          {seed.isSuccess && (
            <p style={{ color: "var(--green2)", marginBottom: "0.5rem" }}>
              ✓ Inserted {(seed.data as { inserted: number }).inserted} monsters.
            </p>
          )}
          {reseed.isSuccess && (
            <p style={{ color: "var(--green2)", marginBottom: "0.5rem" }}>
              ✓ Deleted {(reseed.data as { deleted: number; inserted: number }).deleted}, inserted {(reseed.data as { deleted: number; inserted: number }).inserted} monsters.
            </p>
          )}

          {monstersLoading && <p className="text-muted">Loading monsters…</p>}

          {monsters.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Name</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>CR</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>Type</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>HP</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>AC</th>
                    <th style={{ padding: "0.4rem 0.6rem" }}>XP</th>
                  </tr>
                </thead>
                <tbody>
                  {monsters.map((m) => (
                    <tr
                      key={m.id}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <td style={{ padding: "0.4rem 0.6rem", color: "var(--gold)" }}>{m.name}</td>
                      <td style={{ padding: "0.4rem 0.6rem", textAlign: "center" }} className="text-mono">{m.challenge_rating}</td>
                      <td style={{ padding: "0.4rem 0.6rem", textAlign: "center", color: "var(--muted)" }}>{m.creature_type}</td>
                      <td style={{ padding: "0.4rem 0.6rem", textAlign: "center" }} className="text-mono">{m.hp_average}</td>
                      <td style={{ padding: "0.4rem 0.6rem", textAlign: "center" }} className="text-mono">{m.ac}</td>
                      <td style={{ padding: "0.4rem 0.6rem", textAlign: "center" }} className="text-mono">{m.xp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-sm text-muted" style={{ marginTop: "0.5rem" }}>
                {monsters.length} monsters loaded.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Export */}
      {tab === "export" && (
        <div>
          <div className="card" style={{ maxWidth: 400 }}>
            <h3>Export Campaigns</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: "1rem" }}>
              Downloads all your campaigns as a JSON file.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => exportCampaigns.mutate()}
              disabled={exportCampaigns.isPending}
            >
              {exportCampaigns.isPending ? "Exporting…" : "📥 Download campaigns_export.json"}
            </button>
            {exportCampaigns.isError && (
              <p style={{ color: "var(--red)", marginTop: "0.5rem", fontSize: "0.85rem" }}>
                {(exportCampaigns.error as Error).message}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
