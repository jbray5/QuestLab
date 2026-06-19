import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";

import {
  type Npc,
  type NpcStatus,
  type NpcCreate,
  NPC_STATUS_COLORS,
  npcsApi,
} from "../../api/npcs";
import PortraitGenerator from "../PortraitGenerator";
import { portraitSrc } from "../../lib/portrait";

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

  const statusColor = NPC_STATUS_COLORS[form.status ?? "Alive"];

  return (
    <div role="dialog" aria-label="NPC editor" style={overlayStyle} onClick={onClose}>
      <div
        className="ql-modal-in"
        style={{ ...sheetStyle, borderLeft: `5px solid ${statusColor}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <header style={headerStyle}>
          <h2 style={{ margin: 0, fontSize: "1.2rem", color: "var(--gold)" }}>
            {initial ? `Edit · ${initial.name}` : "New NPC"}
          </h2>
          <button onClick={onClose} style={closeBtnStyle} title="Close (Esc)">
            ✕
          </button>
        </header>

        <div style={bodyStyle}>
          {/* ── TABLE FACE (Plan 40) ─────────────────────────────────────
              These six fields render at the table. Keep them SHORT — they
              are meant to be glanced at, not read. The rich Prep-face
              content below is what you author beforehand. */}
          <section
            style={{
              border: "1px solid var(--gold)",
              borderRadius: 8,
              padding: "0.7rem 0.85rem",
              marginBottom: "1rem",
              background: "rgba(201, 168, 76, 0.04)",
            }}
          >
            <div
              style={{
                fontSize: "0.7rem",
                color: "var(--gold)",
                letterSpacing: "0.1em",
                fontWeight: 700,
                marginBottom: "0.55rem",
              }}
            >
              🎯 TABLE FACE — what you read at arm's length
            </div>
            <Field label="Quick who (one line)">
              <input
                value={form.quick_who ?? ""}
                onChange={(e) => set("quick_who", e.target.value || null)}
                maxLength={120}
                placeholder='Wenneth — dryad innkeeper, dreamy & warm'
              />
            </Field>
            <Field label="WANT — what they want right now (one line)">
              <input
                value={form.want_now ?? ""}
                onChange={(e) => set("want_now", e.target.value || null)}
                maxLength={200}
                placeholder="To know if the party will help her tend the grove tonight."
              />
            </Field>
            <Field label="KNOWS — one bullet per line (cap to 3)">
              <textarea
                value={knowsText}
                onChange={(e) => setKnowsText(e.target.value)}
                rows={3}
                placeholder={"Halve rented her loft three nights ago, paid in old coin.\nThe shrine's been yellowing for weeks.\nWenneth has not slept in a season."}
              />
            </Field>
            <Field label="VOICE — one tic, writable so you can perform it">
              <input
                value={form.voice ?? ""}
                onChange={(e) => set("voice", e.target.value || null)}
                maxLength={200}
                placeholder={`British, warm — "oooh, s'alright, love"`}
              />
            </Field>
            <Field label="SECRET (table-length, one line)">
              <input
                value={form.secret_short ?? ""}
                onChange={(e) => set("secret_short", e.target.value || null)}
                maxLength={200}
                placeholder="She knows the shrine is dying."
              />
            </Field>
            <Field label="Relationship pings (one per line, optional)">
              <textarea
                value={relPingsText}
                onChange={(e) => setRelPingsText(e.target.value)}
                rows={2}
                placeholder={"Recognizes Thane's fey-light; calls him Ae'lim.\nFears Halve on sight."}
              />
            </Field>
          </section>

          {/* ── PREP FACE — rich content the DM reads BEFORE a session ── */}
          <div
            style={{
              fontSize: "0.7rem",
              color: "var(--muted)",
              letterSpacing: "0.1em",
              fontWeight: 700,
              margin: "0.5rem 0 0.6rem",
            }}
          >
            📚 PREP FACE — depth & connections (not for at-table reading)
          </div>

          {/* Portrait + AI generation (only for persisted NPCs) */}
          {initial && (
            <Field label="Portrait">
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

          {/* Identity */}
          <Row>
            <Field label="Name" required>
              <input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                onFocus={(e) => e.currentTarget.select()}
                placeholder="Captain Aldric"
                autoFocus
              />
            </Field>
            <Field label="Role">
              <input
                value={form.role ?? ""}
                onChange={(e) => set("role", e.target.value || null)}
                placeholder="innkeeper, sage, mob boss…"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Race">
              <input
                value={form.race ?? ""}
                onChange={(e) => set("race", e.target.value || null)}
                placeholder="Human, Elf, Tiefling…"
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
                placeholder="in their 40s, ancient…"
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
                placeholder="Tavern of the Black Bird, Phandalin"
              />
            </Field>
          </Row>

          {/* Story */}
          <Field label="Appearance">
            <textarea
              value={form.appearance ?? ""}
              onChange={(e) => set("appearance", e.target.value || null)}
              rows={2}
              placeholder="Slim, silver-haired, eyes the color of frost."
            />
          </Field>
          <Field label="Personality">
            <textarea
              value={form.personality ?? ""}
              onChange={(e) => set("personality", e.target.value || null)}
              rows={2}
              placeholder="Patient. Caustic with fools."
            />
          </Field>
          <Field label="Motivation (what they want)">
            <textarea
              value={form.motivation ?? ""}
              onChange={(e) => set("motivation", e.target.value || null)}
              rows={2}
              placeholder="To prevent the second sundering."
            />
          </Field>
          <Field label="Secret">
            <textarea
              value={form.secret ?? ""}
              onChange={(e) => set("secret", e.target.value || null)}
              rows={2}
              placeholder="She is the second sundering's architect."
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
              placeholder="patron, spellcaster, ally"
            />
          </Field>
          <Field label="Private DM notes">
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value || null)}
              rows={2}
              placeholder="Voice: dry whisper. Likely to betray the party in Act 3."
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
                checked={form.is_revealed ?? true}
                onChange={(e) => set("is_revealed", e.target.checked)}
                style={{ width: "auto" }}
              />
              <span>
                {form.is_revealed ?? true ? (
                  <>
                    <strong style={{ color: "var(--green2, #4caf50)" }}>Revealed</strong>
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
          <p style={{ color: "var(--red)", margin: "0 1.25rem 0.5rem", fontSize: "0.85rem" }}>
            {(save.error as Error)?.message ?? "Save failed"}
          </p>
        )}

        <footer style={footerStyle}>
          {initial && (
            <button
              className="btn btn-ghost"
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
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
          <button className="btn btn-ghost" onClick={onClose}>
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
      is_revealed: true,
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
    notes: initial.notes,
    is_revealed: initial.is_revealed ?? true,
    // Plan 40 — Table face
    quick_who: initial.quick_who,
    want_now: initial.want_now,
    knows: initial.knows,
    voice: initial.voice,
    secret_short: initial.secret_short,
    relationship_pings: initial.relationship_pings,
  };
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
    <label style={{ display: "block", marginBottom: "0.55rem" }}>
      <span
        style={{
          fontSize: "0.65rem",
          color: "var(--muted)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          display: "block",
          marginBottom: "0.2rem",
        }}
      >
        {label}
        {required && <span style={{ color: "var(--red)" }}> *</span>}
      </span>
      {children}
    </label>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.78)",
  zIndex: 350,
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  padding: "2rem 1rem",
  overflowY: "auto",
};

const sheetStyle: React.CSSProperties = {
  background: "var(--bg, #1a1a1a)",
  border: "1px solid var(--gold)",
  borderRadius: 12,
  maxWidth: 760,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  maxHeight: "calc(100vh - 4rem)",
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
  background: "transparent",
  border: "1px solid var(--border)",
  borderRadius: 4,
  color: "var(--text)",
  width: 32,
  height: 32,
  cursor: "pointer",
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
