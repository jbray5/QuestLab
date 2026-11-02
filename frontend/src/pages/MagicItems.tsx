import { useState } from "react";
import { ChevronRight, Copy, FlaskConical, Pencil, Plus, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { itemsApi } from "../api/items";
import type { MagicItem } from "../api/items";
import HomebrewChip from "../components/HomebrewChip";
import ImageUpload from "../components/ImageUpload";
import PhoneSheet from "../components/PhoneSheet";
import { useToast } from "../components/Toast";
import ItemForm, { type ItemFormMode } from "../components/homebrew/ItemForm";
import { useIsCompact } from "../hooks/useIsCompact";
import { useCanEditCatalog } from "../hooks/useCanEditCatalog";
import { isMine, useMyEmail } from "../lib/homebrew";

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

/** Magic items (the default), or the weapons, armor and gear without magic (Plan 132). */
type View = "magic" | "mundane";

function rarityLabel(r: string): string {
  return RARITY_LABELS[r] ?? r;
}

/** The rarity tints in index.css (.badge-uncommon …): the hues players know, calm on the dark ground. */
function rarityBadgeClass(rarity: string): string {
  const key = rarity === "VeryRare" ? "very-rare" : rarity.toLowerCase();
  return `badge badge-${key}`;
}

/** "Weapon (longsword)" → "Weapon": the short type for a list row. */
function typeHead(itemType: string): string {
  return itemType.split("(")[0].trim() || itemType;
}

function isWeapon(item: MagicItem): boolean {
  return !!item.weapon_category && !!item.damage_die;
}

/** A magic weapon's +1/+2/+3 (`properties.bonus`, e.g. "+1"); 0 when it has none. */
function weaponBonus(item: MagicItem): number {
  const raw = item.properties?.bonus;
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? "").replace(/\s/g, ""), 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(3, n)) : 0;
}

function formTitle(mode: ItemFormMode): string {
  if (mode.kind === "edit") return `Edit ${mode.item.name}`;
  if (mode.kind === "copy") return `Copy ${mode.from.name}`;
  return "New item";
}

function formKey(mode: ItemFormMode): string {
  if (mode.kind === "edit") return `edit-${mode.item.id}`;
  if (mode.kind === "copy") return `copy-${mode.from.id}`;
  return "new";
}

