import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";

import {
  type Npc,
  type NpcStatus,
  type NpcCreate,
  npcsApi,
} from "../../api/npcs";
import PortraitGenerator from "../PortraitGenerator";
import { portraitSrc } from "../../lib/portrait";
import { tableApi } from "../../api/table";
import { ObsidianNoteInput } from "../dm/ObsidianLink";

const STATUSES: NpcStatus[] = [
  "Alive",
  "Dead",
  "Missing",
  "Imprisoned",
  "Unknown",
];

interface Props {
  campaignId: string;
  /** When null, the modal is in create mode. */
  initial: Npc | null;
  onClose: () => void;
  onSaved: (npc: Npc) => void;
  onDeleted: () => void;
}

/**
 * NPC create/edit modal (Plan 00033).
 *
 * All fields editable in one form. List fields (dialog_hooks, tags) use
 * line-per-entry textareas. Save persists via POST/PATCH; Delete
 * confirms and removes.
 */
export default function NpcModal({ campaignId, initial, onClose, onSaved, onDeleted }: Props) {
  const [form, setForm] = useState<NpcCreate>(() => fromInitial(initial));
  const [dialogText, setDialogText] = useState(
    (initial?.dialog_hooks ?? []).join("\n"),
  );
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(", "));
  // Plan 40 — Table-face list fields use line-per-entry textareas.
  const [knowsText, setKnowsText] = useState((initial?.knows ?? []).join("\n"));
  const [relPingsText, setRelPingsText] = useState(
    (initial?.relationship_pings ?? []).join("\n"),
  );

  // ESC dismisses
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = useMutation({
    mutationFn: () => {
      const payload: NpcCreate = {
        ...form,
        dialog_hooks: dialogText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        tags: tagsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        // Plan 40 — Table-face list fields.
        knows: knowsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        relationship_pings: relPingsText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      return initial
        ? npcsApi.update(initial.id, payload)
        : npcsApi.create(campaignId, payload);
    },
    onSuccess: (npc) => onSaved(npc),
  });

  const del = useMutation({
    mutationFn: () => npcsApi.delete(initial!.id),
    onSuccess: () => onDeleted(),
  });

  function set<K extends keyof NpcCreate>(key: K, value: NpcCreate[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div role="dialog" aria-label="NPC editor" style={overlayStyle} onClick={onClose}>
      <div
        className="ql-modal-in"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: "1.2rem", minWidth: 0 }}>
            {initial ? (
              <>
                <span style={{ color: "var(--muted)", fontWeight: 500 }}>Edit · </span>
                <span className="story" style={{ fontWeight: 700, fontSize: "1.35rem" }}>{initial.name}</span>
              </>
            ) : (
              "New NPC"
            )}
          </h2>
          <button
            onClick={onClose}
            className="btn btn-ghost"
            style={closeBtnStyle}
            title="Close (Esc)"
            aria-label="Close NPC editor"
          >
            <X size={18} />
          </button>
        </header>

        <div style={bodyStyle}>
          {/* Identity — first, so the autofocused Name opens at the top
              (usability pass: it used to sit below the table face). */}
          <Row>
            <Field label="Name" required>
              <input
                className="story"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="e.g. Captain Aldric"
                autoFocus
                style={{ fontSize: "1.1rem", fontWeight: 700 }}
              />
            </Field>
            <Field label="Role">
              <input
                value={form.role ?? ""}
                onChange={(e) => set("role", e.target.value || null)}
                placeholder="e.g. innkeeper, sage, mob boss…"
              />
            </Field>
          </Row>

          {/* ── TABLE FACE (Plan 40) ─────────────────────────────────────
              These six fields render at the table. Keep them SHORT — they
              are meant to be glanced at, not read. The rich Prep-face
              content below is what you author beforehand. */}
          <section
            style={{
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: "0.8rem 0.9rem 0.3rem",
              marginBottom: "1.1rem",
              background: "var(--surface)",
            }}
          >
            <SectionHead
              title="Table face"
              hint="the short lines you glance at mid-scene, one line each"
            />
            <Field label="Who they are (one line)">
              <input
                value={form.quick_who ?? ""}
                onChange={(e) => set("quick_who", e.target.value || null)}
                maxLength={120}
                placeholder='Wenneth — dryad innkeeper, dreamy & warm'
              />
            </Field>
            <Field label="Wants — what they want right now (one line)">
              <input
                value={form.want_now ?? ""}
                onChange={(e) => set("want_now", e.target.value || null)}
                maxLength={200}
                placeholder="e.g. To know if the party will help her tend the grove tonight."
              />
            </Field>
            <Field label="Knows — one thing per line (three at most)">
              <textarea
                value={knowsText}
                onChange={(e) => setKnowsText(e.target.value)}
                rows={3}
                placeholder={"One line per thing they know.\nThe mill's been dark since the new moon.\nThe captain pays in foreign coin."}
              />
            </Field>
            <Field label="Voice — one habit of speech you can perform">
              <input
                value={form.voice ?? ""}
                onChange={(e) => set("voice", e.target.value || null)}
                maxLength={200}
                placeholder={`British, warm — "oooh, s'alright, love"`}
              />
            </Field>
            <Field label="Secret (one line)">
              <input
                value={form.secret_short ?? ""}
                onChange={(e) => set("secret_short", e.target.value || null)}
                maxLength={200}
                placeholder="e.g. She knows the shrine is dying."
              />
            </Field>
            <Field label="Ties to the party (one per line, optional)">
              <textarea
                value={relPingsText}
                onChange={(e) => setRelPingsText(e.target.value)}
                rows={2}
                placeholder={"Owes the party's cleric a favour.\nWon't speak to the rogue since the market."}
              />
            </Field>
          </section>

          {/* ── PREP FACE — rich content the DM reads BEFORE a session ── */}
          <SectionHead title="Prep face" hint="the depth you read before the session, not at the table" />

          {/* Portrait + AI generation (only for persisted NPCs) */}
          {initial && (
            <Field label="Portrait">
              <ImageSlot
                url={form.portrait_url ?? null}
                stamp={initial?.updated_at}
                empty="No portrait yet — upload one."
                onChange={(url) => set("portrait_url", url)}
              />
              <PortraitGenerator
                currentUrl={portraitSrc(form.portrait_url, initial?.updated_at) ?? null}
                onGenerate={async (hints) => {
                  const updated = await npcsApi.generatePortrait(initial.id, hints);
                  set("portrait_url", updated.portrait_url);
                  return updated.portrait_url ?? "";
                }}
              />
            </Field>
          )}
          {initial && (
            <Field label="True form — the portrait after the reveal">
              <ImageSlot
                url={form.true_form_url ?? null}
                stamp={initial?.updated_at}
                empty="No true form. Give a disguised NPC the face under the mask."
                onChange={(url) => set("true_form_url", url)}
              />
              {form.true_form_url && (
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.85rem",
                    marginTop: "0.4rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.true_form_revealed ?? false}
                    onChange={(e) => set("true_form_revealed", e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  <span>
                    {form.true_form_revealed ? (
                      <strong style={{ color: "var(--teal-text)" }}>True form showing</strong>
                    ) : (
                      <strong style={{ color: "var(--muted)" }}>Disguise showing</strong>
                    )}
                    {" — players and the table swap to the true form when this is on (or hit Reveal on the table face)"}
                  </span>
                </label>
              )}
            </Field>
          )}

          <Field label="Obsidian note">
            <ObsidianNoteInput value={form.dm_note} onChange={(v) => set("dm_note", v)} />
          </Field>

          <Row>
            <Field label="Race">
              <input
                value={form.race ?? ""}
                onChange={(e) => set("race", e.target.value || null)}
                placeholder="e.g. Human, Elf, Tiefling…"
              />
            </Field>
            <Field label="Gender">
              <input
                value={form.gender ?? ""}
                onChange={(e) => set("gender", e.target.value || null)}
                placeholder="any"
              />
            </Field>
            <Field label="Age">
              <input
                value={form.age ?? ""}
                onChange={(e) => set("age", e.target.value || null)}
                placeholder="e.g. in their 40s, ancient…"
              />
            </Field>
          </Row>

          <Row>
            <Field label="Status">
              <select
                value={form.status ?? "Alive"}
                onChange={(e) => set("status", e.target.value as NpcStatus)}
                style={{ width: "100%" }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Last known location">
              <input
                value={form.location ?? ""}
                onChange={(e) => set("location", e.target.value || null)}
                placeholder="e.g. Tavern of the Black Bird, Phandalin"
              />
            </Field>
          </Row>

          {/* Story */}
          <Field label="Appearance">
            <textarea
              value={form.appearance ?? ""}
              onChange={(e) => set("appearance", e.target.value || null)}
              rows={2}
              placeholder="e.g. Slim, silver-haired, eyes the color of frost."
            />
          </Field>
          <Field label="Personality">
            <textarea
              value={form.personality ?? ""}
              onChange={(e) => set("personality", e.target.value || null)}
              rows={2}
              placeholder="e.g. Patient. Caustic with fools."
            />
          </Field>
          <Field label="Motivation (what they want)">
            <textarea
              value={form.motivation ?? ""}
              onChange={(e) => set("motivation", e.target.value || null)}
              rows={2}
              placeholder="e.g. To prevent the second sundering."
            />
          </Field>
          <Field label="Secret">
            <textarea
              value={form.secret ?? ""}
              onChange={(e) => set("secret", e.target.value || null)}
              rows={2}
              placeholder="e.g. She is the second sundering's architect."
            />
          </Field>
          <Field label="Dialog hooks (one per line)">
            <textarea
              value={dialogText}
              onChange={(e) => setDialogText(e.target.value)}
              rows={3}
              placeholder={"What do you know of the Lattice?\nThere is a price for honesty."}
            />
          </Field>
          <Field label="Tags (comma-separated)">
            <input
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
              placeholder="e.g. patron, spellcaster, ally"
            />
          </Field>
          <Field label="Private DM notes">
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
              rows={2}
              placeholder="e.g. Voice: dry whisper. Likely to betray the party in Act 3."
            />
          </Field>

          {/* Plan 38 P3-3 polish — DM-controlled player visibility */}
          <Field label="Visible to players">
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.85rem",
                color: "var(--text)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={form.is_revealed ?? false}
                onChange={(e) => set("is_revealed", e.target.checked)}
                style={{ width: "auto" }}
              />
              <span>
                {form.is_revealed ?? false ? (
                  <>
                    <strong style={{ color: "var(--teal-text)" }}>Revealed</strong>
                    {" — shows on player phones in 'People You've Met'"}
                  </>
                ) : (
                  <>
                    <strong style={{ color: "var(--muted)" }}>Hidden</strong>
                    {" — DM-only until you toggle this on"}
                  </>
                )}
              </span>
            </label>
          </Field>
        </div>

        {save.isError && (
          <p style={{ color: "var(--danger-text)", margin: "0 1.25rem 0.5rem", fontSize: "0.875rem" }}>
            {(save.error as Error)?.message ?? "Save failed"}
          </p>
        )}

        <footer style={footerStyle}>
          {initial && (
            <button
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm(`Delete "${initial.name}"? This cannot be undone.`)) {
                  del.mutate();
                }
              }}
              disabled={del.isPending}
            >
              {del.isPending ? "Deleting…" : "Delete"}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => save.mutate()}
            disabled={!form.name.trim() || save.isPending}
          >
            {save.isPending ? "Saving…" : initial ? "Save" : "Create NPC"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fromInitial(initial: Npc | null): NpcCreate {
  if (!initial)
    return {
      name: "",
      status: "Alive",
      is_revealed: false,
    };
  return {
    name: initial.name,
    role: initial.role,
    race: initial.race,
    gender: initial.gender,
    age: initial.age,
    appearance: initial.appearance,
    personality: initial.personality,
    motivation: initial.motivation,
    secret: initial.secret,
    dialog_hooks: initial.dialog_hooks,
    tags: initial.tags,
    status: initial.status,
    location: initial.location,
    monster_stat_block_id: initial.monster_stat_block_id,
    portrait_url: initial.portrait_url,
    true_form_url: initial.true_form_url ?? null,
    dm_note: initial.dm_note ?? null,
    true_form_revealed: initial.true_form_revealed ?? false,
    notes: initial.notes,
    is_revealed: initial.is_revealed ?? false,
    // Plan 40 — Table face
    quick_who: initial.quick_who,
    want_now: initial.want_now,
    knows: initial.knows,
    voice: initial.voice,
    secret_short: initial.secret_short,
    relationship_pings: initial.relationship_pings,
  };
}

/** Plan 91 — preview + upload for a portrait slot; stores to the art bucket via the map uploader. */
function ImageSlot({
  url,
  stamp,
  empty,
  onChange,
}: {
  url: string | null;
  stamp?: string;
  empty: string;
  onChange: (url: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const src = url ? portraitSrc(url, stamp) : null;
  return (
    <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
      {src ? (
        <img
          src={src}
          alt=""
          style={{ width: 56, height: 56, borderRadius: 6, objectFit: "cover", border: "1px solid var(--border2)" }}
        />
      ) : (
        <span style={{ fontSize: "0.875rem", color: "var(--muted)" }}>{empty}</span>
      )}
      <input
        type="file"
        accept="image/*"
        disabled={busy}
        style={{ width: "auto", maxWidth: "100%", fontSize: "0.8125rem" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          setErr(null);
          try {
            onChange(await tableApi.uploadMap(f));
          } catch (ex) {
            setErr((ex as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      />
      {url && (
        <button type="button" className="btn btn-ghost" style={{ fontSize: "0.8125rem", minHeight: 0, padding: "0.25rem 0.6rem" }} onClick={() => onChange(null)}>
          Remove
        </button>
      )}
      {err && <span style={{ fontSize: "0.8125rem", color: "var(--danger-text)" }}>{err}</span>}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "0.6rem",
        marginBottom: "0.65rem",
      }}
    >
      {children}
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: "0.7rem" }}>
      <span
        style={{
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "var(--text2)",
          display: "block",
          marginBottom: "0.25rem",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--danger-text)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

/** A section heading inside the editor: a title and a muted one-line hint. */
function SectionHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div style={{ margin: "0 0 0.65rem" }}>
      <span style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text)" }}>{title}</span>
      <span style={{ fontSize: "0.8125rem", color: "var(--muted)" }}> — {hint}</span>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(5, 8, 7, 0.78)",
  zIndex: 350,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2rem 1rem",
  overflowY: "auto",
  minHeight: 0,
  WebkitOverflowScrolling: "touch",
  overscrollBehavior: "contain",
};

const sheetStyle: React.CSSProperties = {
  background: "var(--bg)",
  border: "1px solid var(--border2)",
  borderRadius: 12,
  maxWidth: 760,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100dvh - 4rem)",
  overflow: "hidden",
};

const headerStyle: React.CSSProperties = {
  padding: "0.85rem 1.25rem",
  borderBottom: "1px solid var(--border)",
  background: "var(--surface)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const closeBtnStyle: React.CSSProperties = {
  width: 36,
  height: 36,
  minHeight: 0,
  padding: 0,
  flexShrink: 0,
};

const bodyStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  overflowY: "auto",
  flex: 1,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  gap: "0.5rem",
  padding: "0.7rem 1.25rem",
  borderTop: "1px solid var(--border)",
  background: "var(--surface)",
};
