import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import { useCampaignStore } from "../stores/useCampaignStore";
import ImageUpload from "../components/ImageUpload";

const RARITIES = ["All", "Common", "Uncommon", "Rare", "VeryRare", "Legendary", "Artifact"];

const ITEM_TYPES = [
  "All Types",
  "Potion",
  "Scroll",
  "Weapon",
  "Armor",
  "Ring",
  "Rod",
  "Staff",
  "Wand",
  "Wondrous Item",
];

const RARITY_COLORS: Record<string, string> = {
  Common: "#aaa",
  Uncommon: "#1eff00",
  Rare: "#0070dd",
  VeryRare: "#a335ee",
  Legendary: "#ff8000",
  Artifact: "#e6cc80",
};

const RARITY_LABELS: Record<string, string> = {
  VeryRare: "Very Rare",
};

function rarityLabel(r: string): string {
  return RARITY_LABELS[r] ?? r;
}

function rarityBadgeStyle(rarity: string): React.CSSProperties {
  return {
    display: "inline-block",
    padding: "0.15rem 0.5rem",
    borderRadius: "0.25rem",
    fontSize: "0.7rem",
    fontWeight: 600,
    color: RARITY_COLORS[rarity] ?? "#aaa",
    border: `1px solid ${RARITY_COLORS[rarity] ?? "#aaa"}`,
    background: "rgba(0,0,0,0.3)",
  };
}

