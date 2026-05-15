import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { charactersApi } from "../api/characters";
import type { PlayerCharacter } from "../api/types";
import CharacterSheet from "../components/character-sheet/CharacterSheet";
import FeaturePanel from "../components/FeaturePanel";
import ImageUpload from "../components/ImageUpload";
import InventoryPanel from "../components/InventoryPanel";
import SpellPanel from "../components/SpellPanel";

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const cls = pct > 50 ? "green" : pct > 20 ? "yellow" : "red";
  return (
    <div>
      <div
        className="flex items-center"
        style={{ justifyContent: "space-between", marginBottom: "0.2rem" }}
      >
        <span className="text-sm text-muted">HP</span>
        <span className="text-sm text-mono">{hp}/{maxHp}</span>
      </div>
      <div className="hp-bar-track">
        <div className={`hp-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const BLANK_FORM = {
  character_name: "",
  player_name: "",
  race: "",
  character_class: "",
  level: 1,
  hp_current: 10,
  hp_max: 10,
  ac: 10,
  score_str: 10,
  score_dex: 10,
  score_con: 10,
  score_int: 10,
  score_wis: 10,
  score_cha: 10,
  notes: "",
  portrait_url: "",
};

const STATS = [
  "score_str",
  "score_dex",
  "score_con",
  "score_int",
  "score_wis",
  "score_cha",
] as const;
const STAT_LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export default function Characters() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlayerCharacter | null>(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [formError, setFormError] = useState("");
  const [sheetPcId, setSheetPcId] = useState<string | null>(null);

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const create = useMutation({
    mutationFn: () => charactersApi.create(campaignId!, { ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters", campaignId] });
      resetForm();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const update = useMutation({
    mutationFn: () => charactersApi.update(editing!.id, { ...form }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["characters", campaignId] });
      resetForm();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateImage = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string }) =>
      charactersApi.updateImage(id, url),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => charactersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  function resetForm() {
    setForm(BLANK_FORM);
    setFormError("");
    setShowForm(false);
    setEditing(null);
  }

  function startEdit(c: PlayerCharacter) {
    setEditing(c);
    setForm({
      character_name: c.character_name,
      player_name: c.player_name ?? "",
      race: c.race ?? "",
      character_class: c.character_class ?? "",
      level: c.level,
      hp_current: c.hp_current,
      hp_max: c.hp_max,
      ac: c.ac,
      score_str: c.score_str,
      score_dex: c.score_dex,
      score_con: c.score_con,
      score_int: c.score_int,
      score_wis: c.score_wis,
      score_cha: c.score_cha,
      notes: c.notes ?? "",
      portrait_url: c.portrait_url ?? "",
    });
    setFormError("");
    setShowForm(true);
  }

  const f =
    (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({
        ...prev,
        [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value,
      }));

  return (
    <div className="fade-in">
      <div
        className="flex items-center"
        style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}
      >
        <h1>Characters</h1>
        <button
          className="btn btn-primary"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm && !editing ? "✕ Cancel" : "+ Add Character"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 600 }}>
          <h3>{editing ? "Edit Character" : "New Character"}</h3>

          <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", marginBottom: "0.75rem" }}>
            <ImageUpload
              currentUrl={form.portrait_url || null}
              onUrlChange={(url) => setForm((prev) => ({ ...prev, portrait_url: url }))}
              label="Portrait"
              size={100}
            />
            <div style={{ flex: 1 }}>
              <div className="grid-2">
                <div className="form-group">
                  <label>Character Name *</label>
                  <input value={form.character_name} onChange={f("character_name")} />
                </div>
                <div className="form-group">
                  <label>Player Name</label>
                  <input value={form.player_name} onChange={f("player_name")} />
                </div>
                <div className="form-group">
                  <label>Race</label>
                  <input value={form.race} onChange={f("race")} />
                </div>
                <div className="form-group">
                  <label>Class</label>
                  <select
                    value={form.character_class}
                    onChange={(e) => setForm((p) => ({ ...p, character_class: e.target.value }))}
                  >
                    <option value="">— select —</option>
                    {["Barbarian","Bard","Cleric","Druid","Fighter","Monk","Paladin",
                      "Ranger","Rogue","Sorcerer","Warlock","Wizard","Artificer"].map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Level</label>
                  <input type="number" min={1} max={20} value={form.level} onChange={f("level")} />
                </div>
                <div className="form-group">
                  <label>AC</label>
                  <input type="number" value={form.ac} onChange={f("ac")} />
                </div>
                <div className="form-group">
                  <label>HP</label>
                  <input type="number" value={form.hp_current} onChange={f("hp_current")} />
                </div>
                <div className="form-group">
                  <label>Max HP</label>
                  <input type="number" value={form.hp_max} onChange={f("hp_max")} />
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(6, 1fr)",
              gap: "0.5rem",
              margin: "0.5rem 0 1rem",
            }}
          >
            {STATS.map((s, i) => (
              <div key={s} className="form-group" style={{ marginBottom: 0 }}>
                <label>{STAT_LABELS[i]}</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={form[s]}
                  onChange={f(s)}
                  style={{ textAlign: "center" }}
                />
              </div>
            ))}
          </div>

          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={f("notes")} rows={2} style={{ resize: "vertical" }} />
          </div>

          {formError && (
            <p style={{ color: "var(--danger)", fontSize: "0.8rem", margin: "0.25rem 0 0.5rem" }}>
              ⚠ {formError}
            </p>
          )}

          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => (editing ? update.mutate() : create.mutate())}
              disabled={
                !form.character_name.trim() ||
                !form.character_class ||
                create.isPending ||
                update.isPending
              }
            >
              {editing ? "Save" : "Create"}
            </button>
            <button className="btn btn-ghost" onClick={resetForm}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-muted">Loading…</p>}

      <div className="grid-3">
        {characters.map((c) => (
          <div key={c.id} className="card">
            <div className="flex items-center" style={{ gap: "0.75rem", marginBottom: "0.75rem" }}>
              {c.portrait_url ? (
                <img
                  src={c.portrait_url}
                  alt={c.character_name}
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "0.375rem",
                    objectFit: "cover",
                    border: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: "0.375rem",
                    background: "var(--surface2)",
                    border: "1px dashed var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1.4rem",
                    flexShrink: 0,
                  }}
                >
                  🧙
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div className="flex items-center" style={{ gap: "0.4rem", flexWrap: "wrap" }}>
                  <strong style={{ color: "var(--gold)" }}>{c.character_name}</strong>
                  <span className="badge badge-draft">Lv {c.level}</span>
                </div>
                {c.player_name && (
                  <span className="text-sm text-muted">({c.player_name})</span>
                )}
              </div>
            </div>

            {(c.race || c.character_class) && (
              <p className="text-sm text-muted" style={{ marginBottom: "0.5rem" }}>
                {[c.race, c.character_class].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="text-sm" style={{ marginBottom: "0.5rem" }}>AC {c.ac}</p>
            <HpBar hp={c.hp_current} maxHp={c.hp_max} />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(6, 1fr)",
                gap: "0.25rem",
                marginTop: "0.75rem",
                textAlign: "center",
              }}
            >
              {STATS.map((s, i) => (
                <div key={s}>
                  <div style={{ fontSize: "0.6rem", color: "var(--muted)" }}>{STAT_LABELS[i]}</div>
                  <div className="text-mono" style={{ fontSize: "0.85rem" }}>{mod(c[s])}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{c[s]}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              <ImageUpload
                currentUrl={c.portrait_url}
                onUrlChange={(url) => updateImage.mutate({ id: c.id, url })}
                label="Portrait"
                size={48}
              />
            </div>

            <InventoryPanel characterId={c.id} characterName={c.character_name} />

            <SpellPanel
              characterId={c.id}
              characterClass={c.character_class}
              characterName={c.character_name}
            />

            <FeaturePanel
              characterId={c.id}
              characterClass={c.character_class}
              characterLevel={c.level}
              characterName={c.character_name}
            />

            <div className="flex gap-2" style={{ marginTop: "0.75rem" }}>
              <button
                className="btn btn-primary"
                style={{ fontSize: "0.75rem" }}
                onClick={() => setSheetPcId(c.id)}
                title="Open full character sheet"
              >
                📜 Open Sheet
              </button>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={() => startEdit(c)}>
                Edit
              </button>
              <button
                className="btn btn-danger"
                style={{ fontSize: "0.7rem" }}
                onClick={() => window.confirm("Delete character?") && del.mutate(c.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && characters.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🧙</div>
            <p>No characters yet — add one above.</p>
          </div>
        )}
      </div>

      {sheetPcId && (
        <CharacterSheet
          characterId={sheetPcId}
          onClose={() => setSheetPcId(null)}
        />
      )}
    </div>
  );
}
