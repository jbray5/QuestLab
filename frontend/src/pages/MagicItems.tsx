import { useState } from "react";
import { ChevronRight, FlaskConical, ScrollText } from "lucide-react";
import { AI_ON } from "../lib/flags";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import { useCampaignStore } from "../stores/useCampaignStore";
import ImageUpload from "../components/ImageUpload";
import PhoneSheet from "../components/PhoneSheet";
import { useIsCompact } from "../hooks/useIsCompact";
import { useCanEditCatalog } from "../hooks/useCanEditCatalog";

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

const RARITY_LABELS: Record<string, string> = {
  VeryRare: "Very rare",
};

function rarityLabel(r: string): string {
  return RARITY_LABELS[r] ?? r;
}

/** The rarity tints in index.css (.badge-uncommon …): the hues players know, calm on the dark ground. */
function rarityBadgeClass(rarity: string): string {
  const key = rarity === "VeryRare" ? "very-rare" : rarity.toLowerCase();
  return `badge badge-${key}`;
}

export default function MagicItems() {
  const phone = useIsCompact(640);
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

  const detail = selected && (
    <ItemDetail
      item={selected}
      phone={phone}
      onImage={(url) => updateImage.mutate({ id: selected.id, url })}
      lore={lore}
      loreTied={loreTied}
      onLoreTied={setLoreTied}
      adventureTitle={activeAdventure?.title ?? null}
      lorePending={loreMutation.isPending}
      loreError={loreMutation.isError ? (loreMutation.error as Error).message : null}
      onGenerateLore={() => loreMutation.mutate(selected.id)}
    />
  );

  return (
    <div className="fade-in ql-page" style={{ "--page-max": "960px" } as React.CSSProperties}>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ marginBottom: "0.25rem" }}>Magic Items</h1>
        <p className="text-muted text-sm" style={{ margin: 0 }}>
          PHB / DMG — ~100 iconic items across all rarities
        </p>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div
          className="ql-filters"
          style={phone ? undefined : { gridTemplateColumns: "1fr auto auto", alignItems: "center" }}
        >
          <input
            type="search"
            className="ql-filter-wide"
            placeholder="Search items…"
            aria-label="Search items"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={rarity} onChange={(e) => setRarity(e.target.value)} aria-label="Rarity">
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r === "All" ? "All rarities" : rarityLabel(r)}
              </option>
            ))}
          </select>
          <select value={itemType} onChange={(e) => setItemType(e.target.value)} aria-label="Item type">
            {ITEM_TYPES.map((t) => (
              <option key={t} value={t}>
                {t === "All Types" ? "All types" : t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Layout: list + detail side by side on desktop; on a phone the list fills the
          width and a tapped item opens in a bottom sheet. */}
      <div
        style={
          phone
            ? undefined
            : { display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "1.25rem" }
        }
      >
        {/* Item list */}
        <div
          style={{
            maxHeight: phone ? undefined : "75vh",
            overflowY: phone ? undefined : "auto",
            display: "flex",
            flexDirection: "column",
            gap: phone ? "0.5rem" : "0.4rem",
          }}
        >
          {isLoading && (
            <p className="text-muted text-sm" style={{ padding: "1rem" }}>
              Loading…
            </p>
          )}
          {!isLoading && (!items || items.length === 0) && (
            <p className="text-muted text-sm" style={{ padding: "1rem" }}>
              No items match. Try another name, rarity or type.
            </p>
          )}
          {items?.map((item) =>
            phone ? (
              <button
                key={item.id}
                type="button"
                className="card"
                onClick={() => handleSelect(item)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.6rem",
                  width: "100%",
                  minHeight: 52,
                  padding: "0.6rem 0.75rem 0.6rem 0.9rem",
                  textAlign: "left",
                  cursor: "pointer",
                  color: "var(--text)",
                  fontSize: "1rem",
                }}
              >
                <span className="story" style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: "1.05rem" }}>
                  {item.name}
                </span>
                <span className={rarityBadgeClass(item.rarity)} style={{ flexShrink: 0 }}>
                  {rarityLabel(item.rarity)}
                </span>
                <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)" }} />
              </button>
            ) : (
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
                <span className="story" style={{ fontWeight: 700, fontSize: "0.95rem", minWidth: 0 }}>
                  {item.name}
                </span>
                <span className={rarityBadgeClass(item.rarity)} style={{ flexShrink: 0 }}>
                  {rarityLabel(item.rarity)}
                </span>
              </button>
            ),
          )}
        </div>

        {/* Detail panel (desktop) */}
        {!phone && (
          <div>
            {detail ? (
              <div className="card" style={{ padding: "1.25rem" }}>
                {detail}
              </div>
            ) : (
              <div className="card empty-state" style={{ padding: "2rem", fontSize: "0.9375rem" }}>
                <div className="empty-icon">
                  <FlaskConical size={28} aria-hidden />
                </div>
                <p style={{ margin: 0 }}>
                  {AI_ON
                    ? "Select an item to view its details and generate adventure lore."
                    : "Pick an item from the list to see what it does."}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {phone && selected && (
        <PhoneSheet title={selected.name} onClose={() => setSelected(null)}>
          {detail}
        </PhoneSheet>
      )}
    </div>
  );
}

/** One item: rarity, type, attunement, value, art, rules text and (AI builds only) lore. */
function ItemDetail({
  item,
  phone,
  onImage,
  lore,
  loreTied,
  onLoreTied,
  adventureTitle,
  lorePending,
  loreError,
  onGenerateLore,
}: {
  item: MagicItem;
  phone: boolean;
  onImage: (url: string) => void;
  lore: string | null;
  loreTied: boolean;
  onLoreTied: (v: boolean) => void;
  adventureTitle: string | null;
  lorePending: boolean;
  loreError: string | null;
  onGenerateLore: () => void;
}) {
  // SEC-003 — shared items are admin-only to change; homebrew belongs to its DM.
  const canEdit = useCanEditCatalog(item.created_by_email);
  const art = canEdit ? (
    <div style={{ marginBottom: "1rem" }}>
      <ImageUpload currentUrl={item.image_url} onUrlChange={onImage} label="Item Art" size={140} />
    </div>
  ) : item.image_url ? (
    <div style={{ marginBottom: "1rem" }}>
      <img
        src={item.image_url}
        alt={item.name}
        style={{ width: 140, height: 140, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
      />
    </div>
  ) : null;
  return (
    <>
      {/* Item header (the sheet's own header carries the name on a phone) */}
      <div style={{ marginBottom: "1rem" }}>
        {!phone && (
          <h2 className="story" style={{ fontSize: "1.4rem", marginBottom: "0.35rem" }}>
            {item.name}
          </h2>
        )}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className={rarityBadgeClass(item.rarity)}>{rarityLabel(item.rarity)}</span>
          <span className="pill">{item.item_type}</span>
          {item.attunement_required && <span className="pill pill-amber">Requires attunement</span>}
          {item.value_gp > 0 && (
            <span style={{ fontSize: "0.875rem", color: "var(--text2)" }}>
              <span className="num">{item.value_gp.toLocaleString()}</span> gp
            </span>
          )}
        </div>
      </div>

      {/* Item image (after the rules text on a phone, so what it does reads first) */}
      {!phone && art}

      {/* Mechanics */}
      {item.description && (
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "1.25rem", color: "var(--text)" }}>
          {item.description}
        </p>
      )}

      {phone && art}

      {/* AI lore: only in builds with AI features on. */}
      {AI_ON && (
        <>
          <hr className="divider" style={{ margin: "1rem 0" }} />
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
              <h3 style={{ fontSize: "1rem", margin: 0, display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <ScrollText size={16} aria-hidden /> Lore
              </h3>
              {adventureTitle && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    fontSize: "0.8125rem",
                    color: "var(--muted)",
                    cursor: "pointer",
                    margin: 0,
                    minHeight: phone ? 44 : undefined,
                  }}
                >
                  <input type="checkbox" checked={loreTied} onChange={(e) => onLoreTied(e.target.checked)} />
                  Tie to <em className="story">{adventureTitle}</em>
                </label>
              )}
              <button
                className="btn btn-primary"
                style={{ marginLeft: "auto", fontSize: "0.8125rem", padding: "0.35rem 0.9rem" }}
                disabled={lorePending}
                onClick={onGenerateLore}
              >
                {lorePending ? "Generating…" : "Generate lore"}
              </button>
            </div>

            {loreError && <p style={{ color: "var(--danger-text)", fontSize: "0.8125rem" }}>{loreError}</p>}

            {lore && (
              <div className="read-aloud" style={{ fontSize: "1rem", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {lore}
              </div>
            )}

            {!lore && !lorePending && (
              <p className="text-muted text-sm" style={{ margin: 0 }}>
                Generate lore that ties this item to your campaign&rsquo;s story.
                {adventureTitle
                  ? " Check the box above to anchor it to your active arc."
                  : " Select an arc in the sidebar to tie lore to your campaign."}
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
