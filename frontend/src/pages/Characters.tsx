import { useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { charactersApi } from "../api/characters";
import type { PlayerCharacter } from "../api/types";

function mod(score: number) {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function HpBar({ hp, maxHp }: { hp: number; maxHp: number }) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  const cls = pct > 50 ? "green" : pct > 20 ? "yellow" : "red";
  return (
    <div>
      <div className="flex items-center" style={{ justifyContent: "space-between", marginBottom: "0.2rem" }}>
        <span className="text-sm text-muted">HP</span>
        <span className="text-sm text-mono">{hp}/{maxHp}</span>
      </div>
      <div className="hp-bar-track">
        <div className={`hp-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Characters() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlayerCharacter | null>(null);

  const [form, setForm] = useState({
    name: "", player_name: "", race: "", char_class: "",
    level: 1, hp: 10, max_hp: 10, ac: 10,
    str_score: 10, dex_score: 10, con_score: 10,
    int_score: 10, wis_score: 10, cha_score: 10, notes: "",
  });

  const { data: characters = [], isLoading } = useQuery({
    queryKey: ["characters", campaignId],
    queryFn: () => charactersApi.list(campaignId!),
    enabled: !!campaignId,
  });

  const create = useMutation({
    mutationFn: () => charactersApi.create(campaignId!, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["characters", campaignId] }); resetForm(); },
  });

  const update = useMutation({
    mutationFn: () => charactersApi.update(editing!.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["characters", campaignId] }); resetForm(); },
  });

  const del = useMutation({
    mutationFn: (id: string) => charactersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  function resetForm() {
    setForm({ name: "", player_name: "", race: "", char_class: "", level: 1, hp: 10, max_hp: 10, ac: 10, str_score: 10, dex_score: 10, con_score: 10, int_score: 10, wis_score: 10, cha_score: 10, notes: "" });
    setShowForm(false);
    setEditing(null);
  }

  function startEdit(c: PlayerCharacter) {
    setEditing(c);
    setForm({ name: c.name, player_name: c.player_name ?? "", race: c.race ?? "", char_class: c.char_class ?? "", level: c.level, hp: c.hp, max_hp: c.max_hp, ac: c.ac, str_score: c.str_score, dex_score: c.dex_score, con_score: c.con_score, int_score: c.int_score, wis_score: c.wis_score, cha_score: c.cha_score, notes: c.notes ?? "" });
    setShowForm(true);
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));

  const STATS = ["str_score", "dex_score", "con_score", "int_score", "wis_score", "cha_score"] as const;
  const STAT_LABELS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

  return (
    <div className="fade-in">
      <div className="flex items-center" style={{ marginBottom: "1.5rem", justifyContent: "space-between" }}>
        <h1>Characters</h1>
        <button className="btn btn-primary" onClick={() => { resetForm(); setShowForm(!showForm); }}>
          {showForm && !editing ? "✕ Cancel" : "+ Add Character"}
        </button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: "1.5rem", maxWidth: 560 }}>
          <h3>{editing ? "Edit Character" : "New Character"}</h3>
          <div className="grid-2">
            <div className="form-group"><label>Name *</label><input value={form.name} onChange={f("name")} /></div>
            <div className="form-group"><label>Player Name</label><input value={form.player_name} onChange={f("player_name")} /></div>
            <div className="form-group"><label>Race</label><input value={form.race} onChange={f("race")} /></div>
            <div className="form-group"><label>Class</label><input value={form.char_class} onChange={f("char_class")} /></div>
            <div className="form-group"><label>Level</label><input type="number" min={1} max={20} value={form.level} onChange={f("level")} /></div>
            <div className="form-group"><label>AC</label><input type="number" value={form.ac} onChange={f("ac")} /></div>
            <div className="form-group"><label>HP</label><input type="number" value={form.hp} onChange={f("hp")} /></div>
            <div className="form-group"><label>Max HP</label><input type="number" value={form.max_hp} onChange={f("max_hp")} /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.5rem", margin: "0.5rem 0 1rem" }}>
            {STATS.map((s, i) => (
              <div key={s} className="form-group" style={{ marginBottom: 0 }}>
                <label>{STAT_LABELS[i]}</label>
                <input type="number" min={1} max={30} value={form[s]} onChange={f(s)} style={{ textAlign: "center" }} />
              </div>
            ))}
          </div>
          <div className="form-group">
            <label>Notes</label>
            <textarea value={form.notes} onChange={f("notes")} rows={2} style={{ resize: "vertical" }} />
          </div>
          <div className="flex gap-2">
            <button
              className="btn btn-primary"
              onClick={() => editing ? update.mutate() : create.mutate()}
              disabled={!form.name.trim() || create.isPending || update.isPending}
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
            <div className="flex items-center" style={{ justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <div>
                <strong style={{ color: "var(--gold)" }}>{c.name}</strong>
                {c.player_name && <span className="text-sm text-muted" style={{ marginLeft: "0.5rem" }}>({c.player_name})</span>}
              </div>
              <span className="badge badge-draft">Lv {c.level}</span>
            </div>
            {(c.race || c.char_class) && (
              <p className="text-sm text-muted" style={{ marginBottom: "0.5rem" }}>
                {[c.race, c.char_class].filter(Boolean).join(" · ")}
              </p>
            )}
            <p className="text-sm" style={{ marginBottom: "0.5rem" }}>AC {c.ac}</p>
            <HpBar hp={c.hp} maxHp={c.max_hp} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: "0.25rem", marginTop: "0.75rem", textAlign: "center" }}>
              {STATS.map((s, i) => (
                <div key={s}>
                  <div style={{ fontSize: "0.6rem", color: "var(--muted)" }}>{STAT_LABELS[i]}</div>
                  <div className="text-mono" style={{ fontSize: "0.85rem" }}>{mod(c[s])}</div>
                  <div style={{ fontSize: "0.65rem", color: "var(--muted)" }}>{c[s]}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2" style={{ marginTop: "0.75rem" }}>
              <button className="btn btn-ghost" style={{ fontSize: "0.7rem" }} onClick={() => startEdit(c)}>Edit</button>
              <button className="btn btn-danger" style={{ fontSize: "0.7rem" }}
                onClick={() => window.confirm("Delete character?") && del.mutate(c.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
        {!isLoading && characters.length === 0 && (
          <p className="text-muted">No characters yet.</p>
        )}
      </div>
    </div>
  );
}