export default function MagicItems() {
  const phone = useIsCompact(640);
  const qc = useQueryClient();
  const toast = useToast();
  const me = useMyEmail();
  const [view, setView] = useState<View>("magic");
  const [search, setSearch] = useState("");
  const [rarity, setRarity] = useState("All");
  const [itemType, setItemType] = useState("All Types");
  const [homebrewOnly, setHomebrewOnly] = useState(false);
  const [selected, setSelected] = useState<MagicItem | null>(null);
  const [form, setForm] = useState<ItemFormMode | null>(null);
  const [deleteError, setDeleteError] = useState<{ id: string; message: string } | null>(null);
  // The item whose "Delete for good?" question is open.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const queryParams = {
    q: search.trim() || undefined,
    rarity: rarity !== "All" ? rarity : undefined,
    item_type: itemType !== "All Types" ? itemType : undefined,
    kind: view,
  };

  const { data: fetched, isLoading } = useQuery({
    queryKey: ["items", view, search, rarity, itemType],
    queryFn: () => itemsApi.list(queryParams),
  });
  // Lists show the shared catalog plus only your own homebrew (SEC-003), so any owned row is yours.
  const items = homebrewOnly ? fetched?.filter((i) => !!i.created_by_email) : fetched;

  /** Every list that shows catalog items: this page, weapons, inventory search, loot. */
  function refreshCatalog() {
    for (const key of ["items", "weapons", "item-search", "loot-items"]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  }

  const updateImage = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) => itemsApi.updateImage(id, url),
    onSuccess: (updated) => {
      setSelected(updated);
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });

  const remove = useMutation({
    mutationFn: (item: MagicItem) => itemsApi.remove(item.id),
    onSuccess: (_void, item) => {
      setSelected(null);
      setDeleteError(null);
      setConfirmId(null);
      refreshCatalog();
      toast.push(`Deleted ${item.name}.`, "success");
    },
    // Refused while a character, shop or loot table holds it: the server says where.
    onError: (e: Error, item) => {
      setConfirmId(null);
      setDeleteError({ id: item.id, message: e.message });
    },
  });

  function handleSelect(item: MagicItem) {
    setSelected(item);
    setForm(null);
    setDeleteError(null);
    setConfirmId(null);
  }

  function handleSaved(item: MagicItem) {
    setForm(null);
    setSelected(item);
    // Show the list the item lives in, so the DM sees what they just made.
    setView(item.is_magic ? "magic" : "mundane");
    refreshCatalog();
    toast.push(`Saved ${item.name}.`, "success");
  }

  const detail = selected && (
    <ItemDetail
      key={selected.id}
      item={selected}
      phone={phone}
      onImage={(url) => updateImage.mutate({ id: selected.id, url })}
      onCopy={() => setForm({ kind: "copy", from: selected })}
      onEdit={() => setForm({ kind: "edit", item: selected })}
      confirming={confirmId === selected.id}
      onAskDelete={() => {
        setDeleteError(null);
        setConfirmId(selected.id);
      }}
      onCancelDelete={() => setConfirmId(null)}
      onDelete={() => remove.mutate(selected)}
      deleting={remove.isPending}
      deleteError={deleteError?.id === selected.id ? deleteError.message : null}
    />
  );

  const formNode = form && (
    <ItemForm key={formKey(form)} mode={form} onSaved={handleSaved} onCancel={() => setForm(null)} />
  );

  const emptyText = homebrewOnly
    ? "You haven't made any items here yet. Tap New item to make your own, or open any item and copy it."
    : "No items match. Try another name, rarity or type.";

  return (
    <div className="fade-in ql-page" style={{ "--page-max": "960px" } as React.CSSProperties}>
      {/* Header */}
      <div
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1 style={{ marginBottom: "0.25rem" }}>Magic Items</h1>
          <p className="text-muted text-sm" style={{ margin: 0 }}>
            {view === "magic"
              ? "PHB / DMG — ~100 iconic items across all rarities, plus your own"
              : "Weapons, armor and gear without magic, plus your own"}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setForm({ kind: "new" })}
          style={phone ? { minHeight: 44 } : undefined}
        >
          <Plus size={16} aria-hidden /> New item
        </button>
      </div>

      {/* Filters */}
      <div className="card" style={{ marginBottom: "1rem", padding: "1rem" }}>
        <div
          role="group"
          aria-label="Which items"
          style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem" }}
        >
          {(
            [
              ["magic", "Magic items"],
              ["mundane", "Weapons and gear"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              className={`btn ${view === key ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setView(key)}
              style={phone ? { flex: 1, minHeight: 44 } : undefined}
            >
              {label}
            </button>
          ))}
        </div>
        <div
          className="ql-filters"
          style={phone ? undefined : { gridTemplateColumns: "1fr auto auto auto", alignItems: "center" }}
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
                {t === "All Types" ? "All types" : t === "Wondrous Item" ? "Wondrous item" : t}
              </option>
            ))}
          </select>
          <label
            className="ql-filter-wide"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              margin: 0,
              cursor: "pointer",
              color: "var(--text)",
              whiteSpace: "nowrap",
              minHeight: phone ? 44 : undefined,
            }}
          >
            <input
              type="checkbox"
              checked={homebrewOnly}
              onChange={(e) => setHomebrewOnly(e.target.checked)}
              style={{ width: "auto", flex: "none", margin: 0 }}
            />
            Homebrew only
          </label>
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
              {emptyText}
            </p>
          )}
          {items?.map((item) => {
            const mine = isMine(item.created_by_email, me);
            const tag =
              view === "magic" ? (
                <span className={rarityBadgeClass(item.rarity)} style={{ flexShrink: 0 }}>
                  {rarityLabel(item.rarity)}
                </span>
              ) : (
                <span className="badge badge-common" style={{ flexShrink: 0 }}>
                  {typeHead(item.item_type)}
                </span>
              );
            return phone ? (
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
                {mine && <HomebrewChip />}
                {tag}
                <ChevronRight size={18} aria-hidden style={{ color: "var(--muted)", flexShrink: 0 }} />
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
                <span className="story" style={{ fontWeight: 700, fontSize: "0.95rem", minWidth: 0, flex: 1 }}>
                  {item.name}
                </span>
                {mine && <HomebrewChip />}
                {tag}
              </button>
            );
          })}
        </div>

        {/* Detail panel or the form (desktop) */}
        {!phone && (
          <div>
            {form ? (
              <div className="card" style={{ padding: "1.25rem" }}>
                <h2 className="story" style={{ fontSize: "1.3rem", marginBottom: "1rem" }}>
                  {formTitle(form)}
                </h2>
                {formNode}
              </div>
            ) : detail ? (
              <div className="card" style={{ padding: "1.25rem" }}>
                {detail}
              </div>
            ) : (
              <div className="card empty-state" style={{ padding: "2rem", fontSize: "0.9375rem" }}>
                <div className="empty-icon">
                  <FlaskConical size={28} aria-hidden />
                </div>
                <p style={{ margin: 0 }}>
                  Pick an item from the list to see what it does, or make your own with New item.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {phone && form && (
        <PhoneSheet title={formTitle(form)} onClose={() => setForm(null)}>
          {formNode}
        </PhoneSheet>
      )}
      {phone && !form && selected && (
        <PhoneSheet title={selected.name} onClose={() => setSelected(null)}>
          {detail}
        </PhoneSheet>
      )}
    </div>
  );
}

/** One item: rarity, type, attunement, value, weapon numbers, art and rules text, and its actions. */
function ItemDetail({
  item,
  phone,
  onImage,
  onCopy,
  onEdit,
  confirming,
  onAskDelete,
  onCancelDelete,
  onDelete,
  deleting,
  deleteError,
}: {
  item: MagicItem;
  phone: boolean;
  onImage: (url: string) => void;
  onCopy: () => void;
  onEdit: () => void;
  confirming: boolean;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  deleting: boolean;
  deleteError: string | null;
}) {
  // SEC-003 — shared items are admin-only to change; homebrew belongs to its DM.
  const canEdit = useCanEditCatalog(item.created_by_email);
  const me = useMyEmail();
  const mine = isMine(item.created_by_email, me);
  const tap: React.CSSProperties | undefined = phone ? { minHeight: 44 } : undefined;
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
  const bonus = isWeapon(item) ? weaponBonus(item) : 0;

  const actions = (
    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCopy}
          style={tap}
          title="Make your own version; this one stays as it is"
        >
          <Copy size={15} aria-hidden /> Copy and edit
        </button>
        {canEdit && (
          <>
            <button type="button" className="btn btn-secondary" onClick={onEdit} style={tap}>
              <Pencil size={15} aria-hidden /> Edit
            </button>
            {!confirming && (
              <button type="button" className="btn btn-danger" onClick={onAskDelete} style={tap}>
                <Trash2 size={15} aria-hidden /> Delete
              </button>
            )}
          </>
        )}
      </div>
      {canEdit && confirming && (
        <div
          role="alertdialog"
          aria-label={`Delete ${item.name}?`}
          style={{
            marginTop: "0.75rem",
            padding: "0.75rem",
            borderRadius: 8,
            border: "1px solid var(--danger-line)",
            background: "var(--danger-soft)",
          }}
        >
          <p style={{ margin: "0 0 0.6rem", color: "var(--text)", fontSize: "0.9375rem" }}>
            Delete {item.name} for good?
            {!mine && " This is a shared rules item: it goes for every table."}
          </p>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-danger" onClick={onDelete} disabled={deleting} style={tap}>
              {deleting ? "Deleting…" : "Yes, delete it"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onCancelDelete} style={tap}>
              Keep it
            </button>
          </div>
        </div>
      )}
      {deleteError && (
        <p role="alert" style={{ margin: "0.75rem 0 0", color: "var(--danger-text)", fontSize: "0.9rem" }}>
          {deleteError}
        </p>
      )}
    </div>
  );

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
          {mine && <HomebrewChip />}
          <span className={rarityBadgeClass(item.rarity)}>{rarityLabel(item.rarity)}</span>
          <span className="pill">{item.item_type}</span>
          {!item.is_magic && <span className="pill">Not magic</span>}
          {item.attunement_required && <span className="pill pill-amber">Requires attunement</span>}
          {item.value_gp > 0 && (
            <span style={{ fontSize: "0.875rem", color: "var(--text2)" }}>
              <span className="num">{item.value_gp.toLocaleString()}</span> gp
            </span>
          )}
        </div>
      </div>

      {/* Weapon numbers: what the attack roll uses */}
      {isWeapon(item) && (
        <dl
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr)",
            gap: "0.3rem 0.9rem",
            margin: "0 0 1.1rem",
            fontSize: "0.9375rem",
          }}
        >
          <dt className="text-muted">Damage</dt>
          <dd style={{ margin: 0 }}>
            <span className="num">{item.damage_die}</span> {item.damage_type}
            {item.versatile_damage && (
              <span className="text-muted">
                {" "}
                (<span className="num">{item.versatile_damage}</span> in two hands)
              </span>
            )}
          </dd>
          {bonus > 0 && (
            <>
              <dt className="text-muted">Magic bonus</dt>
              <dd style={{ margin: 0 }}>
                <span className="num">+{bonus}</span> to attack and damage rolls
              </dd>
            </>
          )}
          <dt className="text-muted">Kind</dt>
          <dd style={{ margin: 0 }}>{item.weapon_category}</dd>
          {(item.weapon_properties?.length ?? 0) > 0 && (
            <>
              <dt className="text-muted">Properties</dt>
              <dd style={{ margin: 0 }}>{item.weapon_properties?.join(", ")}</dd>
            </>
          )}
          {item.weapon_range && (
            <>
              <dt className="text-muted">Range</dt>
              <dd style={{ margin: 0 }}>
                <span className="num">{item.weapon_range}</span> ft
              </dd>
            </>
          )}
          {item.mastery && (
            <>
              <dt className="text-muted">Mastery</dt>
              <dd style={{ margin: 0 }}>
                {item.mastery} <span className="text-muted">(2024 rules)</span>
              </dd>
            </>
          )}
        </dl>
      )}

      {/* Item image (after the rules text on a phone, so what it does reads first) */}
      {!phone && art}

      {/* Mechanics */}
      {item.description && (
        <p style={{ fontSize: "0.9375rem", lineHeight: 1.6, marginBottom: "1.25rem", color: "var(--text)", whiteSpace: "pre-line" }}>
          {item.description}
        </p>
      )}

      {/* The verbs before the art uploader, so Edit is never below the fold on a phone. */}
      {actions}

      {phone && <div style={{ marginTop: "1.25rem" }}>{art}</div>}
    </>
  );
}