export default function MagicItems() {
  const { activeAdventure } = useCampaignStore();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All");
  const [itemType, setItemType] = useState("All Types");
  const [selected, setSelected] = useState<MagicItem | null>(null);
  const [lore, setLore] = useState<string | null>(null);
  const [loreTied, setLoreTied] = useState(false);

  const queryParams = {
    q: search.trim() || undefined,
    rarity: rarity !== "All" ? rarity : undefined,
    item_type: itemType !== "All Types" ? itemType : undefined,
  };

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", search, rarity, itemType],
    queryFn: () => itemsApi.list(queryParams),
  });

  const loreMutation = useMutation({
    mutationFn: (itemId: string) =>
      itemsApi.generateLore(itemId, {
        adventure_id: loreTied && activeAdventure ? activeAdventure.id : undefined,
      }),
    onSuccess: (data) => setLore(data.lore),
  });

  const updateImage = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => itemsApi.updateImage(id, url),
    onSuccess: (updated) => {
      setSelected(updated);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });

  function handleSelect(item: MagicItem) {
    setSelected(item);
    setLore(null);
  }

  return (
    <div className="fade-in" style={{ maxWidth: "960px", margin: "0 auto", padding: "1.5rem" }}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            color: "var(--gold)",
            fontSize: "2rem",
            marginBottom: "0.25rem",
          }}
        >
          Magic Items
        </h1>
        <p className="text-muted text-sm">PHB / DMG — ~100 iconic items across all rarities</p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto auto",
            gap: "0.75rem",
            alignItems: "center",
          }}
        >
          <input
            type="search"
            placeholder="Search items…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={rarity} onChange={(e) => setRarity(e.target.value)}>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r === "All" ? "All Rarities" : rarityLabel(r)}
              </option>
            ))}
          </select>
          <select value={itemType} onChange={(e) => setItemType(e.target.value)}>
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Layout — list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "1.25rem" }}>
        {/* Item list */}
        <div
          style={{
            maxHeight: "75vh",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "0.4rem",
          }}
        >
          {isLoading && (
            <p className="text-muted text-sm" style={{ padding: "1rem" }}>
              Loading…
            </p>
          )}
          {!isLoading && (!items || items.length === 0) && (
            <p className="text-muted text-sm" style={{ padding: "1rem" }}>
              No items found.
            </p>
          )}
          {items?.map((item) => (
            <button
              key={item.id}
              className={`nav-item${selected?.id === item.id ? " active" : ""}`}
              onClick={() => handleSelect(item)}
              style={{
                textAlign: "left",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
              }}
            >
              <span style={{ fontWeight: 500, fontSize: "0.85rem" }}>{item.name}</span>
              <span style={rarityBadgeStyle(item.rarity)}>{rarityLabel(item.rarity)}</span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div>
          {selected ? (
            <div className="card" style={{ padding: "1.25rem" }}>
              {/* Item header */}
              <div style={{ marginBottom: "1rem" }}>
                <h2
                  style={{
                    fontFamily: "var(--font-serif)",
                    color: "var(--gold)",
                    fontSize: "1.4rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {selected.name}
                </h2>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <span style={rarityBadgeStyle(selected.rarity)}>{rarityLabel(selected.rarity)}</span>
                  <span
                    className="badge-draft"
                    style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem" }}
                  >
                    {selected.item_type}
                  </span>
                  {selected.attunement_required && (
                    <span
                      style={{
                        fontSize: "0.7rem",
                        padding: "0.15rem 0.5rem",
                        border: "1px solid var(--muted)",
                        borderRadius: "0.25rem",
                        color: "var(--muted)",
                      }}
                    >
                      Requires Attunement
                    </span>
                  )}
                  {selected.value_gp > 0 && (
                    <span style={{ fontSize: "0.75rem", color: "var(--gold)" }}>
                      {selected.value_gp.toLocaleString()} gp
                    </span>
                  )}
                </div>
              </div>

              {/* Item image */}
              <div style={{ marginBottom: "1rem" }}>
                <ImageUpload
                  currentUrl={selected.image_url}
                  onUrlChange={(url) => updateImage.mutate({ id: selected.id, url })}
                  label="Item Art"
                  size={140}
                />
              </div>

              {/* Mechanics */}
              {selected.description && (
                <p style={{ fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "1.25rem" }}>
                  {selected.description}
                </p>
              )}

              <hr className="divider" style={{ margin: "1rem 0" }} />

              {/* AI Lore section */}
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                    flexWrap: "wrap",
                  }}
                >
                  <h3
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: "1rem",
                      color: "var(--text)",
                      margin: 0,
                    }}
                  >
                    ✨ AI Lore
                  </h3>
                  {activeAdventure && (
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        fontSize: "0.75rem",
                        color: "var(--muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={loreTied}
                        onChange={(e) => setLoreTied(e.target.checked)}
                        style={{ accentColor: "var(--gold)" }}
                      />
                      Tie to <em>{activeAdventure.title}</em>
                    </label>
                  )}
                  <button
                    className="btn-primary"
                    style={{ marginLeft: "auto", fontSize: "0.8rem", padding: "0.35rem 0.9rem" }}
                    disabled={loreMutation.isPending}
                    onClick={() => loreMutation.mutate(selected.id)}
                  >
                    {loreMutation.isPending ? "Generating…" : "Generate Lore"}
                  </button>
                </div>

                {loreMutation.isError && (
                  <p style={{ color: "var(--danger)", fontSize: "0.8rem" }}>
                    {(loreMutation.error as Error).message}
                  </p>
                )}

                {lore && (
                  <div
                    style={{
                      background: "rgba(201,168,76,0.05)",
                      border: "1px solid rgba(201,168,76,0.2)",
                      borderRadius: "0.5rem",
                      padding: "1rem",
                      fontSize: "0.875rem",
                      lineHeight: 1.75,
                      fontStyle: "italic",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {lore}
                  </div>
                )}

                {!lore && !loreMutation.isPending && (
                  <p className="text-muted text-sm" style={{ fontStyle: "italic" }}>
                    Generate AI-crafted lore that ties this item to your campaign's story.
                    {activeAdventure
                      ? " Check the box above to anchor it to your active adventure."
                      : " Select an adventure in the sidebar to tie lore to your campaign."}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div
              className="card"
              style={{
                padding: "2rem",
                textAlign: "center",
                color: "var(--muted)",
                fontSize: "0.875rem",
              }}
            >
              <p style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⚗️</p>
              <p>Select an item to view its details and generate adventure lore.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
