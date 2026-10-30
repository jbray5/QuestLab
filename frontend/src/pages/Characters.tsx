import { useState } from "react";
import { zoomable } from "../lib/lightbox";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { campaignsApi } from "../api/campaigns";
import { charactersApi } from "../api/characters";
import { featuresApi } from "../api/features";
import type { PlayerCharacter } from "../api/types";
import CharacterSheet from "../components/character-sheet/CharacterSheet";
import FeaturePanel from "../components/FeaturePanel";
import ImageUpload from "../components/ImageUpload";
import ModelUpload from "../components/ModelUpload";
import { heightFtForRace } from "../engine/heights";
import InventoryPanel from "../components/InventoryPanel";
import SpellPanel from "../components/SpellPanel";
import { portraitSrc } from "../lib/portrait";

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
  subclass: "",
  level: 1,
  speed: 30,
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
  // Plan 74 — the campaign row carries the player sign-up switch.
  const { data: campaign } = useQuery({
    queryKey: ["campaign", campaignId],
    queryFn: () => campaignsApi.get(campaignId as string),
    enabled: !!campaignId,
  });
  const signupMut = useMutation({
    mutationFn: (on: boolean) =>
      campaignsApi.update(campaignId as string, { allow_player_signup: on } as Record<string, unknown>),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["campaign", campaignId] }),
  });
  // Plan 83 — an optional join code: the join page asks for it before it lists the party.
  const [joinCodeDraft, setJoinCodeDraft] = useState<string | null>(null);
  const joinCode = joinCodeDraft ?? (campaign?.join_code ?? "");
  const codeMut = useMutation({
    mutationFn: (code: string) =>
      campaignsApi.update(campaignId as string, { join_code: code } as Record<string, unknown>),
    onSuccess: () => {
      setJoinCodeDraft(null);
      void qc.invalidateQueries({ queryKey: ["campaign", campaignId] });
    },
  });
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
    mutationFn: async () => {
      const saved = await charactersApi.update(editing!.id, { ...form });
      // Level/subclass may have changed — sync class features (idempotent).
      await featuresApi.sync(editing!.id).catch(() => undefined);
      return saved;
    },
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

  // Plan 111 — the rigged figure the immersive table walks for this PC.
  const updateModel = useMutation({
    mutationFn: ({ id, url }: { id: string; url: string | null }) =>
      charactersApi.update(id, { model_url: url }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  const del = useMutation({
    mutationFn: (id: string) => charactersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  /** Plan 115 — open a level-up: the player's sheet shows the guide and they make their own
   * choices (HP, feat, spells). The DM never fills a prompt. */
  const grantLevel = useMutation({
    mutationFn: (id: string) => charactersApi.grantLevelUp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
    onError: (e: Error) => window.alert(e.message),
  });
  const revokeLevel = useMutation({
    mutationFn: (id: string) => charactersApi.revokeLevelUp(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["characters", campaignId] }),
  });

  /** Grant the next level to every PC at the party's level (stragglers and test builds skip). */
  async function levelUpParty() {
    const top = Math.max(0, ...characters.map((c) => c.level));
    const party = characters.filter((c) => c.level === top && !(c.pending_level && c.pending_level > c.level));
    if (!party.length || top >= 20) return;
    const names = party.map((c) => `• ${c.character_name}`).join("\n");
    const prompt = `Level up to ${top + 1}?\n\n${names}\n\nEach player gets the level-up guide on their sheet.`;
    if (!window.confirm(prompt)) return;
    for (const c of party) await charactersApi.grantLevelUp(c.id);
    void qc.invalidateQueries({ queryKey: ["characters", campaignId] });
  }

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
      subclass: c.subclass ?? "",
      level: c.level,
      speed: c.speed ?? 30,
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
        <div>
          <h1 style={{ marginBottom: "0.2rem" }}>Characters</h1>
          {(campaign?.allow_player_signup ?? true) && (
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Players join from your join link or the QR on the TV
              {joinCode ? (
                <>
                  , type <strong style={{ fontFamily: "monospace", letterSpacing: "0.1em" }}>{joinCode}</strong>, and build or pick their character.
                </>
              ) : (
                " and build their character. Add a join code so only your table can see the party."
              )}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
          {/* Plan 74 — players build their own characters from the join link. */}
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem", color: "var(--muted)", cursor: "pointer" }}
            title="When on, anyone with your join link / QR can create a character in this campaign"
          >
            <input
              type="checkbox"
              checked={campaign?.allow_player_signup ?? true}
              onChange={(e) => signupMut.mutate(e.target.checked)}
              disabled={signupMut.isPending}
            />
            Players can create their own characters
          </label>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", fontSize: "0.8rem", color: "var(--muted)" }}
            title="Players open your join link (or scan the QR on the TV), type this code, then pick or build their character. Without a code, anyone with the link can see the party."
          >
            Join code
            <input
              value={joinCode}
              onChange={(e) => setJoinCodeDraft(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
              onBlur={() => {
                if ((campaign?.join_code ?? "") !== joinCode) codeMut.mutate(joinCode);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder="no code"
              maxLength={12}
              style={{ width: 132, fontFamily: "monospace", letterSpacing: "0.12em", padding: "2px 6px" }}
            />
            {/* Review 10/30 — sign-up on with no code showed "Join code: none"
                and no way forward. One tap makes one; the hint says how it's used. */}
            {!joinCode && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: "0.72rem", padding: "2px 8px" }}
                disabled={codeMut.isPending}
                onClick={() => {
                  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
                  const bytes = crypto.getRandomValues(new Uint8Array(6));
                  const code = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
                  setJoinCodeDraft(code);
                  codeMut.mutate(code);
                }}
                title="Make a short code the join page asks for"
              >
                🎲 Generate
              </button>
            )}
          </label>
          <button
            className="btn btn-ghost"
            style={{ color: "var(--gold)" }}
            title="Open a level-up for everyone at the party's level; each player picks on their phone"
            onClick={() => void levelUpParty()}
            disabled={!characters.length}
          >
            ⬆ Level up the party
          </button>
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
                  <label>Subclass (chosen at level 3)</label>
                  <input
                    value={form.subclass}
                    onChange={f("subclass")}
                    placeholder="e.g. Champion, Circle of the Moon"
                  />
                </div>
                <div className="form-group">
                  <label>Level</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={form.level}
                    onChange={f("level")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>Speed (ft)</label>
                  <input
                    type="number"
                    value={form.speed}
                    onChange={f("speed")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>AC</label>
                  <input
                    type="number"
                    value={form.ac}
                    onChange={f("ac")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>HP</label>
                  <input
                    type="number"
                    value={form.hp_current}
                    onChange={f("hp_current")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </div>
                <div className="form-group">
                  <label>Max HP</label>
                  <input
                    type="number"
                    value={form.hp_max}
                    onChange={f("hp_max")}
                    onFocus={(e) => e.currentTarget.select()}
                  />
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
                  onFocus={(e) => e.currentTarget.select()}
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

      <div className="ql-card-grid">
        {characters.map((c) => (
          <div key={c.id} className="card">
            <div className="flex items-center" style={{ gap: "0.75rem", marginBottom: "0.75rem" }}>
              {c.portrait_url ? (
                <img
                  src={portraitSrc(c.portrait_url, c.updated_at)} {...zoomable(portraitSrc(c.portrait_url, c.updated_at), c.character_name)}
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

            <div style={{ marginTop: "0.75rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-start" }}>
              <ImageUpload
                currentUrl={portraitSrc(c.portrait_url, c.updated_at) ?? null}
                onUrlChange={(url) => updateImage.mutate({ id: c.id, url })}
                label="Portrait"
                size={48}
              />
              <ModelUpload
                currentUrl={c.model_url}
                onUrlChange={(url) => updateModel.mutate({ id: c.id, url })}
                heightFt={heightFtForRace(c.race)}
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

            <div className="flex gap-2" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
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
              {c.pending_level && c.pending_level > c.level ? (
                <>
                  <a
                    className="btn btn-ghost"
                    style={{ fontSize: "0.7rem", color: "var(--gold)" }}
                    href={`/play/${c.id}/level-up`}
                    target="_blank"
                    rel="noreferrer"
                    title="The player's guide — open it here to walk them through it"
                  >
                    ✨ Level {c.level + 1} guide ↗
                  </a>
                  <button
                    className="btn btn-ghost"
                    style={{ fontSize: "0.7rem" }}
                    title="Withdraw the level-up"
                    onClick={() => revokeLevel.mutate(c.id)}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-ghost"
                  style={{ fontSize: "0.7rem", color: "var(--gold)" }}
                  title="Open a level-up: the player picks HP, feat and spells on their sheet"
                  onClick={() => grantLevel.mutate(c.id)}
                  disabled={c.level >= 20}
                >
                  ⬆ Level up
                </button>
              )}
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
